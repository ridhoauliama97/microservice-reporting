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
 * SP_LapMutasiKD — "Laporan Mutasi KD". Ported from open-api-report's
 * MutasiKdReportService and reports/sawn-timber/mutasi-kd-pdf.blade.php.
 *
 * One table per drying chamber (NoRuangKD), rows sorted by TglMasuk then
 * TglKeluar, each table closing with its own ton totals and its own day count.
 *
 * Kolom verified against the live database: NoRuangKD, TglMasuk, TonIn,
 * TglKeluar, TonOut. The procedure binds @StartDate and @EndDate, NOT the
 * @TglAwal/@TglAkhir the other period reports use, so the names are mapped
 * here rather than relying on the factory default.
 *
 * Two details worth naming:
 *
 *   - A NoRuangKD of zero or less is dropped. The reference skips it, and a
 *     chamber numbered 0 is a placeholder row rather than a real chamber.
 *   - "Jumlah Hari" is the SIGNED difference TglKeluar - TglMasuk, and it is 0
 *     when either date is missing. The reference asks Carbon for a non-absolute
 *     diff, so a lot that has not been emptied yet, or that went out before it
 *     came in, prints a negative or zero figure rather than a made-up one.
 *     The chamber total sums those signed differences.
 */

interface KdRow extends Record<string, unknown> {
  NoRuangKD: number | string | null
  TglMasuk: Date | string | null
  TonIn: number | string | null
  TglKeluar: Date | string | null
  TonOut: number | string | null
}

interface KdGroup {
  noRuangKd: number
  rows: KdRow[]
  tonIn: number
  tonOut: number
  totalDays: number
}

interface KdData {
  groups: KdGroup[]
  totalGroups: number
  grandTonIn: number
  grandTonOut: number
}

const COLUMNS = 6;
const MS_PER_DAY = 86_400_000;

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replaceAll(',', '.');
  if (normalized === '' || normalized === '-') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim();

/** Legacy $fmtTon: four decimals, blank at ~zero. */
const fmtTon = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

/** d-M-y, the format the reference blade prints. */
const fmtDate = (value: unknown): string => {
  // The driver hands SQL `date` columns back as Date at UTC midnight, so the
  // UTC date is the calendar date. Stringifying it would print the whole
  // "Wed Jul 29 2026 07:00:00 GMT+0700" toString, which is what the first
  // render of this report did.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatTanggalId(value.toISOString().slice(0, 10)).replace(
      /\d{4}$/,
      (year) => year.slice(-2),
    );
  }
  const raw = toText(value);
  if (raw === '') return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return raw;
  return formatTanggalId(`${iso[1]}-${iso[2]}-${iso[3]}`).replace(
    /\d{4}$/,
    (year) => year.slice(-2),
  );
};

const toEpochDay = (value: unknown): number | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : Math.floor(value.getTime() / MS_PER_DAY);
  }
  const raw = toText(value);
  if (raw === '') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return null;
  const parsed = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / MS_PER_DAY);
};

/** Signed TglKeluar - TglMasuk in days; 0 when either date is missing. */
export function calcDays(tglMasuk: unknown, tglKeluar: unknown): number {
  const inDay = toEpochDay(tglMasuk);
  const outDay = toEpochDay(tglKeluar);
  if (inDay === null || outDay === null) return 0;
  return outDay - inDay;
}

/**
 * Groups by chamber, numerically ascending, rows by TglMasuk then TglKeluar.
 * A stable sort keeps the procedure's order inside a chamber when the two
 * dates tie, which the reference's usort also does.
 */
export function buildKdGroups(rows: KdRow[]): KdData {
  const byKd = new Map<number, KdRow[]>();
  for (const row of rows) {
    const kd = Math.trunc(toFloat(row.NoRuangKD));
    if (kd <= 0) continue;
    const bucket = byKd.get(kd);
    if (bucket) bucket.push(row);
    else byKd.set(kd, [row]);
  }

  const groups: KdGroup[] = [...byKd.keys()]
    .sort((left, right) => left - right)
    .map((kd) => {
      const kdRows = [...byKd.get(kd)!]
        .map((row, index) => ({ row, index }))
        .sort((left, right) => {
          const byIn = toEpochDay(left.row.TglMasuk) ?? 0;
          const byOut = toEpochDay(left.row.TglKeluar) ?? 0;
          const inA = toEpochDay(right.row.TglMasuk) ?? 0;
          const inB = toEpochDay(right.row.TglKeluar) ?? 0;
          if (byIn !== inA) return byIn - inA;
          if (byOut !== inB) return byOut - inB;
          return left.index - right.index;
        })
        .map((entry) => entry.row);

      return {
        noRuangKd: kd,
        rows: kdRows,
        tonIn: kdRows.reduce((sum, row) => sum + toFloat(row.TonIn), 0),
        tonOut: kdRows.reduce((sum, row) => sum + toFloat(row.TonOut), 0),
        totalDays: kdRows.reduce(
          (sum, row) => sum + calcDays(row.TglMasuk, row.TglKeluar),
          0,
        ),
      };
    });

  return {
    groups,
    totalGroups: groups.length,
    grandTonIn: groups.reduce((sum, group) => sum + group.tonIn, 0),
    grandTonOut: groups.reduce((sum, group) => sum + group.tonOut, 0),
  };
}

const buildGroupTable = (group: KdGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(fmtDate(row.TglMasuk))}</td>
        <td class="number">${escapeHtml(fmtTon(toFloat(row.TonIn)))}</td>
        <td class="center">${escapeHtml(fmtDate(row.TglKeluar))}</td>
        <td class="number">${escapeHtml(fmtTon(toFloat(row.TonOut)))}</td>
        <td class="center">${calcDays(row.TglMasuk, row.TglKeluar)} Hari</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">No KD : ${group.noRuangKd}</div>
  <table class="report-table kd-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 4%;">No</th>
        <th style="width: 20%;">Tanggal (In)</th>
        <th style="width: 20%;">Ton (In)</th>
        <th style="width: 20%;">Tanggal (Out)</th>
        <th style="width: 20%;">Ton (Out)</th>
        <th style="width: 16%;">Jumlah Hari</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(COLUMNS)}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="2" class="center">Total</td>
        <td class="number">${escapeHtml(fmtTon(group.tonIn))}</td>
        <td></td>
        <td class="number">${escapeHtml(fmtTon(group.tonOut))}</td>
        <td class="center">${group.totalDays} Hari</td>
      </tr>
    </tfoot>
  </table>`;
};

export const mutasiKdReport: ReportDefinition<PeriodParams, KdData> = {
  type: 'mutasi-kd',
  title: 'Laporan Mutasi KD',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      // This procedure names its dates @StartDate / @EndDate, unlike the
      // @TglAwal / @TglAkhir used by the other period reports.
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir)
      .execute('SP_LapMutasiKD');
    return buildKdGroups((result.recordset ?? []) as KdRow[]);
  },

  render(data, meta) {
    const bodyHtml =
      data.groups.length > 0
        ? data.groups.map(buildGroupTable).join('\n  ')
        : `<table class="report-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;

    return renderWpsReportPage({
      title: 'Laporan Mutasi KD',
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: 'mutasi_kd',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
