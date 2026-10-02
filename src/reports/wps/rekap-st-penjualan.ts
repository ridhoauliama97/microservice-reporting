import sql from "mssql";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapRekapSTPenjualan — "Laporan Rekap ST Penjualan". Ported from
 * open-api-report's RekapStPenjualanReportService +
 * rekap-st-penjualan-pdf.blade.php.
 *
 * One row per sold board, grouped by Pembeli. The SP names the period
 * parameters @StartDate/@EndDate (mapped to tglAwal/tglAkhir by inputNames),
 * and derives "NoST" from NoST (falling back to NoSTJual) plus UOM labels
 * from IdUOMTblLebar/IdUOMPanjang. Each Pembeli block closes with its own
 * JmlhBtg/Ton subtotal, as the legacy per-supplier sheet does.
 */

const UOM_LABEL: Record<number, string> = { 1: "mm", 3: "inch", 4: "feet" };

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toInt = (value: unknown): number =>
  Math.round(toFloat(value));

const naturalCompare = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

interface PenjualanRow extends Record<string, unknown> {
  Pembeli: string;
  NoST: string;
  Tanggal: string;
  JenisKayu: string;
  Tebal: number;
  Lebar: number;
  UOMTblLebar: string;
  Panjang: number;
  UOMPanjang: string;
  JmlhBtg: number;
  Ton: number;
}

interface PenjualanGroup {
  pembeli: string;
  rows: PenjualanRow[];
  totalBatang: number;
  totalTon: number;
}

const uomLabel = (id: unknown): string =>
  UOM_LABEL[toInt(id)] ?? "";

function mapRow(row: Record<string, unknown>): PenjualanRow {
  const tanggalRaw = row.DateCreate ?? row.TglJual ?? "";
  return {
    Pembeli: String(row.Pembeli ?? ""),
    NoST: String(row.NoST ?? row.NoSTJual ?? ""),
    Tanggal:
      tanggalRaw instanceof Date
        ? tanggalRaw.toISOString().slice(0, 10)
        : String(tanggalRaw ?? ""),
    JenisKayu: String(row.Jenis ?? row.JenisKayu ?? ""),
    Tebal: toFloat(row.Tebal),
    Lebar: toFloat(row.Lebar),
    UOMTblLebar:
      typeof row.UOMTblLebar === "string" && row.UOMTblLebar.trim() !== ""
        ? row.UOMTblLebar.trim()
        : uomLabel(row.IdUOMTblLebar),
    Panjang: toFloat(row.Panjang),
    UOMPanjang:
      typeof row.UOMPanjang === "string" && row.UOMPanjang.trim() !== ""
        ? row.UOMPanjang.trim()
        : uomLabel(row.IdUOMPanjang),
    JmlhBtg: toInt(row.JmlhBatang ?? row.JmlhBtg),
    Ton: toFloat(row.Ton),
  };
}

function groupByPembeli(rows: PenjualanRow[]): PenjualanGroup[] {
  const map = new Map<string, PenjualanRow[]>();
  for (const row of rows) {
    const pembeli = row.Pembeli.trim() || "-";
    const list = map.get(pembeli) ?? [];
    list.push(row);
    map.set(pembeli, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => naturalCompare(a, b))
    .map(([pembeli, items]) => {
      const sorted = [...items].sort(
        (a, b) =>
          a.Tanggal.localeCompare(b.Tanggal) ||
          a.NoST.localeCompare(b.NoST),
      );
      return {
        pembeli,
        rows: sorted,
        totalBatang: sorted.reduce((sum, r) => sum + r.JmlhBtg, 0),
        totalTon: sorted.reduce((sum, r) => sum + r.Ton, 0),
      };
    });
}

const buildGroupTable = (group: PenjualanGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(row.NoST)}</td>
        <td class="center">${escapeHtml(
          row.Tanggal ? formatTanggalId(row.Tanggal) : "",
        )}</td>
        <td>${escapeHtml(row.JenisKayu)}</td>
        <td class="center">${formatNumber(row.Tebal, 0)}</td>
        <td class="center">${formatNumber(row.Lebar, 0)}</td>
        <td class="center">${escapeHtml(row.UOMTblLebar)}</td>
        <td class="number">${formatNumber(row.Panjang, 0)}</td>
        <td class="center">${escapeHtml(row.UOMPanjang)}</td>
        <td class="number">${formatNumber(row.JmlhBtg, 0)}</td>
        <td class="number">${formatNumber(row.Ton, 4)}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>NoST</th>
      <th>Tanggal (ST)</th>
      <th>Jenis Kayu</th>
      <th>Tebal</th>
      <th>Lebar</th>
      <th>UOM Tbl Lebar</th>
      <th>Panjang</th>
      <th>UOMPanjang</th>
      <th>JmlhBtg</th>
      <th>Ton</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="8" class="number" style="text-align:right;">Jmlh Batang / ${escapeHtml(group.pembeli)} :</td>
      <td class="number">${formatNumber(group.totalBatang, 0)}</td>
      <td class="number">${formatNumber(group.totalTon, 4)}</td>
    </tr>
  </tbody>
</table>`;
};

export const rekapStPenjualanReport: ReportDefinition<
  PeriodParams,
  PenjualanRow[]
> = {
  type: "rekap-st-penjualan",
  title: "Laporan Rekap ST Penjualan",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SP_LapRekapSTPenjualan");
    return ((result.recordset ?? []) as Array<Record<string, unknown>>).map(
      mapRow,
    );
  },

  render(rows, meta) {
    const groups = groupByPembeli(rows);
    const bodyHtml = groups.length
      ? groups
          .map(
            (group) =>
              `<div class="section-title">Pembeli&nbsp;&nbsp;: ${escapeHtml(group.pembeli)}</div>\n` +
              buildGroupTable(group),
          )
          .join("\n")
      : `<table class="report-table"><tbody>${buildEmptyTableRow(10)}</tbody></table>`;
    return renderWpsReportPage({
      title: "Laporan Rekap ST Penjualan",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
