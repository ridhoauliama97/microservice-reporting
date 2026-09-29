import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import type { ReportDefinition } from '../types'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import { buildEmptyTableRow, renderWpsReportPage } from './template'

/**
 * SP_Mutasi_S4S + SP_SubMutasi_S4S — "Laporan Mutasi S4S (m3)".
 *
 * The main SP supplies one row per Jenis, the sub SP supplies the breakdown of
 * what each downstream process consumed, and both are rendered as separate
 * tables. The sub table is omitted entirely when the sub SP returns no rows,
 * which is what the legacy layout did.
 *
 * The column shape is not the same as the Laminating/Moulding/Finger Joint
 * mutasi reports: S4S puts "CCA Prod Out" on the masuk side (four columns) and
 * has no separate CCA column on the keluar side (six columns). It also exposes
 * S4SMasuk as a fallback for ProdOut, so a production that only reports the
 * direct figure still shows up under the right heading.
 */

export interface MutasiS4SRow extends Record<string, unknown> {
  Jenis: string | null;
  S4SAwal: number | string | null;
  S4SMasuk: number | string | null;
  AdjOutputS4S: number | string | null;
  BSOutputS4S: number | string | null;
  ProdOutputS4S: number | string | null;
  CCAProdOutputS4S: number | string | null;
  AdjInputS4S: number | string | null;
  BsInputS4S: number | string | null;
  FJinputS4S: number | string | null;
  MldInputS4S: number | string | null;
  S4SInputS4S: number | string | null;
  JualS4S: number | string | null;
  AkhirS4S: number | string | null;
}

export interface SubMutasiS4SRow extends Record<string, unknown> {
  Jenis: string | null;
  Reproses: number | string | null;
  S4S: number | string | null;
  ST: number | string | null;
  WIP: number | string | null;
  FJ: number | string | null;
  MLD: number | string | null;
  LMT: number | string | null;
}

type MainKey =
  | 'awal'
  | 'adjOut'
  | 'bsOut'
  | 'prodOut'
  | 'ccaProd'
  | 'totalMasuk'
  | 'adjInpt'
  | 'bsInpt'
  | 's4sJual'
  | 'fjInpt'
  | 'mldInpt'
  | 's4sInpt'
  | 'totalKeluar'
  | 'akhir';

const MAIN_KEYS: MainKey[] = [
  'awal',
  'adjOut',
  'bsOut',
  'prodOut',
  'ccaProd',
  'totalMasuk',
  'adjInpt',
  'bsInpt',
  's4sJual',
  'fjInpt',
  'mldInpt',
  's4sInpt',
  'totalKeluar',
  'akhir',
];

/**
 * Legacy $subSpec order. The sub SP names the columns MLD and LMT while the
 * report calls them Moulding and Laminating, so the labels are mapped here
 * rather than read straight off the row.
 */
const SUB_SPEC = [
  { key: 'ST', label: 'ST' },
  { key: 'WIP', label: 'WIP' },
  { key: 'FJ', label: 'FJ' },
  { key: 'LMT', label: 'Laminating' },
  { key: 'MLD', label: 'Moulding' },
  { key: 'Reproses', label: 'Reproses' },
  { key: 'S4S', label: 'S4S' },
] as const;

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  let normalized = value.trim().replaceAll(' ', '');
  if (normalized === '') return 0;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replaceAll('.', '').replaceAll(',', '.')
        : normalized.replaceAll(',', '');
  } else if (normalized.includes(',')) {
    normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(normalized)
      ? normalized.replaceAll(',', '')
      : normalized.replaceAll(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });

const emptyTotals = (): Record<MainKey, number> =>
  Object.fromEntries(MAIN_KEYS.map((key) => [key, 0])) as Record<MainKey, number>;

export const mainValues = (row: MutasiS4SRow): Record<MainKey, number> => {
  const adjOut = toFloat(row.AdjOutputS4S);
  const bsOut = toFloat(row.BSOutputS4S);
  // S4SMasuk is the fallback the legacy blade used for ProdOut.
  const prodOutRaw = toFloat(row.ProdOutputS4S);
  const prodOut = prodOutRaw !== 0 ? prodOutRaw : toFloat(row.S4SMasuk);
  const ccaProd = toFloat(row.CCAProdOutputS4S);
  const adjInpt = toFloat(row.AdjInputS4S);
  const bsInpt = toFloat(row.BsInputS4S);
  const s4sJual = toFloat(row.JualS4S);
  const fjInpt = toFloat(row.FJinputS4S);
  const mldInpt = toFloat(row.MldInputS4S);
  const s4sInpt = toFloat(row.S4SInputS4S);
  return {
    awal: toFloat(row.S4SAwal),
    adjOut,
    bsOut,
    prodOut,
    ccaProd,
    totalMasuk: adjOut + bsOut + prodOut + ccaProd,
    adjInpt,
    bsInpt,
    s4sJual,
    fjInpt,
    mldInpt,
    s4sInpt,
    totalKeluar: adjInpt + bsInpt + s4sJual + fjInpt + mldInpt + s4sInpt,
    akhir: toFloat(row.AkhirS4S),
  };
};

const buildMainTable = (rows: MutasiS4SRow[]): string => {
  const totals = emptyTotals();
  const bodyRows = rows
    .map((row, index) => {
      const values = mainValues(row);
      for (const key of MAIN_KEYS) totals[key] += values[key];
      return `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ''))}</td>
      <td class="number data-cell">${fmt(values.awal)}</td>
      <td class="number data-cell">${fmt(values.adjOut)}</td>
      <td class="number data-cell">${fmt(values.bsOut)}</td>
      <td class="number data-cell">${fmt(values.prodOut)}</td>
      <td class="number data-cell">${fmt(values.ccaProd)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalMasuk)}</td>
      <td class="number data-cell">${fmt(values.adjInpt)}</td>
      <td class="number data-cell">${fmt(values.bsInpt)}</td>
      <td class="number data-cell">${fmt(values.s4sJual)}</td>
      <td class="number data-cell">${fmt(values.fjInpt)}</td>
      <td class="number data-cell">${fmt(values.mldInpt)}</td>
      <td class="number data-cell">${fmt(values.s4sInpt)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.totalKeluar)}</td>
      <td class="number data-cell" style="font-weight: bold;">${fmt(values.akhir)}</td>
    </tr>`;
    })
    .join('\n    ');

  const totalsHtml = MAIN_KEYS.map((key) => `<td class="number">${fmt(totals[key])}</td>`).join(
    '\n      ',
  );

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 30px;">No</th>
      <th rowspan="2" style="width: 210px;">Jenis Kayu</th>
      <th rowspan="2" style="width: 55px;">Awal</th>
      <th colspan="4">Masuk</th>
      <th rowspan="2" style="width: 62px;">Total<br>Masuk</th>
      <th colspan="6">Keluar</th>
      <th rowspan="2" style="width: 62px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 55px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 58px;">Adj Out S4S</th>
      <th style="width: 58px;">BS Out S4S</th>
      <th style="width: 58px;">Prod Out S4S</th>
      <th style="width: 58px;">CCA Prod S4S</th>
      <th style="width: 58px;">Adj Inpt S4S</th>
      <th style="width: 58px;">BS Inpt S4S</th>
      <th style="width: 58px;">S4S Jual</th>
      <th style="width: 58px;">FJ Inpt S4S</th>
      <th style="width: 58px;">Mld Inpt S4S</th>
      <th style="width: 58px;">S4S Inpt S4S</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(15)}
    <tr class="totals-row">
      <td colspan="2" class="blank" style="text-align: center;">Total</td>
      ${totalsHtml}
    </tr>
  </tbody>
</table>`;
};

/** Hidden entirely when the sub SP returned no rows, so no empty state. */
const buildSubTable = (rows: SubMutasiS4SRow[]): string => {
  const totals: Record<string, number> = { Total: 0 };
  for (const spec of SUB_SPEC) totals[spec.key] = 0;

  const bodyRows = rows
    .map((row, index) => {
      const cells = SUB_SPEC.map((spec) => toFloat(row[spec.key]));
      SUB_SPEC.forEach((spec, i) => {
        totals[spec.key] += cells[i]!;
      });
      const rowTotal = cells.reduce((sum, value) => sum + value, 0);
      totals.Total += rowTotal;
      return `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ''))}</td>
      ${cells.map((value) => `<td class="number data-cell">${fmt(value)}</td>`).join('\n      ')}
      <td class="number data-cell" style="font-weight: bold;">${fmt(rowTotal)}</td>
    </tr>`;
    })
    .join('\n      ');

  return `<div class="section-title">Input S4S Produksi</div>
  <table class="report-table sub-report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 30px;">No</th>
        <th style="width: 210px;">Jenis</th>
        ${SUB_SPEC.map((spec) => `<th style="width: 70px;">${escapeHtml(spec.label)}</th>`).join('\n        ')}
        <th style="width: 70px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="2" class="blank" style="text-align: center;">Total</td>
        ${SUB_SPEC.map((spec) => `<td class="number">${fmt(totals[spec.key]!)}</td>`).join('\n        ')}
        <td class="number">${fmt(totals.Total!)}</td>
      </tr>
    </tbody>
  </table>`;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareJenis = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const mutasiS4sReport: ReportDefinition<
  PeriodParams,
  { rows: MutasiS4SRow[]; subRows: SubMutasiS4SRow[] }
> = {
  type: 'mutasi-s4s',
  title: 'Laporan Mutasi S4S (m3)',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input('TglAwal', sql.Date, params.tglAwal)
        .input('TglAkhir', sql.Date, params.tglAkhir)
        .execute('SP_Mutasi_S4S'),
      conn
        .request()
        .input('TglAwal', sql.Date, params.tglAwal)
        .input('TglAkhir', sql.Date, params.tglAkhir)
        .execute('SP_SubMutasi_S4S'),
    ]);

    // Legacy usort: Jenis ascending on both result sets.
    const rows = (mainResult.recordset ?? []) as MutasiS4SRow[];
    rows.sort((left, right) =>
      compareJenis(String(left.Jenis ?? ''), String(right.Jenis ?? '')),
    );
    const subRows = (subResult.recordset ?? []) as SubMutasiS4SRow[];
    subRows.sort((left, right) =>
      compareJenis(String(left.Jenis ?? ''), String(right.Jenis ?? '')),
    );
    return { rows, subRows };
  },

  render(data, meta) {
    const parts = [buildMainTable(data.rows)];
    if (data.subRows.length > 0) parts.push(buildSubTable(data.subRows));
    return renderWpsReportPage({
      title: 'Laporan Mutasi S4S (m3)',
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: parts.join('\n  '),
      style: 'mutasi_s4s',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
}
