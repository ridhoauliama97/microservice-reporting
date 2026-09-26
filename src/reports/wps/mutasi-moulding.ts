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
 * SP_Mutasi_Moulding + SP_SubMutasi_Moulding — "Laporan Mutasi Moulding (m3)".
 * Ported from MutasiMouldingReportService and moulding-pdf.blade.php.
 *
 * Totals follow the legacy formulas: Total Masuk = Adj Out + BS Out + Prod Out;
 * Total Keluar is the sum of the nine outgoing columns; Akhir comes from the SP.
 *
 * Two upstream quirks are preserved rather than corrected:
 *  - the SP column is misspelled "BSOutptutMLD";
 *  - the blade also lists "MLDMasuk" as a late fallback for the Prod Out
 *    display column, so MLDMasuk is never displayed and is not read here.
 *
 * Deliberately NOT shared with the Cross Cut Akhir, Finger Joint or Laminating
 * mutasi reports: this one groups 3 columns under Masuk and 9 under Keluar
 * (18 total), and its sub table has nine input columns.
 */

export interface MutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  MLDAwal: number | string | null;
  AdjOutputMLD: number | string | null;
  /** Misspelled upstream; the name the SP actually returns. */
  BSOutptutMLD: number | string | null;
  MLDProdOutput: number | string | null;
  AdjInptMLD: number | string | null;
  BSInptMLD: number | string | null;
  MLDJual: number | string | null;
  CCAInptMLD: number | string | null;
  LMTInptMLD: number | string | null;
  MLDInptMLD: number | string | null;
  PACKInptMLD: number | string | null;
  SANDInptMLD: number | string | null;
  S4SinptMLD: number | string | null;
  MLDAkhir: number | string | null;
}

export interface SubMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  Total: number | string | null;
  [key: string]: unknown;
}

type MainNumberKey =
  | "awal"
  | "adjOut"
  | "bsOut"
  | "prodOut"
  | "totalMasuk"
  | "adjInpt"
  | "bsInpt"
  | "mldJual"
  | "ccaInpt"
  | "lmtInpt"
  | "mldInpt"
  | "packInpt"
  | "sandInpt"
  | "s4sInpt"
  | "totalKeluar"
  | "akhir";

const MAIN_KEYS: MainNumberKey[] = [
  "awal",
  "adjOut",
  "bsOut",
  "prodOut",
  "totalMasuk",
  "adjInpt",
  "bsInpt",
  "mldJual",
  "ccaInpt",
  "lmtInpt",
  "mldInpt",
  "packInpt",
  "sandInpt",
  "s4sInpt",
  "totalKeluar",
  "akhir",
];

/** Legacy $subSpec order; drives both the headers and the column order. */
const SUB_SPEC = [
  { key: "BJ", label: "BJ" },
  { key: "CCAkhir", label: "CCAkhir" },
  { key: "FJ", label: "FJ" },
  { key: "Laminating", label: "Laminating" },
  { key: "Moulding", label: "Moulding" },
  { key: "Reproses", label: "Reproses" },
  { key: "S4S", label: "S4S" },
  { key: "Sanding", label: "Sanding" },
  { key: "WIP", label: "WIP" },
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
  adjInpt: 0,
  bsInpt: 0,
  mldJual: 0,
  ccaInpt: 0,
  lmtInpt: 0,
  mldInpt: 0,
  packInpt: 0,
  sandInpt: 0,
  s4sInpt: 0,
  totalKeluar: 0,
  akhir: 0,
});

export const mainValues = (row: MutasiRow): Record<MainNumberKey, number> => {
  const adjOut = toFloat(row.AdjOutputMLD);
  const bsOut = toFloat(row.BSOutptutMLD);
  const prodOut = toFloat(row.MLDProdOutput);
  const adjInpt = toFloat(row.AdjInptMLD);
  const bsInpt = toFloat(row.BSInptMLD);
  const mldJual = toFloat(row.MLDJual);
  const ccaInpt = toFloat(row.CCAInptMLD);
  const lmtInpt = toFloat(row.LMTInptMLD);
  const mldInpt = toFloat(row.MLDInptMLD);
  const packInpt = toFloat(row.PACKInptMLD);
  const sandInpt = toFloat(row.SANDInptMLD);
  const s4sInpt = toFloat(row.S4SinptMLD);
  return {
    awal: toFloat(row.MLDAwal),
    adjOut,
    bsOut,
    prodOut,
    totalMasuk: adjOut + bsOut + prodOut,
    adjInpt,
    bsInpt,
    mldJual,
    ccaInpt,
    lmtInpt,
    mldInpt,
    packInpt,
    sandInpt,
    s4sInpt,
    totalKeluar:
      adjInpt +
      bsInpt +
      mldJual +
      ccaInpt +
      lmtInpt +
      mldInpt +
      packInpt +
      sandInpt +
      s4sInpt,
    akhir: toFloat(row.MLDAkhir),
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
      <td class="number data-cell">${fmt(values.adjInpt)}</td>
      <td class="number data-cell">${fmt(values.bsInpt)}</td>
      <td class="number data-cell">${fmt(values.mldJual)}</td>
      <td class="number data-cell">${fmt(values.ccaInpt)}</td>
      <td class="number data-cell">${fmt(values.lmtInpt)}</td>
      <td class="number data-cell">${fmt(values.mldInpt)}</td>
      <td class="number data-cell">${fmt(values.packInpt)}</td>
      <td class="number data-cell">${fmt(values.sandInpt)}</td>
      <td class="number data-cell">${fmt(values.s4sInpt)}</td>
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
      <th rowspan="2" style="width: 55px;">Awal</th>
      <th colspan="3">Masuk</th>
      <th rowspan="2" style="width: 62px;">Total<br>Masuk</th>
      <th colspan="9">Keluar</th>
      <th rowspan="2" style="width: 62px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 55px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 58px;">Adj Outp MLD</th>
      <th style="width: 58px;">BS Outp MLD</th>
      <th style="width: 58px;">Prod Outp MLD</th>
      <th style="width: 58px;">Adj Inpt MLD</th>
      <th style="width: 58px;">BS Inpt MLD</th>
      <th style="width: 58px;">MLD Jual</th>
      <th style="width: 58px;">CCAInpt MLD</th>
      <th style="width: 58px;">LMT Inpt MLD</th>
      <th style="width: 58px;">MLD Inpt MLD</th>
      <th style="width: 58px;">PACKInpt MLD</th>
      <th style="width: 58px;">SAND Inpt MLD</th>
      <th style="width: 58px;">S4Sinpt MLD</th>
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
  const totals: Record<string, number> = { Total: 0 };
  for (const spec of SUB_SPEC) totals[spec.key] = 0;

  const bodyRows = rows
    .map((row, index) => {
      const cells = SUB_SPEC.map((spec) => toFloat(row[spec.key]));
      SUB_SPEC.forEach((spec, i) => {
        totals[spec.key] += cells[i]!;
      });
      const calculated = cells.reduce((sum, value) => sum + value, 0);
      // Legacy prefers a Total column when the SP provides one.
      const direct = toFloat(row.Total);
      const rowTotal = direct !== 0 ? direct : calculated;
      totals.Total += rowTotal;
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      ${cells.map((value) => `<td class="number data-cell">${fmt(value)}</td>`).join("\n      ")}
      <td class="number data-cell" style="font-weight: bold;">${fmt(rowTotal)}</td>
    </tr>`;
    })
    .join("\n      ");

  return `<div class="section-title">Input Moulding Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 32px;">No</th>
        <th style="width: 220px;">Jenis</th>
        ${SUB_SPEC.map((spec) => `<th style="width: 84px;">${escapeHtml(spec.label)}</th>`).join("\n        ")}
        <th style="width: 84px;">Total</th>
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

export const mutasiMouldingReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiRow[]; subRows: SubMutasiRow[] }
> = {
  type: "mutasi-moulding",
  title: "Laporan Mutasi Moulding (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_Moulding"),
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_SubMutasi_Moulding"),
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
      title: "Laporan Mutasi Moulding (m3)",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: parts.join("\n  "),
      style: "mutasi_moulding",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
