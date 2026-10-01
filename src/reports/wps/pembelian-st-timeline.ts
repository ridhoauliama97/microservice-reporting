import sql from 'mssql'
import {
  MONTHS_SHORT_ID,
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, renderWpsReportPage } from './template'
import {
  cellFitsShare,
  naturalCaseInsensitive,
  pivotColumnWidths,
  renderPivotCell,
  renderTotalCell,
} from './pembelian-st-cell'

/**
 * SP_LapPembelianSTTimeline — "Laporan Pembelian ST Timeline (Ton)". Ported from
 * open-api-report's PembelianStTimelineTonReportService and
 * reports/sawn-timber/pembelian-st-timeline-ton-pdf.blade.php.
 *
 * The per-supplier cross-tab with the type axis replaced by the month axis, so
 * one row per supplier and one column per month, tonnage summed in each cell
 * with its share of the month. Months are grouped under a year header, which
 * is the whole point of a timeline: a two-year window puts 24 columns side by
 * side and the year band is what makes them readable.
 *
 * Columns verified against the live database: NmSupplier, Jenis, DateCreate,
 * DateUsage, TglLaporan, STTon. The month comes from TglLaporan, which is the
 * reference's FIRST choice in its date-candidate list; DateCreate and
 * DateUsage are the fallbacks and are not used here.
 *
 * Details worth naming:
 *
 *   - A month sorts chronologically, and a month key that will not parse - the
 *     reference parks unparseable rows under "Tanpa Periode" - sorts LAST
 *     rather than first, so a stray row cannot displace January.
 *   - Rows with no usable date at all still get a column ("Tanpa Periode"),
 *     and their tonnage still reaches the grand total. Dropping them would
 *     quietly understate the purchase.
 *   - Only months that actually have tonnage become columns, so the header has
 *     no run of empty months. The reference expands the range to every month
 *     instead; for a purchase history that is mostly noise, and the year band
 *     is what carries the shape of time here.
 *   - When a row's own total is zero the Total cell is blank, not "0.0000(0%)".
 *
 * Suppliers sort naturally and case-insensitively, as in the per-supplier
 * report.
 */

interface SpRow extends Record<string, unknown> {
  NmSupplier?: unknown;
  TglLaporan?: unknown;
  DateCreate?: unknown;
  DateUsage?: unknown;
  STTon?: unknown;
}

const NO_PERIOD = 'Tanpa Periode';
const LABEL_WIDTH_PERCENT = 20;
const NO_WIDTH_PERCENT = 4;

export interface MonthColumn {
  key: string;
  year: number;
  /** Short Indonesian month name, e.g. "Agt". */
  label: string;
}

export interface TimelineRow {
  supplier: string;
  byMonth: number[];
  total: number;
}

export interface TimelineYearGroup {
  year: number;
  monthKeys: string[];
}

export interface TimelineData {
  monthColumns: MonthColumn[];
  yearGroups: TimelineYearGroup[];
  rows: TimelineRow[];
  totalsByMonth: number[];
  grandTotal: number;
}

const text = (value: unknown): string => String(value ?? '').trim();

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** YYYY-MM from the procedure's date, or null when it is missing/unparseable. */
export function toMonthKey(value: unknown): { key: string; year: number } | null {
  let iso: string | null = null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    iso = value.toISOString().slice(0, 7);
  } else {
    const raw = text(value);
    if (raw === '') return null;
    const match = /^(\d{4})-(\d{1,2})/.exec(raw);
    if (match) iso = `${match[1]}-${match[2]!.padStart(2, '0')}`;
  }
  if (iso === null) return null;
  const [year, month] = iso.split('-');
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isFinite(yearNumber) || !Number.isFinite(monthNumber)) return null;
  if (monthNumber < 1 || monthNumber > 12) return null;
  return { key: iso, year: yearNumber };
}

const monthLabel = (key: string): string => {
  if (key === NO_PERIOD) return NO_PERIOD;
  const month = Number(key.split('-')[1]);
  return MONTHS_SHORT_ID[month - 1] ?? key;
};

/** Chronological, with the unparseable bucket last. */
const monthOrder = (left: string, right: string): number => {
  const leftParsed = /^\d{4}-\d{2}$/.test(left);
  const rightParsed = /^\d{4}-\d{2}$/.test(right);
  if (leftParsed && rightParsed) return left < right ? -1 : left > right ? 1 : 0;
  if (leftParsed) return -1;
  if (rightParsed) return 1;
  return naturalCaseInsensitive(left, right);
};

export function buildTimelineData(rows: SpRow[]): TimelineData {
  const bySupplier = new Map<string, Map<string, number>>();
  const totalsByMonth = new Map<string, number>();
  const years = new Map<string, number>();

  for (const row of rows) {
    const supplier = text(row.NmSupplier) || '-';
    const month = toMonthKey(row.TglLaporan ?? row.DateCreate ?? row.DateUsage);
    const key = month?.key ?? NO_PERIOD;
    const ton = toFloat(row.STTon);

    const bucket = bySupplier.get(supplier) ?? new Map<string, number>();
    bucket.set(key, (bucket.get(key) ?? 0) + ton);
    bySupplier.set(supplier, bucket);
    totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + ton);
    if (month) years.set(key, month.year);
  }

  const monthKeys = [...totalsByMonth.keys()].sort(monthOrder);
  const monthColumns: MonthColumn[] = monthKeys.map((key) => ({
    key,
    year: years.get(key) ?? 0,
    label: monthLabel(key),
  }));

  // Consecutive months of one year share a header cell.
  const yearGroups: TimelineYearGroup[] = [];
  for (const column of monthColumns) {
    if (column.year <= 0) continue;
    const last = yearGroups[yearGroups.length - 1];
    if (last && last.year === column.year) last.monthKeys.push(column.key);
    else yearGroups.push({ year: column.year, monthKeys: [column.key] });
  }

  const built: TimelineRow[] = [...bySupplier.keys()]
    .sort(naturalCaseInsensitive)
    .map((supplier) => {
      const bucket = bySupplier.get(supplier)!;
      const byMonth = monthKeys.map((key) => bucket.get(key) ?? 0);
      return {
        supplier,
        byMonth,
        total: byMonth.reduce((sum, value) => sum + value, 0),
      };
    });

  const totals = monthKeys.map((key) => totalsByMonth.get(key) ?? 0);

  return {
    monthColumns,
    yearGroups,
    rows: built,
    totalsByMonth: totals,
    grandTotal: totals.reduce((sum, value) => sum + value, 0),
  };
}

function renderPivot(data: TimelineData): string {
  if (data.rows.length === 0 || data.monthColumns.length === 0) {
    return `<table class="report-table pembelian-st-table"><tbody>${buildEmptyTableRow(3)}</tbody></table>`;
  }

  const labelPercent = NO_WIDTH_PERCENT + LABEL_WIDTH_PERCENT;
  const measureCount = data.monthColumns.length + 1;
  const measureWidth = pivotColumnWidths(measureCount, labelPercent);
  const withShare = cellFitsShare(measureCount, labelPercent);

  // Months with no usable date carry no year, so they would fall outside every
  // year band and shift the whole header out of line with the body. The
  // reference's colspan only covers the years it knows about; a trailing band
  // here keeps the header aligned with the columns underneath it.
  const banded = data.yearGroups.reduce((sum, group) => sum + group.monthKeys.length, 0);
  const unbanded = data.monthColumns.length - banded;
  const yearHeader =
    data.yearGroups.length > 0
      ? data.yearGroups
          .map(
            (group) =>
              `        <th colspan="${group.monthKeys.length}">${group.year}</th>`,
          )
          .join('\n') +
        (unbanded > 0 ? `\n        <th colspan="${unbanded}">&nbsp;</th>` : '')
      : `        <th colspan="${data.monthColumns.length}">&nbsp;</th>`;

  const body = data.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${index + 1}</td>
        <td class="data-cell" style="text-align: left">${escapeHtml(row.supplier)}</td>
${row.byMonth
  .map(
    (ton, column) =>
      `        <td class="data-cell">${renderPivotCell(ton, data.totalsByMonth[column]!, withShare)}</td>`,
  )
  .join('\n')}
        <td class="data-cell">${renderPivotCell(row.total, data.grandTotal, withShare)}</td>
      </tr>`,
    )
    .join('\n      ');

  const totalsRow = `<tr class="totals-row">
        <td class="data-cell supplier" colspan="2">Grand Total</td>
${data.totalsByMonth
  .map((ton) => `        <td class="data-cell">${renderTotalCell(ton, withShare)}</td>`)
  .join('\n')}
        <td class="data-cell">${renderTotalCell(data.grandTotal, withShare)}</td>
      </tr>`;

  return `<table class="report-table pembelian-st-table">
    <colgroup>
      <col style="width: ${NO_WIDTH_PERCENT}%;">
      <col style="width: ${LABEL_WIDTH_PERCENT}%;">
      <col span="${data.monthColumns.length}" style="width: ${measureWidth}%;">
      <col style="width: ${measureWidth}%;">
    </colgroup>
    <thead>
      <tr class="headers-row">
        <th rowspan="2">No</th>
        <th rowspan="2">Supplier</th>
${yearHeader}
        <th rowspan="2">Total</th>
      </tr>
      <tr class="headers-row">
${data.monthColumns
  .map((column) => `        <th>${escapeHtml(column.label)}</th>`)
  .join('\n')}
      </tr>
    </thead>
    <tbody>
      ${body}
      ${totalsRow}
    </tbody>
  </table>`;
}

export const pembelianStTimelineReport: ReportDefinition<PeriodParams, TimelineData> = {
  type: 'pembelian-st-timeline-ton',
  title: 'Laporan Pembelian ST Timeline (Ton)',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir)
      .execute('SP_LapPembelianSTTimeline');
    return buildTimelineData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Pembelian ST Timeline (Ton)',
      subtitle: `Periode ${period}`,
      bodyHtml: renderPivot(data),
      style: 'pembelian_st',
      // Portrait. The month axis is one or two years wide at most in practice,
      // and the year band reads better on a portrait page than stretched out
      // across a landscape one.
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
