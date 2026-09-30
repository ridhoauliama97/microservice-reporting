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
 * SPWps_LapRangkumanJlhLabelInput — "Laporan Rangkuman Jumlah Label Input".
 * Ported from open-api-report's RangkumanJlhLabelInputReportService and
 * rangkuman-label-input-pdf.blade.php.
 *
 * One table per process, no totals row. Three things differ from a plain
 * dump of the procedure:
 *
 *   1. A computed Rendemen column. The procedure does not return one, so it is
 *      derived as KubikOut / KubikIN x 100, and left blank when the input is
 *      zero or missing rather than showing 0% or Infinity. That is also why the
 *      roughly half of rows coming back with every measure NULL simply produce
 *      an empty cell.
 *   2. Header labels are mapped to the readable forms - Nomor Produksi, Nama
 *      Mesin, Label In, Kubik In, Label Out, Kubik Out - instead of the raw
 *      column names.
 *   3. Rows are sorted by a fixed process order, S4S then FJ, MLD, LMT, CCAkhir,
 *      Sanding, PACK, rather than alphabetically. Any other process keeps its
 *      relative order after those.
 *
 * The process order is matched loosely: the service looks for "proses sawmill"
 * / "proses S4S" style names, and the procedure returns "PROSES S4S",
 * "PROSES CCAKHIR" and "PROSES PACK", so the prefix is stripped and the
 * remainder compared. That is why the reference lists "Proses Cross Cut Akhir"
 * while the procedure actually says "CCAKHIR".
 *
 * About half the rows come back with LabelIn "() " and every measure NULL - a
 * production number opened and closed with nothing running through it. They
 * are kept, not filtered: the row numbering is what an operator checks against
 * the production numbers, and dropping them would shift every number below.
 *
 * The Group column becomes the table heading and is not repeated as a column.
 */

interface LabelInputRow extends Record<string, unknown> {
  Group: string | null;
  NoProduksi: string | null;
  NamaMesin: string | null;
  LabelIn: string | null;
  KubikIN: number | string | null;
  LabelOut: number | string | null;
  KubikOut: number | string | null;
}

interface LabelInputGroup {
  name: string;
  rows: Array<LabelInputRow & { Rendemen: number | null }>;
}

interface LabelInputData {
  groups: LabelInputGroup[];
}

/** The reference PROCESS_ORDER, in production order rather than alphabetical. */
const PROCESS_ORDER = [
  "S4S",
  "FJ",
  "MLD",
  "LMT",
  "CCAKHIR",
  "SANDING",
  "PACK",
];

const COLUMNS = 6;

/** Raw column name to the header the reference prints. */
const HEADER_LABELS: Record<string, string> = {
  NoProduksi: "Nomor Produksi",
  NamaMesin: "Nama Mesin",
  LabelIn: "Label In",
  KubikIN: "Kubik In",
  LabelOut: "Label Out",
  KubikOut: "Kubik Out",
  Rendemen: "Rendemen",
};

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll(",", ".");
  if (normalized === "" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy $fmt: four decimals, empty for a non-numeric value. */
const fmt = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 4);

/** Label counts are whole numbers. */
const fmtInt = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 0);

/** Rendemen carries a percent sign and one decimal. */
const fmtPercent = (value: number | null): string =>
  value === null ? "" : `${formatNumber(value, 1)}%`;

/**
 * Renders a group label down to the process key, so "PROSES CCAKHIR" matches
 * the "CCAKHIR" entry in PROCESS_ORDER. An unrecognised process returns null and
 * keeps its place after the known ones.
 */
export function processRank(group: string): number {
  const normalized = group
    .toLowerCase()
    .replace(/^proses\s+/, "")
    .replace(/^sawmill\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const index = PROCESS_ORDER.findIndex(
    (key) => key.toLowerCase() === normalized,
  );
  return index === -1 ? PROCESS_ORDER.length : index;
}

export function buildLabelInputGroups(rows: LabelInputRow[]): LabelInputData {
  // Stable sort: uasort in the reference keeps the procedure's order inside a
  // process, and so does this.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const byProcess =
        processRank(toText(left.row.Group)) -
        processRank(toText(right.row.Group));
      return byProcess !== 0 ? byProcess : left.index - right.index;
    })
    .map((entry) => entry.row);

  const groups = new Map<string, LabelInputGroup>();
  for (const row of sorted) {
    const name = toText(row.Group) || "Tanpa Group";
    let group = groups.get(name);
    if (!group) {
      group = { name, rows: [] };
      groups.set(name, group);
    }
    const input = toFloat(row.KubikIN);
    const output = toFloat(row.KubikOut);
    group.rows.push({
      ...row,
      // Blank rather than 0% when there is no input to divide by: an idle
      // production number has no yield, and "0%" would read as a bad one.
      Rendemen:
        input !== null && input !== 0 && output !== null
          ? (output / input) * 100
          : null,
    });
  }

  return { groups: [...groups.values()] };
}

const HEADERS = [
  ["NoProduksi", "9%"],
  ["NamaMesin", "13%"],
  ["LabelIn", "15%"],
  ["KubikIN", "11%"],
  ["LabelOut", "10%"],
  ["KubikOut", "11%"],
  ["Rendemen", "9%"],
] as const;

const buildGroupTable = (group: LabelInputGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center data-cell" style="width: 4%;">${index + 1}</td>
        <td class="label data-cell" style="width: 9%;">${escapeHtml(toText(row.NoProduksi))}</td>
        <td class="label data-cell" style="width: 13%;">${escapeHtml(toText(row.NamaMesin))}</td>
        <td class="label data-cell" style="width: 15%;">${escapeHtml(toText(row.LabelIn))}</td>
        <td class="number data-cell" style="width: 11%; font-weight: bold;">${escapeHtml(fmt(toFloat(row.KubikIN)))}</td>
        <td class="number data-cell" style="width: 10%;">${escapeHtml(fmtInt(toFloat(row.LabelOut)))}</td>
        <td class="number data-cell" style="width: 11%; font-weight: bold;">${escapeHtml(fmt(toFloat(row.KubikOut)))}</td>
        <td class="number data-cell" style="width: 9%; font-weight: bold;">${escapeHtml(fmtPercent(row.Rendemen))}</td>
      </tr>`,
    )
    .join("\n    ");

  return `<div class="group-title">${escapeHtml(group.name)}</div>
  <table class="report-table">
    <thead>
      <tr class="headers-row">
        <th style="text-align: center; width: 4%;">No</th>
        ${HEADERS.map(
          ([key, width]) =>
            `<th style="width: ${width};">${escapeHtml(HEADER_LABELS[key] ?? key)}</th>`,
        ).join("\n        ")}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(COLUMNS + 1)}
    </tbody>
  </table>`;
};

export const rangkumanJumlahLabelInputReport: ReportDefinition<
  PeriodParams,
  LabelInputData
> = {
  type: "rangkuman-jumlah-label-input",
  title: "Laporan Rangkuman Jumlah Label Input",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapRangkumanJlhLabelInput");
    return buildLabelInputGroups(
      (result.recordset ?? []) as LabelInputRow[],
    );
  },

  render(data, meta) {
    const bodyHtml =
      data.groups.length > 0
        ? data.groups.map(buildGroupTable).join("\n  ")
        : `<table class="report-table"><tbody>${buildEmptyTableRow(COLUMNS + 1)}</tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rangkuman Jumlah Label Input",
      subtitle: `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rangkuman_label_input",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
