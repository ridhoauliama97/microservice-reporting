import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

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

/**
 * Column geometry shared by the per-product tables and the group's "Total"
 * band, so a group's figure sits directly under the column it summarises.
 *
 * The blade states these as `th` percentages and as a separate `width: 100%`
 * plus `margin-left: 12px`, which adds up to 115% and hangs the last column
 * past the right margin. One `<colgroup>` inside a padded wrapper keeps the
 * blade's proportions and the indent without the overflow.
 */
const COLGROUP = `<colgroup>
      <col style="width: 5%"><col style="width: 12%"><col style="width: 12%"><col style="width: 8%"><col style="width: 15.75%"><col style="width: 15.75%"><col style="width: 15.75%"><col style="width: 15.75%">
    </colgroup>`;

const buildProductTable = (group: ProdukGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center data-cell">${index + 1}</td>
        <td class="number data-cell">${formatNumber(toFloat(row.Tebal), 0)}</td>
        <td class="number data-cell">${formatNumber(toFloat(row.Lebar), 0)}</td>
        <td class="center data-cell">${escapeHtml(String(row.UOM ?? ""))}</td>
        <td class="number data-cell">${fmtTon(row.BasahTon)}</td>
        <td class="number data-cell">${fmtTon(row.KDTon)}</td>
        <td class="number data-cell">${fmtTon(row.KeringTon)}</td>
        <td class="number data-cell">${fmtTon(row.TotalTon)}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title" style="margin: 6px 0 2px 0; font-weight: bold; font-size: 11px;">Produk : ${escapeHtml(group.name)}</div>
<table class="report-table">
    ${COLGROUP}
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>Tebal</th>
      <th>Lebar</th>
      <th>UOM</th>
      <th>Basah (Ton)</th>
      <th>KD (Ton)</th>
      <th>Kering (Ton)</th>
      <th>Total (Ton)</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td colspan="8" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
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

const buildEmptyBlock = (): string => `<div class="center">${EMPTY_DATA_MESSAGE}</div>`;

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
  <div style="padding: 0 12px;">
  ${group.produks.map(buildProductTable).join("\n  ")}
  <table class="report-table report-table-total" style="margin: 6px 0 2px 0;">
    ${COLGROUP}
    <tbody>
      <tr class="totals-row">
        <td class="center" colspan="4">Total ${escapeHtml(group.name)}</td>
        <td class="number">${fmtTon(group.basah)}</td>
        <td class="number">${fmtTon(group.kd)}</td>
        <td class="number">${fmtTon(group.kering)}</td>
        <td class="number">${fmtTon(group.total)}</td>
      </tr>
    </tbody>
  </table>
  </div>`,
          )
          .join("\n")
      : buildEmptyBlock();
    return renderWpsReportPage({
      title: "Laporan Saldo ST Hidup Per-Jenis Per-Tebal (Per-Group Jenis Kayu)",
      // The blade keeps the (empty) subtitle line, so the title sits above the
      // same 20px gap the other WPS sheets have.
      subtitle: "\u00A0",
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["saldo-st-hidup-per-produk"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
