import sql from 'mssql'
import { z } from 'zod'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, renderWpsReportPage } from './template'

/**
 * SP_LapKDUpahPerCutomer — "Laporan KD Upah Per-Customer". Ported from
 * open-api-report's KdUpahPerCustomerReportService and
 * reports/sawn-timber/kd-upah-per-customer-pdf.blade.php.
 *
 * The procedure takes no parameters: it lists every drying job ever recorded,
 * grouped here by customer, one table per customer with that customer's m3 in
 * the tfoot. It is the widest of the no-parameter reports here - 62 rows when
 * checked - so a period filter would be a lie about what the SP does.
 *
 * Columns verified against the live database: NamaCustomer, NoProcKD,
 * NoRuangKD, TglMasuk, TglKeluar, Jenis, m3.
 *
 * Group order is first appearance in the procedure's own output, which the
 * reference preserves rather than sorting. Sorting by customer name instead
 * would be tidier but is not what the legacy view shows, so it is not done
 * here either.
 *
 * An empty NamaCustomer is bucketed as "Tanpa Customer" rather than dropped, so
 * its m3 still reaches the customer's total.
 */

interface CustomerRow extends Record<string, unknown> {
  NamaCustomer?: unknown;
  NoProcKD?: unknown;
  NoRuangKD?: unknown;
  TglMasuk?: unknown;
  TglKeluar?: unknown;
  Jenis?: unknown;
  m3?: unknown;
}

export interface CustomerGroup {
  customer: string;
  rows: CustomerRow[];
  totalM3: number;
}

const COLUMNS = 7;
const NO_CUSTOMER = 'Tanpa Customer';

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const text = (value: unknown): string => String(value ?? '').trim();

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

/** Reference $fmtM3: four decimals, and no blanking at zero. */
const fmtM3 = (value: unknown): string => formatNumber(toFloat(value), 4);

/**
 * Groups in first-appearance order, as the reference does. m3 is rounded to
 * four decimals at the group level so the printed total matches the sum of the
 * printed rows rather than drifting on binary float error.
 */
export function buildCustomerGroups(rows: CustomerRow[]): CustomerGroup[] {
  const groups = new Map<string, CustomerGroup>();
  for (const row of rows) {
    const name = text(row.NamaCustomer);
    const customer = name === '' ? NO_CUSTOMER : name;
    const group = groups.get(customer) ?? { customer, rows: [], totalM3: 0 };
    group.rows.push(row);
    group.totalM3 += toFloat(row.m3);
    groups.set(customer, group);
  }
  for (const group of groups.values()) group.totalM3 = Number(group.totalM3.toFixed(4));
  return [...groups.values()];
}

const buildTable = (group: CustomerGroup): string => {
  const body = group.rows
    .map(
      (row, index) => `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(text(row.NoProcKD))}</td>
        <td class="center">${escapeHtml(text(row.NoRuangKD))}</td>
        <td class="center">${escapeHtml(fmtDate(row.TglMasuk))}</td>
        <td class="center">${escapeHtml(fmtDate(row.TglKeluar))}</td>
        <td class="label">${escapeHtml(text(row.Jenis))}</td>
        <td class="number">${escapeHtml(fmtM3(row.m3))}</td>
      </tr>`,
    )
    .join('\n      ');

  return `<table class="report-table kd-upah-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 5%;">No</th>
        <th style="width: 13%;">No Proc KD</th>
        <th style="width: 9%;">Ruang KD</th>
        <th style="width: 13%;">Tgl Masuk</th>
        <th style="width: 13%;">Tgl Keluar</th>
        <th style="width: 31%;">Jenis Kayu</th>
        <th style="width: 16%;">M3</th>
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(COLUMNS)}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="${COLUMNS - 1}" class="center">Total ${escapeHtml(group.customer)}</td>
        <td class="number">${escapeHtml(formatNumber(group.totalM3, 4))}</td>
      </tr>
    </tfoot>
  </table>`;
};

export const kdUpahPerCustomerReport: ReportDefinition<
  Record<string, never>,
  CustomerGroup[]
> = {
  type: 'kd-upah-per-customer',
  title: 'Laporan KD Upah Per-Customer',
  // The procedure declares no parameters, so neither does the request body.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute('SP_LapKDUpahPerCutomer');
    return buildCustomerGroups((result.recordset ?? []) as CustomerRow[]);
  },

  render(groups, meta) {
    // No subtitle: there is no period to state, and printing today's date here
    // would read as the period the data covers.
    const bodyHtml =
      groups.length > 0
        ? groups.map(buildTable).join('\n  ')
        : `<table class="report-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;

    return renderWpsReportPage({
      title: 'Laporan KD Upah Per-Customer',
      bodyHtml,
      style: 'kd_upah',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
