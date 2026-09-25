import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { renderWpsReportPage } from "./template";

/**
 * SP_Mutasi_CCAkhir + SP_SubMutasi_CCAkhir — "Laporan Mutasi Cross Cut Akhir
 * (m3)". Ported from MutasiCCAkhirReportService and
 * cca-akhir-pdf.blade.php.
 *
 * The main SP supplies one row per Jenis and the sub SP supplies the input
 * production breakdown. Totals are calculated by the same formulas as the
 * legacy Blade: Total Masuk = Adj Out + BS Out + CCA Prod Out + CCA Masuk;
 * Total Keluar is the sum of the ten outgoing columns; Akhir is taken from
 * the SP rather than recomputed.
 */

interface MutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  CCAkhirAwal: number | string | null;
  AdjOutputCCA: number | string | null;
  BSOutputCCA: number | string | null;
  CCAProdOutput: number | string | null;
  CCAMasuk: number | string | null;
  AdjInptCCA: number | string | null;
  BSInputCCA: number | string | null;
  CCAJual: number | string | null;
  FJProdInpt: number | string | null;
  LMTProdInpt: number | string | null;
  MldProdinpt: number | string | null;
  S4SProdInpt: number | string | null;
  SandProdInpt: number | string | null;
  PACKProdInpt: number | string | null;
  CCAInputCCA: number | string | null;
  CCAAkhir: number | string | null;
}

interface SubMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  FJ: number | string | null;
  Laminating: number | string | null;
  Reproses: number | string | null;
  WIP: number | string | null;
  BJ: number | string | null;
  Sanding: number | string | null;
  CCAkhir: number | string | null;
}

type MainNumberKey =
  | "awal"
  | "adjOut"
  | "bsOut"
  | "prodOut"
  | "ccaMasuk"
  | "totalMasuk"
  | "adjIn"
  | "bsIn"
  | "ccaJual"
  | "fjInpt"
  | "lmtInpt"
  | "mldInpt"
  | "s4sInpt"
  | "sandInpt"
  | "packInpt"
  | "ccaProdInpt"
  | "totalKeluar"
  | "akhir";

type SubNumberKey =
  | "BJ"
  | "CCAkhir"
  | "FJ"
  | "Laminating"
  | "WIP"
  | "Reproses"
  | "Sanding"
  | "Total";

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

const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const emptyMainTotals = (): Record<MainNumberKey, number> => ({
  awal: 0,
  adjOut: 0,
  bsOut: 0,
  prodOut: 0,
  ccaMasuk: 0,
  totalMasuk: 0,
  adjIn: 0,
  bsIn: 0,
  ccaJual: 0,
  fjInpt: 0,
  lmtInpt: 0,
  mldInpt: 0,
  s4sInpt: 0,
  sandInpt: 0,
  packInpt: 0,
  ccaProdInpt: 0,
  totalKeluar: 0,
  akhir: 0,
});

const emptySubTotals = (): Record<SubNumberKey, number> => ({
  BJ: 0,
  CCAkhir: 0,
  FJ: 0,
  Laminating: 0,
  WIP: 0,
  Reproses: 0,
  Sanding: 0,
  Total: 0,
});

const mainValues = (row: MutasiRow): Record<MainNumberKey, number> => {
  const awal = toFloat(row.CCAkhirAwal);
  const adjOut = toFloat(row.AdjOutputCCA);
  const bsOut = toFloat(row.BSOutputCCA);
  const prodOut = toFloat(row.CCAProdOutput);
  const ccaMasuk = toFloat(row.CCAMasuk);
  const adjIn = toFloat(row.AdjInptCCA);
  const bsIn = toFloat(row.BSInputCCA);
  const ccaJual = toFloat(row.CCAJual);
  const fjInpt = toFloat(row.FJProdInpt);
  const lmtInpt = toFloat(row.LMTProdInpt);
  const mldInpt = toFloat(row.MldProdinpt);
  const s4sInpt = toFloat(row.S4SProdInpt);
  const sandInpt = toFloat(row.SandProdInpt);
  const packInpt = toFloat(row.PACKProdInpt);
  const ccaProdInpt = toFloat(row.CCAInputCCA);
  return {
    awal,
    adjOut,
    bsOut,
    prodOut,
    ccaMasuk,
    totalMasuk: adjOut + bsOut + prodOut + ccaMasuk,
    adjIn,
    bsIn,
    ccaJual,
    fjInpt,
    lmtInpt,
    mldInpt,
    s4sInpt,
    sandInpt,
    packInpt,
    ccaProdInpt,
    totalKeluar:
      adjIn +
      bsIn +
      ccaJual +
      fjInpt +
      lmtInpt +
      mldInpt +
      s4sInpt +
      sandInpt +
      packInpt +
      ccaProdInpt,
    akhir: toFloat(row.CCAAkhir),
  };
};

const subValues = (row: SubMutasiRow): Record<SubNumberKey, number> => {
  const values = {
    BJ: toFloat(row.BJ),
    CCAkhir: toFloat(row.CCAkhir),
    FJ: toFloat(row.FJ),
    Laminating: toFloat(row.Laminating),
    WIP: toFloat(row.WIP),
    Reproses: toFloat(row.Reproses),
    Sanding: toFloat(row.Sanding),
  };
  return {
    ...values,
    Total: Object.values(values).reduce((sum, value) => sum + value, 0),
  };
};

const buildMainTable = (
  rows: MutasiRow[],
): { html: string; totals: Record<MainNumberKey, number> } => {
  const totals = emptyMainTotals();
  const bodyRows = rows
    .map((row, index) => {
      const values = mainValues(row);
      for (const [key, value] of Object.entries(values) as [
        MainNumberKey,
        number,
      ][]) {
        totals[key] += value;
      }
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(values.awal)}</td>
      <td class="number data-cell">${fmt(values.adjOut)}</td>
      <td class="number data-cell">${fmt(values.bsOut)}</td>
      <td class="number data-cell">${fmt(values.prodOut)}</td>
      <td class="number data-cell">${fmt(values.ccaMasuk)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalMasuk)}</td>
      <td class="number data-cell">${fmt(values.adjIn)}</td>
      <td class="number data-cell">${fmt(values.bsIn)}</td>
      <td class="number data-cell">${fmt(values.ccaJual)}</td>
      <td class="number data-cell">${fmt(values.fjInpt)}</td>
      <td class="number data-cell">${fmt(values.lmtInpt)}</td>
      <td class="number data-cell">${fmt(values.mldInpt)}</td>
      <td class="number data-cell">${fmt(values.s4sInpt)}</td>
      <td class="number data-cell">${fmt(values.sandInpt)}</td>
      <td class="number data-cell">${fmt(values.packInpt)}</td>
      <td class="number data-cell">${fmt(values.ccaProdInpt)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalKeluar)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.akhir)}</td>
    </tr>`;
    })
    .join("\n    ");

  const totalCells: MainNumberKey[] = [
    "awal",
    "adjOut",
    "bsOut",
    "prodOut",
    "ccaMasuk",
    "totalMasuk",
    "adjIn",
    "bsIn",
    "ccaJual",
    "fjInpt",
    "lmtInpt",
    "mldInpt",
    "s4sInpt",
    "sandInpt",
    "packInpt",
    "ccaProdInpt",
    "totalKeluar",
    "akhir",
  ];
  const totalsHtml = totalCells
    .map((key) => `<td class="number">${fmt(totals[key])}</td>`)
    .join("\n      ");

  return {
    html: `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 2%;">No</th>
      <th rowspan="2" style="width: 13%;">Jenis</th>
      <th rowspan="2" style="width: 4.6%;">Awal</th>
      <th colspan="4">Masuk</th>
      <th rowspan="2" style="width: 5.7%;">Total<br>Masuk</th>
      <th colspan="10">Keluar</th>
      <th rowspan="2" style="width: 5.7%;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 4.6%;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 4.6%;">Adj<br>Out<br>CCA</th>
      <th style="width: 4.6%;">BS<br>Out<br>CCA</th>
      <th style="width: 4.6%;">CCA<br>Prod<br>Out</th>
      <th style="width: 4.6%;">CCA<br>Masuk</th>
      <th style="width: 4.6%;">Adj<br>In<br>CCA</th>
      <th style="width: 4.6%;">BS<br>In<br>CCA</th>
      <th style="width: 4.6%;">CCA<br>Jual</th>
      <th style="width: 4.6%;">FJ<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">LMT<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">Mld<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">S4S<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">Sand<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">Pack<br>Prod<br>Inpt</th>
      <th style="width: 4.6%;">CCA<br>Prod<br>Inpt</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td colspan="20" class="center">Tidak ada data.</td></tr>`}
    <tr class="totals-row">
      <td colspan="2" class="blank">Total</td>
      ${totalsHtml}
    </tr>
  </tbody>
</table>`,
    totals,
  };
};

const buildSubTable = (rows: SubMutasiRow[]): string => {
  const totals = emptySubTotals();
  const bodyRows = rows
    .map((row, index) => {
      const values = subValues(row);
      for (const [key, value] of Object.entries(values) as [
        SubNumberKey,
        number,
      ][]) {
        totals[key] += value;
      }
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(values.BJ)}</td>
      <td class="number data-cell">${fmt(values.CCAkhir)}</td>
      <td class="number data-cell">${fmt(values.FJ)}</td>
      <td class="number data-cell">${fmt(values.Laminating)}</td>
      <td class="number data-cell">${fmt(values.WIP)}</td>
      <td class="number data-cell">${fmt(values.Reproses)}</td>
      <td class="number data-cell">${fmt(values.Sanding)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.Total)}</td>
    </tr>`;
    })
    .join("\n      ");

  const totalKeys: SubNumberKey[] = [
    "BJ",
    "CCAkhir",
    "FJ",
    "Laminating",
    "WIP",
    "Reproses",
    "Sanding",
    "Total",
  ];
  const totalCells = totalKeys
    .map((key) => `<td class="number">${fmt(totals[key])}</td>`)
    .join("\n        ");

  return `<div class="section-title">Input Cross Cut Akhir Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 30px;">No</th>
        <th style="width: 210px;">Jenis</th>
        <th style="width: 70px;">BJ</th>
        <th style="width: 70px;">CCAkhir</th>
        <th style="width: 70px;">FJ</th>
        <th style="width: 70px;">Laminating</th>
        <th style="width: 70px;">Moulding</th>
        <th style="width: 70px;">Reproses</th>
        <th style="width: 70px;">Sanding</th>
        <th style="width: 78px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="2" class="blank">Total</td>
        ${totalCells}
      </tr>
    </tbody>
  </table>`;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/(\d{2})\d{2}$/, "$1");

const MUTASI_CC_CSS = `
  .report-table th, .report-table td.number { white-space: nowrap; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .sub-report-table { width: 92%; }
`;

export const mutasiCrossCutAkhirReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiRow[]; subRows: SubMutasiRow[] }
> = {
  type: "mutasi-cross-cut-akhir",
  title: "Laporan Mutasi Cross Cut Akhir (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_CCAkhir"),
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_SubMutasi_CCAkhir"),
    ]);
    return {
      rows: (mainResult.recordset ?? []) as MutasiRow[],
      subRows: (subResult.recordset ?? []) as SubMutasiRow[],
    };
  },

  render(data, meta) {
    const main = buildMainTable(data.rows);
    const bodyHtml = `${main.html}${data.subRows.length > 0 ? `\n  ${buildSubTable(data.subRows)}` : ""}`;
    return renderWpsReportPage({
      title: "Laporan Mutasi Cross Cut Akhir (m3)",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: MUTASI_CC_CSS,
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
