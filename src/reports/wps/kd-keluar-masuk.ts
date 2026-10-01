import sql from 'mssql'
import { z } from 'zod'
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
 * SP_LapKDKeluarMasuk — "Laporan KD (Keluar - Masuk)". Ported from
 * open-api-report's KdKeluarMasukReportService and
 * reports/sawn-timber/kd-keluar-masuk-pdf.blade.php.
 *
 * One row per drying lot, with the tonnage split across six wood groups as
 * columns, and the rows in two sections: lots already out of the chamber, then
 * lots still in it. Each section closes with its own total and the table ends
 * with a grand total. That split is the point of the report - "masih" is stock
 * that is still drying, and mixing it into a flat list would hide it.
 *
 * Columns verified against the live database: NoKamarKD, TglMasuk, TglKeluar,
 * JmlhHari, Group, AveTebal, Ton.
 *
 * Four things the reference does that are easy to get wrong:
 *
 *   - The six group columns are a FIXED list, not derived from the data, so a
 *     group with no production in the period still gets a column. Group names
 *     are normalised first: "JABON TGI" and "JABON TANGGUNG" both fold into
 *     "JABON TG", and "RAMBUNG MC 1" into "RAMBUNG MC1". A Group outside the
 *     list is DROPPED, so its tonnage reaches neither a column nor the row
 *     total - that is the reference behaviour, and it means the row Total can
 *     be less than the SP's own Ton.
 *   - Rows are keyed on chamber + both dates + days + average thickness, so the
 *     several Group rows the SP returns for one lot collapse into one table
 *     row. The thickness is rounded to one decimal in the key to keep float
 *     noise from splitting a lot in two.
 *   - Sorting puts lots still in the chamber LAST, whatever their dates, and
 *     only then orders by TglKeluar and TglMasuk. Sorting purely by date would
 *     interleave the two sections and the totals would stop lining up.
 *   - A chamber numbered 0 prints blank rather than "0".
 *
 * Takes a period plus an optional chamber number, so the body is
 * `{ tglAwal, tglAkhir, noRuangKd? }`. The SP's @NoRuangKD is an int; the
 * reference passes NULL for "all chambers", and omitting the input is what that
 * means to SQL Server.
 */

const GROUP_COLUMNS = [
  'JABON',
  'JABON TG',
  'PULAI',
  'RAMBUNG',
  'RAMBUNG MC1',
  'RAMBUNG MC2',
] as const;

type GroupColumn = (typeof GROUP_COLUMNS)[number];

const FIXED_COLUMNS = 5; // Out, In, No.KD, Hari, Ave Tebal
const TOTAL_COLUMNS = FIXED_COLUMNS + GROUP_COLUMNS.length + 1;

interface SpRow extends Record<string, unknown> {
  NoKamarKD?: unknown;
  TglMasuk?: unknown;
  TglKeluar?: unknown;
  JmlhHari?: unknown;
  Group?: unknown;
  AveTebal?: unknown;
  Ton?: unknown;
}

export interface KeluarMasukRow {
  tanggalOut: string;
  tanggalIn: string;
  noKd: string;
  hari: number;
  aveTebal: number;
  /** Tonnage per group column, in GROUP_COLUMNS order. */
  byGroup: number[];
  total: number;
}

export interface KeluarMasukTotals {
  byGroup: number[];
  total: number;
}

export interface KeluarMasukData {
  keluar: KeluarMasukRow[];
  masih: KeluarMasukRow[];
  totalsKeluar: KeluarMasukTotals;
  totalsMasih: KeluarMasukTotals;
  totalsGrand: KeluarMasukTotals;
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

/** Fold the SP's Group values onto the six fixed columns; null drops the row's tonnage. */
export function normalizeGroupKey(raw: string): GroupColumn | null {
  const t = text(raw).toUpperCase().replace(/\s+/g, ' ');
  switch (t) {
    case 'JABON':
      return 'JABON';
    case 'JABON TG':
    case 'JABON TGI':
    case 'JABON TANGGUNG':
      return 'JABON TG';
    case 'PULAI':
      return 'PULAI';
    case 'RAMBUNG':
      return 'RAMBUNG';
    case 'RAMBUNG MC1':
    case 'RAMBUNG MC 1':
      return 'RAMBUNG MC1';
    case 'RAMBUNG MC2':
    case 'RAMBUNG MC 2':
      return 'RAMBUNG MC2';
    default:
      return null;
  }
}

export function buildKeluarMasukData(rows: SpRow[]): KeluarMasukData {
  // Keyed on the lot's identity, so the several Group rows the SP returns for
  // one chamber-date-day-thickness become a single table row.
  const keyed = new Map<
    string,
    { tanggalOut: string; tanggalIn: string; noKd: string; hari: number; aveTebal: number; byGroup: number[] }
  >();

  for (const row of rows) {
    const tanggalOut = toDateKey(row.TglKeluar);
    const tanggalIn = toDateKey(row.TglMasuk);
    const chamber = Math.trunc(toFloat(row.NoKamarKD));
    const hari = Math.trunc(toFloat(row.JmlhHari));
    const aveTebal = toFloat(row.AveTebal);
    const key = `${chamber}|${tanggalIn}|${tanggalOut}|${hari}|${aveTebal.toFixed(1)}`;

    let record = keyed.get(key);
    if (!record) {
      record = {
        tanggalOut,
        tanggalIn,
        noKd: chamber === 0 ? '' : String(chamber),
        hari,
        aveTebal,
        byGroup: GROUP_COLUMNS.map(() => 0),
      };
      keyed.set(key, record);
    }

    const column = normalizeGroupKey(text(row.Group));
    if (column === null) continue;
    record.byGroup[GROUP_COLUMNS.indexOf(column)]! += toFloat(row.Ton);
  }

  const all: KeluarMasukRow[] = [...keyed.values()].map((record) => ({
    ...record,
    total: record.byGroup.reduce((sum, value) => sum + value, 0),
  }));

  // Still-in-chamber lots last whatever their dates, so the two sections and
  // their totals stay aligned.
  all.sort((left, right) => {
    const leftStill = left.tanggalOut === '' ? 1 : 0;
    const rightStill = right.tanggalOut === '' ? 1 : 0;
    if (leftStill !== rightStill) return leftStill - rightStill;
    if (left.tanggalOut !== right.tanggalOut) return left.tanggalOut < right.tanggalOut ? -1 : 1;
    if (left.tanggalIn !== right.tanggalIn) return left.tanggalIn < right.tanggalIn ? -1 : 1;
    return 0;
  });

  const sumOf = (items: KeluarMasukRow[]): KeluarMasukTotals => {
    const byGroup = GROUP_COLUMNS.map((_, index) =>
      items.reduce((sum, row) => sum + row.byGroup[index]!, 0),
    );
    return { byGroup, total: byGroup.reduce((sum, value) => sum + value, 0) };
  };

  const keluar = all.filter((row) => row.tanggalOut !== '');
  const masih = all.filter((row) => row.tanggalOut === '');

  return {
    keluar,
    masih,
    totalsKeluar: sumOf(keluar),
    totalsMasih: sumOf(masih),
    totalsGrand: sumOf(all),
  };
}

/** d-M-y, the two-digit year the reference blade prints. */
const fmtDate = (key: string): string => {
  if (key === '') return '';
  return formatTanggalId(key).replace(/\d{4}$/, (year) => year.slice(-2));
};

const fmt4 = (value: number): string => formatNumber(value, 4);
const fmt1 = (value: number): string => formatNumber(value, 1);

const renderRows = (rows: KeluarMasukRow[], startIndex: number): string =>
  rows
    .map(
      (row, index) => `<tr class="data-row ${(startIndex + index) % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${escapeHtml(fmtDate(row.tanggalOut))}</td>
        <td class="center">${escapeHtml(fmtDate(row.tanggalIn))}</td>
        <td class="center">${escapeHtml(row.noKd)}</td>
        <td class="center" style="font-weight: bold;">${row.hari === 0 ? '' : row.hari}</td>
        <td class="number">${escapeHtml(fmt1(row.aveTebal))}</td>
${row.byGroup
  .map(
    (value) => `        <td class="number">${escapeHtml(fmt4(value))}</td>`,
  )
  .join('\n')}
        <td class="number" style="font-weight: bold;">${escapeHtml(fmt4(row.total))}</td>
      </tr>`,
    )
    .join('\n      ');

const renderTotalsRow = (label: string, totals: KeluarMasukTotals): string =>
  `<tr class="totals-row">
        <td colspan="${FIXED_COLUMNS}" class="center">${escapeHtml(label)}</td>
${totals.byGroup
  .map((value) => `        <td class="number">${escapeHtml(fmt4(value))}</td>`)
  .join('\n')}
        <td class="number">${escapeHtml(fmt4(totals.total))}</td>
      </tr>`;

function renderTable(data: KeluarMasukData): string {
  if (data.keluar.length === 0 && data.masih.length === 0) {
    return `<table class="report-table kd-keluar-masuk-table"><tbody>${buildEmptyTableRow(TOTAL_COLUMNS)}</tbody></table>`;
  }

  const groupHeaders = GROUP_COLUMNS.map(
    (column) => `        <th>${escapeHtml(column)}</th>`,
  ).join('\n');

  let body = '';
  if (data.keluar.length > 0) {
    body += renderRows(data.keluar, 0);
    body += `\n      ${renderTotalsRow('Total', data.totalsKeluar)}`;
  }
  if (data.masih.length > 0) {
    body += `\n      <tr class="section-line"><td colspan="${TOTAL_COLUMNS}"></td></tr>`;
    body += `\n      ${renderRows(data.masih, data.keluar.length)}`;
    body += `\n      ${renderTotalsRow('Total', data.totalsMasih)}`;
  }
  if (data.keluar.length > 0 || data.masih.length > 0) {
    body += `\n      ${renderTotalsRow('Total', data.totalsGrand)}`;
  }

  return `<table class="report-table kd-keluar-masuk-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 70px;">Tanggal (Out)</th>
        <th style="width: 70px;">Tanggal (In)</th>
        <th style="width: 46px;">No.KD</th>
        <th style="width: 42px;">Hari</th>
        <th style="width: 56px;">Ave Tebal</th>
${groupHeaders}
        <th style="width: 62px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(TOTAL_COLUMNS)}
    </tbody>
  </table>`;
}

export const kdKeluarMasukReport: ReportDefinition<
  PeriodParams & { noRuangKd?: number },
  KeluarMasukData
> = {
  type: 'kd-keluar-masuk',
  title: 'Laporan KD (Keluar - Masuk)',
  paramsSchema: periodParamsSchema.extend({
    // Omitted means "all chambers", which is how the procedure reads a NULL.
    noRuangKd: z.number().int().positive().optional(),
  }),

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn
      .request()
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir);
    if (params.noRuangKd !== undefined) {
      request.input('NoRuangKD', sql.Int, params.noRuangKd);
    }
    const result = await request.execute('SP_LapKDKeluarMasuk');
    return buildKeluarMasukData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    // The chamber filter is its own line under the title in the reference, not
    // appended to the period. It only appears when the report was filtered.
    const filterMeta = meta.params.noRuangKd
      ? `<p class="report-meta">Filter No KD : <strong>${escapeHtml(meta.params.noRuangKd)}</strong></p>\n  `
      : '';
    return renderWpsReportPage({
      title: 'Laporan KD (Keluar - Masuk)',
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`,
      bodyHtml: filterMeta + renderTable(data),
      style: 'kd_upah',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
