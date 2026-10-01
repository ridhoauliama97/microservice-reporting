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
 * SPWps_LapRekapHasilSawmillPerMeja — "Laporan Rekap Hasil Sawmill Per-Meja".
 * Ported from open-api-report's RekapHasilSawmillPerMejaReportService and
 * reports/sawn-timber/rekap-hasil-sawmill-per-meja-pdf.blade.php.
 *
 * A cross-tab of sawn output by chamber: one row per chamber-and-thickness, one
 * column per sawmill date, tonnage in the cells. Each chamber closes with its
 * own subtotal, and the table with a grand total across every date.
 *
 * Columns verified against the live database: NoMeja, TglSawmill, Tebal, UOM,
 * TonRacip - five, all used.
 *
 * The row key is thickness AND unit, not thickness alone, and that matters: the
 * same nominal thickness measured in mm and in inches is a different board, and
 * collapsing them would add two different numbers into one cell. Rows sort by
 * thickness, then unit.
 *
 * The chamber number is a rowspan down its own block, and a cell the procedure
 * did not report for a date is left BLANK rather than printed as 0.0000 - the
 * reference's cell formatter blanks anything at ~zero, and in a month of
 * columns most cells are genuinely empty.
 *
 * Note the two totals formatters differ on purpose: a data cell blanks at zero
 * while the subtotal and grand total do not, because "0.0000" under a date
 * header is noise and "0.0000" in a total row is a real statement that the
 * total is zero.
 *
 * The reference's title for this report is "Laporan Rekap Hasil Sawmill / Meja";
 * the title used here is the one requested for this catalogue.
 *
 * Binds @TglAwal / @TglAkhir.
 */

interface SpRow extends Record<string, unknown> {
  NoMeja?: unknown;
  TglSawmill?: unknown;
  Tebal?: unknown;
  UOM?: unknown;
  TonRacip?: unknown;
}

export interface MejaTebalRow {
  tebal: number;
  uom: string;
  /** Tonnage keyed by ISO date. */
  values: Map<string, number>;
  rowTotal: number;
}

export interface MejaGroup {
  noMeja: number;
  rows: MejaTebalRow[];
}

export interface PerMejaData {
  dateKeys: string[];
  mejaGroups: MejaGroup[];
  totalsByDate: number[];
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

/** d-M, the short form the column headings print. */
const fmtDateShort = (key: string): string =>
  key === '' ? '' : formatTanggalId(key).replace(/-\d{4}$/, '');

/** Cell formatter: 4 decimals, blank at ~zero. */
const fmtCell = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 4);

/** Total formatter: 4 decimals, and a zero total really does print. */
const fmtTotal = (value: number): string => formatNumber(value, 4);

/** Thickness prints to one decimal with trailing zeros stripped. */
const fmtTebal = (value: number): string => {
  const [intPart, decPart] = value.toFixed(1).split('.');
  const trimmed = (decPart ?? '').replace(/0+$/, '');
  return trimmed === '' ? intPart : `${intPart}.${trimmed}`;
};

export function buildPerMejaData(rows: SpRow[]): PerMejaData {
  const dateSet = new Set<string>();
  for (const row of rows) {
    const key = toDateKey(row.TglSawmill);
    if (key !== '') dateSet.add(key);
  }
  const dateKeys = [...dateSet].sort();
  const datesPresent = new Set(dateKeys);

  const byMeja = new Map<number, Map<string, MejaTebalRow>>();
  for (const row of rows) {
    const noMeja = Math.trunc(toFloat(row.NoMeja));
    const tebal = toFloat(row.Tebal);
    const uom = text(row.UOM);
    const value = toFloat(row.TonRacip);
    const dateKey = toDateKey(row.TglSawmill);

    const meja = byMeja.get(noMeja) ?? new Map<string, MejaTebalRow>();
    byMeja.set(noMeja, meja);

    // Thickness AND unit: the same nominal thickness in mm and in inches is a
    // different board and must not share a cell.
    const rowKey = `${tebal}|${uom}`;
    let entry = meja.get(rowKey);
    if (!entry) {
      entry = { tebal, uom, values: new Map(), rowTotal: 0 };
      meja.set(rowKey, entry);
    }

    if (dateKey === '' || !datesPresent.has(dateKey)) continue;
    entry.values.set(dateKey, (entry.values.get(dateKey) ?? 0) + value);
    entry.rowTotal += value;
  }

  const mejaGroups: MejaGroup[] = [...byMeja.entries()]
    .sort(([left], [right]) => left - right)
    .map(([noMeja, meja]) => ({
      noMeja,
      rows: [...meja.values()].sort(
        (a, b) => a.tebal - b.tebal || a.uom.localeCompare(b.uom),
      ),
    }));

  const totalsByDate = dateKeys.map(
    (date) =>
      mejaGroups.reduce(
        (sum, group) =>
          sum + group.rows.reduce((inner, row) => inner + (row.values.get(date) ?? 0), 0),
        0,
      ),
  );
  const grandTotal = mejaGroups.reduce(
    (sum, group) => sum + group.rows.reduce((inner, row) => inner + row.rowTotal, 0),
    0,
  );

  return { dateKeys, mejaGroups, totalsByDate, grandTotal };
}

function renderPivot(data: PerMejaData): string {
  const width = 4 + data.dateKeys.length;

  if (data.mejaGroups.length === 0) {
    return `<table class="report-table per-meja-table"><tbody>${buildEmptyTableRow(width)}</tbody></table>`;
  }

  const body = data.mejaGroups
    .map((group) => {
      const rowIndex = group.rows.length;
      const cells = group.rows
        .map((row, index) => {
          const perDate = data.dateKeys
            .map((date) => `        <td class="number">${escapeHtml(fmtCell(row.values.get(date) ?? 0))}</td>`)
            .join('\n');
          // The chamber number spans its own block of rows.
          const noMejaCell =
            index === 0
              ? `          <td class="center" rowspan="${rowIndex}">${group.noMeja}</td>\n          `
              : '';
          return `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
          ${noMejaCell}<td class="center">${escapeHtml(fmtTebal(row.tebal))}</td>
          <td class="center">${escapeHtml(row.uom)}</td>
${perDate}
          <td class="number" style="font-weight: bold;">${escapeHtml(fmtTotal(row.rowTotal))}</td>
        </tr>`;
        })
        .join('\n        ');

      const subtotalByDate = data.dateKeys.map(
        (date) =>
          escapeHtml(
            fmtTotal(
              group.rows.reduce((sum, row) => sum + (row.values.get(date) ?? 0), 0),
            ),
          ),
      );
      const subtotal = group.rows.reduce((sum, row) => sum + row.rowTotal, 0);

      return `${cells}
        <tr class="subtotal-row">
          <td colspan="3" class="center">Sub Total Meja ${group.noMeja}</td>
${subtotalByDate
  .map((value) => `          <td class="number">${value}</td>`)
  .join('\n')}
          <td class="number">${escapeHtml(fmtTotal(subtotal))}</td>
        </tr>`;
    })
    .join('\n        ');

  return `<table class="report-table per-meja-table">
    <thead>
      <tr class="headers-row">
        <th rowspan="2" style="width: 46px;">No. Meja</th>
        <th rowspan="2" style="width: 56px;">Tebal</th>
        <th rowspan="2" style="width: 40px;">UOM</th>
        <th colspan="${data.dateKeys.length + 1}">Tanggal</th>
      </tr>
      <tr class="headers-row">
${data.dateKeys
  .map(
    (date) => `        <th style="width: 52px;">${escapeHtml(fmtDateShort(date))}</th>`,
  )
  .join('\n')}
        <th style="width: 56px;">Total</th>
      </tr>
    </thead>
    <tbody>
        ${body}
        <tr class="totals-row">
          <td colspan="3" class="center">Total (Ton)</td>
${data.totalsByDate
  .map((value) => `          <td class="number">${escapeHtml(fmtTotal(value))}</td>`)
  .join('\n')}
          <td class="number">${escapeHtml(fmtTotal(data.grandTotal))}</td>
        </tr>
    </tbody>
  </table>`;
}

export const rekapHasilSawmillPerMejaReport: ReportDefinition<PeriodParams, PerMejaData> = {
  type: 'rekap-hasil-sawmill-per-meja',
  title: 'Laporan Rekap Hasil Sawmill Per-Meja',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapRekapHasilSawmillPerMeja');
    return buildPerMejaData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Rekap Hasil Sawmill Per-Meja',
      subtitle: `Periode ${period}`,
      bodyHtml: renderPivot(data),
      style: 'per_meja',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
