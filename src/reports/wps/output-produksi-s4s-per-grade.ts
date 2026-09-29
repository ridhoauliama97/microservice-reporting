import sql from 'mssql'
import { escapeHtml, formatPrintedAt, formatTanggalId } from '../../templates/html'
import type { ReportDefinition } from '../types'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from './template'

/**
 * SPWps_LapProduksiOutputS4SPerGrade — "Laporan Output Produksi S4S Per Grade".
 *
 * One table per machine. Inside it each Jns (JABON, JABON TG, PULAI, RAMBUNG)
 * is a band of columns, one per grade, and each grade cell holds the day's
 * output together with that grade's share of the Jns total — there is no
 * separate Target column per grade. The last column pairs the machine's total
 * for the day with its target, and four summary rows (Total / Avg / Min / Max)
 * close the table.
 *
 * Two details are easy to get wrong and both show up as wrong numbers:
 *
 *   The column layout is FIXED per machine class, not derived from the data. A
 *   grade with no output in the period still gets a column, so the report looks
 *   the same on the first day of a month as on the last. Grades the procedure
 *   returns that the layout does not know are appended, sorted, rather than
 *   dropped.
 *
 *   Avg / Min / Max are taken over the days that actually produced, not over
 *   every day in the period. A day with no production is not a zero
 *   measurement, and averaging it in would drag every average toward zero.
 */

const EPS = 1e-7;

/**
 * Legacy buildLayoutColumns(). The Multi Ripsaw has a different grade
 * composition from the other machines, and S4S LINE 1 additionally swaps the
 * position of PULAI and RAMBUNG.
 */
const LAYOUT_RIPSAW: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['JABON', ['BELAH', 'A/A', 'ISOBO', 'NISOBO']],
  ['JABON TG', ['A/A']],
  ['PULAI', ['BELAH', 'ISOBO']],
  ['RAMBUNG', ['BELAH', 'A/B', 'A/C', 'C/C']],
];

const LAYOUT_DEFAULT: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['JABON', ['BELAH', 'MISS TEBAL', 'A/A', 'ISOBO', 'NISOBO']],
  ['JABON TG', ['A/A']],
  ['RAMBUNG', ['BELAH', 'MISS TEBAL', 'A/A', 'A/B', 'A/C', 'C/C']],
  ['PULAI', ['ISOBO', 'NISOBO', 'TASOBO']],
];

const LAYOUT_S4S_LINE_1: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['JABON', ['BELAH', 'MISS TEBAL', 'A/A', 'ISOBO', 'NISOBO']],
  ['JABON TG', ['A/A']],
  ['PULAI', ['ISOBO', 'NISOBO', 'TASOBO']],
  ['RAMBUNG', ['BELAH', 'MISS TEBAL', 'A/A', 'A/B', 'A/C', 'C/C']],
];

/** The per-Jns total sits under the grades rather than being a grade itself. */
const TOTAL_KEY = '__TOTAL__';

export interface OutputCell {
  value: number;
  percent: number;
}

export interface OutputGroup {
  jns: string;
  grades: string[];
}

export interface OutputRow {
  date: string;
  target: number;
  /** Jns -> grade (or TOTAL_KEY) -> cell. */
  cells: Map<string, Map<string, OutputCell>>;
  grandTotal: number;
}

export interface OutputMachine {
  machine: string;
  groups: OutputGroup[];
  rows: OutputRow[];
  /** First non-zero target the machine reported, shown beside the summary. */
  targetDefault: number;
  summary: Array<{ label: string; row: OutputRow }>;
}

interface SpRow extends Record<string, unknown> {
  Tanggal?: unknown;
  NamaMesin?: unknown;
  Jns?: unknown;
  Jenis?: unknown;
  Target?: unknown;
  Output?: unknown;
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Null and empty target both mean "no target for this row", not zero. */
const toNullableFloat = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = toFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim());
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return '';
};

const text = (value: unknown): string => String(value ?? '').trim();

export const eachDay = (startIso: string, endIso: string): string[] => {
  const days: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

export function buildLayoutColumns(
  machine: string,
  jnsGrades: Map<string, Set<string>>,
): OutputGroup[] {
  const upper = machine.toUpperCase();
  const layout = upper.includes('RIP')
    ? LAYOUT_RIPSAW
    : upper.includes('S4S LINE 1')
      ? LAYOUT_S4S_LINE_1
      : LAYOUT_DEFAULT;

  return layout.map(([jns, desired]) => {
    const grades = [...desired];
    const available = [...(jnsGrades.get(jns) ?? [])];
    if (available.length > 0) {
      // A grade the layout does not know still has to be shown, or real output
      // would vanish the day the procedure starts returning it.
      const extras = available
        .filter((grade) => !desired.includes(grade))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      grades.push(...extras);
    }
    return { jns, grades: [...new Set(grades)] };
  });
}

/** One day's cells, with each grade's share of its Jns total. */
function buildComputedRow(
  date: string,
  target: number,
  byJns: Map<string, Map<string, number>> | undefined,
  groups: OutputGroup[],
): OutputRow {
  const cells = new Map<string, Map<string, OutputCell>>();
  let grandTotal = 0;

  for (const group of groups) {
    const map = new Map<string, OutputCell>();
    let jnsTotal = 0;
    for (const grade of group.grades) {
      const value = byJns?.get(group.jns)?.get(grade) ?? 0;
      map.set(grade, { value, percent: 0 });
      jnsTotal += value;
    }
    map.set(TOTAL_KEY, { value: jnsTotal, percent: 100 });
    for (const grade of group.grades) {
      const cell = map.get(grade)!;
      cell.percent = jnsTotal > 0 ? (cell.value / jnsTotal) * 100 : 0;
    }
    cells.set(group.jns, map);
    grandTotal += jnsTotal;
  }

  return { date, target, cells, grandTotal };
}

type ReduceMode = 'sum' | 'avg' | 'min' | 'max';

const reduce = (values: number[], mode: ReduceMode): number => {
  if (mode === 'sum') return values.reduce((sum, v) => sum + v, 0);
  if (values.length === 0) return 0;
  if (mode === 'avg') return values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mode === 'min') return Math.min(...values);
  return Math.max(...values);
};

/**
 * Collapses the daily rows into one summary row.
 *
 * Only the 'sum' mode keeps the zero days. For avg/min/max a day with no
 * production is dropped rather than counted as a zero, matching the legacy
 * service — otherwise a month with four producing days would report an average
 * a quarter of the real figure.
 */
export function reduceRows(
  rows: OutputRow[],
  mode: ReduceMode,
  groups: OutputGroup[],
): OutputRow {
  if (rows.length === 0) {
    return { date: '', target: 0, cells: new Map(), grandTotal: 0 };
  }

  const cells = new Map<string, Map<string, OutputCell>>();
  let grandTotal = 0;

  for (const group of groups) {
    const map = new Map<string, OutputCell>();
    let jnsTotal = 0;
    for (const grade of group.grades) {
      let values = rows.map((row) => row.cells.get(group.jns)?.get(grade)?.value ?? 0);
      if (mode !== 'sum') values = values.filter((v) => Math.abs(v) > EPS);
      const value = reduce(values, mode);
      map.set(grade, { value, percent: 0 });
      jnsTotal += value;
    }
    map.set(TOTAL_KEY, { value: jnsTotal, percent: 100 });
    for (const grade of group.grades) {
      const cell = map.get(grade)!;
      cell.percent = jnsTotal > 0 ? (cell.value / jnsTotal) * 100 : 0;
    }
    cells.set(group.jns, map);
    grandTotal += jnsTotal;
  }

  let targets = rows.map((row) => row.target);
  if (mode !== 'sum') targets = targets.filter((v) => Math.abs(v) > EPS);

  return { date: '', target: reduce(targets, mode), cells, grandTotal };
}

interface MachineAccum {
  /** Insertion order matters: the first non-zero target becomes the default. */
  targetByDate: Map<string, number>;
  jnsGrades: Map<string, Set<string>>;
  values: Map<string, Map<string, Map<string, number>>>;
}

export function buildOutputSections(
  rows: SpRow[],
  startIso: string,
  endIso: string,
): OutputMachine[] {
  const order: string[] = [];
  const machines = new Map<string, MachineAccum>();

  for (const row of rows) {
    const machine = text(row.NamaMesin);
    const date = toDateKey(row.Tanggal);
    if (machine === '' || date === '') continue;

    let accum = machines.get(machine);
    if (!accum) {
      accum = {
        targetByDate: new Map(),
        jnsGrades: new Map(),
        values: new Map(),
      };
      machines.set(machine, accum);
      order.push(machine);
    }

    const target = toNullableFloat(row.Target);
    if (target !== null && !accum.targetByDate.has(date)) {
      accum.targetByDate.set(date, target);
    }

    const jns = text(row.Jns);
    const jenis = text(row.Jenis);

    // The column is registered even when the row carries no output, so a grade
    // the procedure knows about still appears in the header.
    if (jns !== '' && jenis !== '') {
      let grades = accum.jnsGrades.get(jns);
      if (!grades) {
        grades = new Set();
        accum.jnsGrades.set(jns, grades);
      }
      grades.add(jenis);
    }

    if (jns === '' || jenis === '') continue;
    const output = toNullableFloat(row.Output);
    if (output === null) continue;

    let byJns = accum.values.get(date);
    if (!byJns) {
      byJns = new Map();
      accum.values.set(date, byJns);
    }
    let byGrade = byJns.get(jns);
    if (!byGrade) {
      byGrade = new Map();
      byJns.set(jns, byGrade);
    }
    byGrade.set(jenis, (byGrade.get(jenis) ?? 0) + output);
  }

  const dates = eachDay(startIso, endIso);

  return order.map((machine) => {
    const accum = machines.get(machine)!;
    const groups = buildLayoutColumns(machine, accum.jnsGrades);

    const machineRows = dates.map((date) =>
      buildComputedRow(date, accum.targetByDate.get(date) ?? 0, accum.values.get(date), groups),
    );

    let targetDefault = 0;
    for (const value of accum.targetByDate.values()) {
      if (value > 0) {
        targetDefault = value;
        break;
      }
    }

    return {
      machine,
      groups,
      rows: machineRows,
      targetDefault,
      summary: (['sum', 'avg', 'min', 'max'] as const).map((mode, index) => ({
        label: ['Total', 'Avg', 'Min', 'Max'][index]!,
        row: reduceRows(machineRows, mode, groups),
      })),
    };
  });
}

/** Legacy $fmtVal: one decimal, no thousands separator, blank at ~zero. */
const fmtVal = (value: number): string =>
  Math.abs(value) < EPS ? '' : value.toFixed(1);

/** Legacy $fmtPct: one decimal then a percent sign, blank at ~zero. */
const fmtPct = (value: number): string =>
  Math.abs(value) < EPS ? '' : `${value.toFixed(1)}%`;

/** Legacy $fmtTarget: a whole target prints without a decimal point. */
const fmtTarget = (value: number): string => {
  if (Math.abs(value) < EPS) return '';
  return Math.abs(value - Math.round(value)) < 0.00001
    ? String(Math.round(value))
    : value.toFixed(1);
};

/** A value on the left and its share on the right, inside one cell. */
function cellHtml(value: string, percent: string): string {
  return `<div class="cell-split"><span class="cell-left">${escapeHtml(
    value,
  )}</span><span class="cell-right">${escapeHtml(percent)}</span></div>`;
}

function renderRow(row: OutputRow, groups: OutputGroup[]): string {
  const parts: string[] = [];
  for (const group of groups) {
    const map = row.cells.get(group.jns);
    for (const grade of group.grades) {
      const cell = map?.get(grade);
      parts.push(`<td class="number">${cellHtml(fmtVal(cell?.value ?? 0), fmtPct(cell?.percent ?? 0))}</td>`);
    }
    const total = map?.get(TOTAL_KEY);
    parts.push(
      `<td class="number total-col">${cellHtml(fmtVal(total?.value ?? 0), fmtPct(total?.percent ?? 0))}</td>`,
    );
  }
  // The target only accompanies a real total; showing "0" beside nothing reads
  // as a shortfall that was never measured.
  const target = Math.abs(row.grandTotal) < EPS ? '' : fmtTarget(row.target);
  parts.push(`<td class="number total-col">${cellHtml(fmtVal(row.grandTotal), target)}</td>`);
  return parts.join('\n        ');
}

function renderSection(machine: OutputMachine): string {
  const { groups } = machine;
  const colCount =
    1 + groups.reduce((sum, g) => sum + g.grades.length + 1, 0) + 1;

  const topHeader = groups
    .map((g) => `<th colspan="${g.grades.length + 1}">${escapeHtml(g.jns)}</th>`)
    .join('\n        ');
  const leafHeader = groups
    .map(
      (g) =>
        `${g.grades.map((grade) => `<th>${escapeHtml(grade)}</th>`).join('\n          ')}\n          <th class="total-col">Total</th>`,
    )
    .join('\n        ');

  let body = machine.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${escapeHtml(formatTanggalId(row.date))}</td>
        ${renderRow(row, groups)}
      </tr>`,
    )
    .join('\n      ');

  body += `\n      <tr class="summary-separator"><td colspan="${colCount}"></td></tr>\n      `;

  const summary = machine.summary
    .map(({ label, row }, index) => {
      // Only the Total row carries percentages; showing them again on Avg/Min/Max
      // would imply the share of a share.
      const parts: string[] = [];
      for (const group of groups) {
        const map = row.cells.get(group.jns);
        const pct = (cell: OutputCell | undefined): string =>
          label === 'Total' ? fmtPct(cell?.percent ?? 0) : '';
        for (const grade of group.grades) {
          const cell = map?.get(grade);
          parts.push(
            `<td class="number">${cellHtml(fmtVal(cell?.value ?? 0), pct(cell))}</td>`,
          );
        }
        parts.push(
          `<td class="number total-col">${cellHtml(fmtVal(map?.get(TOTAL_KEY)?.value ?? 0), pct(map?.get(TOTAL_KEY)))}</td>`,
        );
      }
      const target =
        Math.abs(row.grandTotal) < EPS ? '' : fmtTarget(machine.targetDefault);
      parts.push(`<td class="number total-col">${cellHtml(fmtVal(row.grandTotal), target)}</td>`);
      return `<tr class="data-row summary-row ${index === 0 ? 'row-odd strong' : index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${escapeHtml(label)}</td>
        ${parts.join('\n        ')}
      </tr>`;
    })
    .join('\n      ');

  return `<div class="section-title">${escapeHtml(machine.machine)}</div>
  <table class="report-table output-s4s-table">
    <thead>
      <tr class="headers-row">
        <th rowspan="2" style="width: 70px;">Tanggal</th>
        ${topHeader}
        <th rowspan="2" style="width: 80px;">Total - Target</th>
      </tr>
      <tr class="headers-row">
        ${leafHeader}
      </tr>
    </thead>
    <tbody>
      ${body}
      ${summary}
    </tbody>
  </table>`;
}

export const outputProduksiS4SPerGradeReport: ReportDefinition<
  PeriodParams,
  OutputMachine[]
> = {
  type: 'output-produksi-s4s-per-grade',
  title: 'Laporan Output Produksi S4S Per Grade',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapProduksiOutputS4SPerGrade');
    return buildOutputSections(
      (result.recordset ?? []) as SpRow[],
      params.tglAwal,
      params.tglAkhir,
    );
  },

  render(machines, meta) {
    const bodyHtml =
      machines.length === 0
        ? `<table class="report-table output-s4s-table"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`
        : machines.map(renderSection).join('\n  ');
    return renderWpsReportPage({
      title: 'Laporan Output Produksi S4S Per Grade',
      subtitle: `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: 'output_s4s_per_grade',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
