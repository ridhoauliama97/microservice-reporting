import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import type { ReportDefinition } from "../types";
import {
  buildEmptyTable,
  renderWpsReportPage,
  singleDateParamsSchema,
  type SingleDateParams,
} from "./template";

/**
 * SPWps_LapRangkumanBongkarSusun — "Laporan Rangkuman Bongkar Susun". Ported
 * from open-api-report's RangkumanBongkarSusunReportService and
 * rangkuman-bongkar-susun-pdf.blade.php.
 *
 * One table per category, numbered, each closing with "Total {kategori}", then
 * a Rangkuman table with a row count per category and a Grand Total.
 *
 * The category order is the reference CATEGORY_ORDER - S4S, FJ, MLD, LMT, CCA,
 * SND, BJ - not alphabetical, with any extra category appended so a new one
 * still shows up. An empty Category is filed under "LAINNYA".
 *
 * InA and OutA are both areas in m2. The two totals are kept apart rather than
 * added: their difference is the whole point of a restack entry, and one
 * combined figure would hide it.
 *
 * The procedure declares a single @TglAwal, so the request body is
 * `{ tglAkhir }` bound to @TglAwal.
 */

interface BongkarRow extends Record<string, unknown> {
  Category: string | null;
  NoBongkarSusun: string | null;
  Jenis: string | null;
  InA: number | string | null;
  OutA: number | string | null;
  /** Usually NULL in the live data; kept because the reference prints a dash. */
  Keterangan?: string | null;
}

interface Category {
  no: number;
  name: string;
  rows: BongkarRow[];
  totalIn: number;
  totalOut: number;
}

interface SummaryRow {
  kategori: string;
  jumlah: number;
  totalIn: number;
  totalOut: number;
}

interface BongkarData {
  categories: Category[];
  summary: SummaryRow[];
  grandRowCount: number;
  grandIn: number;
  grandOut: number;
}

const CATEGORY_ORDER = ["S4S", "FJ", "MLD", "LMT", "CCA", "SND", "BJ"];

const COLUMNS = 6;

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll(",", ".");
  if (normalized === "" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const num = (value: unknown): number => toFloat(value) ?? 0;

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy $fmt: four decimals, empty for a non-numeric value. */
const fmt = (value: unknown): string => {
  const numeric = toFloat(value);
  return numeric === null ? "" : formatNumber(numeric, 4);
};

const orDash = (value: unknown): string => toText(value) || "-";

export function buildBongkarCategories(rows: BongkarRow[]): BongkarData {
  const grouped = new Map<string, Category>();
  for (const row of rows) {
    const name = toText(row.Category) || "LAINNYA";
    let category = grouped.get(name);
    if (!category) {
      category = { no: 0, name, rows: [], totalIn: 0, totalOut: 0 };
      grouped.set(name, category);
    }
    category.rows.push(row);
    category.totalIn += num(row.InA);
    category.totalOut += num(row.OutA);
  }

  const ordered: Category[] = [];
  for (const key of CATEGORY_ORDER) {
    const category = grouped.get(key);
    if (category) ordered.push(category);
  }
  for (const category of grouped.values()) {
    if (!CATEGORY_ORDER.includes(category.name)) ordered.push(category);
  }
  ordered.forEach((category, index) => {
    category.no = index + 1;
  });

  const summary: SummaryRow[] = ordered.map((category) => ({
    kategori: category.name,
    jumlah: category.rows.length,
    totalIn: category.totalIn,
    totalOut: category.totalOut,
  }));

  return {
    categories: ordered,
    summary,
    grandRowCount: rows.length,
    grandIn: summary.reduce((sum, row) => sum + row.totalIn, 0),
    grandOut: summary.reduce((sum, row) => sum + row.totalOut, 0),
  };
}

const buildCategoryTable = (category: Category): string => {
  const bodyRows = category.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(orDash(row.NoBongkarSusun))}</td>
        <td>${escapeHtml(orDash(row.Jenis))}</td>
        <td class="number">${escapeHtml(fmt(row.InA))}</td>
        <td class="number">${escapeHtml(fmt(row.OutA))}</td>
        <td>${escapeHtml(orDash(row.Keterangan))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">${category.no}. ${escapeHtml(category.name)}</div>
  <table class="report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 36px;">No</th>
        <th style="width: 110px;">No Bongkar Susun</th>
        <th style="width: 110px;">Jenis</th>
        <th style="width: 84px;">In</th>
        <th style="width: 84px;">Out</th>
        <th>Keterangan</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total-row totals-row">
        <td colspan="3" class="center">Total ${escapeHtml(category.name)}</td>
        <td class="number">${escapeHtml(fmt(category.totalIn))}</td>
        <td class="number">${escapeHtml(fmt(category.totalOut))}</td>
        <td></td>
      </tr>
    </tbody>
  </table>`;
};

const buildSummaryTable = (data: BongkarData): string => {
  const bodyRows = data.summary
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td>${escapeHtml(orDash(row.kategori))}</td>
        <td class="number">${escapeHtml(formatNumber(row.jumlah, 0))}</td>
        <td class="number">${escapeHtml(fmt(row.totalIn))}</td>
        <td class="number">${escapeHtml(fmt(row.totalOut))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">Rangkuman</div>
  <table class="report-table summary-table">
    <thead>
      <tr class="headers-row">
        <th>Kategori</th>
        <th style="width: 84px;">Jumlah</th>
        <th style="width: 96px;">Total In</th>
        <th style="width: 96px;">Total Out</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total-row totals-row">
        <td class="center">Grand Total</td>
        <td class="number">${escapeHtml(formatNumber(data.grandRowCount, 0))}</td>
        <td class="number">${escapeHtml(fmt(data.grandIn))}</td>
        <td class="number">${escapeHtml(fmt(data.grandOut))}</td>
      </tr>
    </tbody>
  </table>`;
};

export const rangkumanBongkarSusunReport: ReportDefinition<
  SingleDateParams,
  BongkarData
> = {
  type: "rangkuman-bongkar-susun",
  title: "Laporan Rangkuman Bongkar Susun",
  paramsSchema: singleDateParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAkhir)
      .execute("SPWps_LapRangkumanBongkarSusun");
    return buildBongkarCategories(
      (result.recordset ?? []) as BongkarRow[],
    );
  },

  render(data, meta) {
    const bodyHtml =
      data.categories.length > 0
        ? `${data.categories.map(buildCategoryTable).join("\n  ")}\n  ${buildSummaryTable(data)}`
        : buildEmptyTable(COLUMNS);

    return renderWpsReportPage({
      title: "Laporan Rangkuman Bongkar Susun",
      subtitle: `Tanggal ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rangkuman_bongkar_susun",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
