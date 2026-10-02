import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SPWps_LapSTHidupPerProduk — "Laporan Saldo ST Hidup Per-Jenis Per-Tebal
 * (Per-Group Jenis Kayu)". Ported from open-api-report's
 * SaldoStHidupPerProdukReportService + saldo-st-hidup-per-produk-pdf.blade.php.
 *
 * Live snapshot (no parameters). Rows are grouped per Group (jenis kayu), then
 * per Produk; each product gets a Tebal / Lebar / UOM / Basah / KD / Kering /
 * Total table closed by a "Jumlah" row, and every Group ends with a
 * "Total <group>" summary band.
 */

interface SaldoRow extends Record<string, unknown> {
  Group: string | null;
  Produk: string | null;
  Tebal: number | null;
  Lebar: number | null;
  UOM: string | null;
  BasahTon: number | null;
  KDTon: number | null;
  KeringTon: number | null;
  TotalTon: number | null;
}

interface ProdukGroup {
  name: string;
  rows: SaldoRow[];
  basah: number;
  kd: number;
  kering: number;
  total: number;
}

interface GroupBlock {
  name: string;
  produks: ProdukGroup[];
  basah: number;
  kd: number;
  kering: number;
  total: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const natural = (left: string, right: string): number =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

function groupRows(rows: SaldoRow[]): GroupBlock[] {
  const byGroup = new Map<string, Map<string, SaldoRow[]>>();
  for (const row of rows) {
    const groupName = String(row.Group ?? "").trim() || "Tanpa Group";
    const produkName = String(row.Produk ?? "").trim() || "Tanpa Produk";
    let produks = byGroup.get(groupName);
    if (!produks) {
      produks = new Map<string, SaldoRow[]>();
      byGroup.set(groupName, produks);
    }
    const list = produks.get(produkName) ?? [];
    list.push(row);
    produks.set(produkName, list);
  }

  return [...byGroup.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([groupName, produks]) => {
      const sorted = [...produks.entries()]
        .sort(([a], [b]) => natural(a, b))
        .map(([name, rows]) => {
          const sortedRows = [...rows].sort(
            (a, b) =>
              toFloat(a.Tebal) - toFloat(b.Tebal) ||
              toFloat(a.Lebar) - toFloat(b.Lebar),
          );
          return {
            name,
            rows: sortedRows,
            basah: sortedRows.reduce((s, r) => s + toFloat(r.BasahTon), 0),
            kd: sortedRows.reduce((s, r) => s + toFloat(r.KDTon), 0),
            kering: sortedRows.reduce((s, r) => s + toFloat(r.KeringTon), 0),
            total: sortedRows.reduce((s, r) => s + toFloat(r.TotalTon), 0),
          };
        });
      return {
        name: groupName,
        produks: sorted,
        basah: sorted.reduce((s, p) => s + p.basah, 0),
        kd: sorted.reduce((s, p) => s + p.kd, 0),
        kering: sorted.reduce((s, p) => s + p.kering, 0),
        total: sorted.reduce((s, p) => s + p.total, 0),
      };
    });
}

const fmtTon = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

const buildProductTable = (group: ProdukGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="number">${formatNumber(toFloat(row.Tebal), 0)}</td>
        <td class="number">${formatNumber(toFloat(row.Lebar), 0)}</td>
        <td>${escapeHtml(String(row.UOM ?? ""))}</td>
        <td class="number">${fmtTon(row.BasahTon)}</td>
        <td class="number">${fmtTon(row.KDTon)}</td>
        <td class="number">${fmtTon(row.KeringTon)}</td>
        <td class="number">${fmtTon(row.TotalTon)}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="product-title">Produk : ${escapeHtml(group.name)}</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 5%;">No</th>
      <th style="width: 15%;">Tebal</th>
      <th style="width: 15%;">Lebar</th>
      <th style="width: 10%;">UOM</th>
      <th style="width: 17.5%;">Basah (Ton)</th>
      <th style="width: 17.5%;">KD (Ton)</th>
      <th style="width: 17.5%;">Kering (Ton)</th>
      <th style="width: 17.5%;">Total (Ton)</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="4" class="center">Jumlah</td>
      <td class="number">${fmtTon(group.basah)}</td>
      <td class="number">${fmtTon(group.kd)}</td>
      <td class="number">${fmtTon(group.kering)}</td>
      <td class="number">${fmtTon(group.total)}</td>
    </tr>
  </tbody>
</table>`;
};

const buildEmptyTable = (): string => `<table class="report-table">
  <tbody>${buildEmptyTableRow(8)}</tbody>
</table>`;

export const saldoStHidupPerProdukReport: ReportDefinition<
  Record<never, never>,
  SaldoRow[]
> = {
  type: "saldo-st-hidup-per-produk",
  title: "Laporan Saldo ST Hidup Per-Jenis Per-Tebal (Per-Group Jenis Kayu)",
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SPWps_LapSTHidupPerProduk");
    return (result.recordset ?? []) as SaldoRow[];
  },

  render(rows, meta) {
    const bodyHtml = rows.length
      ? groupRows(rows)
          .map(
            (group, gi) => `<div class="section-title">${gi + 1}. ${escapeHtml(group.name)}</div>
  ${group.produks.map(buildProductTable).join("\n  ")}
  <table class="report-table" style="margin: 6px 0 2px 20px;">
    <colgroup>
      <col style="width: 5%"><col style="width: 15%"><col style="width: 15%"><col style="width: 10%"><col style="width: 17.5%"><col style="width: 17.5%"><col style="width: 17.5%"><col style="width: 17.5%">
    </colgroup>
    <tbody>
      <tr class="totals-row">
        <td class="center" colspan="4">Total ${escapeHtml(group.name)}</td>
        <td class="number">${fmtTon(group.basah)}</td>
        <td class="number">${fmtTon(group.kd)}</td>
        <td class="number">${fmtTon(group.kering)}</td>
        <td class="number">${fmtTon(group.total)}</td>
      </tr>
    </tbody>
  </table>`,
          )
          .join("\n")
      : buildEmptyTable();
    return renderWpsReportPage({
      title: "Laporan Saldo ST Hidup Per-Jenis Per-Tebal (Per-Group Jenis Kayu)",
      subtitle: undefined,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
