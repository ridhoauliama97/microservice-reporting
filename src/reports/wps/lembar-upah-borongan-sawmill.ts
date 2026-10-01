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
 * SPWps_LapUpahSawmill — "Lembaran Perhitungan Upah Borongan Sawmill". Ported
 * from open-api-report's LembarTallyHasilSawmillReportService and
 * sawn-timber/lembar-tally-hasil-sawmill-pdf.blade.php.
 *
 * A pay sheet for one sawmill production number: a header block identifying the
 * sheet, the board tally, a per-product-type summary, and a signature strip.
 * Keyed by a single number, so the body is `{ noProduksi: "..." }` and there is
 * no period.
 *
 * Columns verified against the live database (19): NoSTSawmill, TglSawmill,
 * NmSupplier, Status, Condition, NoKayuBulat, Suket, NoMeja, NoPlat, Jenis,
 * Berat, NamaOperator, Tebal, Lebar, Panjang, JmlhBatang, IdUOMTblLebar,
 * IdUOMPanjang, Ket. The service is a pure pass-through; every derivation below
 * happens at render time, as in the reference.
 *
 * The weight is the interesting part. `Berat` from the procedure is NOT always
 * what gets printed. When the row carries all four of thickness, width, length
 * and piece count, the reference recomputes the weight from the board
 * dimensions, because the two UOM id columns say which unit the dimensions are
 * in and the stored Berat was captured under a different assumption:
 *
 *   IdUOMTblLebar=3, IdUOMPanjang=4  ->  T x W x L x pcs / 7200.8
 *   IdUOMTblLebar=1, IdUOMPanjang=4  ->  T x W x L x 304.8 x pcs / 1e9 / 1.416
 *
 * The second divides by 1.416, the m3-to-ton factor used elsewhere in this
 * system, so a row measured in inches still lands in tonnes. Rows missing any of
 * the four fall back to the stored Berat. The result is truncated to four
 * decimals, not rounded, matching the reference's truncate4.
 *
 * Note that those UOM ids drive the arithmetic but are never printed: the "@"
 * columns are hardcoded to "mm" and "feet" in the reference, because the two
 * formulas above are the only two shapes this procedure produces and both are
 * millimetres by feet.
 *
 * The summary groups by Ket, folded onto six keys (STD, MC 1, MC 2, MC, LOKAL
 * STD, LOKAL MC) so "MC1" and "MC 1" land in one bucket, and shows only the
 * keys that actually occurred. A row whose Ket matches nothing keeps its own
 * normalised text as a key, so an unexpected product type still gets counted
 * rather than vanishing from the summary while remaining in the tally.
 */

const MAX_NO_PRODUKSI = 26; // nvarchar(26) on the procedure's own parameter.

/** IdUOMTblLebar / IdUOMPanjang pairs the reference has formulas for. */
const UOM_SIZE_CM = 3;
const UOM_SIZE_INCH = 1;
const UOM_LENGTH_FEET = 4;

/** m3 to ton, the same factor the other reports in this system use. */
const M3_TO_TON = 1.416;
const MM3_PER_FOOT_LENGTH = 304.8;

const SUMMARY_KEYS = ['STD', 'MC 1', 'MC 2', 'MC', 'LOKAL STD', 'LOKAL MC'] as const;
type SummaryKey = (typeof SUMMARY_KEYS)[number];

/** Two blocks per row, three rows - the reference's summary layout. */
const SUMMARY_LAYOUT: SummaryKey[][] = [
  ['STD', 'MC 1', 'MC 2'],
  ['MC', 'LOKAL STD', 'LOKAL MC'],
];

const DETAIL_COLUMNS = 9;

interface SpRow extends Record<string, unknown> {
  NoSTSawmill?: unknown;
  TglSawmill?: unknown;
  NmSupplier?: unknown;
  Status?: unknown;
  NoKayuBulat?: unknown;
  Suket?: unknown;
  NoMeja?: unknown;
  NoPlat?: unknown;
  Jenis?: unknown;
  Berat?: unknown;
  NamaOperator?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  IdUOMTblLebar?: unknown;
  IdUOMPanjang?: unknown;
  Ket?: unknown;
}

export interface TallyRow {
  no: string;
  tebal: string;
  lebar: string;
  uomSize: string;
  panjang: string;
  uomLength: string;
  pcs: number;
  berat: number;
  ket: string;
}

export interface SummaryEntry {
  key: string;
  pcs: number;
  ton: number;
}

export interface SawmillSheet {
  head: SpRow;
  rows: TallyRow[];
  /** Where the split falls, so the right table's numbering continues the left. */
  leftCount: number;
  summary: SummaryEntry[];
  totalPcs: number;
  totalTon: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** null for a missing or unparseable value, so "was it there?" is answerable. */
const toFloatOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const text = (value: unknown): string => String(value ?? '').trim();

/** Four decimals, truncated rather than rounded, as the reference's truncate4. */
const truncate4 = (value: number): number => {
  const scaled = value * 10_000;
  return (scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled)) / 10_000;
};

/**
 * The board weight. Recomputed from the dimensions when the UOM ids match a
 * formula the reference knows, and otherwise the stored Berat.
 */
export function computeBerat(row: SpRow): number {
  const tebal = toFloatOrNull(row.Tebal);
  const lebar = toFloatOrNull(row.Lebar);
  const panjang = toFloatOrNull(row.Panjang);
  const pcs = toFloatOrNull(row.JmlhBatang);

  if (tebal !== null && lebar !== null && panjang !== null && pcs !== null) {
    const sizeUom = Math.trunc(toFloat(row.IdUOMTblLebar));
    const lengthUom = Math.trunc(toFloat(row.IdUOMPanjang));
    if (lengthUom === UOM_LENGTH_FEET) {
      if (sizeUom === UOM_SIZE_CM) {
        return truncate4((tebal * lebar * panjang * pcs) / 7200.8);
      }
      if (sizeUom === UOM_SIZE_INCH) {
        return truncate4(
          (tebal * lebar * panjang * MM3_PER_FOOT_LENGTH * pcs) / 1_000_000_000 / M3_TO_TON,
        );
      }
    }
  }

  return truncate4(toFloat(row.Berat));
}

/** Folds the procedure's Ket values onto the six summary keys. */
export function normalizeKet(value: unknown): string {
  const normalized = text(value)
    .toUpperCase()
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  switch (normalized) {
    case 'STD':
      return 'STD';
    case 'MC 1':
    case 'MC1':
      return 'MC 1';
    case 'MC 2':
    case 'MC2':
      return 'MC 2';
    case 'MC':
      return 'MC';
    case 'LOKAL STD':
    case 'L STD':
    case 'LSTD':
      return 'LOKAL STD';
    case 'LOKAL MC':
    case 'L MC':
    case 'LMC':
      return 'LOKAL MC';
    default:
      return normalized === '' ? '-' : normalized;
  }
}

/** d-M-y, the two-digit year the reference blade prints; "-" when absent. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '-';
    return formatTanggalId(value.toISOString().slice(0, 10)).replace(
      /\d{4}$/,
      (year) => year.slice(-2),
    );
  }
  const raw = text(value);
  if (raw === '') return '-';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!iso) return raw;
  return formatTanggalId(`${iso[1]}-${iso[2]}-${iso[3]}`).replace(
    /\d{4}$/,
    (year) => year.slice(-2),
  );
};

/** Reference $formatOperatorText: tidy the "(" spacing, "-" when empty. */
const fmtOperator = (value: unknown): string => {
  const raw = text(value);
  if (raw === '') return '-';
  return raw.replace(/\s*\(\s*/g, ' (');
};

/** Trailing zeros trimmed, the reference's summary number format. */
const fmtSummary = (value: number): string => {
  if (Math.abs(value) < 0.0000001) return '';
  const text4 = value.toFixed(4);
  return text4.includes('.') ? text4.replace(/0+$/, '').replace(/\.$/, '') : text4;
};

const fmtIntPlain = (value: number): string => String(Math.round(value));

export function buildSawmillSheet(rows: SpRow[]): SawmillSheet {
  const head = rows[0] ?? {};

  const byKet = new Map<string, { pcs: number; ton: number }>();
  let totalPcs = 0;
  let totalTon = 0;

  const tally: TallyRow[] = rows.map((row, index) => {
    const pcs = toFloat(row.JmlhBatang);
    const ton = computeBerat(row);
    const ket = normalizeKet(row.Ket);

    const bucket = byKet.get(ket) ?? { pcs: 0, ton: 0 };
    bucket.pcs += pcs;
    bucket.ton += ton;
    byKet.set(ket, bucket);
    totalPcs += pcs;
    totalTon += ton;

    return {
      no: String(index + 1),
      tebal: fmtIntPlain(toFloat(row.Tebal)),
      lebar: fmtIntPlain(toFloat(row.Lebar)),
      uomSize: 'mm',
      panjang: (toFloatOrNull(row.Panjang) ?? 0).toFixed(1),
      uomLength: 'feet',
      pcs,
      berat: ton,
      ket,
    };
  });

  // The six known keys in their fixed order, then anything unexpected.
  const summary: SummaryEntry[] = [];
  const used = new Set<string>();
  for (const key of SUMMARY_KEYS) {
    used.add(key);
    const entry = byKet.get(key);
    if (entry) summary.push({ key, pcs: entry.pcs, ton: entry.ton });
  }
  for (const [key, entry] of [...byKet.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!used.has(key)) summary.push({ key, pcs: entry.pcs, ton: entry.ton });
  }

  return {
    head,
    rows: tally,
    leftCount: Math.ceil(tally.length / 2),
    summary,
    totalPcs,
    totalTon,
  };
}

const metaRow = (label: string, value: string, extra = false): string =>
  `<tr>
                  <td class="meta-label">${escapeHtml(label)}</td>
                  <td class="meta-separator">:</td>
                  <td class="meta-value"${extra ? ' colspan="4"' : ''}>${escapeHtml(value)}</td>
                </tr>`;

const metaPairRow = (
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
): string =>
  `<tr>
                  <td class="meta-label">${escapeHtml(leftLabel)}</td>
                  <td class="meta-separator">:</td>
                  <td class="meta-value">${escapeHtml(leftValue)}</td>
                  <td class="meta-label" style="padding-left: 18px;">${escapeHtml(rightLabel)}</td>
                  <td class="meta-separator">:</td>
                  <td class="meta-value">${escapeHtml(rightValue)}</td>
                </tr>`;

const metaOrDash = (value: unknown): string => text(value) || '-';

function renderMeta(sheet: SawmillSheet, noProduksi: string): string {
  const head = sheet.head;
  return `<table class="meta-layout">
        <tbody>
          <tr>
            <td style="width: 50%; padding-right: 16px;">
              <table class="meta-block">
                <tbody>
                  ${metaRow('Nomor Lembaran', metaOrDash(head.NoSTSawmill) === '-' ? noProduksi : metaOrDash(head.NoSTSawmill))}
                  ${metaRow('Tanggal', fmtDate(head.TglSawmill))}
                  ${metaRow('Supplier', metaOrDash(head.NmSupplier))}
                  ${metaRow('No.Kayu Bulat', metaOrDash(head.NoKayuBulat))}
                  ${metaRow('No. Suket', metaOrDash(head.Suket))}
                </tbody>
              </table>
            </td>
            <td style="width: 50%; padding-left: 12px;">
              <table class="meta-block">
                <tbody>
                  ${metaPairRow('No. Meja', metaOrDash(head.NoMeja), 'Status', metaOrDash(head.Status))}
                  ${metaPairRow('No.Plat', metaOrDash(head.NoPlat), 'Berat (Tim)', formatNumber(toFloat(head.Berat), 2))}
                  ${metaRow('Jenis Kayu', metaOrDash(head.Jenis))}
                  ${metaRow('Operator', fmtOperator(head.NamaOperator), true)}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>`;
}

const renderTallyTable = (rows: TallyRow[], startNo: number): string => {
  const body = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
                      <td class="center">${startNo + index}</td>
                      <td class="number">${escapeHtml(row.tebal)}</td>
                      <td class="number">${escapeHtml(row.lebar)}</td>
                      <td class="center">${escapeHtml(row.uomSize)}</td>
                      <td class="number">${escapeHtml(row.panjang)}</td>
                      <td class="center">${escapeHtml(row.uomLength)}</td>
                      <td class="number">${escapeHtml(fmtIntPlain(row.pcs))}</td>
                      <td class="number emphasis">${escapeHtml(formatNumber(row.berat, 4, { noSeparator: true }))}</td>
                      <td class="label">${escapeHtml(row.ket)}</td>
                    </tr>`,
    )
    .join('\n                    ');

  return `<table class="report-table tally-table">
                    <thead>
                      <tr class="headers-row">
                        <th style="width: 7%;">No</th>
                        <th style="width: 10%;">Tebal</th>
                        <th style="width: 10%;">Lebar</th>
                        <th style="width: 8%;">@</th>
                        <th style="width: 10%;">Pjg</th>
                        <th style="width: 10%;">@</th>
                        <th style="width: 11%;">Pcs</th>
                        <th style="width: 16%;">Berat</th>
                        <th style="width: 18%;">Ket</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${body || buildEmptyTableRow(DETAIL_COLUMNS)}
                    </tbody>
                  </table>`;
};

const renderSummaryBlock = (entry: SummaryEntry): string =>
  `<table class="summary-block">
                    <tbody>
                      <tr>
                        <td class="summary-title" colspan="3">//${escapeHtml(entry.key)}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">JmlhPcs</td>
                        <td class="summary-separator">:</td>
                        <td class="summary-value">${entry.pcs > 0 ? escapeHtml(fmtIntPlain(entry.pcs)) : ''}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">Jmlh Ton</td>
                        <td class="summary-separator">:</td>
                        <td class="summary-value">${escapeHtml(fmtSummary(entry.ton))}</td>
                      </tr>
                    </tbody>
                  </table>`;

function renderSummary(sheet: SawmillSheet): string {
  const lookup = new Map(sheet.summary.map((entry) => [entry.key, entry]));
  // Only types that actually occurred, in the reference's fixed order.
  const present = SUMMARY_LAYOUT.map((row) =>
    row.map((key) => lookup.get(key)).filter((entry): entry is SummaryEntry => entry !== undefined),
  ).filter((row) => row.length > 0);

  const unexpected = sheet.summary.filter(
    (entry) => !(SUMMARY_KEYS as readonly string[]).includes(entry.key),
  );
  if (unexpected.length > 0) present.push(unexpected);

  if (present.length === 0) return '';

  return `<table class="summary-layout">
        <tbody>
          ${present
            .map(
              (row) => `<tr>
            ${row.map((entry) => `<td>${renderSummaryBlock(entry)}</td>`).join('\n            ')}
          </tr>`,
            )
            .join('\n          ')}
        </tbody>
      </table>`;
}

function renderSignatures(sheet: SawmillSheet): string {
  return `<table class="signatures">
        <tbody>
          <tr>
            <td>Dibuat Oleh :</td>
            <td>Diperiksa Oleh :</td>
            <td>Operator :</td>
            <td class="signature-total-cell">
              <table class="signature-total-block">
                <tbody>
                  <tr>
                    <td class="summary-label">Jmlh Pcs</td>
                    <td class="summary-separator">:</td>
                    <td class="summary-value">${escapeHtml(fmtIntPlain(sheet.totalPcs))}</td>
                  </tr>
                  <tr>
                    <td class="summary-label">Jmlh Ton</td>
                    <td class="summary-separator">:</td>
                    <td class="summary-value">${escapeHtml(fmtSummary(sheet.totalTon))}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>`;
}

export const lembarPerhitunganUpahBoronganSawmillReport: ReportDefinition<
  { noProduksi: string },
  SawmillSheet
> = {
  type: 'lembar-perhitungan-upah-borongan-sawmill',
  title: 'Lembaran Perhitungan Upah Borongan Sawmill',
  paramsSchema: z.object({
    noProduksi: z.string().trim().min(1).max(MAX_NO_PRODUKSI),
  }),

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('NoProduksi', sql.VarChar(MAX_NO_PRODUKSI), params.noProduksi)
      .execute('SPWps_LapUpahSawmill');
    return buildSawmillSheet((result.recordset ?? []) as SpRow[]);
  },

  render(sheet, meta) {
    // The two tally halves sit in flex boxes, not table cells. Wrapping them in
    // a table row makes the pair atomic - a table row cannot break across a
    // page - so a long sheet pushed the whole thing to the next page and threw
    // away the space under the header. Flex boxes let each half paginate on its
    // own, which is what a 40-row half needs.
    const bodyHtml = `${renderMeta(sheet, meta.params.noProduksi)}
  <div class="split-tally">
    <div class="split-half">${renderTallyTable(sheet.rows.slice(0, sheet.leftCount), 1)}</div>
    <div class="split-half">${renderTallyTable(sheet.rows.slice(sheet.leftCount), sheet.leftCount + 1)}</div>
  </div>
  ${renderSummary(sheet)}
  ${renderSignatures(sheet)}`;

    return renderWpsReportPage({
      title: 'Lembaran Perhitungan Upah Borongan Sawmill',
      subtitle: `No. Produksi : ${meta.params.noProduksi}`,
      bodyHtml,
      style: 'upah_sawmill',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
