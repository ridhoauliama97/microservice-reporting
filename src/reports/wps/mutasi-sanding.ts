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
 * SP_Mutasi_Sanding + SP_SubMutasi_Sanding — "Laporan Mutasi Sanding (m3)".
 *
 * Both procedure names and every column read below are already in use by the
 * Sanding section of rekap-mutasi.ts (PRODUCTION_SPECS key "sanding"), so the
 * column set is verified rather than assumed: four columns under Masuk, eight
 * under Keluar (the seven outgoing columns plus SANDJual), and the sub report
 * breaking the period's production input down into BJ / CCAkhir / FJ /
 * Moulding / Sanding.
 *
 * Totals follow the legacy formulas used by the sibling mutasi reports:
 * Total Masuk = SANDMasuk + AdjOutputSAND + BSOutputSAND + SANDProdOutput,
 * Total Keluar = the eight outgoing columns, and Akhir comes from the SP.
 *
 * The sub table is rendered only when the sub SP returned rows, so it has no
 * empty state. Both result sets are sorted by Jenis ascending, as the legacy
 * service does.
 */

interface MutasiSandingRow extends Record<string, unknown> {
  Jenis: string | null;
  SANDAwal: number | string | null;
  SANDMasuk: number | string | null;
  AdjOutputSAND: number | string | null;
  BSOutputSAND: number | string | null;
  SANDProdOutput: number | string | null;
  AdjInptSAND: number | string | null;
  BSInptSAND: number | string | null;
  LMTProdInptSAND: number | string | null;
  PACKProdInptSAND: number | string | null;
  CCAProdInptSand: number | string | null;
  SANDProdInptSand: number | string | null;
  MLDProdInptSand: number | string | null;
  SANDJual: number | string | null;
  SANDAkhir: number | string | null;
}

interface SubMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
}

type MainNumberKey =
  | "awal"
  | "masuk"
  | "adjOut"
  | "bsOut"
  | "prodOut"
  | "totalMasuk"
  | "adjIn"
  | "bsIn"
  | "lmtProdIn"
  | "packProdIn"
  | "ccaProdIn"
  | "sandProdIn"
  | "mldProdIn"
  | "jual"
  | "totalKeluar"
  | "akhir";

const MAIN_KEYS: MainNumberKey[] = [
  "awal",
  "masuk",
  "adjOut",
  "bsOut",
  "prodOut",
  "totalMasuk",
  "adjIn",
  "bsIn",
  "lmtProdIn",
  "packProdIn",
  "ccaProdIn",
  "sandProdIn",
  "mldProdIn",
  "jual",
  "totalKeluar",
  "akhir",
];

/** Legacy $subSpec order; drives both the headers and the column order. */
const SUB_SPEC = ["BJ", "CCAkhir", "FJ", "Moulding", "Sanding"] as const;
type SubKey = (typeof SUB_SPEC)[number];

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replaceAll(".", "").replaceAll(",", ".")
      : normalized.replaceAll(",", "");
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

export const mainValues = (row: MutasiSandingRow): Record<MainNumberKey, number> => {
  const masuk = toFloat(row.SANDMasuk);
  const adjOut = toFloat(row.AdjOutputSAND);
  const bsOut = toFloat(row.BSOutputSAND);
  const prodOut = toFloat(row.SANDProdOutput);
  const adjIn = toFloat(row.AdjInptSAND);
  const bsIn = toFloat(row.BSInptSAND);
  const lmtProdIn = toFloat(row.LMTProdInptSAND);
  const packProdIn = toFloat(row.PACKProdInptSAND);
  const ccaProdIn = toFloat(row.CCAProdInptSand);
  const sandProdIn = toFloat(row.SANDProdInptSand);
  const mldProdIn = toFloat(row.MLDProdInptSand);
  const jual = toFloat(row.SANDJual);
  return {
    awal: toFloat(row.SANDAwal),
    masuk,
    adjOut,
    bsOut,
    prodOut,
    totalMasuk: masuk + adjOut + bsOut + prodOut,
    adjIn,
    bsIn,
    lmtProdIn,
    packProdIn,
    ccaProdIn,
    sandProdIn,
    mldProdIn,
    jual,
    totalKeluar:
      adjIn + bsIn + lmtProdIn + packProdIn + ccaProdIn + sandProdIn + mldProdIn + jual,
    akhir: toFloat(row.SANDAkhir),
  };
};

const buildMainTable = (rows: MutasiSandingRow[]): string => {
  const totals: Record<MainNumberKey, number> = {
    awal: 0,
    masuk: 0,
    adjOut: 0,
    bsOut: 0,
    prodOut: 0,
    totalMasuk: 0,
    adjIn: 0,
    bsIn: 0,
    lmtProdIn: 0,
    packProdIn: 0,
    ccaProdIn: 0,
    sandProdIn: 0,
    mldProdIn: 0,
    jual: 0,
    totalKeluar: 0,
    akhir: 0,
  };

  const bodyRows = rows
    .map((row, index) => {
      const values = mainValues(row);
      for (const key of MAIN_KEYS) totals[key] += values[key];
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(values.awal)}</td>
      <td class="number data-cell">${fmt(values.masuk)}</td>
      <td class="number data-cell">${fmt(values.adjOut)}</td>
      <td class="number data-cell">${fmt(values.bsOut)}</td>
      <td class="number data-cell">${fmt(values.prodOut)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalMasuk)}</td>
      <td class="number data-cell">${fmt(values.adjIn)}</td>
      <td class="number data-cell">${fmt(values.bsIn)}</td>
      <td class="number data-cell">${fmt(values.lmtProdIn)}</td>
      <td class="number data-cell">${fmt(values.packProdIn)}</td>
      <td class="number data-cell">${fmt(values.ccaProdIn)}</td>
      <td class="number data-cell">${fmt(values.sandProdIn)}</td>
      <td class="number data-cell">${fmt(values.mldProdIn)}</td>
      <td class="number data-cell">${fmt(values.jual)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalKeluar)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.akhir)}</td>
    </tr>`;
    })
    .join("\n    ");

  const totalsHtml = MAIN_KEYS
    .map((key) => `<td class="number">${fmt(totals[key])}</td>`)
    .join("\n      ");

  return `<table class="report-table main-mutasi-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 30px;">No</th>
      <th rowspan="2" style="width: 180px;">Jenis</th>
      <th rowspan="2" style="width: 60px;">Awal</th>
      <th colspan="4">Masuk</th>
      <th rowspan="2" style="width: 68px;">Total<br>Masuk</th>
      <th colspan="8">Keluar</th>
      <th rowspan="2" style="width: 68px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 60px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 68px;">SAND<br>Masuk</th>
      <th style="width: 68px;">Adj Out<br>SAND</th>
      <th style="width: 68px;">BS Out<br>SAND</th>
      <th style="width: 68px;">SAND Prod<br>Out</th>
      <th style="width: 60px;">Adj Inp<br>SAND</th>
      <th style="width: 60px;">BS Inpt<br>SAND</th>
      <th style="width: 60px;">LMT Prod<br>Inpt</th>
      <th style="width: 60px;">PACK Prod<br>Inpt</th>
      <th style="width: 60px;">CCA Prod<br>Inpt</th>
      <th style="width: 60px;">SAND Prod<br>Inpt</th>
      <th style="width: 60px;">MLD Prod<br>Inpt</th>
      <th style="width: 60px;">SAND<br>Jual</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(18)}
    <tr class="totals-row">
      <td colspan="2" class="blank" style="text-align: center;">Total</td>
      ${totalsHtml}
    </tr>
  </tbody>
</table>`;
};

/** Hidden entirely when the sub SP returned no rows, so no empty state. */
const buildSubTable = (rows: SubMutasiRow[]): string => {
  const totals: Record<SubKey | "Total", number> = {
    BJ: 0,
    CCAkhir: 0,
    FJ: 0,
    Moulding: 0,
    Sanding: 0,
    Total: 0,
  };

  const bodyRows = rows
    .map((row, index) => {
      const cells = SUB_SPEC.map((key) => toFloat(row[key]));
      SUB_SPEC.forEach((key, i) => {
        totals[key] += cells[i]!;
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

  return `<div class="section-title">Input Sanding Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 30px;">No</th>
        <th style="width: 180px;">Jenis</th>
        ${SUB_SPEC.map((key) => `<th style="width: 78px;">${escapeHtml(key)}</th>`).join("\n        ")}
        <th style="width: 78px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="2" class="blank" style="text-align: center;">Total</td>
        ${SUB_SPEC.map((key) => `<td class="number">${fmt(totals[key])}</td>`).join("\n        ")}
        <td class="number">${fmt(totals.Total)}</td>
      </tr>
    </tbody>
  </table>`;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareJenis = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const mutasiSandingReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiSandingRow[]; subRows: SubMutasiRow[] }
> = {
  type: "mutasi-sanding",
  title: "Laporan Mutasi Sanding (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_Sanding"),
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_SubMutasi_Sanding"),
    ]);

    // Legacy usort: Jenis ascending on both result sets.
    const rows = (mainResult.recordset ?? []) as MutasiSandingRow[];
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
      title: "Laporan Mutasi Sanding (m3)",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: parts.join("\n  "),
      style: "mutasi_sanding",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
