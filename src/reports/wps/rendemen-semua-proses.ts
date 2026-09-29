import sql from 'mssql'
import type { ReportDefinition, RenderMeta, RenderResult } from '../types'
import { escapeHtml, formatPrintedAt, formatTanggalId } from '../../templates/html'
import { EMPTY_DATA_MESSAGE, formatInt, renderWpsReportPage } from './template'
import { periodParamsSchema, type PeriodParams } from '../period-params'

/**
 * "Rendemen Semua Proses" pivots the daily yield of every process against the
 * date it was produced on: one row per date, and for each process a block of
 * Input / Output / %. The block order follows the production flow rather than
 * alphabetical order, then anything the procedure returns that is not one of
 * the seven known processes is appended in the order it arrived.
 */

/**
 * The flow order. The procedure returns the processes alphabetically, so this
 * is what actually decides the column order in the report.
 */
export const PROSES_ORDER: readonly string[] = [
  'S4S',
  'FJ',
  'MLD',
  'LMT',
  'CCAKHIR',
  'SAND',
  'PACK',
];

export interface RendemenSemuaProsesRow {
  tanggal: string;
  input: number;
  output: number;
  rendemen: number | null;
  grup: string;
}

export interface RendemenSemuaProsesGroup {
  name: string;
  rows: RendemenSemuaProsesRow[];
  totalInput: number;
  totalOutput: number;
  rendemen: number | null;
}

export interface RendemenSemuaProsesData {
  groups: RendemenSemuaProsesGroup[];
  /** Every distinct date, ascending, so a date missing from a group stays blank. */
  dates: string[];
  grandInput: number;
  grandOutput: number;
  grandRendemen: number | null;
}

interface SpRow {
  Tanggal?: unknown;
  Input?: unknown;
  Output?: unknown;
  GRP?: unknown;
}

const EPS = 1e-7;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** The procedure's Tanggal may arrive as a Date or as a yyyy-mm-dd string. */
function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return '';
}

const percentOf = (output: number, input: number): number | null =>
  Math.abs(input) > EPS ? (output / input) * 100 : null;

export function buildRendemenSemuaProses(rows: SpRow[]): RendemenSemuaProsesData {
  const normalized: RendemenSemuaProsesRow[] = rows.map((row) => {
    const input = toNumber(row.Input);
    const output = toNumber(row.Output);
    return {
      tanggal: toDateKey(row.Tanggal),
      input,
      output,
      rendemen: percentOf(output, input),
      grup: typeof row.GRP === 'string' && row.GRP.trim() !== '' ? row.GRP.trim() : 'LAINNYA',
    };
  });

  // Group by process, then order the groups: the known seven in flow order,
  // anything else after them in the order the procedure first mentioned it.
  const byGroup = new Map<string, RendemenSemuaProsesRow[]>();
  for (const row of normalized) {
    const bucket = byGroup.get(row.grup);
    if (bucket) bucket.push(row);
    else byGroup.set(row.grup, [row]);
  }

  const ordered: Array<[string, RendemenSemuaProsesRow[]]> = [];
  for (const name of PROSES_ORDER) {
    const bucket = byGroup.get(name);
    if (bucket) {
      ordered.push([name, bucket]);
      byGroup.delete(name);
    }
  }
  for (const [name, bucket] of byGroup) ordered.push([name, bucket]);

  let grandInput = 0;
  let grandOutput = 0;
  const groups: RendemenSemuaProsesGroup[] = ordered.map(([name, groupRows]) => {
    let totalInput = 0;
    let totalOutput = 0;
    for (const row of groupRows) {
      totalInput += row.input;
      totalOutput += row.output;
    }
    grandInput += totalInput;
    grandOutput += totalOutput;
    return {
      name,
      rows: [...groupRows].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0)),
      totalInput,
      totalOutput,
      rendemen: percentOf(totalOutput, totalInput),
    };
  });

  // A date only reaches the table if some process reported on it.
  const dateSet = new Set<string>();
  for (const row of normalized) if (row.tanggal !== '') dateSet.add(row.tanggal);
  const dates = [...dateSet].sort();

  return {
    groups,
    dates,
    grandInput,
    grandOutput,
    grandRendemen: percentOf(grandOutput, grandInput),
  };
}

function fmtVolume(value: number | null): string {
  return value === null ? '' : value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPercent(value: number | null): string {
  return value === null ? '' : `${value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function renderTable(data: RendemenSemuaProsesData): string {
  const groupNames = data.groups.map((g) => g.name);
  // Keyed by process then by date, so a date missing from one process is a
  // plain miss rather than a string that has to be split apart again.
  const lookup = new Map<string, Map<string, RendemenSemuaProsesRow>>();
  for (const group of data.groups) {
    const byDate = new Map<string, RendemenSemuaProsesRow>();
    for (const row of group.rows) byDate.set(row.tanggal, row);
    lookup.set(group.name, byDate);
  }

  const topHeader = groupNames
    .map((name) => `<th colspan="3">${escapeHtml(name)}</th>`)
    .join('');
  const subHeader = groupNames
    .map(
      () =>
        `<th style="width: 70px;">Input</th><th style="width: 70px;">Output</th><th style="width: 50px;">%</th>`,
    )
    .join('');

  const body = data.dates
    .map((date, index) => {
      const cells = groupNames
        .map((name) => {
          const row = lookup.get(name)?.get(date);
          return (
            `<td class="number">${escapeHtml(fmtVolume(row ? row.input : null))}</td>` +
            `<td class="number">${escapeHtml(fmtVolume(row ? row.output : null))}</td>` +
            `<td class="number rendemen-cell">${escapeHtml(fmtPercent(row ? row.rendemen : null))}</td>`
          );
        })
        .join('');
      const shade = (index + 1) % 2 === 1 ? 'row-odd' : 'row-even';
      return (
        `<tr class="data-row ${shade}"><td class="center">${formatInt(index + 1)}</td>` +
        `<td class="center">${escapeHtml(formatTanggalId(date))}</td>${cells}</tr>`
      );
    })
    .join('\n      ');

  const totalCells = data.groups
    .map(
      (group) =>
        `<td class="number">${escapeHtml(fmtVolume(group.totalInput))}</td>` +
        `<td class="number">${escapeHtml(fmtVolume(group.totalOutput))}</td>` +
        `<td class="number">${escapeHtml(fmtPercent(group.rendemen))}</td>`,
    )
    .join('');

  return `<table class="report-table rendemen-pivot">
      <thead>
        <tr class="headers-row">
          <th style="width: 44px;" rowspan="2">No</th>
          <th style="width: 90px;" rowspan="2">Tanggal</th>
          ${topHeader}
        </tr>
        <tr class="headers-row">${subHeader}</tr>
      </thead>
      <tbody>
        ${body}
        <tr class="totals-row">
          <td colspan="2" class="center">Total</td>
          ${totalCells}
        </tr>
      </tbody>
    </table>`;
}

function renderSummary(data: RendemenSemuaProsesData): string {
  return `<div class="rangkuman">
      <div class="rangkuman-title">Rangkuman</div>
      <table class="rangkuman-table">
        <tr><td>Total Group</td><td class="number">${escapeHtml(formatInt(data.groups.length))}</td></tr>
        <tr><td>Total Baris</td><td class="number">${escapeHtml(formatInt(data.dates.length))}</td></tr>
        <tr><td>Total Input</td><td class="number">${escapeHtml(fmtVolume(data.grandInput))}</td></tr>
        <tr><td>Total Output</td><td class="number">${escapeHtml(fmtVolume(data.grandOutput))}</td></tr>
        <tr><td>Rendemen</td><td class="number">${escapeHtml(fmtPercent(data.grandRendemen))}</td></tr>
      </table>
    </div>`;
}

export const rendemenSemuaProsesReport: ReportDefinition<PeriodParams, RendemenSemuaProsesData> = {
  type: 'rendemen-semua-proses',
  title: 'Laporan Rendemen Semua Proses',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SP_LapRekapRendemenSemuaProses');
    return buildRendemenSemuaProses((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta: RenderMeta<PeriodParams>): RenderResult {
    const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;
    const bodyHtml =
      data.dates.length === 0
        ? `<table class="report-table rendemen-pivot"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`
        : renderTable(data);

    return renderWpsReportPage({
      title: 'Laporan Rendemen Semua Proses',
      subtitle,
      bodyHtml: data.groups.length > 0 ? `${bodyHtml}\n  ${renderSummary(data)}` : bodyHtml,
      style: 'rendemen_semua_proses',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
