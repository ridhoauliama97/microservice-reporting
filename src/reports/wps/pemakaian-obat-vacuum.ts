import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, formatInt, renderWpsReportPage } from './template'

/**
 * SP_LapPemakaianObatVacuum — "Laporan Pemakaian Obat Vacuum". Ported from
 * open-api-report's PemakaianObatVacuumReportService and
 * reports/sawn-timber/pemakaian-obat-vacuum-pdf.blade.php.
 *
 * One row per day of vacuum treatment, with the medication mix and its
 * efficiency ratios. Twelve procedure columns become nineteen printed columns,
 * because seven of them are derived:
 *
 *   Rasio Borax (kg/ton) = Borax / STTon
 *   Rasio Boric (kg/ton) = Boric / STTon
 *   Obat (%)            = (Borax + Boric) / Air * 100
 *   Borax / Boric       = Borax / Boric
 *   Persen (%)          = Kaporit / Air * 100
 *   Charge (Menit)      = JamKerja / Charge
 *   ST Ton/Charge       = STTon / Charge
 *
 * Columns verified against the live database: Tanggal, Air, Borax, Boric,
 * Kaporit, STTon, STJabon, STTG, STPulai, STRambung, Charge, JamKerja. Note
 * "STTG" and "JamKerja" - the reference reads STJabon/STTG/STPulai/STRambung
 * and JamKerja directly, with no candidate matching, so the printed "Jabon TG"
 * and "Menit" columns are those two.
 *
 * Every ratio is 0 rather than a division by zero when its denominator is
 * missing, and the formatter prints 0 as blank - so a day with no water reads
 * as empty cells, not as a wall of zeros.
 *
 * The footer is a real total row, not a column sum of the ratios: the reference
 * recomputes each ratio from the summed figures (sumBorax / sumSTTon, and so
 * on), which is the only correct way to total a ratio. Summing the daily
 * percentages would produce a number with no meaning.
 *
 * Binds @TglAwal / @TglAkhir, the default period names.
 */

const EPS = 0.0000001;

/** Reference column order, with the two header groups in their printed slots. */
const COLUMNS = [
  { key: 'Tanggal', label: 'Tanggal', kind: 'date' },
  { key: 'Air', label: 'Air', kind: 'int' },
  { key: 'Borax', label: 'Borax (kg)', kind: 'int' },
  { key: 'RasioBorax', label: 'Rasio Borax (kg/ton)', kind: 'ratio' },
  { key: 'Boric', label: 'Boric (kg)', kind: 'int' },
  { key: 'RasioBoric', label: 'Rasio Boric (kg/ton)', kind: 'ratio' },
  { key: 'Obat', label: 'Obat (%)', kind: 'ratio' },
  { key: 'BoraxBoric', label: 'Borax / Boric', kind: 'ratio' },
  { key: 'Kaporit', label: 'Kaporit (Kg)', kind: 'int' },
  { key: 'KaporitPct', label: 'Persen (%)', kind: 'ratio' },
  { key: 'STTon', label: 'ST (Ton)', kind: 'ton' },
  { key: 'STJabon', label: 'Jabon', kind: 'ton' },
  { key: 'STTG', label: 'Jabon TG', kind: 'ton' },
  { key: 'STPulai', label: 'Pulai', kind: 'ton' },
  { key: 'STRambung', label: 'Rambung', kind: 'ton' },
  { key: 'Charge', label: 'Charge', kind: 'int' },
  { key: 'Menit', label: 'Menit', kind: 'int' },
  { key: 'ChargeMenit', label: 'Charge (Menit)', kind: 'ratio' },
  { key: 'STTonCharge', label: 'ST Ton/Charge', kind: 'ton' },
] as const;

/** The two derived columns that sit under a colspan'd group header. */
const GROUPED = new Set(['Borax', 'RasioBorax', 'Boric', 'RasioBoric']);

interface SpRow extends Record<string, unknown> {
  Tanggal?: unknown;
  Air?: unknown;
  Borax?: unknown;
  Boric?: unknown;
  Kaporit?: unknown;
  STTon?: unknown;
  STJabon?: unknown;
  STTG?: unknown;
  STPulai?: unknown;
  STRambang?: unknown;
  Charge?: unknown;
  JamKerja?: unknown;
}

export type ObatRow = Record<string, string>;

export interface ObatData {
  rows: ObatRow[];
  total: ObatRow;
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

/** Ratio, or 0 when the denominator is missing - the reference guards both sides. */
const ratio = (numerator: number, denominator: number): number =>
  numerator > EPS && denominator > EPS ? numerator / denominator : 0;

/**
 * Reference formatters all blank at ~zero rather than printing "0.00". It
 * matters here more than in most reports: a treatment day with no water leaves
 * every ratio at zero, and a row of "0.00" across nineteen columns is noise
 * around the handful of figures that matter.
 */
const fmtInt = (value: number): string => formatInt(value);
const fmt2 = (value: number): string => formatNumber(value, 2, { blankWhenZero: true });
const fmt4 = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });

/** d-M-y, the two-digit year the reference blade prints. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatTanggalId(value.toISOString().slice(0, 10)).replace(
      /\d{4}$/,
      (year) => year.slice(-2),
    );
  }
  const raw = text(value);
  if (raw === '') return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return raw;
  return formatTanggalId(`${iso[1]}-${iso[2]}-${iso[3]}`).replace(
    /\d{4}$/,
    (year) => year.slice(-2),
  );
};

const formatValue = (kind: string, value: number): string => {
  if (kind === 'int') return fmtInt(value);
  if (kind === 'ratio') return fmt2(value);
  return fmt4(value);
};

const toRow = (source: Record<string, string | number>, dateLabel: string): ObatRow => {
  const row: ObatRow = {};
  for (const column of COLUMNS) {
    if (column.key === 'Tanggal') {
      row[column.key] = dateLabel;
      continue;
    }
    const raw = source[column.key] ?? 0;
    row[column.key] = formatValue(column.kind, typeof raw === 'number' ? raw : 0);
  }
  return row;
};

export function buildObatData(rows: SpRow[]): ObatData {
  const plain = rows.map((row) => {
    const air = toFloat(row.Air);
    const borax = toFloat(row.Borax);
    const boric = toFloat(row.Boric);
    const kaporit = toFloat(row.Kaporit);
    const st = toFloat(row.STTon);
    const charge = toFloat(row.Charge);
    const menit = toFloat(row.JamKerja);

    return {
      Tanggal: fmtDate(row.Tanggal),
      Air: air,
      Borax: borax,
      RasioBorax: ratio(borax, st),
      Boric: boric,
      RasioBoric: ratio(boric, st),
      Obat: ratio(borax + boric, air) * 100,
      BoraxBoric: ratio(borax, boric),
      Kaporit: kaporit,
      KaporitPct: ratio(kaporit, air) * 100,
      STTon: st,
      STJabon: toFloat(row.STJabon),
      STTG: toFloat(row.STTG),
      STPulai: toFloat(row.STPulai),
      STRambang: toFloat(row.STRambung),
      Charge: charge,
      Menit: menit,
      ChargeMenit: ratio(menit, charge),
      STTonCharge: ratio(st, charge),
    };
  });

  const sum = (key: string): number =>
    plain.reduce((total, row) => total + (row[key as keyof typeof row] as number), 0);

  // The footer recomputes each ratio from the summed figures. Summing the daily
  // ratios instead would add a month of percentages, which is not a quantity.
  const sumAir = sum('Air');
  const sumBorax = sum('Borax');
  const sumBoric = sum('Boric');
  const sumKaporit = sum('Kaporit');
  const sumSt = sum('STTon');
  const sumCharge = sum('Charge');
  const sumMenit = sum('Menit');

  return {
    rows: plain.map((row) => toRow(row, row.Tanggal)),
    total: toRow(
      {
        Tanggal: 'Total',
        Air: sumAir,
        Borax: sumBorax,
        RasioBorax: ratio(sumBorax, sumSt),
        Boric: sumBoric,
        RasioBoric: ratio(sumBoric, sumSt),
        Obat: ratio(sumBorax + sumBoric, sumAir) * 100,
        BoraxBoric: ratio(sumBorax, sumBoric),
        Kaporit: sumKaporit,
        KaporitPct: ratio(sumKaporit, sumAir) * 100,
        STTon: sumSt,
        STJabon: sum('STJabon'),
        STTG: sum('STTG'),
        STPulai: sum('STPulai'),
        STRambung: sum('STRambung'),
        Charge: sumCharge,
        Menit: sumMenit,
        ChargeMenit: ratio(sumMenit, sumCharge),
        STTonCharge: ratio(sumSt, sumCharge),
      },
      'Total',
    ),
  };
}

const renderRow = (cells: string, className: string): string =>
  `<tr class="${className}">${cells}</tr>`;

const renderCells = (row: ObatRow, total: boolean): string =>
  COLUMNS.map((column, index) => {
    const value = row[column.key] ?? '';
    const isDate = column.key === 'Tanggal';
    const className = isDate
      ? 'center data-cell'
      : total
        ? 'number data-cell'
        : 'number data-cell';
    return `        <td class="${className}"${total ? ' style="font-weight: bold;"' : ''}>${escapeHtml(value)}</td>`;
  }).join('\n');

function renderTable(data: ObatData): string {
  // Header: a colspan'd "Borax" and "Boric" band over their two columns, and
  // every other column spanning both header rows.
  const topRow = COLUMNS.map((column) => {
    if (column.key === 'Borax' || column.key === 'Boric') {
      return `      <th colspan="2">${escapeHtml(column.key === 'Borax' ? 'Borax' : 'Boric')}</th>`;
    }
    if (GROUPED.has(column.key)) return '';
    return `      <th rowspan="2">${escapeHtml(column.label)}</th>`;
  })
    .filter((line) => line !== '')
    .join('\n');

  const secondRow = ['Borax', 'RasioBorax', 'Boric', 'RasioBoric']
    .map((key) => `      <th>${escapeHtml(key === 'RasioBorax' ? 'Rasio Borax (kg/ton)' : key === 'RasioBoric' ? 'Rasio Boric (kg/ton)' : `${key} (kg)`)}</th>`)
    .join('\n');

  const body = data.rows
    .map(
      (row, index) =>
        renderRow(
          renderCells(row, false),
          `data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}`,
        ),
    )
    .join('\n    ');

  const totalRow =
    data.rows.length > 0
      ? `\n    ${renderRow(renderCells(data.total, true), 'totals-row')}`
      : '';

  return `<table class="report-table obat-vacuum-table">
    <thead>
      <tr class="headers-row">
${topRow}
      </tr>
      <tr class="headers-row">
${secondRow}
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(COLUMNS.length)}${totalRow}
    </tbody>
  </table>`;
}

export const pemakaianObatVacuumReport: ReportDefinition<PeriodParams, ObatData> = {
  type: 'pemakaian-obat-vacuum',
  title: 'Laporan Pemakaian Obat Vacuum',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SP_LapPemakaianObatVacuum');
    return buildObatData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Pemakaian Obat Vacuum',
      subtitle: `Periode ${period}`,
      bodyHtml: renderTable(data),
      style: 'obat_vacuum',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
