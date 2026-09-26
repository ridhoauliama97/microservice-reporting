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
 * SP_Mutasi_FingerJoint + SP_SubMutasi_FingerJoint — "Laporan Mutasi Finger
 * Joint (m3)". Ported from MutasiFingerJointReportService and
 * finger-joint-pdf.blade.php.
 *
 * The main SP supplies one row per Jenis and the sub SP supplies the input
 * production breakdown. Totals use the same formulas as the legacy Blade:
 * Total Masuk = Adj Out + BS Out + FJ Prod Out; Total Keluar is the sum of the
 * seven outgoing columns; Akhir is taken from the SP rather than recomputed.
 *
 * Deliberately NOT shared with the Cross Cut Akhir variant: this blade groups
 * three columns under Masuk and seven under Keluar (16 columns total), where
 * the CCA one groups four and ten (20 columns), and it only renders the sub
 * table when the sub SP returned rows.
 *
 * The legacy blade resolves every value through a list of key aliases. Those
 * lists are reproduced here as the canonical source column for each display
 * column, which is why FJMasuk is not displayed: the blade only ever reaches
 * for it as a late fallback for "FJ Prod Out", and the SP also returns
 * FJProdOutput, so the fallback never fires.
 */

export interface MutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  FJAwal: number | string | null;
  AdjOutputFJ: number | string | null;
  BSOutputFJ: number | string | null;
  FJProdOutput: number | string | null;
  AdjInptFJ: number | string | null;
  BSInptFJ: number | string | null;
  FJJual: number | string | null;
  CCAInptFJ: number | string | null;
  MldInptFJ: number | string | null;
  S4SInptFJ: number | string | null;
  SandInptFJ: number | string | null;
  FJAkhir: number | string | null;
}

interface SubMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  CCAkhir: number | string | null;
  S4S: number | string | null;
}

type MainNumberKey =
  | "awal"
  | "adjOut"
  | "bsOut"
  | "prodOut"
  | "totalMasuk"
  | "adjIn"
  | "bsIn"
  | "jual"
  | "ccaProdIn"
  | "mldProdIn"
  | "s4sProdIn"
  | "sandProdIn"
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
  "jual",
  "ccaProdIn",
  "mldProdIn",
  "s4sProdIn",
  "sandProdIn",
  "totalKeluar",
  "akhir",
];

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
  jual: 0,
  ccaProdIn: 0,
  mldProdIn: 0,
  s4sProdIn: 0,
  sandProdIn: 0,
  totalKeluar: 0,
  akhir: 0,
});

export const mainValues = (row: MutasiRow): Record<MainNumberKey, number> => {
  const adjOut = toFloat(row.AdjOutputFJ);
  const bsOut = toFloat(row.BSOutputFJ);
  const prodOut = toFloat(row.FJProdOutput);
  const adjIn = toFloat(row.AdjInptFJ);
  const bsIn = toFloat(row.BSInptFJ);
  const jual = toFloat(row.FJJual);
  const ccaProdIn = toFloat(row.CCAInptFJ);
  const mldProdIn = toFloat(row.MldInptFJ);
  const s4sProdIn = toFloat(row.S4SInptFJ);
  const sandProdIn = toFloat(row.SandInptFJ);
  return {
    awal: toFloat(row.FJAwal),
    adjOut,
    bsOut,
    prodOut,
    totalMasuk: adjOut + bsOut + prodOut,
    adjIn,
    bsIn,
    jual,
    ccaProdIn,
    mldProdIn,
    s4sProdIn,
    sandProdIn,
    totalKeluar:
      adjIn + bsIn + jual + ccaProdIn + mldProdIn + s4sProdIn + sandProdIn,
    akhir: toFloat(row.FJAkhir),
  };
};

const buildMainTable = (
  rows: MutasiRow[],
): string => {
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
      <td class="number data-cell">${fmt(values.jual)}</td>
      <td class="number data-cell">${fmt(values.ccaProdIn)}</td>
      <td class="number data-cell">${fmt(values.mldProdIn)}</td>
      <td class="number data-cell">${fmt(values.s4sProdIn)}</td>
      <td class="number data-cell">${fmt(values.sandProdIn)}</td>
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
      <th rowspan="2" style="width: 210px;">Jenis</th>
      <th rowspan="2" style="width: 60px;">FJ Awal</th>
      <th colspan="3">Masuk</th>
      <th rowspan="2" style="width: 62px;">Total<br>Masuk</th>
      <th colspan="7">Keluar</th>
      <th rowspan="2" style="width: 62px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 55px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 58px;">Adj Out FJ</th>
      <th style="width: 58px;">BS Out FJ</th>
      <th style="width: 58px;">FJ Prod Out</th>
      <th style="width: 58px;">Adj Inp FJ</th>
      <th style="width: 58px;">BS Inp FJ</th>
      <th style="width: 58px;">FJ Jual</th>
      <th style="width: 58px;">CCA Prod Inpt</th>
      <th style="width: 58px;">Mld Prod Inpt</th>
      <th style="width: 58px;">S4S Prod Inpt</th>
      <th style="width: 58px;">Sand Prod Inpt</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(16)}
    <tr class="totals-row">
      <td colspan="2" class="blank" style="text-align: center;">Total</td>
      ${totalsHtml}
    </tr>
  </tbody>
</table>`;
};

/**
 * The legacy blade hides the whole sub table when the sub SP returned no rows,
 * so there is no empty state here by design.
 */
const buildSubTable = (rows: SubMutasiRow[]): string => {
  let totalCca = 0;
  let totalS4s = 0;
  let totalAll = 0;
  const bodyRows = rows
    .map((row, index) => {
      const cca = toFloat(row.CCAkhir);
      const s4s = toFloat(row.S4S);
      const total = cca + s4s;
      totalCca += cca;
      totalS4s += s4s;
      totalAll += total;
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(cca)}</td>
      <td class="number data-cell">${fmt(s4s)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(total)}</td>
    </tr>`;
    })
    .join("\n      ");

  return `<div class="section-title">Input FJ Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 32px;">No</th>
        <th style="width: 280px; text-align: center;">Jenis</th>
        <th style="width: 95px;">CCAkhir</th>
        <th style="width: 95px;">S4S</th>
        <th style="width: 95px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="2" class="blank" style="text-align: center;">Total</td>
        <td class="number">${fmt(totalCca)}</td>
        <td class="number">${fmt(totalS4s)}</td>
        <td class="number">${fmt(totalAll)}</td>
      </tr>
    </tbody>
  </table>`;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareJenis = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const mutasiFingerJointReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiRow[]; subRows: SubMutasiRow[] }
> = {
  type: "mutasi-finger-joint",
  title: "Laporan Mutasi Finger Joint (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_FingerJoint"),
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_SubMutasi_FingerJoint"),
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
      title: "Laporan Mutasi Finger Joint (m3)",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: parts.join("\n  "),
      style: "mutasi_finger_joint",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
