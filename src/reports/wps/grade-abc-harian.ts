import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import type { ReportDefinition } from '../types'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from './template'

/**
 * SPWps_LapGradeABCHarian — "Laporan Grade ABC Harian".
 *
 * The stored procedure returns one row per date per grade per label: a month of
 * S4S runs to 50,000+ rows. It has to be aggregated before it goes anywhere
 * near a PDF, so this sums JmlhBatang into the four grades the report shows and
 * emits one row per day.
 *
 * Every day in the period gets a row even when nothing was produced, which is
 * what the legacy layout did: a gap in production shows as a zero day, not as a
 * missing day.
 */

/** The four grades the report shows, in the legacy "canonical order". */
export const GRADE_KEYS = ['GRADE A', 'GRADE AB/AC', 'GRADE CC', 'GRADE CUT'] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

export interface GradeAbcCell {
  pcs: number;
  percent: number;
}

export interface GradeAbcDay {
  date: string;
  cells: Record<GradeKey, GradeAbcCell>;
  totalPcs: number;
}

export interface GradeAbcData {
  days: GradeAbcDay[];
  totals: Record<GradeKey, { pcs: number; percent: number }>;
  grandTotal: number;
}

interface SpRow {
  DATE?: unknown;
  Tanggal?: unknown;
  NamaGrade?: unknown;
  JmlhBatang?: unknown;
}

/**
 * Maps whatever the procedure calls a grade onto the four canonical keys.
 * The checks are ordered so that "GRADE AB/AC" is tested before "GRADE A" and
 * "GRADE CC" before "GRADE CUT", otherwise the longer names would be swallowed
 * by the shorter pattern.
 */
export function normalizeGradeKey(raw: unknown): GradeKey | null {
  const t = String(raw ?? '')
    .toUpperCase()
    .trim();
  if (t === '') return null;

  if (t.includes('AB') || t.includes('A/B') || t.includes('A B') || t.includes('AB/AC')) {
    return 'GRADE AB/AC';
  }
  if (t === 'A' || t === 'GRADE A' || t.includes('GRADE A ')) return 'GRADE A';
  if (t.includes('CC')) return 'GRADE CC';
  if (t.includes('CUT')) return 'GRADE CUT';
  return null;
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim());
  if (match) {
    return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  }
  return '';
};

/** Every calendar day from start to end inclusive, as ISO dates. */
export function eachDay(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function buildGradeAbcData(
  rows: SpRow[],
  startIso: string,
  endIso: string,
): GradeAbcData {
  const byDate = new Map<string, Record<GradeKey, number>>();

  for (const row of rows) {
    const date = toDateKey(row.DATE ?? row.Tanggal);
    if (date === '') continue;
    const grade = normalizeGradeKey(row.NamaGrade);
    if (grade === null) continue;
    const bucket = byDate.get(date) ?? { 'GRADE A': 0, 'GRADE AB/AC': 0, 'GRADE CC': 0, 'GRADE CUT': 0 };
    bucket[grade] += toNumber(row.JmlhBatang);
    byDate.set(date, bucket);
  }

  const totals: Record<GradeKey, number> = {
    'GRADE A': 0,
    'GRADE AB/AC': 0,
    'GRADE CC': 0,
    'GRADE CUT': 0,
  };
  let grandTotal = 0;

  const days: GradeAbcDay[] = eachDay(startIso, endIso).map((date) => {
    const values = byDate.get(date) ?? {
      'GRADE A': 0,
      'GRADE AB/AC': 0,
      'GRADE CC': 0,
      'GRADE CUT': 0,
    };
    const dayTotal = GRADE_KEYS.reduce((sum, key) => sum + values[key], 0);
    const cells = {} as Record<GradeKey, GradeAbcCell>;
    for (const key of GRADE_KEYS) {
      cells[key] = {
        pcs: values[key],
        percent: dayTotal > 0 ? (values[key] / dayTotal) * 100 : 0,
      };
      totals[key] += values[key];
    }
    grandTotal += dayTotal;
    return { date, cells, totalPcs: dayTotal };
  });

  const totalCells = {} as Record<GradeKey, GradeAbcCell>;
  for (const key of GRADE_KEYS) {
    totalCells[key] = {
      pcs: totals[key],
      percent: grandTotal > 0 ? (totals[key] / grandTotal) * 100 : 0,
    };
  }

  return { days, totals: totalCells, grandTotal };
}

/** Piece count: whole numbers, blank when there was none. */
const fmtPcs = (value: number): string => formatNumber(value, 0, { blankWhenZero: true });

/**
 * Share of the day: two decimals then a percent sign, blank when zero.
 *
 * The zero rule matches the piece count on purpose. A day with no production of
 * that grade prints nothing in either column, so an empty cell reads as "no
 * production" instead of a genuine 0.00% that sits next to a blank piece count
 * and looks like a rendering fault.
 */
const fmtPercent = (value: number): string => {
  const text = formatNumber(value, 2, { blankWhenZero: true });
  return text === '' ? '' : `${text} %`;
};

function renderTable(data: GradeAbcData): string {
  const headerGroups = GRADE_KEYS.map(
    (key) => `<th colspan="2">${escapeHtml(key)}</th>`,
  ).join('\n      ');
  const subHeader = GRADE_KEYS.map(
    () => '<th>Jmlh Batang</th>\n      <th>%</th>',
  ).join('\n      ');

  const body =
    data.days.length === 0
      ? `<tr><td colspan="${1 + GRADE_KEYS.length * 2}" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`
      : data.days
          .map(
            (day, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${escapeHtml(formatTanggalId(day.date))}</td>
        ${GRADE_KEYS.map(
          (key) =>
            `<td class="number data-cell">${escapeHtml(fmtPcs(day.cells[key].pcs))}</td>\n        <td class="number data-cell percent">${escapeHtml(fmtPercent(day.cells[key].percent))}</td>`,
        ).join('\n        ')}
        <td class="number data-cell" style="font-weight: bold;">${escapeHtml(fmtPcs(day.totalPcs))}</td>
      </tr>`,
          )
          .join('\n      ');

  const totalsRow = GRADE_KEYS.map(
    (key) =>
      `<td class="number">${escapeHtml(fmtPcs(data.totals[key].pcs))}</td>\n      <td class="number percent">${escapeHtml(fmtPercent(data.totals[key].percent))}</td>`,
  ).join('\n    ');

  return `<table class="report-table grade-abc-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 78px;">Tanggal</th>
      ${headerGroups}
      <th rowspan="2" style="width: 84px;">Total</th>
    </tr>
    <tr class="headers-row">
      ${subHeader}
    </tr>
  </thead>
  <tbody>
    ${body}
    <tr class="totals-row">
      <td class="blank" style="text-align: center;">Total</td>
      ${totalsRow}
      <td class="number">${escapeHtml(fmtPcs(data.grandTotal))}</td>
    </tr>
  </tbody>
</table>`;
}

export const gradeAbcHarianReport: ReportDefinition<PeriodParams, GradeAbcData> = {
  type: 'grade-abc-harian',
  title: 'Laporan Grade ABC Harian',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapGradeABCHarian');
    // 50k+ rows in, a few dozen out: aggregated here so the worker never holds
    // a recordset big enough to matter and the PDF stays one row per day.
    return buildGradeAbcData(
      (result.recordset ?? []) as SpRow[],
      params.tglAwal,
      params.tglAkhir,
    );
  },

  render(data, meta) {
    return renderWpsReportPage({
      title: 'Laporan Grade ABC Harian',
      subtitle: `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml: renderTable(data),
      style: 'grade_abc_harian',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
}
