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
 * SPWps_LapRekapPenSTDariSawmill — "Laporan Rekap Penerimaan ST Dari Sawmill
 * (Non Rambung)". Ported from open-api-report's
 * RekapPenerimaanSTDariSawmillNonRambungReportService and
 * reports/sawn-timber/rekap-penerimaan-st-dari-sawmill-non-rambung-pdf.blade.php.
 *
 * One row per sawmill receipt, grouped by supplier and ordered by date inside
 * each supplier, closing with a supplier total and a grand total.
 *
 * Columns verified against the live database: NoPenerimaanST, NmSupplier,
 * NoTruk, TglLaporan, NoKayuBulat, Jenis, NoMeja, KBTon, STTon, Area, Potong,
 * PcsKB, PcsST, TotalTblST.
 *
 * The reference resolves every one of its twelve output columns by candidate
 * match against whatever the procedure returned, and three of the twelve are
 * NOT in that procedure. They are derived here instead, the same way the
 * reference does when the column is missing:
 *
 *   Rend ST-KB  =  STTon / KBTon          a ratio, printed as a percentage
 *   Ave Dia     =  sqrt(Area / PcsKB)     average diameter of the round log
 *   Ave Tbl     =  TotalTblST / PcsST     average sawn table width
 *
 * Each falls back to 0 when its denominator is missing rather than dividing,
 * and the ratio is left as a ratio (0.xx) so the formatter can present it as a
 * percentage. A receipt with no KBTon shows no rendemen rather than a
 * misleading 0%.
 *
 * A blank supplier is bucketed as "Tanpa Supplier" so its tonnage still reaches
 * the grand total.
 *
 * Binds @TglAwal / @TglAkhir.
 */

const EPS = 0.0000001;

interface SpRow extends Record<string, unknown> {
  NoPenerimaanST?: unknown;
  NmSupplier?: unknown;
  NoTruk?: unknown;
  TglLaporan?: unknown;
  NoKayuBulat?: unknown;
  Jenis?: unknown;
  NoMeja?: unknown;
  KBTon?: unknown;
  STTon?: unknown;
  Area?: unknown;
  Potong?: unknown;
  PcsKB?: unknown;
  PcsST?: unknown;
  TotalTblST?: unknown;
}

export interface ReceiptLine {
  noSt: string;
  noTruk: string;
  meja: string;
  tanggal: string;
  /** ISO, for ordering; the display string is what gets printed. */
  sortDate: string;
  noKb: string;
  jenisKayuBulat: string;
  tonKb: number;
  tonSt: number;
  aveDia: number;
  aveTbl: number;
  potong: string;
  rendStKb: number;
}

export interface SupplierBlock {
  supplier: string;
  rows: ReceiptLine[];
  tonKb: number;
  tonSt: number;
}

export interface NonRambungData {
  suppliers: SupplierBlock[];
  grandKb: number;
  grandSt: number;
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

const fmtTon = (value: number): string => formatNumber(value, 4);
const fmt1 = (value: number): string => formatNumber(value, 1);

/** The ratio is stored 0.xx and shown as a percentage. */
const fmtRend = (ratio: number): string =>
  ratio > EPS ? formatNumber(ratio * 100, 2) : '';

export function buildNonRambungData(rows: SpRow[]): NonRambungData {
  const bySupplier = new Map<string, ReceiptLine[]>();

  for (const row of rows) {
    const supplier = text(row.NmSupplier) || 'Tanpa Supplier';
    const tonKb = toFloat(row.KBTon);
    const tonSt = toFloat(row.STTon);
    const area = toFloat(row.Area);
    const pcsKb = toFloat(row.PcsKB);
    const pcsSt = toFloat(row.PcsST);
    const totalTblSt = toFloat(row.TotalTblST);

    const list = bySupplier.get(supplier) ?? [];
    list.push({
      noSt: text(row.NoPenerimaanST),
      noTruk: text(row.NoTruk),
      meja: text(row.NoMeja),
      tanggal: fmtDate(toDateKey(row.TglLaporan)),
      sortDate: toDateKey(row.TglLaporan),
      noKb: text(row.NoKayuBulat),
      jenisKayuBulat: text(row.Jenis),
      tonKb,
      tonSt,
      // Average diameter of the round log: a disc of that area holds that
      // many pieces, so its diameter is the square root.
      aveDia: area > EPS && pcsKb > EPS ? Math.sqrt(area / pcsKb) : 0,
      aveTbl: totalTblSt > EPS && pcsSt > EPS ? totalTblSt / pcsSt : 0,
      potong: text(row.Potong),
      rendStKb: tonKb > EPS ? tonSt / tonKb : 0,
    });
    bySupplier.set(supplier, list);
  }

  // Suppliers alphabetical, receipts by date inside each.
  const suppliers: SupplierBlock[] = [...bySupplier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([supplier, list]) => {
      const rows = [...list].sort((a, b) => (a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : 0));
      return {
        supplier,
        rows,
        tonKb: rows.reduce((sum, row) => sum + row.tonKb, 0),
        tonSt: rows.reduce((sum, row) => sum + row.tonSt, 0),
      };
    });

  return {
    suppliers,
    grandKb: suppliers.reduce((sum, block) => sum + block.tonKb, 0),
    grandSt: suppliers.reduce((sum, block) => sum + block.tonSt, 0),
  };
}

const COLUMNS = 12;

const renderRow = (row: ReceiptLine, className: string): string =>
  `<tr class="${className}">
        <td class="label">${escapeHtml(row.noSt)}</td>
        <td class="center">${escapeHtml(row.noTruk)}</td>
        <td class="center">${escapeHtml(row.meja)}</td>
        <td class="center">${escapeHtml(row.tanggal)}</td>
        <td class="label">${escapeHtml(row.noKb)}</td>
        <td class="label">${escapeHtml(row.jenisKayuBulat)}</td>
        <td class="number">${escapeHtml(fmtTon(row.tonKb))}</td>
        <td class="number">${escapeHtml(fmtTon(row.tonSt))}</td>
        <td class="number">${escapeHtml(fmt1(row.aveDia))}</td>
        <td class="number">${escapeHtml(fmt1(row.aveTbl))}</td>
        <td class="center">${escapeHtml(row.potong)}</td>
        <td class="number">${escapeHtml(fmtRend(row.rendStKb))}</td>
      </tr>`;

function renderTable(data: NonRambungData): string {
  if (data.suppliers.length === 0) {
    return `<table class="report-table non-rambung-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;
  }

  const blocks = data.suppliers
    .map((block) => {
      const body = block.rows
        .map((row, index) => renderRow(row, index % 2 === 0 ? 'row-odd' : 'row-even'))
        .join('\n        ');
      // The supplier heading and its total are rows in the same tbody. A
      // wrapping <div> would make the <tr> invalid HTML and the total row would
      // not render at all.
      return `<tr class="supplier-heading-row">
        <td colspan="${COLUMNS}" class="label">${escapeHtml(block.supplier)}</td>
      </tr>
      ${body}
      <tr class="supplier-total-row">
        <td colspan="6" class="center">Total ${escapeHtml(block.supplier)}</td>
        <td class="number">${escapeHtml(fmtTon(block.tonKb))}</td>
        <td class="number">${escapeHtml(fmtTon(block.tonSt))}</td>
        <td colspan="4"></td>
      </tr>`;
    })
    .join('\n      ');

  return `<table class="report-table non-rambang-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 11%;">No ST</th>
        <th style="width: 7%;">NoTruk</th>
        <th style="width: 6%;">Meja</th>
        <th style="width: 8%;">Tanggal</th>
        <th style="width: 11%;">No.KB</th>
        <th style="width: 12%;">Jenis Kayu Bulat</th>
        <th style="width: 9%;">Ton (KB)</th>
        <th style="width: 9%;">Ton (ST)</th>
        <th style="width: 7%;">Ave Dia</th>
        <th style="width: 7%;">Ave Tbl</th>
        <th style="width: 5%;">Potong</th>
        <th style="width: 8%;">Rend ST-KB</th>
      </tr>
    </thead>
    <tbody>
      ${blocks}
      <tr class="totals-row">
        <td colspan="6" class="center">Total</td>
        <td class="number">${escapeHtml(fmtTon(data.grandKb))}</td>
        <td class="number">${escapeHtml(fmtTon(data.grandSt))}</td>
        <td colspan="4"></td>
      </tr>
    </tbody>
  </table>`;
}

export const rekapPenerimaanStNonRambungReport: ReportDefinition<
  PeriodParams,
  NonRambungData
> = {
  type: 'rekap-penerimaan-st-non-rambung',
  title: 'Laporan Rekap Penerimaan ST Dari Sawmill (Non Rambung)',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapRekapPenSTDariSawmill');
    return buildNonRambungData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    // The reference prints the title and no subtitle for this report.
    return renderWpsReportPage({
      title: 'Laporan Rekap Penerimaan ST Dari Sawmill (Non Rambung)',
      bodyHtml: renderTable(data),
      style: 'non_rambung',
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
