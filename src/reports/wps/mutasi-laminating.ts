import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_Mutasi_Laminating + SP_SubMutasi_Laminating — "Laporan Mutasi Laminating
 * (m3)". Ported from MutasiLaminatingReportService and laminating-pdf.blade.php.
 *
 * The main SP supplies one row per Jenis and the sub SP supplies the input
 * production breakdown. Totals follow the legacy formulas: Total Masuk =
 * Adj Out + BS Out + LMT Prod Out; Total Keluar is the sum of the six outgoing
 * columns; Akhir comes from the SP.
 *
 * The main table groups three columns under Masuk and six under Keluar (15
 * columns in total), and the sub table is rendered only when the sub SP
 * returned rows, so it has no empty state.
 *
 * The SP column is spelled "LMTProdOuput" upstream; the legacy blade reaches
 * for "LMTMasuk" only as a late fallback for the same display column, and since
 * the SP also returns the misspelled key the fallback never fires. LMTMasuk is
 * therefore not displayed, matching the legacy output.
 *
 * Deliberately NOT shared with the Cross Cut Akhir or Finger Joint mutasi
 * reports: all three group a different number of columns under Masuk/Keluar.
 */

export interface MutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  LMTAwal: number | string | null;
  AdjOutputLMT: number | string | null;
  BSOutputLMT: number | string | null;
  /** Misspelled upstream; the name the SP actually returns. */
  LMTProdOuput: number | string | null;
  AdjInptLMT: number | string | null;
  BSInptLMT: number | string | null;
  CCAProdInptLMT: number | string | null;
  LMTJual: number | string | null;
  MldProdInptLMT: number | string | null;
  S4SProdInptLMT: number | string | null;
  LMTAkhir: number | string | null;
}

interface SubMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  Moulding: number | string | null;
  Reproses: number | string | null;
  Sanding: number | string | null;
  WIP: number | string | null;
  BJ: number | string | null;
  CCAkhir: number | string | null;
}

type MainNumberKey =
  | "awal"
  | "adjOut"
  | "bsOut"
  | "prodOut"
  | "totalMasuk"
  | "adjIn"
  | "bsIn"
  | "ccaProdIn"
  | "jual"
  | "mldProdIn"
  | "s4sProdIn"
  | "totalKeluar"
  | "akhir";

const MAIN_KEYS: MainNumberKey[] = [
  "awal",
  "adjOut",
  "bsOut",
  "prodOut",
  "totalMasuk",
  "adjIn",
  "bsIn",
  "ccaProdIn",
  "jual",
  "mldProdIn",
  "s4sProdIn",
  "totalKeluar",
  "akhir",
];

/** Legacy $subSpec order; drives both the headers and the column order. */
const SUB_SPEC = [
  { key: "Moulding", label: "Moulding" },
  { key: "Reproses", label: "Reproses" },
  { key: "Sanding", label: "Sanding" },
  { key: "WIP", label: "WIP" },
  { key: "BJ", label: "BJ" },
  { key: "CCAkhir", label: "CCAkhir" },
] as const;

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replaceAll(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (normalized.includes(",")) {
    normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(normalized)
      ? normalized.replaceAll(",", "")
      : normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const emptyTotals = (): Record<MainNumberKey, number> => ({
  awal: 0,
  adjOut: 0,
  bsOut: 0,
  prodOut: 0,
  totalMasuk: 0,
  adjIn: 0,
  bsIn: 0,
  ccaProdIn: 0,
  jual: 0,
  mldProdIn: 0,
  s4sProdIn: 0,
  totalKeluar: 0,
  akhir: 0,
});

export const mainValues = (row: MutasiRow): Record<MainNumberKey, number> => {
  const adjOut = toFloat(row.AdjOutputLMT);
  const bsOut = toFloat(row.BSOutputLMT);
  const prodOut = toFloat(row.LMTProdOuput);
  const adjIn = toFloat(row.AdjInptLMT);
  const bsIn = toFloat(row.BSInptLMT);
  const ccaProdIn = toFloat(row.CCAProdInptLMT);
  const jual = toFloat(row.LMTJual);
  const mldProdIn = toFloat(row.MldProdInptLMT);
  const s4sProdIn = toFloat(row.S4SProdInptLMT);
  return {
    awal: toFloat(row.LMTAwal),
    adjOut,
    bsOut,
    prodOut,
    totalMasuk: adjOut + bsOut + prodOut,
    adjIn,
    bsIn,
    ccaProdIn,
    jual,
    mldProdIn,
    s4sProdIn,
    totalKeluar: adjIn + bsIn + ccaProdIn + jual + mldProdIn + s4sProdIn,
    akhir: toFloat(row.LMTAkhir),
  };
};

const buildMainTable = (rows: MutasiRow[]): string => {
  const totals = emptyTotals();
  const bodyRows = rows
    .map((row, index) => {
      const values = mainValues(row);
      for (const key of MAIN_KEYS) totals[key] += values[key];
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(values.awal)}</td>
      <td class="number data-cell">${fmt(values.adjOut)}</td>
      <td class="number data-cell">${fmt(values.bsOut)}</td>
      <td class="number data-cell">${fmt(values.prodOut)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalMasuk)}</td>
      <td class="number data-cell">${fmt(values.adjIn)}</td>
      <td class="number data-cell">${fmt(values.bsIn)}</td>
      <td class="number data-cell">${fmt(values.ccaProdIn)}</td>
      <td class="number data-cell">${fmt(values.jual)}</td>
      <td class="number data-cell">${fmt(values.mldProdIn)}</td>
      <td class="number data-cell">${fmt(values.s4sProdIn)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalKeluar)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.akhir)}</td>
    </tr>`;
    })
    .join("\n    ");

  const totalsHtml = MAIN_KEYS
    .map((key) => `<td class="number">${fmt(totals[key])}</td>`)
    .join("\n      ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 30px;">No</th>
      <th rowspan="2" style="width: 222px;">Jenis</th>
      <th rowspan="2" style="width: 60px;">Awal</th>
      <th colspan="3">Masuk</th>
      <th rowspan="2" style="width: 68px;">Total<br>Masuk</th>
      <th colspan="6">Keluar</th>
      <th rowspan="2" style="width: 68px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 60px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 68px;">Adj Out<br>LMT</th>
      <th style="width: 68px;">BS Out<br>LMT</th>
      <th style="width: 68px;">LMT Prod<br>Out</th>
      <th style="width: 60px;">Adj Inp<br>LMT</th>
      <th style="width: 60px;">BS Inpt<br>LMT</th>
      <th style="width: 60px;">CCA Prod<br>Inpt</th>
      <th style="width: 60px;">LMT<br>Jual</th>
      <th style="width: 60px;">Mld Prod<br>Inpt</th>
      <th style="width: 60px;">S4S Prod<br>Inpt</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(15)}
    <tr class="totals-row">
      <td colspan="2" class="blank" style="text-align: center;">Total</td>
      ${totalsHtml}
    </tr>
  </tbody>
</table>`;
};

/** Hidden entirely when the sub SP returned no rows, so no empty state. */
const buildSubTable = (rows: SubMutasiRow[]): string => {
  const totals: Record<string, number> = { Total: 0 };
  for (const spec of SUB_SPEC) totals[spec.key] = 0;

  const bodyRows = rows
    .map((row, index) => {
      const cells = SUB_SPEC.map((spec) => toFloat(row[spec.key]));
      SUB_SPEC.forEach((spec, i) => {
        totals[spec.key] += cells[i]!;
      });
      const rowTotal = cells.reduce((sum, value) => sum + value, 0);
      totals.Total += rowTotal;
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      ${cells.map((value) => `<td class="number data-cell">${fmt(value)}</td>`).join("\n      ")}
      <td class="number data-cell" style="font-weight: bold;">${fmt(rowTotal)}</td>
    </tr>`;
    })
    .join("\n      ");

  return `<div class="section-title">Input Laminating Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 30px;">No</th>
        <th style="width: 220px;">Jenis</th>
        ${SUB_SPEC.map((spec) => `<th style="width: 78px;">${escapeHtml(spec.label)}</th>`).join("\n        ")}
        <th style="width: 78px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="2" class="blank" style="text-align: center;">Total</td>
        ${SUB_SPEC.map((spec) => `<td class="number">${fmt(totals[spec.key]!)}</td>`).join("\n        ")}
        <td class="number">${fmt(totals.Total!)}</td>
      </tr>
    </tbody>
  </table>`;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareJenis = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const mutasiLaminatingReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiRow[]; subRows: SubMutasiRow[] }
> = {
  type: "mutasi-laminating",
  title: "Laporan Mutasi Laminating (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_Laminating"),
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_SubMutasi_Laminating"),
    ]);

    // Legacy usort: Jenis ascending on both result sets.
    const rows = (mainResult.recordset ?? []) as MutasiRow[];
    rows.sort((left, right) =>
      compareJenis(String(left.Jenis ?? ""), String(right.Jenis ?? "")),
    );
    const subRows = (subResult.recordset ?? []) as SubMutasiRow[];
    subRows.sort((left, right) =>
      compareJenis(String(left.Jenis ?? ""), String(right.Jenis ?? "")),
    );
    return { rows, subRows };
  },

  render(data, meta) {
    const parts = [buildMainTable(data.rows)];
    if (data.subRows.length > 0) parts.push(buildSubTable(data.subRows));
    return renderWpsReportPage({
      title: "Laporan Mutasi Laminating (m3)",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: parts.join("\n  "),
      style: "mutasi_laminating",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
