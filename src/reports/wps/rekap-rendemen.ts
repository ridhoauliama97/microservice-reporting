import { z } from 'zod'
import sql from 'mssql'
import type { ReportDefinition, RenderMeta, RenderResult } from '../types'
import { escapeHtml } from '../../templates/html'
import {
  EMPTY_DATA_MESSAGE,
  formatInt,
  renderWpsReportPage,
} from './template'
import { formatPrintedAt } from '../../templates/html'

/**
 * "Rekap Rendemen Rambung" and "Rekap Rendemen Non Rambung" are one report
 * twice over: the legacy services are byte-for-byte the same apart from the
 * config key they read, which is what decides the stored procedure. Only the
 * title and the procedure differ, so both come out of the same factory here
 * rather than being copied.
 *
 * The stored procedure takes a year and a month and returns the months from
 * that one onwards — passing 2026/8 comes back with August and September —
 * which is why the subtitle reads "Mulai Periode" and not "Periode".
 */

/** @Tahun int, @Bulan int. */
export const rekapRendemenParamsSchema = z.object({
  tahun: z.coerce.number().int().min(1900).max(2999),
  bulan: z.coerce.number().int().min(1).max(12),
})
export type RekapRendemenParams = z.infer<typeof rekapRendemenParamsSchema>

const BULAN_LABELS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

/** One month of the yield chain. `null` means the procedure had no value. */
export interface RekapRendemenRow {
  tahun: number | null;
  bulan: number | null;
  kbKeluarTon: number | null;
  stMasukTon: number | null;
  stKeluarM3: number | null;
  wipMasukM3: number | null;
  wipPemakaianNetM3: number | null;
  bjMasukM3: number | null;
  /** Derived, in the order the legacy service derived them. */
  pctStKb: number | null;
  pctWipSt: number | null;
  pctBjWip: number | null;
  pctBjSt: number | null;
  pctTotal: number | null;
}

interface SpRow {
  Tahun?: unknown;
  Bulan?: unknown;
  KBKeluarTon?: unknown;
  STMasukTon?: unknown;
  STKeluarTon?: unknown;
  WIPMasukM3?: unknown;
  WIPPemakaianNetM3?: unknown;
  BJMasukM3?: unknown;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // The procedures can hand back a value with the decimal separator swapped for
  // a comma, or with thousands separators glued on.
  const cleaned = value.trim().replace(/\s/g, '');
  if (cleaned === '') return null;
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

const dividePercent = (numerator: number | null, denominator: number | null): number | null =>
  numerator === null || denominator === null || Math.abs(denominator) < 1e-7
    ? null
    : (numerator / denominator) * 100;

/** Chains two percentages without letting the intermediate lose its scale. */
const multiplyPercent = (left: number | null, right: number | null): number | null =>
  left === null || right === null ? null : (left / 100) * (right / 100) * 100;

export function buildRekapRendemenRows(rows: SpRow[]): RekapRendemenRow[] {
  return rows.map((row) => {
    const kbKeluarTon = toNumber(row.KBKeluarTon);
    const stMasukTon = toNumber(row.STMasukTon);
    const stKeluarM3 = toNumber(row.STKeluarTon);
    const wipMasukM3 = toNumber(row.WIPMasukM3);
    const wipPemakaianNetM3 = toNumber(row.WIPPemakaianNetM3);
    const bjMasukM3 = toNumber(row.BJMasukM3);

    const pctStKb = dividePercent(stMasukTon, kbKeluarTon);
    const pctWipSt = dividePercent(wipMasukM3, stKeluarM3);
    const pctBjWip = dividePercent(bjMasukM3, wipPemakaianNetM3);
    const pctBjSt = multiplyPercent(pctBjWip, pctWipSt);
    const pctTotal = multiplyPercent(pctBjSt, pctStKb);

    return {
      tahun: toIntOrNull(row.Tahun),
      bulan: toIntOrNull(row.Bulan),
      kbKeluarTon,
      stMasukTon,
      stKeluarM3,
      wipMasukM3,
      wipPemakaianNetM3,
      bjMasukM3,
      pctStKb,
      pctWipSt,
      pctBjWip,
      pctBjSt,
      pctTotal,
    };
  });
}

/** 4 decimals on the volumes, 2 on the percentages — as the legacy blade. */
function fmtVolume(value: number | null): string {
  return value === null ? '' : value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtM3(value: number | null): string {
  return value === null ? '' : value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Renders the percentage as it stands. The legacy blade applied a
 * "value <= 1.5 means it is really a fraction" guess, which turned a genuine
 * 0.5% reading into 50.0%. The service already multiplied by 100, so the value
 * is printed unchanged.
 */
function fmtPercent(value: number | null): string {
  if (value === null) return '';
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function monthLabel(bulan: number | null): string {
  return bulan !== null && bulan >= 1 && bulan <= 12 ? BULAN_LABELS[bulan - 1]! : '';
}

/**
 * Column order and widths. The legacy blade declared these in px, which came to
 * 880px against a 698px text column, so `table-layout: fixed` shrank every
 * column: "September" wrapped to "Septe/mber" and "Tahun" overran its rule.
 *
 * These are shares of the text column instead, sized from measurement: each
 * one is at least as wide as the widest single word it has to hold on one
 * line ("September" 43pt, "Pemakaian" 46pt, "%WIP/ST" 39pt, "%BJ/WIP" 37pt,
 * "Tahun" 30pt) plus its padding, and they add up to exactly 100%. The labels
 * still wrap onto two or three lines, as they did in the legacy report.
 */
const COLUMNS: ReadonlyArray<{
  label: string;
  width: string;
  numeric: boolean;
  cell: (row: RekapRendemenRow) => string;
}> = [
  { label: 'Tahun', width: '6%', numeric: false, cell: (r) => escapeHtml(r.tahun === null ? '' : String(r.tahun)) },
  { label: 'Bulan', width: '9%', numeric: false, cell: (r) => escapeHtml(monthLabel(r.bulan)) },
  { label: 'KB Keluar (Ton)', width: '6%', numeric: true, cell: (r) => escapeHtml(fmtVolume(r.kbKeluarTon)) },
  { label: 'ST Masuk (Ton)', width: '6%', numeric: true, cell: (r) => escapeHtml(fmtVolume(r.stMasukTon)) },
  { label: '%ST/KB', width: '7%', numeric: true, cell: (r) => escapeHtml(fmtPercent(r.pctStKb)) },
  { label: 'ST Keluar (M3)', width: '7%', numeric: true, cell: (r) => escapeHtml(fmtM3(r.stKeluarM3)) },
  { label: 'WIP Masuk (M3)', width: '8%', numeric: true, cell: (r) => escapeHtml(fmtVolume(r.wipMasukM3)) },
  { label: '%WIP/ST', width: '8%', numeric: true, cell: (r) => escapeHtml(fmtPercent(r.pctWipSt)) },
  { label: 'WIP Pemakaian Net (M3)', width: '10%', numeric: true, cell: (r) => escapeHtml(fmtVolume(r.wipPemakaianNetM3)) },
  { label: 'BJ Masuk (M3)', width: '7%', numeric: true, cell: (r) => escapeHtml(fmtVolume(r.bjMasukM3)) },
  { label: '%BJ/WIP', width: '8%', numeric: true, cell: (r) => escapeHtml(fmtPercent(r.pctBjWip)) },
  { label: '%BJ/ST', width: '7%', numeric: true, cell: (r) => escapeHtml(fmtPercent(r.pctBjSt)) },
  { label: '%Total', width: '7%', numeric: true, cell: (r) => escapeHtml(fmtPercent(r.pctTotal)) },
]

const COLUMN_COUNT = COLUMNS.length + 1; // plus the row number

function renderBody(rows: RekapRendemenRow[]): string {
  const header = COLUMNS.map(
    (c) => `<th style="width: ${c.width};">${escapeHtml(c.label)}</th>`,
  ).join('');

  const body =
    rows.length === 0
      ? `<tr><td colspan="${COLUMN_COUNT}" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`
      : rows
          .map((row, index) => {
            const cells = COLUMNS.map(
              (c) => `<td class="${c.numeric ? 'number' : 'center'}">${c.cell(row)}</td>`,
            ).join('');
            const shade = (index + 1) % 2 === 1 ? 'row-odd' : 'row-even';
            return `<tr class="data-row ${shade}"><td class="center">${formatInt(index + 1)}</td>${cells}</tr>`;
          })
          .join('\n      ');

  return `<table class="report-table rekap-rendemen-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 4%;">No</th>
          ${header}
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>`;
}

export interface RekapRendemenSpec {
  type: string;
  title: string;
  spName: string;
}

export function createRekapRendemenReport(
  spec: RekapRendemenSpec,
): ReportDefinition<RekapRendemenParams, RekapRendemenRow[]> {
  return {
    type: spec.type,
    title: spec.title,
    paramsSchema: rekapRendemenParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input('Tahun', sql.Int, params.tahun)
        .input('Bulan', sql.Int, params.bulan)
        .execute(spec.spName);
      return buildRekapRendemenRows((result.recordset ?? []) as SpRow[]);
    },

    render(rows, meta: RenderMeta<RekapRendemenParams>): RenderResult {
      // The procedure returns the requested month and the ones after it, so
      // this is the month the report starts at, not the whole period.
      const subtitle = `Mulai Periode ${monthLabel(meta.params.bulan)} ${meta.params.tahun}`;

      return renderWpsReportPage({
        title: spec.title,
        subtitle,
        bodyHtml: renderBody(rows),
        style: 'rekap_rendemen',
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const rekapRendemenNonRambungReport = createRekapRendemenReport({
  type: 'rekap-rendemen-non-rambung',
  title: 'Laporan Rekap Rendemen Non Rambung',
  spName: 'SP_LapRekapRendemenNonRambung',
});

export const rekapRendemenRambungReport = createRekapRendemenReport({
  type: 'rekap-rendemen-rambung',
  title: 'Laporan Rekap Rendemen Rambung',
  spName: 'SP_LapRekapRendemenRambung',
});
