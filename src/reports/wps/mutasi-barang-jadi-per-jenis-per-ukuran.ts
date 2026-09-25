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
 * SP_LapMutasiBJPerJenisPerUkuran — "Laporan Mutasi Barang Jadi Per-Jenis
 * Per-Ukuran (m3)". Ported from
 * open-api-report's MutasiBarangJadiPerJenisPerUkuranReportService +
 * mutasi-barang-jadi-per-jenis-per-ukuran-pdf.blade.php.
 *
 * Rows are grouped per Jenis; each group prints a two-tier header
 * (Awal / Masuk / Minus / Jual / Akhir, each with Pcs + m3 sub-columns), the
 * dimension columns (Tebal / Lebar / Panjang, whole numbers) and a totals row.
 * A closing "Rangkuman" list repeats the grand totals across every group.
 */

interface MutasiUkuranRow extends Record<string, unknown> {
  Jenis: string | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  AwalPcs: number | null;
  AwalM3: number | null;
  MasukPcs: number | null;
  MasukM3: number | null;
  MinusPcs: number | null;
  MinusM3: number | null;
  JualPcs: number | null;
  JualM3: number | null;
  AkhirPcs: number | null;
  AkhirM3: number | null;
}

type MeasureKey =
  | "AwalPcs"
  | "AwalM3"
  | "MasukPcs"
  | "MasukM3"
  | "MinusPcs"
  | "MinusM3"
  | "JualPcs"
  | "JualM3"
  | "AkhirPcs"
  | "AkhirM3";

const MEASURE_KEYS: MeasureKey[] = [
  "AwalPcs",
  "AwalM3",
  "MasukPcs",
  "MasukM3",
  "MinusPcs",
  "MinusM3",
  "JualPcs",
  "JualM3",
  "AkhirPcs",
  "AkhirM3",
];

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtPcs: whole number, blank when 0 (used for dims AND Pcs). */
const fmtPcs = (value: unknown): string => {
  const num = toFloat(value);
  if (Math.round(num) === 0) return "";
  return formatNumber(Math.round(num), 0);
};

/** Legacy $fmtM3: 4 decimals, blank when ~0. */
const fmtM3 = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

/** Rangkuman bullets print "-" instead of a blank cell. */
const fmtPcsDash = (value: unknown): string => fmtPcs(value) || "-";
const fmtM3Dash = (value: unknown): string => fmtM3(value) || "-";

/** Legacy subtitle date format: d-M-y (2-digit year). */
const fmtTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/(\d{2})\d{2}$/, "$1");

const MUTASI_CSS = `
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .summary-block { margin-top: 14px; }
  .summary-list { margin: 4px 0 0 18px; padding: 0; font-size: 10px; }
  .summary-list li { margin: 0 0 2px 0; }
  .section-title { margin: 10px 0 6px 0; font-size: 12px; font-weight: bold; }
`;

const buildGroupTable = (jenis: string, rows: MutasiUkuranRow[]): string => {
  // Legacy sorts the whole payload by [Jenis, Tebal, Lebar, Panjang] before
  // grouping, so the rows inside a group are dimension-ascending.
  const sortedRows = [...rows].sort((left, right) => {
    const byJenis = String(left.Jenis ?? "").localeCompare(String(right.Jenis ?? ""));
    if (byJenis !== 0) return byJenis;
    const byTebal = toFloat(left.Tebal) - toFloat(right.Tebal);
    if (byTebal !== 0) return byTebal;
    const byLebar = toFloat(left.Lebar) - toFloat(right.Lebar);
    if (byLebar !== 0) return byLebar;
    return toFloat(left.Panjang) - toFloat(right.Panjang);
  });

  const totals: Record<MeasureKey, number> = sortedRows.reduce(
    (acc, row) => {
      for (const key of MEASURE_KEYS) acc[key] += toFloat(row[key]);
      return acc;
    },
    {
      AwalPcs: 0, AwalM3: 0,
      MasukPcs: 0, MasukM3: 0,
      MinusPcs: 0, MinusM3: 0,
      JualPcs: 0, JualM3: 0,
      AkhirPcs: 0, AkhirM3: 0,
    } as Record<MeasureKey, number>,
  );

  const bodyRows = sortedRows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="number">${fmtPcs(row.Tebal)}</td>
        <td class="number">${fmtPcs(row.Lebar)}</td>
        <td class="number">${fmtPcs(row.Panjang)}</td>
        <td class="number">${fmtPcs(row.AwalPcs)}</td>
        <td class="number">${fmtM3(row.AwalM3)}</td>
        <td class="number">${fmtPcs(row.MasukPcs)}</td>
        <td class="number">${fmtM3(row.MasukM3)}</td>
        <td class="number">${fmtPcs(row.MinusPcs)}</td>
        <td class="number">${fmtM3(row.MinusM3)}</td>
        <td class="number">${fmtPcs(row.JualPcs)}</td>
        <td class="number">${fmtM3(row.JualM3)}</td>
        <td class="number">${fmtPcs(row.AkhirPcs)}</td>
        <td class="number">${fmtM3(row.AkhirM3)}</td>
      </tr>`,
    )
    .join("\n      ");

  const totalCells = MEASURE_KEYS.map(
    (key) =>
      `<td class="number">${key.endsWith("M3") ? fmtM3(totals[key]) : fmtPcs(totals[key])}</td>`,
  ).join("\n          ");

  return `<div class="section-title">${escapeHtml(jenis)}</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 3%;">No</th>
      <th rowspan="2" style="width: 10%;">Tebal</th>
      <th rowspan="2" style="width: 10%;">Lebar</th>
      <th rowspan="2" style="width: 10%;">Panjang</th>
      <th colspan="2">Awal</th>
      <th colspan="2">Masuk</th>
      <th colspan="2">Minus</th>
      <th colspan="2">Jual</th>
      <th colspan="2">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 62px;">Pcs</th><th style="width: 72px;">m3</th>
      <th style="width: 62px;">Pcs</th><th style="width: 72px;">m3</th>
      <th style="width: 62px;">Pcs</th><th style="width: 72px;">m3</th>
      <th style="width: 62px;">Pcs</th><th style="width: 72px;">m3</th>
      <th style="width: 62px;">Pcs</th><th style="width: 72px;">m3</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="4" class="center">Total ${escapeHtml(jenis)}</td>
      ${totalCells}
    </tr>
  </tbody>
</table>`;
};

export const mutasiBarangJadiPerJenisPerUkuranReport: ReportDefinition<
  PeriodParams,
  MutasiUkuranRow[]
> = {
  type: "mutasi-barang-jadi-per-jenis-per-ukuran",
  title: "Laporan Mutasi Barang Jadi Per-Jenis Per-Ukuran (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapMutasiBJPerJenisPerUkuran");
    return (result.recordset ?? []) as MutasiUkuranRow[];
  },

  render(rows, meta) {
    // Group per Jenis, keeping first-appearance order (legacy groupBy).
    const grouped = new Map<string, MutasiUkuranRow[]>();
    for (const row of rows) {
      const jenis = String(row.Jenis ?? "") || "LAINNYA";
      const bucket = grouped.get(jenis);
      if (bucket) bucket.push(row);
      else grouped.set(jenis, [row]);
    }

    const grand: Record<MeasureKey, number> = rows.reduce(
      (acc, row) => {
        for (const key of MEASURE_KEYS) acc[key] += toFloat(row[key]);
        return acc;
      },
      {
        AwalPcs: 0, AwalM3: 0,
        MasukPcs: 0, MasukM3: 0,
        MinusPcs: 0, MinusM3: 0,
        JualPcs: 0, JualM3: 0,
        AkhirPcs: 0, AkhirM3: 0,
      } as Record<MeasureKey, number>,
    );

    const summaryHtml =
      rows.length > 0
        ? `<div class="summary-block">
  <div class="section-title">Rangkuman</div>
  <ul class="summary-list">
    <li>Awal : <b>${fmtPcsDash(grand.AwalPcs)}</b> Pcs / <b>${fmtM3Dash(grand.AwalM3)}</b> m3</li>
    <li>Masuk : <b>${fmtPcsDash(grand.MasukPcs)}</b> Pcs / <b>${fmtM3Dash(grand.MasukM3)}</b> m3</li>
    <li>Minus : <b>${fmtPcsDash(grand.MinusPcs)}</b> Pcs / <b>${fmtM3Dash(grand.MinusM3)}</b> m3</li>
    <li>Jual : <b>${fmtPcsDash(grand.JualPcs)}</b> Pcs / <b>${fmtM3Dash(grand.JualM3)}</b> m3</li>
    <li>Akhir : <b>${fmtPcsDash(grand.AkhirPcs)}</b> Pcs / <b>${fmtM3Dash(grand.AkhirM3)}</b> m3</li>
  </ul>
</div>`
        : "";

    const bodyHtml =
      rows.length > 0
        ? `${[...grouped.entries()]
            .map(([jenis, groupRows]) => buildGroupTable(jenis, groupRows))
            .join("\n  ")}
  ${summaryHtml}`
        : `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Mutasi Barang Jadi Per-Jenis Per-Ukuran (m3)",
      // Legacy subtitle uses d-M-y (2-digit year).
      subtitle: `Periode ${fmtTanggalPendek(meta.params.tglAwal)} s/d ${fmtTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: MUTASI_CSS,
      // 14 columns of Pcs/m3 pairs need the landscape width.
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
