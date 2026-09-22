import sql from "mssql";
import {
  escapeHtml,
  formatNumber4,
  formatPrintedAt,
  formatTanggalId,
  pageFooterHtml,
  renderPage,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * The standard WPS report template, ported from the legacy Blade
 * (wkhtmltopdf) output of the Mutasi Barang Jadi report: centered title,
 * period subtitle, bordered table with zebra rows, optional totals row and
 * the standard page footer.
 *
 * Report files must contain NO styling: they only declare data (columns,
 * SP name, totals) and let this module render. Hand-written `render` bodies
 * are the exception for special layouts (e.g. the multi-table mutasi view).
 */

export const WPS_REPORT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Noto Serif', serif; font-size: 10px; line-height: 1.2; color: #000; }
  .report-title { text-align: center; margin: 0; font-size: 16px; font-weight: bold; }
  .report-subtitle { text-align: center; margin: 2px 0 20px 0; font-size: 12px; color: #636466; }
  .section-title { margin: 14px 0 6px 0; font-size: 12px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; table-layout: fixed; }
  .report-table { border-spacing: 0; border-top: 0; border-right: 0; border-bottom: 1px solid #000; border-left: 1px solid #000; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
  th { text-align: center; font-weight: bold; background: #ffffff; color: #000; }
  td.center { text-align: center; }
  td.label { white-space: nowrap; }
  td.number { text-align: right; white-space: nowrap; }
  .row-odd td { background: #c9d1df; }
  .row-even td { background: #eef2f8; }
  .totals-row td { font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .totals-row td.blank { background: transparent; }
  .headers-row th { font-weight: bold; font-size: 11px; border-top: 0; border-right: 1px solid #000; border-bottom: 1px solid #000; border-left: 0; }
  .report-table thead tr.headers-row:first-child th { border-top: 1px solid #000; }
  .report-table thead tr.headers-row:first-child th[rowspan] { border-bottom: 1px solid #000; }
  .report-table thead tr.headers-row:first-child th[colspan] { border-bottom: 0; }
  .report-table thead tr.headers-row:last-child th { border-top: 1px solid #000; }
`;

export interface ReportColumn {
  /** Header label. "\n" becomes a <br> line break inside the cell. */
  label: string;
  /** "no" renders the 1-based row index; "label" escaped text; "number" via formatNumber4. */
  kind: "no" | "label" | "number";
  /** Row property holding the cell value (unused for kind "no"). */
  field?: string;
  /** CSS width, e.g. "30px". */
  width?: string;
  /** Renders the cell bold (e.g. a total column). */
  bold?: boolean;
  /**
   * Group header: consecutive columns sharing a `group` render under one
   * colspan'd header cell; columns without a `group` span both header rows.
   */
  group?: string;
}

export interface ReportTotals {
  /** Row label. Default "Total". */
  label?: string;
  /** Cells spanned before the first value. Defaults to the index of the first "number" column. */
  colspan?: number;
  /** Totals keyed by column field; number columns without a value render empty. */
  values: Record<string, number | null | undefined>;
}

export interface ReportTableSpec {
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: ReportTotals;
  emptyMessage?: string;
}

const labelToHtml = (label: string): string =>
  label
    .split("\n")
    .map((part) => escapeHtml(part))
    .join("<br>");

const widthAttr = (width?: string): string =>
  width ? ` style="width: ${escapeHtml(width)};"` : "";

function buildHeaderRows(columns: ReportColumn[]): string {
  // Consecutive columns sharing a `group` merge into one colspan'd th in row
  // 1 with their own labels in row 2; ungrouped columns span both rows.
  const segments: Array<{ group: string | undefined; items: ReportColumn[] }> = [];
  for (const column of columns) {
    const last = segments[segments.length - 1];
    if (column.group && last?.group === column.group) last.items.push(column);
    else segments.push({ group: column.group, items: [column] });
  }

  const firstRow: string[] = [];
  const secondRow: string[] = [];
  for (const segment of segments) {
    if (segment.group) {
      firstRow.push(`<th colspan="${segment.items.length}">${labelToHtml(segment.group)}</th>`);
      for (const item of segment.items) {
        secondRow.push(`<th${widthAttr(item.width)}>${labelToHtml(item.label)}</th>`);
      }
    } else {
      const item = segment.items[0];
      firstRow.push(`<th rowspan="2"${widthAttr(item.width)}>${labelToHtml(item.label)}</th>`);
    }
  }

  return `<tr class="headers-row">
      ${firstRow.join("\n      ")}
    </tr>${secondRow.length ? `\n    <tr class="headers-row">\n      ${secondRow.join("\n      ")}\n    </tr>` : ""}`;
}

function buildCell(column: ReportColumn, row: Record<string, unknown>, index: number): string {
  if (column.kind === "no") return `<td class="center">${index + 1}</td>`;
  const value = (column.field ? row[column.field] : undefined) as number | string | null | undefined;
  if (column.kind === "number") {
    const bold = column.bold ? ` style="font-weight: bold;"` : "";
    return `<td class="number"${bold}>${formatNumber4(value as number | null | undefined)}</td>`;
  }
  return `<td class="label">${escapeHtml(value)}</td>`;
}

function buildTotalsRow(columns: ReportColumn[], totals: ReportTotals): string {
  const firstNumberIndex = columns.findIndex((column) => column.kind === "number");
  const colspan = totals.colspan ?? (firstNumberIndex === -1 ? columns.length : firstNumberIndex);
  const cells = columns
    .slice(colspan)
    .map((column) => {
      if (column.kind !== "number" || !column.field) return `<td class="number"></td>`;
      return `<td class="number">${formatNumber4(totals.values[column.field])}</td>`;
    });
  return `<tr class="totals-row">
                            <td colspan="${colspan}" class="blank" style="text-align:center">${escapeHtml(totals.label ?? "Total")}</td>
                            ${cells.join("\n                            ")}
                          </tr>`;
}

/** Builds a standard `<table class="report-table">` from declarative columns. */
export function buildReportTable(spec: ReportTableSpec): string {
  const emptyMessage = spec.emptyMessage ?? "Tidak ada data untuk periode ini";

  const bodyRows = spec.rows.length
    ? spec.rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
                            ${spec.columns.map((column) => buildCell(column, row, index)).join("\n                            ")}
                          </tr>`,
        )
        .join("\n")
    : `<tr class="data-row row-odd"><td colspan="${spec.columns.length}" class="center">${escapeHtml(emptyMessage)}</td></tr>`;

  return `<table class="report-table">
  <thead>
    ${buildHeaderRows(spec.columns)}
  </thead>
  <tbody>
    ${bodyRows}
    ${spec.totals ? buildTotalsRow(spec.columns, spec.totals) : ""}
  </tbody>
</table>`;
}

export interface WpsReportPageOptions {
  /** Document title AND centered h1. */
  title: string
  subtitle: string
  /** Tables/sections; the title and subtitle are added by the shell. */
  bodyHtml: string
  landscape?: boolean
  printedBy?: string
  printedAt?: string
}

/** Wraps report body HTML in the standard WPS page shell (title, subtitle, CSS, footer). */
export function renderWpsReportPage(options: WpsReportPageOptions): RenderResult {
  const body = `<h1 class="report-title">${escapeHtml(options.title)}</h1>
<p class="report-subtitle">${escapeHtml(options.subtitle)}</p>
${options.bodyHtml}`;

  return {
    html: renderPage({ title: options.title, bodyHtml: body, extraCss: WPS_REPORT_CSS }),
    footerHtml: pageFooterHtml({
      printedBy: options.printedBy,
      printedAt: options.printedAt,
    }),
    landscape: options.landscape,
  };
}

export interface SingleTableReportSpec {
  type: string;
  title: string;
  /** Stored procedure called with TglAwal/TglAkhir (sql.Date) inputs. */
  spName: string;
  columns: ReportColumn[];
  /** Omit for no totals row; `true` sums every "number" column. */
  totals?: ReportTotals | true | false;
  landscape?: boolean;
}

/**
 * Factory for the most common WPS report shape: one stored procedure taking
 * TglAwal/TglAkhir and returning ONE recordset, rendered as a single table
 * in the standard template. The report file contains no styling.
 */
export function createSingleTableReport(spec: {
  type: string;
  title: string;
  spName: string;
  columns: ReportColumn[];
  totals?: ReportTotals | true | false;
  landscape?: boolean;
}): ReportDefinition<PeriodParams, Array<Record<string, unknown>>> {
  return {
    type: spec.type,
    title: spec.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute(spec.spName);
      return (result.recordset ?? []) as Array<Record<string, unknown>>;
    },

    render(rows, meta) {
      const subtitle = `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;
      const totals = spec.totals === true
        ? sumNumericColumns(spec.columns, rows)
        : spec.totals === false || spec.totals === undefined
          ? undefined
          : spec.totals;

      return renderWpsReportPage({
        title: spec.title,
        subtitle,
        bodyHtml: buildReportTable({
          columns: spec.columns,
          rows,
          totals,
        }),
        landscape: spec.landscape,
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

/** Sums every "number" column across rows (nulls ignored) for `totals: true`. */
function sumNumericColumns(
  columns: ReportColumn[],
  rows: Array<Record<string, unknown>>,
): ReportTotals {
  const values: Record<string, number> = {};
  for (const column of columns) {
    if (column.kind !== "number" || !column.field) continue;
    let sum = 0;
    for (const row of rows) {
      const value = row[column.field];
      if (typeof value === "number" && Number.isFinite(value)) sum += value;
    }
    values[column.field] = sum;
  }
  return { values };
}
