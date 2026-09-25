import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapKetahananBarangReproses — "Laporan Ketahanan Barang Dagang
 * Reproses". The SP returns Jenis / Stockm3 / m3; the legacy service maps
 * Stockm3 to Stock, m3 to Penjualan, falls back AvgPenjualan to Penjualan,
 * and derives Ketahanan = Stock / AvgPenjualan when absent.
 */

interface KetahananRow extends Record<string, unknown> {
  Jenis: string | null;
  Stockm3: number | string | null;
  m3: number | string | null;
  AvgPenjualan: number | string | null;
  Ketahanan: number | string | null;
}

interface KetahananView {
  Jenis: string;
  Stock: number;
  Penjualan: number;
  AvgPenjualan: number;
  Ketahanan: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt2OrBlank = (value: number): string => {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0000001) return "";
  return value.toFixed(2);
};

const buildView = (rows: KetahananRow[]): KetahananView[] =>
  rows.map((row) => {
    const stock = toFloat(row.Stockm3);
    const penjualan = toFloat(row.m3);
    const avgPenjualan = row.AvgPenjualan === null || row.AvgPenjualan === undefined
      ? penjualan
      : toFloat(row.AvgPenjualan);
    const ketahanan = row.Ketahanan === null || row.Ketahanan === undefined
      ? (avgPenjualan > 0 ? stock / avgPenjualan : 0)
      : toFloat(row.Ketahanan);
    return {
      Jenis: String(row.Jenis ?? ""),
      Stock: stock,
      Penjualan: penjualan,
      AvgPenjualan: avgPenjualan,
      Ketahanan: ketahanan,
    };
  });

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

export const ketahananBarangReprosesReport: ReportDefinition<
  PeriodParams,
  KetahananView[]
> = {
  type: "ketahanan-barang-reproses",
  title: "Laporan Ketahanan Barang Dagang Reproses",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapKetahananBarangReproses");
    return buildView((result.recordset ?? []) as KetahananRow[]);
  },

  render(rows, meta) {
    const bodyRows = rows
      .map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(row.Jenis)}</td>
        <td class="number">${fmt2OrBlank(row.Stock)}</td>
        <td class="number">${fmt2OrBlank(row.Penjualan)}</td>
        <td class="number">${fmt2OrBlank(row.AvgPenjualan)}</td>
        <td class="number">${fmt2OrBlank(row.Ketahanan)}</td>
      </tr>`)
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>Jenis</th>
      <th>Stock</th>
      <th>Penjualan</th>
      <th>Avg Penjualan</th>
      <th>Ketahanan</th>
    </tr>
  </thead>
  <tbody>${bodyRows || buildEmptyTableRow(6)}</tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Ketahanan Barang Dagang Reproses",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "ketahanan_barang_reproses",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
