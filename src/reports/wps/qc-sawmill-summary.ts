import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, renderWpsReportPage } from './template'

/**
 * SP_LapQCSawmillSummary — "Laporan QC Sawmill - Summary". Ported from
 * open-api-report's QcSawmillSummaryReportService and
 * reports/sawn-timber/qc-sawmill-summary-pdf.blade.php.
 *
 * Not a row list. It is a grid: one row per sawmill chamber, one column per QC
 * date, each cell the accuracy percentage the procedure already computed for
 * that chamber on that date. The last column is the chamber's own average
 * across the period.
 *
 * Columns verified against the live database: Meja, NamaMeja, Tgl, DevTebal,
 * DevLebar, Data, Acc, SumDevTebal, SumDevLebar, Accurate.
 *
 * `Accurate` is the procedure's own float percentage for the cell - it is NOT
 * recomputed from Data and Acc, and Data / Acc are not printed. The chamber
 * column is the plain average of its cells, which is why it is the reference's
 * arithmetic mean of the daily percentages rather than a weighted one: the
 * procedure does not expose per-cell sample counts, so a weighted mean is not
 * computable from what it returns.
 *
 * Chamber order is numeric on Meja, with a non-numeric chamber number sorting
 * last rather than interleaved, then by name. Dates sort as strings, which is
 * correct because the procedure returns Y-m-d.
 *
 * Binds @StartDate / @EndDate.
 */

interface SpRow extends Record<string, unknown> {
  Meja?: unknown;
  NamaMeja?: unknown;
  Tgl?: unknown;
  DevTebal?: unknown;
  DevLebar?: unknown;
  Data?: unknown;
  Acc?: unknown;
  SumDevTebal?: unknown;
  SumDevLebar?: unknown;
  Accurate?: unknown;
}

export interface SummaryMejaRow {
  meja: string;
  namaMeja: string;
  /** Accuracy by date, keyed Y-m-d, in the order the columns are printed. */
  byDate: Map<string, number>;
  avgAccurate: number;
}

export interface QcSummaryData {
  dateKeys: string[];
  mejaRows: SummaryMejaRow[];
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const text = (value: unknown): string => String(value ?? '').trim();

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (raw === '') return '';
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (!iso) return '';
  return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
};

/** d-M, the short form the reference prints in the column headings. */
const fmtDateShort = (key: string): string => {
  if (key === '') return '';
  return formatTanggalId(key).replace(/-\d{4}$/, '');
};

const fmtPct = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 1);

export function buildQcSummaryData(rows: SpRow[]): QcSummaryData {
  const dateKeys = new Set<string>();
  const byMeja = new Map<string, SummaryMejaRow>();

  for (const row of rows) {
    const tanggal = toDateKey(row.Tgl);
    if (tanggal !== '') dateKeys.add(tanggal);

    const meja = text(row.Meja);
    const namaMeja = text(row.NamaMeja) || `Meja ${meja}`;
    const key = `${meja}|${namaMeja}`;

    let entry = byMeja.get(key);
    if (!entry) {
      entry = { meja, namaMeja, byDate: new Map(), avgAccurate: 0 };
      byMeja.set(key, entry);
    }
    // A later row for the same chamber and date replaces the earlier one, as
    // the reference's assignment does.
    entry.byDate.set(tanggal, toFloat(row.Accurate));
  }

  const dates = [...dateKeys].sort();
  const mejaRows = [...byMeja.values()];

  for (const entry of mejaRows) {
    const values = dates.map((date) => entry.byDate.get(date) ?? 0);
    entry.avgAccurate =
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  // Numeric chamber order, non-numeric last, then by name.
  mejaRows.sort((left, right) => {
    const leftNumeric = Number(left.meja);
    const rightNumeric = Number(right.meja);
    const leftKey = left.meja !== '' && Number.isFinite(leftNumeric) ? leftNumeric : Infinity;
    const rightKey =
      right.meja !== '' && Number.isFinite(rightNumeric) ? rightNumeric : Infinity;
    if (leftKey !== rightKey) return leftKey - rightKey;
    return left.namaMeja.localeCompare(right.namaMeja);
  });

  return { dateKeys: dates, mejaRows };
}

function renderSummaryGrid(data: QcSummaryData): string {
  if (data.mejaRows.length === 0 || data.dateKeys.length === 0) {
    return `<table class="report-table"><tbody>${buildEmptyTableRow(2)}</tbody></table>`;
  }

  const body = data.mejaRows
    .map((row, index) => {
      const cells = data.dateKeys
        .map((date) => {
          const value = row.byDate.get(date);
          // A date the chamber has no cell for stays blank, not 0.0 - a
          // chamber that was never inspected is not 0% accurate.
          return `          <td class="number">${value === undefined ? '' : escapeHtml(fmtPct(value))}</td>`;
        })
        .join('\n');
      return `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="label">${escapeHtml(row.namaMeja)}</td>
${cells}
        <td class="number">${escapeHtml(fmtPct(row.avgAccurate))}</td>
      </tr>`;
    })
    .join('\n      ');

  return `<table class="report-table qc-summary-table">
    <thead>
      <tr class="headers-row">
        <th class="meja-column" rowspan="2"></th>
${data.dateKeys
  .map(
    (date) => `        <th class="date-column">${escapeHtml(fmtDateShort(date))}</th>`,
  )
  .join('\n')}
        <th class="total-column">Total</th>
      </tr>
      <tr class="headers-row">
${data.dateKeys.map(() => '        <th>Accrte</th>').join('\n')}
        <th>AVG</th>
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>`;
}

export const qcSawmillSummaryReport: ReportDefinition<PeriodParams, QcSummaryData> = {
  type: 'qc-sawmill-summary',
  title: 'Laporan QC Sawmill - Summary',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir)
      .execute('SP_LapQCSawmillSummary');
    return buildQcSummaryData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan QC Sawmill - Summary',
      subtitle: `Periode ${period}`,
      bodyHtml: renderSummaryGrid(data),
      style: 'qc_sawmill',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
