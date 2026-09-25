import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapRekapProduksiBarangJadiPerJenisPerGrade — "Laporan Rekap Produksi
 * Packing Per-Jenis & Per-Grade (m3)". Ported from open-api-report's
 * rekap-produksi-packing-per-jenis-per-grade-pdf.blade.php.
 *
 * Rows are grouped per JenisKayu, each group a table of NamaGrade rows with
 * the production flow volumes (In Moulding / In Sanding / In WIP /
 * In Barang Jadi / Output / Out Reproses) and a per-group Total row. Volumes
 * are printed in 4 decimals without a thousands separator (legacy $fmt).
 */

interface ProduksiGradeRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaGrade: string | null;
  Moulding: number | null;
  Sanding: number | null;
  WIP: number | null;
  BarangJadi: number | null;
  Output: number | null;
  OutputReproses: number | null;
}

const FLOW_KEYS = [
  "Moulding",
  "Sanding",
  "WIP",
  "BarangJadi",
  "Output",
  "OutputReproses",
] as const;

type FlowKey = (typeof FLOW_KEYS)[number];

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmt: 4 decimals, no thousands separator, blank when ~0. */
const fmt = (value: unknown): string => {
  const num = toFloat(value);
  if (Math.abs(num) < 0.0000001) return "";
  const [intPart, decPart] = num.toFixed(4).split(".");
  return `${intPart}.${decPart}`;
};

/** Legacy subtitle date format: d-M-y (2-digit year). */
const fmtTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const CSS = `
  .group-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

const buildGroupTable = (jenis: string, rows: ProduksiGradeRow[]): string => {
  const totals = rows.reduce(
    (acc, row) => {
      for (const key of FLOW_KEYS) acc[key] += toFloat(row[key]);
      return acc;
    },
    { Moulding: 0, Sanding: 0, WIP: 0, BarangJadi: 0, Output: 0, OutputReproses: 0 } as Record<FlowKey, number>,
  );

  const bodyRows = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(String(row.Jenis ?? ""))}</td>
        <td class="label">${escapeHtml(String(row.NamaGrade ?? ""))}</td>
        <td class="number">${fmt(row.Moulding)}</td>
        <td class="number">${fmt(row.Sanding)}</td>
        <td class="number">${fmt(row.WIP)}</td>
        <td class="number">${fmt(row.BarangJadi)}</td>
        <td class="number">${fmt(row.Output)}</td>
        <td class="number">${fmt(row.OutputReproses)}</td>
      </tr>`,
    )
    .join("\n      ");

  const totalCells = FLOW_KEYS.map(
    (key) => `<td class="number">${fmt(totals[key])}</td>`,
  ).join("\n        ");

  return `<div class="group-title">${escapeHtml(jenis)}</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 28px;">No</th>
      <th style="width: 100px;">Jenis Kayu</th>
      <th>Nama Grade</th>
      <th style="width: 78px;">In Moulding</th>
      <th style="width: 74px;">In Sanding</th>
      <th style="width: 62px;">In WIP</th>
      <th style="width: 86px;">In Barang Jadi</th>
      <th style="width: 68px;">Output</th>
      <th style="width: 84px;">Out Reproses</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="3" class="center">Total</td>
      ${totalCells}
    </tr>
  </tbody>
</table>`;
};

export const rekapProduksiPackingPerJenisPerGradeReport: ReportDefinition<
  PeriodParams,
  ProduksiGradeRow[]
> = {
  type: "rekap-produksi-packing-per-jenis-per-grade",
  title: "Laporan Rekap Produksi Packing Per-Jenis & Per-Grade (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiBarangJadiPerJenisPerGrade");
    const rows = (result.recordset ?? []) as ProduksiGradeRow[];

    // Legacy usort: Jenis ASC, then NamaGrade ASC.
    rows.sort((left, right) => {
      const byJenis = String(left.Jenis ?? "").localeCompare(String(right.Jenis ?? ""));
      if (byJenis !== 0) return byJenis;
      return String(left.NamaGrade ?? "").localeCompare(String(right.NamaGrade ?? ""));
    });
    return rows;
  },

  render(rows, meta) {
    // Group per Jenis (legacy service groups by Jenis, keeping the grade rows).
    const grouped = new Map<string, ProduksiGradeRow[]>();
    for (const row of rows) {
      const jenis = String(row.Jenis ?? "") || "LAINNYA";
      const bucket = grouped.get(jenis);
      if (bucket) bucket.push(row);
      else grouped.set(jenis, [row]);
    }

    const bodyHtml =
      rows.length > 0
        ? [...grouped.entries()]
            .map(([jenis, groupRows]) => buildGroupTable(jenis, groupRows))
            .join("\n  ")
        : `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi Packing Per-Jenis & Per-Grade (m3)",
      // Legacy subtitle uses d-M-y (2-digit year).
      subtitle: `Periode ${fmtTanggalPendek(meta.params.tglAwal)} s/d ${fmtTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
