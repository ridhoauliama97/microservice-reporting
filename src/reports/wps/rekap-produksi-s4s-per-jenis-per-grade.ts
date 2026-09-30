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
 * SP_LapRekapProduksiS4SPerJenisPerGrade — "Laporan Rekap Produksi S4S
 * Per-Jenis & Per-Grade (m3)".
 *
 * Same layout as the Moulding per-jenis variant: rows sorted by Jenis then
 * NamaGrade, one table per Jenis closing with a "Total" row, and a grand-total
 * table after the last group.
 *
 * Assumed columns, because no reference layout for this procedure exists in the
 * repo yet: the flow columns are In FJ / In MLD / In S4S / In ST / Output, i.e.
 * the sources the SP_SubMutasi_S4S breakdown (rekap-mutasi.ts) reports for S4S
 * production plus the SP's own Output. Change the two constants below if the
 * procedure spells them differently.
 */

interface ProduksiGradeRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaGrade: string | null;
  FJ: number | string | null;
  MLD: number | string | null;
  S4S: number | string | null;
  ST: number | string | null;
  Output: number | string | null;
}

const FLOW_KEYS = ["InFJ", "InMLD", "InS4S", "InST", "Output"] as const;
type FlowKey = (typeof FLOW_KEYS)[number];

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

const readFlows = (row: ProduksiGradeRow): Record<FlowKey, number> => ({
  InFJ: toFloat(row.FJ),
  InMLD: toFloat(row.MLD),
  InS4S: toFloat(row.S4S),
  InST: toFloat(row.ST),
  Output: toFloat(row.Output),
});

const emptyFlows = (): Record<FlowKey, number> => ({
  InFJ: 0,
  InMLD: 0,
  InS4S: 0,
  InST: 0,
  Output: 0,
});

const COLUMN_COUNT = 8;

const HEADERS = `
        <th style="width: 4%;">No</th>
        <th style="width: 12%;">Jenis Kayu</th>
        <th style="width: 12%;">Nama Grade</th>
        <th style="width: 10%;">In FJ</th>
        <th style="width: 10%;">In MLD</th>
        <th style="width: 10%;">In S4S</th>
        <th style="width: 10%;">In ST</th>
        <th style="width: 10%;">Output</th>`;

const buildGroupTable = (jenis: string, rows: ProduksiGradeRow[]): string => {
  const totals = emptyFlows();
  const bodyRows = rows
    .map((row, index) => {
      const values = readFlows(row);
      for (const key of FLOW_KEYS) totals[key] += values[key];
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(String(row.Jenis ?? ""))}</td>
        <td>${escapeHtml(String(row.NamaGrade ?? ""))}</td>
        ${FLOW_KEYS.slice(0, 4)
          .map((key) => `<td class="number">${escapeHtml(fmt(values[key]))}</td>`)
          .join("\n        ")}
        <td class="number" style="font-weight: bold;">${escapeHtml(fmt(values.Output))}</td>
      </tr>`;
    })
    .join("\n      ");
  const totalCells = FLOW_KEYS
    .map((key) => `<td class="number">${escapeHtml(fmt(totals[key]))}</td>`)
    .join("\n        ");

  return `<div class="group-title">${escapeHtml(jenis)}</div>
  <table class="report-table grade-table" style="margin-bottom: 12px;">
    <thead>
      <tr class="headers-row">${HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(COLUMN_COUNT)}
      <tr class="totals-row">
        <td colspan="3" class="center">Total</td>
        ${totalCells}
      </tr>
    </tbody>
  </table>`;
};

const buildEmptyGradeTable = (): string => `<table class="report-table">
  <thead>
    <tr class="headers-row">${HEADERS}
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(COLUMN_COUNT)}</tbody>
</table>`;

/**
 * Reproduced as the legacy blade builds it: the grand-total row emits a single
 * 23%-wide label cell followed by the flow cells, so the row is not
 * column-aligned with the group tables above. Kept for output parity.
 */
const buildGrandTotalTable = (grand: Record<FlowKey, number>): string =>
  `<table class="report-table grade-table" style="margin-top: 6px;">
    <tbody>
      <tr class="totals-row">
        <td style="width: 23%;" class="center">Grand Total</td>
        ${FLOW_KEYS.map((key) => `<td class="number" style="width: 8%;">${escapeHtml(fmt(grand[key]))}</td>`).join("\n        ")}
      </tr>
    </tbody>
  </table>`;

export const rekapProduksiS4SPerJenisPerGradeReport: ReportDefinition<
  PeriodParams,
  ProduksiGradeRow[]
> = {
  type: "rekap-produksi-s4s-per-jenis-per-grade",
  title: "Laporan Rekap Produksi S4S Per-Jenis & Per-Grade (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiS4SPerJenisPerGrade");
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

    const grand = emptyFlows();
    for (const row of rows) {
      const values = readFlows(row);
      for (const key of FLOW_KEYS) grand[key] += values[key];
    }

    const bodyHtml = rows.length > 0
      ? `${[...grouped.entries()]
          .map(([jenis, groupRows]) => buildGroupTable(jenis, groupRows))
          .join("\n  ")}\n  ${buildGrandTotalTable(grand)}`
      : buildEmptyGradeTable();

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi S4S Per-Jenis & Per-Grade (m3)",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_produksi_s4s_per_jenis_per_grade",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
