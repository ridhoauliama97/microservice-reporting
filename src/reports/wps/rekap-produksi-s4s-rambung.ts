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
 * SP_LapRekapProduksiS4SRambungPerGrade — "Laporan Rekap Produksi S4S Rambung
 * Per Grade".
 *
 * The procedure returns one row per (Group, Type, date, grade) carrying the
 * grade's own total, the grand total for that group on that day, and the ratio
 * of the two. The report pivots that into three header rows: Tanggal, then
 * Input and Output, each with a Total/Ratio pair per grade.
 *
 * The daily Ratio is read from the procedure rather than recomputed, and
 * GrandTotalPerGroup is constant across the rows of a single group on a single
 * day — so a day's ratios already sum to 100% inside that day.
 *
 * That is why the footer's Ratio cannot be the sum of the column above it. A
 * month of daily percentages added together is not a share of anything; for
 * August 2026 the Output column would read 1688.14%. The footer instead shows
 * each grade's share of the whole period, which is a real figure and sums to
 * 100% on each side.
 */

interface SpRow extends Record<string, unknown> {
  Group?: unknown;
  Type?: unknown;
  Tanggal?: unknown;
  Jenis?: unknown;
  Total?: unknown;
  GrandTotalPerGroup?: unknown;
  RatioDecimal?: unknown;
  Ratio?: unknown;
}

export interface RambungGradeCell {
  total: number;
  ratio: number;
}

export interface RambungRow {
  date: string;
  input: RambungGradeCell[];
  output: RambungGradeCell[];
}

export interface RambungData {
  inputGrades: string[];
  outputGrades: string[];
  rows: RambungRow[];
  totals: { input: RambungGradeCell[]; output: RambungGradeCell[] };
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim());
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return '';
};

const text = (value: unknown, fallback = '-'): string => {
  const s = String(value ?? '').trim();
  return s === '' ? fallback : s;
};

export function buildRambungData(rows: SpRow[]): RambungData {
  const inputGrades: string[] = [];
  const outputGrades: string[] = [];
  const dates: string[] = [];
  const cells = new Map<string, RambungGradeCell>();

  for (const row of rows) {
    const date = toDateKey(row.Tanggal);
    if (date === '') continue;
    const type = text(row.Type).toLowerCase();
    const grade = text(row.Jenis);
    const list = type === 'input' ? inputGrades : outputGrades;
    if (!list.includes(grade)) list.push(grade);
    if (!dates.includes(date)) dates.push(date);

    const key = `${date}|${type}|${grade}`;
    const cell = cells.get(key) ?? { total: 0, ratio: 0 };
    cell.total += toFloat(row.Total);
    cell.ratio = toFloat(row.Ratio);
    cells.set(key, cell);
  }

  dates.sort();
  inputGrades.sort();
  outputGrades.sort();

  const built: RambungRow[] = dates.map((date) => ({
    date,
    input: inputGrades.map((grade) => cells.get(`${date}|input|${grade}`) ?? { total: 0, ratio: 0 }),
    output: outputGrades.map((grade) => cells.get(`${date}|output|${grade}`) ?? { total: 0, ratio: 0 }),
  }));

  const sumColumn = (
    side: 'input' | 'output',
    grades: string[],
  ): RambungGradeCell[] => {
    const summed = grades.map((_, index) =>
      built.reduce<RambungGradeCell>(
        (acc, row) => {
          acc.total += row[side][index]!.total;
          return acc;
        },
        { total: 0, ratio: 0 },
      ),
    );

    // The footer's ratio is each grade's share of the whole period, not the
    // arithmetic sum of the daily ratios above it. Summed the other way the
    // Output column read 1688.14% for August 2026, because each day's
    // percentages are relative to that day's own group total.
    const periodGrand = summed.reduce((sum, c) => sum + c.total, 0);
    for (const cell of summed) {
      cell.ratio = periodGrand > 0 ? (cell.total / periodGrand) * 100 : 0;
    }
    return summed;
  };

  return {
    inputGrades,
    outputGrades,
    rows: built,
    totals: { input: sumColumn('input', inputGrades), output: sumColumn('output', outputGrades) },
  };
}

const fmt4 = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });

/** Share: two decimals then a percent sign, blank at zero. */
const fmtPct = (value: number): string => {
  const text = formatNumber(value, 2, { blankWhenZero: true });
  return text === '' ? '' : `${text} %`;
};

function renderTable(data: RambungData): string {
  if (data.inputGrades.length === 0 && data.outputGrades.length === 0) {
    return `<table class="report-table rambung-per-grade-table"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;
  }

  const gradeHeaders = (grades: string[]): string =>
    grades.map((grade) => `<th colspan="2">${escapeHtml(grade)}</th>`).join('\n        ');
  const leafHeaders = (grades: string[]): string =>
    grades.map(() => '<th>Total</th>\n        <th>Ratio</th>').join('\n        ');

  const sideCells = (side: 'input' | 'output', row: RambungRow | null): string =>
    data[side === 'input' ? 'inputGrades' : 'outputGrades']
      .map((_, index) => {
        const cell = row ? row[side][index]! : data.totals[side][index]!;
        return `<td class="number data-cell">${escapeHtml(fmt4(cell.total))}</td>\n      <td class="number data-cell">${escapeHtml(fmtPct(cell.ratio))}</td>`;
      })
      .join('\n      ');

  const body = data.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
      <td class="center data-cell">${escapeHtml(formatTanggalId(row.date))}</td>
      ${sideCells('input', row)}
      ${sideCells('output', row)}
    </tr>`,
    )
    .join('\n    ');

  return `<table class="report-table rambung-per-grade-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="3" style="width: 72px;">Tanggal</th>
      <th colspan="${data.inputGrades.length * 2}">Input</th>
      <th colspan="${data.outputGrades.length * 2}">Output</th>
    </tr>
    <tr class="headers-row">
      ${gradeHeaders(data.inputGrades)}
      ${gradeHeaders(data.outputGrades)}
    </tr>
    <tr class="headers-row">
      ${leafHeaders(data.inputGrades)}
      ${leafHeaders(data.outputGrades)}
    </tr>
  </thead>
  <tbody>
    ${body || `<tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`}
    <tr class="totals-row">
      <td class="blank" style="text-align: center;">Total</td>
      ${sideCells('input', null)}
      ${sideCells('output', null)}
    </tr>
  </tbody>
</table>`;
}

export const rekapProduksiS4SRambungPerGradeReport: ReportDefinition<
  PeriodParams,
  RambungData
> = {
  type: 'rekap-produksi-s4s-rambung-per-grade',
  title: 'Laporan Rekap Produksi S4S Rambung Per Grade',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir)
      .execute('SP_LapRekapProduksiS4SRambungPerGrade');
    return buildRambungData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    return renderWpsReportPage({
      title: 'Laporan Rekap Produksi S4S Rambung Per Grade',
      subtitle: `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml: renderTable(data),
      style: 'rekap_produksi_s4s_rambung',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
