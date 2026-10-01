import sql from 'mssql'
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, renderWpsReportPage } from './template'
import {
  naturalCaseInsensitive,
  pivotColumnWidths,
  renderPivotCell,
  renderTotalCell,
} from './pembelian-st-cell'

/**
 * SP_LapPembelianSTPerSupplier — "Laporan Pembelian ST Per Supplier (Ton)".
 * Ported from open-api-report's PembelianStPerSupplierTonReportService and
 * reports/sawn-timber/pembelian-st-per-supplier-ton-pdf.blade.php.
 *
 * A cross-tab: one row per supplier, one column per wood type, tonnage summed
 * in each cell, each cell carrying its share of the column. Closes with a
 * totals row and a grand total.
 *
 * Columns verified against the live database: NmSupplier, Jenis, DateCreate,
 * DateUsage, TglLaporan, STTon. Only the first, second and last are read; the
 * three date columns are there but the period is pinned in the procedure and
 * the reference never looks at them.
 *
 * Two ordering rules, both from the reference:
 *
 *   - Types come out in a fixed preferred order (Bira, Jabon, Pulai, Rambung
 *     and its MC/STD variants, then Kayu Lat), with anything unlisted appended
 *     naturally. Plain alphabetical would scatter "RAMBUNG - MC 1" and
 *     "RAMBUNG - MC 2" away from the other Rambung columns, which is not how
 *     the legacy sheet reads.
 *   - Suppliers sort naturally and case-insensitively, so "SUP A2" precedes
 *     "SUP A10" and a lowercase name is not exiled to the end.
 *
 * A blank supplier or type prints as "-", keeping its tonnage in the totals
 * rather than dropping it on the floor.
 *
 * The totals row sits in the tbody, not a tfoot - matching the reference, so
 * it does not repeat on every page of a long cross-tab.
 */

interface SpRow extends Record<string, unknown> {
  NmSupplier?: unknown;
  Jenis?: unknown;
  STTon?: unknown;
}

export interface SupplierRow {
  supplier: string;
  byJenis: number[];
}

export interface PerSupplierData {
  jenisColumns: string[];
  rows: SupplierRow[];
  totalsByJenis: number[];
  grandTotal: number;
}

/**
 * The legacy type order, carried over from the reference verbatim.
 *
 * One entry does not match the data: the list has "RAMBUNG STD" without a dash,
 * while the procedure returns "RAMBUNG - STD" (checked against the live
 * database). So the Rambung STD column never matches the preferred slot and
 * falls into the alphabetical tail. Left as the reference has it, because
 * "correcting" it would move a column relative to every other report derived
 * from this one. If the intended order really is the reference's, change the
 * entry to "RAMBUNG - STD" here.
 */
const PREFERRED_JENIS = [
  'BIRA - BIRA',
  'BIRA-BIRA',
  'JABON',
  'JABON TD',
  'JABON TG',
  'PULAI',
  'RAMBUNG',
  'RAMBUNG MC1',
  'RAMBUNG MC 1',
  'RAMBUNG MC2',
  'RAMBUNG MC 2',
  'RAMBUNG STD',
  'KAYU LAT JABON',
];

const LABEL_WIDTH_PERCENT = 26;

const text = (value: unknown): string => String(value ?? '').trim();

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Preferred order first, then everything else naturally. */
export function orderJenis(columns: string[]): string[] {
  const remaining = new Set(columns);
  const ordered: string[] = [];
  for (const preferred of PREFERRED_JENIS) {
    if (remaining.delete(preferred)) ordered.push(preferred);
  }
  return [...ordered, ...[...remaining].sort(naturalCaseInsensitive)];
}

export function buildPerSupplierData(rows: SpRow[]): PerSupplierData {
  const bySupplier = new Map<string, Map<string, number>>();
  const totalsByJenis = new Map<string, number>();

  for (const row of rows) {
    const supplier = text(row.NmSupplier) || '-';
    const jenis = text(row.Jenis) || '-';
    const ton = toFloat(row.STTon);

    const bucket = bySupplier.get(supplier) ?? new Map<string, number>();
    bucket.set(jenis, (bucket.get(jenis) ?? 0) + ton);
    bySupplier.set(supplier, bucket);
    totalsByJenis.set(jenis, (totalsByJenis.get(jenis) ?? 0) + ton);
  }

  const jenisColumns = orderJenis([...totalsByJenis.keys()]);
  const rows2 = [...bySupplier.keys()].sort(naturalCaseInsensitive).map((supplier) => {
    const bucket = bySupplier.get(supplier)!;
    return {
      supplier,
      byJenis: jenisColumns.map((jenis) => bucket.get(jenis) ?? 0),
    };
  });

  const totals = jenisColumns.map((jenis) => totalsByJenis.get(jenis) ?? 0);

  return {
    jenisColumns,
    rows: rows2,
    totalsByJenis: totals,
    grandTotal: totals.reduce((sum, value) => sum + value, 0),
  };
}

function renderPivot(data: PerSupplierData): string {
  if (data.rows.length === 0) {
    return `<table class="report-table pembelian-st-table"><tbody>${buildEmptyTableRow(3)}</tbody></table>`;
  }

  // The Total column is a measure column too, so it shares the remaining width.
  const measureCount = data.jenisColumns.length + 1;
  const measureWidth = pivotColumnWidths(measureCount, LABEL_WIDTH_PERCENT);

  const body = data.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${index + 1}</td>
        <td class="data-cell" style="text-align: left">${escapeHtml(row.supplier)}</td>
${row.byJenis
  .map((ton, column) => `        <td class="data-cell">${renderPivotCell(ton, data.totalsByJenis[column]!)}</td>`)
  .join('\n')}
        <td class="data-cell">${renderPivotCell(
          row.byJenis.reduce((sum, value) => sum + value, 0),
          data.grandTotal,
        )}</td>
      </tr>`,
    )
    .join('\n      ');

  const totalsRow = `<tr class="totals-row">
        <td class="data-cell" colspan="2" style="text-align: center">Total</td>
${data.totalsByJenis
  .map((ton) => `        <td class="data-cell">${renderTotalCell(ton)}</td>`)
  .join('\n')}
        <td class="data-cell">${renderTotalCell(data.grandTotal)}</td>
      </tr>`;

  return `<table class="report-table pembelian-st-table">
    <colgroup>
      <col style="width: 4%;">
      <col style="width: ${LABEL_WIDTH_PERCENT}%;">
      <col span="${data.jenisColumns.length}" style="width: ${measureWidth}%;">
      <col style="width: ${measureWidth}%;">
    </colgroup>
    <thead>
      <tr class="headers-row">
        <th>No</th>
        <th>Supplier</th>
${data.jenisColumns
  .map((jenis) => `        <th>${escapeHtml(jenis)}</th>`)
  .join('\n')}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      ${totalsRow}
    </tbody>
  </table>`;
}

export const pembelianStPerSupplierReport: ReportDefinition<
  PeriodParams,
  PerSupplierData
> = {
  type: 'pembelian-st-per-supplier-ton',
  title: 'Laporan Pembelian ST Per Supplier (Ton)',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('StartDate', sql.Date, params.tglAwal)
      .input('EndDate', sql.Date, params.tglAkhir)
      .execute('SP_LapPembelianSTPerSupplier');
    return buildPerSupplierData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Pembelian ST Per Supplier (Ton)',
      subtitle: `Periode ${period}`,
      bodyHtml: renderPivot(data),
      style: 'pembelian_st',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
