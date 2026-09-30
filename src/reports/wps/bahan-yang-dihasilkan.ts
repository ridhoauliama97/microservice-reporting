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
 * SPWps_LapBahanYangDihasilkan — "Laporan Rangkuman Bahan Yang Di Hasilkan".
 * Ported from open-api-report's BahanYangDihasilkanReportService and
 * bahan-yang-dihasilkan-pdf.blade.php.
 *
 * One table per process, numbered, each closing with its own "Total {proses}"
 * row, then a single Rangkuman table listing every process with its row count
 * and totals, closed by a Grand Total.
 *
 * The process order is fixed by the reference service, NOT alphabetical:
 * S4S, FJ, MLD, LMT, CCAKHIR, SND, PCK. A process the procedure returns that
 * is not in that list is appended afterwards, so a new process shows up rather
 * than disappearing. An empty Group is filed under "LAINNYA".
 *
 * This is the same procedure shape as Bahan Terpakai but a different report:
 * no sub report, no per-machine table, and a Rangkuman block at the end. The two
 * are deliberately not sharing a layout.
 *
 * Column names are verified against the live database as well: Group,
 * NamaMesin, Jenis, Tebal, Lebar, Panjang, JmlhBatang, KubikIN.
 *
 * The procedure declares a single @TglAwal, so the request body is
 * `{ tglAkhir }` bound to @TglAwal.
 */

interface BahanRow extends Record<string, unknown> {
  Group: string | null;
  NamaMesin: string | null;
  Jenis: string | null;
  /** Dimensions are absent on the live result set but declared so a column
   *  check would catch a shape change. */
  Tebal?: number | string | null;
  Lebar?: number | string | null;
  Panjang?: number | string | null;
  JmlhBatang: number | string | null;
  KubikIN: number | string | null;
}

interface Category {
  no: number;
  name: string;
  rows: BahanRow[];
  totalPcs: number;
  totalVolume: number;
}

interface SummaryRow {
  kategori: string;
  jumlah: number;
  totalPcs: number;
  totalVolume: number;
}

interface BahanData {
  categories: Category[];
  summary: SummaryRow[];
  grandRowCount: number;
  grandPcs: number;
  grandVolume: number;
}

/** The reference service's CATEGORY_ORDER, not alphabetical. */
const CATEGORY_ORDER = [
  "PROSES S4S",
  "PROSES FJ",
  "PROSES MLD",
  "PROSES LMT",
  "PROSES CCAKHIR",
  "PROSES SND",
  "PROSES PCK",
];

const COLUMNS = 8;

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

const fmtInt = (value: unknown): string => {
  const numeric = toFloat(value);
  return numeric === null ? "" : formatNumber(Math.round(numeric), 0);
};

/** Legacy $fmtDim: whole number, but a dash rather than a blank. */
const fmtDim = (value: unknown): string => {
  const numeric = toFloat(value);
  return numeric === null ? "-" : formatNumber(Math.round(numeric), 0);
};

const orDash = (value: unknown): string => toText(value) || "-";

export function buildBahanCategories(rows: BahanRow[]): BahanData {
  const grouped = new Map<string, Category>();
  for (const row of rows) {
    const name = toText(row.Group) || "LAINNYA";
    let category = grouped.get(name);
    if (!category) {
      category = { no: 0, name, rows: [], totalPcs: 0, totalVolume: 0 };
      grouped.set(name, category);
    }
    category.rows.push(row);
    category.totalPcs += num(row.JmlhBatang);
    category.totalVolume += num(row.KubikIN);
  }

  // Fixed process order first, then anything the procedure added that the
  // reference list does not know about.
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
    totalPcs: category.totalPcs,
    totalVolume: category.totalVolume,
  }));

  return {
    categories: ordered,
    summary,
    grandRowCount: rows.length,
    grandPcs: summary.reduce((sum, row) => sum + row.totalPcs, 0),
    grandVolume: summary.reduce((sum, row) => sum + row.totalVolume, 0),
  };
}

const buildCategoryTable = (category: Category): string => {
  const bodyRows = category.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(orDash(row.NamaMesin))}</td>
        <td>${escapeHtml(orDash(row.Jenis))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Panjang))}</td>
        <td class="number">${escapeHtml(fmtInt(row.JmlhBatang))}</td>
        <td class="number">${escapeHtml(fmt(row.KubikIN))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">${category.no}. ${escapeHtml(category.name)}</div>
  <table class="report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 36px;">No</th>
        <th style="width: 120px;">Nama Mesin</th>
        <th>Jenis</th>
        <th style="width: 54px;">Tebal</th>
        <th style="width: 54px;">Lebar</th>
        <th style="width: 64px;">Panjang</th>
        <th style="width: 58px;">Pcs</th>
        <th style="width: 84px;">Kubik</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total-row totals-row">
        <td colspan="6" class="center">Total ${escapeHtml(category.name)}</td>
        <td class="number">${escapeHtml(fmtInt(category.totalPcs))}</td>
        <td class="number">${escapeHtml(fmt(category.totalVolume))}</td>
      </tr>
    </tbody>
  </table>`;
};

const buildSummaryTable = (data: BahanData): string => {
  const bodyRows = data.summary
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td>${escapeHtml(orDash(row.kategori))}</td>
        <td class="number">${escapeHtml(fmtInt(row.jumlah))}</td>
        <td class="number">${escapeHtml(fmtInt(row.totalPcs))}</td>
        <td class="number">${escapeHtml(fmt(row.totalVolume))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">Rangkuman</div>
  <table class="report-table summary-table">
    <thead>
      <tr class="headers-row">
        <th>Kategori</th>
        <th style="width: 84px;">Jumlah</th>
        <th style="width: 90px;">Total Pcs</th>
        <th style="width: 96px;">Total Kubik</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total-row totals-row">
        <td class="center">Grand Total</td>
        <td class="number">${escapeHtml(fmtInt(data.grandRowCount))}</td>
        <td class="number">${escapeHtml(fmtInt(data.grandPcs))}</td>
        <td class="number">${escapeHtml(fmt(data.grandVolume))}</td>
      </tr>
    </tbody>
  </table>`;
};

export const bahanYangDihasilkanReport: ReportDefinition<
  SingleDateParams,
  BahanData
> = {
  type: "bahan-yang-dihasilkan",
  title: "Laporan Rangkuman Bahan Yang Di Hasilkan",
  paramsSchema: singleDateParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAkhir)
      .execute("SPWps_LapBahanYangDihasilkan");
    return buildBahanCategories(
      (result.recordset ?? []) as BahanRow[],
    );
  },

  render(data, meta) {
    const bodyHtml =
      data.categories.length > 0
        ? `${data.categories.map(buildCategoryTable).join("\n  ")}\n  ${buildSummaryTable(data)}`
        : buildEmptyTable(COLUMNS);

    return renderWpsReportPage({
      title: "Laporan Rangkuman Bahan Yang Di Hasilkan",
      subtitle: `Per-Tanggal ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "bahan_yang_dihasilkan",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
