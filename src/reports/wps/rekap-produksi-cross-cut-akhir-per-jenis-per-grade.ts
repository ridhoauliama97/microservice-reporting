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
 * SP_LapRekapProduksiCCAkhirPerJenisPerGrade — "Laporan Rekap Produksi CCAkhir
 * Per-Jenis & Per-Grade (m3)". Ported from the legacy service and Blade.
 * Rows are sorted by Jenis then NamaGrade and grouped per Jenis.
 */

interface ProduksiGradeRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaGrade: string | null;
  FJ: number | string | null;
  Laminating: number | string | null;
  WIP: number | string | null;
  Reproses: number | string | null;
  Output: number | string | null;
}

type FlowKey = "InFJ" | "InLaminating" | "InWIP" | "InReproses" | "Output";
const FLOW_KEYS: FlowKey[] = ["InFJ", "InLaminating", "InWIP", "InReproses", "Output"];

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.trim();
  if (normalized === "" || normalized === "-") return 0;
  let result = normalized.replaceAll(" ", "");
  if (result.includes(",") && result.includes(".")) {
    result = result.lastIndexOf(",") > result.lastIndexOf(".")
      ? result.replaceAll(".", "").replaceAll(",", ".")
      : result.replaceAll(",", "");
  } else if (result.includes(",")) {
    result = result.replaceAll(",", ".");
  }
  const parsed = Number(result);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const buildGroupTable = (jenis: string, rows: ProduksiGradeRow[]): string => {
  const totals: Record<FlowKey, number> = {
    InFJ: 0,
    InLaminating: 0,
    InWIP: 0,
    InReproses: 0,
    Output: 0,
  };
  const bodyRows = rows.map((row, index) => {
    const values: Record<FlowKey, number> = {
      InFJ: toFloat(row.FJ),
      InLaminating: toFloat(row.Laminating),
      InWIP: toFloat(row.WIP),
      InReproses: toFloat(row.Reproses),
      Output: toFloat(row.Output),
    };
    for (const key of FLOW_KEYS) totals[key] += values[key];
    return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(String(row.Jenis ?? ""))}</td>
        <td class="label">${escapeHtml(String(row.NamaGrade ?? ""))}</td>
        <td class="number">${escapeHtml(fmt(values.InFJ))}</td>
        <td class="number">${escapeHtml(fmt(values.InLaminating))}</td>
        <td class="number">${escapeHtml(fmt(values.InWIP))}</td>
        <td class="number">${escapeHtml(fmt(values.InReproses))}</td>
        <td class="number">${escapeHtml(fmt(values.Output))}</td>
      </tr>`;
  }).join("\n      ");
  const totalCells = FLOW_KEYS.map((key) => `<td class="number">${escapeHtml(fmt(totals[key]))}</td>`).join("\n        ");

  return `<div class="group-title">${escapeHtml(jenis)}</div>
  <table class="report-table grade-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 28px;">No</th>
        <th style="width: 100px;">Jenis Kayu</th>
        <th>Nama Grade</th>
        <th style="width: 75px;">In FJ</th>
        <th style="width: 86px;">In Laminating</th>
        <th style="width: 72px;">In WIP</th>
        <th style="width: 82px;">In Reproses</th>
        <th style="width: 68px;">Output</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="8" class="center">Tidak ada data.</td></tr>`}
      <tr class="totals-row">
        <td colspan="3" class="center">Total</td>
        ${totalCells}
      </tr>
    </tbody>
  </table>`;
};

const GRADE_CSS = `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .grade-table { margin-bottom: 12px; }
  .grade-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .grade-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
`;

export const rekapProduksiCrossCutAkhirPerJenisPerGradeReport: ReportDefinition<
  PeriodParams,
  ProduksiGradeRow[]
> = {
  type: "rekap-produksi-cross-cut-akhir-per-jenis-per-grade",
  title: "Laporan Rekap Produksi CCAkhir Per-Jenis & Per-Grade (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiCCAkhirPerJenisPerGrade");
    const rows = (result.recordset ?? []) as ProduksiGradeRow[];
    rows.sort((left, right) => {
      const jenis = compareText(String(left.Jenis ?? ""), String(right.Jenis ?? ""));
      if (jenis !== 0) return jenis;
      return compareText(String(left.NamaGrade ?? ""), String(right.NamaGrade ?? ""));
    });
    return rows;
  },

  render(rows, meta) {
    const grouped = new Map<string, ProduksiGradeRow[]>();
    for (const row of rows) {
      const jenis = String(row.Jenis ?? "").trim() || "JENIS";
      const bucket = grouped.get(jenis);
      if (bucket) bucket.push(row);
      else grouped.set(jenis, [row]);
    }
    const bodyHtml = rows.length > 0
      ? [...grouped.entries()].map(([jenis, groupRows]) => buildGroupTable(jenis, groupRows)).join("\n  ")
      : `<table class="report-table"><tbody><tr><td colspan="8" class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi CCAkhir Per-Jenis & Per-Grade (m3)",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: GRADE_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
