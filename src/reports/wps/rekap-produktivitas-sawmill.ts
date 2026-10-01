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
 * SPWps_LapRekapProduktivitasSawmill — "Laporan Rekap Produktivitas Sawmill".
 * Ported from open-api-report's RekapProduktivitasSawmillReportService and
 * reports/sawn-timber/rekap-produktivitas-sawmill-pdf.blade.php.
 *
 * One row per sawmill date, with sawn output split into five product families
 * and a total, plus how many tables ran that day.
 *
 * Columns verified against the live database: TglSawmill, JlhMeja, GroupKayu,
 * TonST. Four - this procedure returns LONG format, not a pivot, so the
 * grouping into a grid happens here.
 *
 * The five columns are not in the procedure. GroupKayu is a free-text wood
 * group, and the reference folds it onto five fixed columns with a contains
 * test, in a specific order:
 *
 *   "jabon"                              -> JABON
 *   rambung + kayulat / kayul            -> RAMBUNG KAYU L
 *   rambung + mc1                        -> RAMBUNG MC 1
 *   rambung + mc2                        -> RAMBUNG MC 2
 *   rambung + std                        -> RAMBUNG STD
 *   anything else                        -> dropped
 *
 * The order matters and is not alphabetical: JABON is tested first, then the
 * Rambung variants, because a group string can name more than one family and
 * the first match wins. A group that matches nothing is dropped rather than
 * given a sixth column, so the day's Total is the sum of the five columns and
 * not the sum of the procedure. That is the reference behaviour; it also means
 * an unrecognised group makes the day look lighter than it was.
 *
 * "Jumlah Meja" is the procedure's own JlhMeja, taken from whichever row carries
 * it, NOT a count of distinct tables - a table appearing on two group rows for
 * one day would otherwise be counted twice. The reference's fallback to
 * counting distinct NoMeja does not apply, because this procedure has no NoMeja
 * column.
 *
 * Binds @TglAwal / @TglAkhir.
 */

const TYPE_COLUMNS = [
  'JABON',
  'RAMBUNG KAYU L',
  'RAMBUNG MC 1',
  'RAMBUNG MC 2',
  'RAMBUNG STD',
] as const;

const HEADERS = ['Jabon', 'Rambung\nKayu Lat', 'Rambung\nMC 1', 'Rambung\nMC 2', 'Rambung\nSTD'];

interface SpRow extends Record<string, unknown> {
  TglSawmill?: unknown;
  JlhMeja?: unknown;
  GroupKayu?: unknown;
  TonST?: unknown;
}

export interface ProduktivitasRow {
  tanggal: string;
  jumlahMeja: number;
  byType: number[];
  total: number;
}

export interface ProduktivitasData {
  rows: ProduktivitasRow[];
  totalsByType: number[];
  totalJumlahMeja: number;
  grandTotal: number;
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
  if (!iso) return raw;
  return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
};

/** d-M-y, the two-digit year the blade prints. */
const fmtDate = (key: string): string =>
  key === '' ? '' : formatTanggalId(key).replace(/\d{4}$/, (year) => year.slice(-2));

/** Reference $fmt: 4 decimals, blank at ~zero. */
const fmtCell = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 4);

/** Reference $fmtTotal: 4 decimals, and a zero total really does print. */
const fmtTotal = (value: number): string => formatNumber(value, 4);

const fmtInt = (value: number): string => (value <= 0 ? '' : String(Math.round(value)));

/**
 * Folds a GroupKayu value onto one of the five columns, or null when it matches
 * none. Order is the reference's: JABON first, then the Rambung families, so a
 * group naming more than one family lands in the first match.
 */
export function mapJenisToColumn(jenis: string): number | null {
  const norm = jenis.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (norm === 'jabon' || norm.includes('jabon')) return 0;
  if (norm.includes('rambung') && (norm.includes('kayulat') || norm.includes('kayul'))) return 1;
  if (norm.includes('rambang') && norm.includes('mc1')) return 2;
  if (norm.includes('rambang') && norm.includes('mc2')) return 3;
  if (norm.includes('rambang') && norm.includes('std')) return 4;
  return null;
}

export function buildProduktivitasData(rows: SpRow[]): ProduktivitasData {
  const byDate = new Map<string, { jumlahMeja: number; byType: number[] }>();

  for (const row of rows) {
    const tanggal = toDateKey(row.TglSawmill);
    if (tanggal === '') continue;

    let entry = byDate.get(tanggal);
    if (!entry) {
      entry = { jumlahMeja: 0, byType: TYPE_COLUMNS.map(() => 0) };
      byDate.set(tanggal, entry);
    }

    // The procedure's own table count, not a count of rows.
    entry.jumlahMeja = Math.round(toFloat(row.JlhMeja));

    const column = mapJenisToColumn(text(row.GroupKayu));
    // A group that matches none of the five is dropped, so the day's total is
    // the sum of the printed columns.
    if (column === null) continue;
    entry.byType[column]! += toFloat(row.TonST);
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const built: ProduktivitasRow[] = sorted.map(([tanggal, entry]) => ({
    tanggal,
    jumlahMeja: entry.jumlahMeja,
    byType: entry.byType,
    total: entry.byType.reduce((sum, value) => sum + value, 0),
  }));

  return {
    rows: built,
    totalsByType: TYPE_COLUMNS.map((_, column) =>
      built.reduce((sum, row) => sum + row.byType[column]!, 0),
    ),
    // Summing the per-day table counts would double count a table that ran on
    // two group rows, so this is only meaningful as a day count.
    totalJumlahMeja: built.reduce((sum, row) => sum + row.jumlahMeja, 0),
    grandTotal: built.reduce((sum, row) => sum + row.total, 0),
  };
}

const COLUMNS = 8;

function renderTable(data: ProduktivitasData): string {
  if (data.rows.length === 0) {
    return `<table class="report-table produktivitas-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;
  }

  const body = data.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${escapeHtml(fmtDate(row.tanggal))}</td>
        <td class="center">${escapeHtml(fmtInt(row.jumlahMeja))}</td>
${row.byType
  .map((value) => `        <td class="number">${escapeHtml(fmtCell(value))}</td>`)
  .join('\n')}
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtCell(row.total))}</td>
      </tr>`,
    )
    .join('\n      ');

  return `<table class="report-table produktivitas-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 10%;">Tanggal</th>
        <th style="width: 12%;">Jumlah Meja</th>
        <th style="width: 10%;">Jabon</th>
        <th>Rambung <br> Kayu Lat</th>
        <th>Rambung <br> MC 1</th>
        <th>Rambung <br> MC 2</th>
        <th>Rambung <br> STD</th>
        <th style="width: 12%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      <tr class="totals-row">
        <td class="center">Total</td>
        <td class="center">${escapeHtml(fmtInt(data.totalJumlahMeja))}</td>
${data.totalsByType
  .map((value) => `        <td class="number">${escapeHtml(fmtTotal(value))}</td>`)
  .join('\n')}
        <td class="number">${escapeHtml(fmtTotal(data.grandTotal))}</td>
      </tr>
    </tbody>
  </table>`;
}

export const rekapProduktivitasSawmillReport: ReportDefinition<
  PeriodParams,
  ProduktivitasData
> = {
  type: 'rekap-produktivitas-sawmill',
  title: 'Laporan Rekap Produktivitas Sawmill',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapRekapProduktivitasSawmill');
    return buildProduktivitasData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Rekap Produktivitas Sawmill',
      subtitle: `Periode ${period}`,
      bodyHtml: renderTable(data),
      style: 'per_meja',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
