import sql from 'mssql'
import { z } from 'zod'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, formatInt, renderWpsReportPage } from './template'

/**
 * SP_LapKDUpahPerNoProcKDPerCustomerDetail — "Laporan KD Upah Per-No.Proses KD
 * Per-Cutomer Detail". Ported from open-api-report's
 * KdUpahPerNoProcKdPerCustomerDetailReportService and
 * reports/sawn-timber/kd-upah-per-no-proc-kd-per-customer-detail-pdf.blade.php.
 *
 * Keyed by a single drying-process number, so the request body is
 * `{ noProcKd: "H.000771" }` and there is no period. The report is one batch:
 * a meta table repeating what the number belongs to, then the label breakdown
 * grouped by No ST, each group closing with its piece count and its m3.
 *
 * Columns verified against the live database: NamaCustomer, NoProcKD,
 * NoRuangKD, TglMasuk, TglKeluar, NoST, Jenis, Tebal, Lebar, Panjang,
 * JmlhBatang, M3.
 *
 * The meta table is built from the FIRST row, as the reference does. The
 * procedure is filtered to one process number, so every row carries the same
 * customer, chamber and dates; taking the first is a presentation choice, not
 * an assumption that the SP agrees with itself.
 *
 * A blank No ST is bucketed as "Tanpa No ST" rather than dropped, so its pieces
 * and volume still reach a group total.
 *
 * Tebal / Lebar / Panjang are rounded to two decimals and JmlhBatang to a whole
 * number at read time, matching the reference; M3 is rounded to four.
 */

const COLUMNS = 7;
const NO_ST_FALLBACK = 'Tanpa No ST';
const MAX_NO_PROC_KD = 26; // nvarchar(26) on the procedure's own parameter.

interface DetailRow extends Record<string, unknown> {
  NamaCustomer?: unknown;
  NoProcKD?: unknown;
  NoRuangKD?: unknown;
  TglMasuk?: unknown;
  TglKeluar?: unknown;
  NoST?: unknown;
  Jenis?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
}

export interface DetailHeader {
  namaCustomer: string;
  noProcKd: string;
  noRuangKd: string;
  tglMasuk: string;
  tglKeluar: string;
  jenis: string;
}

export interface NoStGroup {
  noSt: string;
  rows: Array<Record<string, unknown>>;
  totalPcs: number;
  totalM3: number;
}

export interface DetailData {
  header: DetailHeader;
  groups: NoStGroup[];
  totalPcs: number;
  totalM3: number;
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

const fmtM3 = (value: number): string => formatNumber(value, 4);
const fmt2 = (value: number): string => formatNumber(value, 2);

/** Builds the header, the per-NoST groups and the batch totals. */
export function buildDetailData(rows: DetailRow[], requestedNoProcKd: string): DetailData {
  const first = rows[0] ?? {};
  const header: DetailHeader = {
    namaCustomer: text(first.NamaCustomer),
    noProcKd: text(first.NoProcKD) || requestedNoProcKd,
    noRuangKd: text(first.NoRuangKD),
    tglMasuk: fmtDate(first.TglMasuk),
    tglKeluar: fmtDate(first.TglKeluar),
    jenis: text(first.Jenis),
  };

  const groups = new Map<string, NoStGroup>();
  for (const row of rows) {
    const raw = text(row.NoST);
    const noSt = raw === '' ? NO_ST_FALLBACK : raw;
    const group = groups.get(noSt) ?? { noSt, rows: [], totalPcs: 0, totalM3: 0 };
    group.rows.push({
      NoST: raw,
      Jenis: text(row.Jenis),
      Tebal: Number(toFloat(row.Tebal).toFixed(2)),
      Lebar: Number(toFloat(row.Lebar).toFixed(2)),
      Panjang: Number(toFloat(row.Panjang).toFixed(2)),
      JmlhBatang: Math.round(toFloat(row.JmlhBatang)),
      M3: Number(toFloat(row.M3).toFixed(4)),
    });
    group.totalPcs += Math.round(toFloat(row.JmlhBatang));
    group.totalM3 += toFloat(row.M3);
    groups.set(noSt, group);
  }

  const list = [...groups.values()];
  for (const group of list) group.totalM3 = Number(group.totalM3.toFixed(4));

  return {
    header,
    groups: list,
    totalPcs: list.reduce((sum, group) => sum + group.totalPcs, 0),
    totalM3: Number(list.reduce((sum, group) => sum + group.totalM3, 0).toFixed(4)),
  };
}

const buildMetaTable = (header: DetailHeader): string => {
  const cell = (label: string, value: string): string =>
    `<td class="meta-label">${escapeHtml(label)}</td>\n        <td class="meta-separator">:</td>\n        <td class="meta-value">${escapeHtml(value)}</td>`;

  return `<table class="meta-table">
      <tbody>
        <tr>
          ${cell('Customer', header.namaCustomer || '-')}
          ${cell('No.Proses KD', header.noProcKd || '-')}
        </tr>
        <tr>
          ${cell('No.Ruang KD', header.noRuangKd || '-')}
          ${cell('Jenis Kayu', header.jenis || '-')}
        </tr>
        <tr>
          ${cell('Tanggal Masuk', header.tglMasuk)}
          ${cell('Tanggal Keluar', header.tglKeluar)}
        </tr>
      </tbody>
    </table>`;
};

const buildGroupTable = (group: NoStGroup): string => {
  const body = group.rows
    .map(
      (row, index) => `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(text(row.NoST))}</td>
        <td class="label">${escapeHtml(text(row.Jenis))}</td>
        <td class="number">${escapeHtml(fmt2(Number(row.Tebal)))}</td>
        <td class="number">${escapeHtml(fmt2(Number(row.Lebar)))}</td>
        <td class="number">${escapeHtml(fmt2(Number(row.Panjang)))}</td>
        <td class="number">${escapeHtml(formatInt(Number(row.JmlhBatang)))}</td>
      </tr>`,
    )
    .join('\n        ');

  return `<div class="section-title">No ST : ${escapeHtml(group.noSt)}</div>
    <table class="report-table kd-detail-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 5%;">No</th>
          <th style="width: 14%;">No ST</th>
          <th style="width: 26%;">Jenis</th>
          <th style="width: 12%;">Tebal (mm)</th>
          <th style="width: 12%;">Lebar (mm)</th>
          <th style="width: 12%;">Panjang (ft)</th>
          <th style="width: 19%;">Jmlh Batang (pcs)</th>
        </tr>
      </thead>
      <tbody>
        ${body || buildEmptyTableRow(COLUMNS)}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="${COLUMNS - 1}" class="center">Total ${escapeHtml(group.noSt)}</td>
          <td class="number">${escapeHtml(formatInt(group.totalPcs))}</td>
        </tr>
      </tfoot>
    </table>
    <div class="group-volume">Total m3 ${escapeHtml(group.noSt)}: ${escapeHtml(fmtM3(group.totalM3))}</div>`;
};

export const kdUpahPerNoProcKdDetailReport: ReportDefinition<
  { noProcKd: string },
  DetailData
> = {
  type: 'kd-upah-per-no-proc-kd-detail',
  title: 'Laporan KD Upah Per-No.Proses KD Per-Cutomer Detail',
  paramsSchema: z.object({
    noProcKd: z.string().trim().min(1).max(MAX_NO_PROC_KD),
  }),

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('NoProcKD', sql.VarChar(MAX_NO_PROC_KD), params.noProcKd)
      .execute('SP_LapKDUpahPerNoProcKDPerCustomerDetail');
    return buildDetailData((result.recordset ?? []) as DetailRow[], params.noProcKd);
  },

  render(data, meta) {
    const bodyHtml =
      data.groups.length > 0
        ? `${buildMetaTable(data.header)}
  ${data.groups.map(buildGroupTable).join('\n  ')}
  <table class="report-table summary-table">
      <tbody>
        <tr class="totals-row">
          <td class="label">Total Keseluruhan</td>
          <td class="number">${escapeHtml(formatInt(data.totalPcs))} pcs</td>
          <td class="number">${escapeHtml(fmtM3(data.totalM3))} m3</td>
        </tr>
      </tbody>
    </table>`
        : `${buildMetaTable(data.header)}
  <table class="report-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;

    return renderWpsReportPage({
      title: 'Laporan KD Upah Per-No.Proses KD Per-Cutomer Detail',
      subtitle: `No.Proses KD : ${meta.params.noProcKd}`,
      bodyHtml,
      style: 'kd_upah',
      // Portrait. Seven columns, and the batch header is two label/value pairs
      // wide - it reads better stacked over a portrait page than spread across
      // a landscape one.
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
