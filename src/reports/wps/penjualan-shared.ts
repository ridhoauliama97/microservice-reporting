import { escapeHtml, formatNumber } from "../../templates/html";
import { buildEmptyTableRow } from "./template";

/**
 * Shared pieces of the "Rekap Penjualan" family (Per-Produk, Per-Produk &
 * Per-Buyer, Per-Buyer & Per-Produk). All four legacy services format their
 * numbers the same way and repeat the same 7-column detail table, so the
 * formatting and the table live here instead of being copied four times.
 */

/**
 * number_format($v, $d, '.', ','). The three services each defined the same
 * three closures; only the decimals and the trailing " %" differ. A null renders
 * as an empty cell rather than as 0, which is what the legacy closures did.
 */
const fmt = (value: number | null | undefined, decimals: number): string =>
  value === null || value === undefined ? "" : formatNumber(value, decimals);

export const fmtInt = (value: number | null | undefined): string => fmt(value, 0);
export const fmtM3 = (value: number | null | undefined): string => fmt(value, 4);
export const fmtRatio = (value: number | null | undefined): string => fmt(value, 2);
export const fmtPct = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : `${formatNumber(value, 2)} %`;

/** Roman numerals for the product sections of the Per-Produk report. */
export function toRoman(number: number): string {
  const map: Array<[string, number]> = [
    ["M", 1000],
    ["CM", 900],
    ["D", 500],
    ["CD", 400],
    ["C", 100],
    ["XC", 90],
    ["L", 50],
    ["XL", 40],
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1],
  ];
  let remaining = number;
  let result = "";
  for (const [roman, value] of map) {
    while (remaining >= value) {
      result += roman;
      remaining -= value;
    }
  }
  return result;
}

/** One size/quantity line inside a product (or buyer/product) section. */
export interface PenjualanDetailRow {
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  jmlhBatang: number;
  m3: number;
  /** Share of the parent group's total, in percent. */
  ratio: number | null;
}

const DETAIL_HEADERS = `
        <th style="width: 5%;">No</th>
        <th>Tebal</th>
        <th>Lebar</th>
        <th>Panjang</th>
        <th>Pcs</th>
        <th style="width: 15%;">M3</th>
        <th style="width: 15%;">Rasio (%)</th>`;

export interface PenjualanDetailTableOptions {
  rows: PenjualanDetailRow[];
  /** Subtotal shown in the total row, and the ratio printed beside it. */
  totalM3: number;
  totalRatio: number | null;
  /** Trailing space the legacy total label carries on the two export reports. */
  totalLabel: string;
  /**
   * Per-Produk has an eighth, header-less column holding the running ratio. It
   * only shows figures while the running total is at or below 70%.
   */
  cumulative?: Array<number | null>;
  /**
   * Indents the table so its left edge lines up with the group label above it.
   * The two export reports nest a table under each Buyer/Produk heading; the
   * Per-Produk report has no such heading and keeps the table flush left.
   */
  indented?: boolean;
}

/**
 * The detail table all three reports repeat, with its total row spanning the
 * five dimension columns. An empty body still renders the shared empty state so
 * a group with no lines is visibly empty rather than a bare header.
 */
export function renderPenjualanDetailTable(
  options: PenjualanDetailTableOptions,
): string {
  const hasCumulative = options.cumulative !== undefined;
  // The running-ratio cell only exists when the caller asked for it. It used to
  // be emitted either way, which added a phantom eighth column to the two
  // export reports: their data rows had a cell the header and the total row
  // did not, so the table ended in a borderless empty strip.
  const cumulativeCell = (index: number): string => {
    if (!hasCumulative) return "";
    const value = options.cumulative![index] ?? null;
    return `<td class="number">${value === null ? "" : escapeHtml(fmtPct(value))}</td>`;
  };

  const body = options.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td class="center">${index + 1}</td>
            <td class="center">${escapeHtml(fmtInt(row.tebal))}</td>
            <td class="center">${escapeHtml(fmtInt(row.lebar))}</td>
            <td class="center">${escapeHtml(fmtInt(row.panjang))}</td>
            <td class="number">${escapeHtml(fmtInt(row.jmlhBatang))}</td>
            <td class="number">${escapeHtml(fmtM3(row.m3))}</td>
            <td class="number">${escapeHtml(fmtRatio(row.ratio))}</td>
            ${cumulativeCell(index)}
          </tr>`,
    )
    .join("\n          ");

  const headers = hasCumulative
    ? `${DETAIL_HEADERS}
        <th style="width: 10%;"></th>`
    : DETAIL_HEADERS;

  return `<table class="report-table product-table${options.indented ? " indented-table" : ""}">
    <thead>
      <tr class="headers-row">${headers}
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(hasCumulative ? 8 : 7)}
      <tr class="totals-row">
        <td class="center" colspan="5">${escapeHtml(options.totalLabel)}</td>
        <td class="number">${escapeHtml(fmtM3(options.totalM3))}</td>
        <td class="number">${escapeHtml(fmtPct(options.totalRatio))}</td>
        ${hasCumulative ? '<td class="number"></td>' : ""}
      </tr>
    </tbody>
  </table>`;
}

/** Percentage of `part` against `whole`, or null when there is nothing to share. */
export function shareRatio(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}
