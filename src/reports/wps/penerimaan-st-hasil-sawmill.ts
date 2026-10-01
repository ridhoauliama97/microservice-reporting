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
 * SP_LapPenerimaanSTSawmill + SP_LapPenerimaanSTSawmill_Sub — "Laporan
 * Penerimaan ST Hasil Sawmill". Ported from open-api-report's
 * PenerimaanStHasilSawmillReportService and
 * reports/sawn-timber/penerimaan-st-hasil-sawmill-pdf.blade.php.
 *
 * One receipt of sawn output: a header naming the round log it came from, then
 * the tally - thickness, width, then one column per length, holding piece
 * counts, with a tonnage column. The body is grouped by grade and then by
 * thickness, and the tonnage is that group's own sum.
 *
 * Columns verified against the live database.
 *   main  NamaGrade, Tebal, Lebar, IdTblLebar, Panjang, IdPanjang, JmlhBatang,
 *         IsLocal, Hasil, NoKayuBulat, NoPenerimaanST, TglLaporan, NmSupplier,
 *         NoTruk, Jenis, Suket, TglMasuk
 *   _Sub  IdGradeKB, NamaGrade, Berat
 *
 * THE NUMBER THAT MATTERS MOST IN THIS REPORT:
 *
 *   QUANTITY_DIVISOR = 3
 *
 * The procedure's JmlhBatang and Hasil are counted in a unit three times the one
 * the report prints, so both are divided by three: pieces are round(JmlhBatang
 * / 3) and tonnage is Hasil / 3. Missing that divisor prints three times the
 * pieces and three times the tonnage, and every figure on the sheet is still
 * plausible - it is exactly the kind of error that survives a visual check.
 *
 * The lengths across the top are the distinct Panjang values, sorted
 * numerically, keyed to 4 decimals with trailing zeros trimmed so 1 and 1.0 are
 * the same column. Pieces accumulate into the cell for their length, so a
 * grade-thickness-width reported at several lengths becomes one row with a
 * figure in each length column.
 *
 * Grades sort by the reference's fixed order - STD, MC 2, MC 1, KAYU LAT, then
 * everything else - rather than alphabetically, which would put KAYU LAT between
 * the MC grades and STD last.
 *
 * The _Sub procedure supplies the round-log weight per input grade, shown under
 * the tally as a receipt cross-check.
 *
 * The reference has a second, "flat" layout that it uses only when the main
 * procedure returns nothing and it falls back to a hand-written query. That
 * path is not reproduced: it is not reachable when the procedure answers, and
 * its query is a PHP-configured fallback rather than part of this procedure
 * pair. The grade layout below is the one the procedure produces.
 *
 * Binds @NoPenST on both, so the body is `{ noPenST: "B.001516" }`.
 */

const QUANTITY_DIVISOR = 3;
const MAX_NO_PEN_ST = 13; // varchar(13) on the procedure's own parameter.

interface MainRow extends Record<string, unknown> {
  NamaGrade?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  IdTblLebar?: unknown;
  Panjang?: unknown;
  IdPanjang?: unknown;
  JmlhBatang?: unknown;
  IsLocal?: unknown;
  Hasil?: unknown;
  NoKayuBulat?: unknown;
  NoPenerimaanST?: unknown;
  TglLaporan?: unknown;
  NmSupplier?: unknown;
  NoTruk?: unknown;
  Jenis?: unknown;
  Suket?: unknown;
  TglMasuk?: unknown;
}

interface SubRow extends Record<string, unknown> {
  IdGradeKB?: unknown;
  NamaGrade?: unknown;
  Berat?: unknown;
}

export interface LengthColumn {
  key: string;
  label: string;
  raw: number;
}

export interface DetailRow {
  grade: string;
  tebal: number;
  lebar: number;
  uom: string;
  /** Piece count keyed by length column key. */
  cells: Map<string, number>;
  totalPcs: number;
  totalTon: number;
}

export interface TebalGroup {
  tebal: number;
  rows: DetailRow[];
}

export interface GradeGroup {
  grade: string;
  tebalGroups: TebalGroup[];
  totals: Map<string, number>;
  totalPcs: number;
  totalTon: number;
}

export interface SheetHeader {
  noPenerimaanSt: string;
  supplier: string;
  jenisKayu: string;
  noKayuBulat: string;
  noTruk: string;
  noSuket: string;
  /**
   * Kept raw, not stringified: the driver hands SQL date columns back as Date,
   * and String() on one produces the whole "07/00:00 GMT+0700 (Western
   * Indonesia Time)" toString. Formatting happens at render time.
   */
  tglLaporan: unknown;
  tglMasuk: unknown;
}

export interface SubLine {
  idGradeKb: number;
  namaGrade: string;
  berat: number;
}

export interface PenerimaanHasilSawmillData {
  header: SheetHeader;
  lengthColumns: LengthColumn[];
  gradeGroups: GradeGroup[];
  totalsByLength: Map<string, number>;
  totalPcs: number;
  totalTon: number;
  subRows: SubLine[];
  subTotalBerat: number;
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

/** Trailing zeros trimmed, so 1 and 1.0 collapse to one column. */
const lengthKey = (value: number): string => {
  const fixed = value.toFixed(4);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
};

/** Reference $formatLengthLabel: one decimal, trailing zeros stripped. */
const lengthLabel = (value: number): string => {
  const [intPart, decPart] = value.toFixed(1).split('.');
  const trimmed = (decPart ?? '').replace(/0+$/, '');
  return trimmed === '' ? intPart : `${intPart}.${trimmed}`;
};

/** d-M-y, the two-digit year the blade prints. */
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

const fmtInt = (value: number): string => String(Math.round(value));
const fmtDim = (value: number): string => formatNumber(value, 2);
const fmtTon = (value: number): string => formatNumber(value, 4);

/** The reference's fixed grade order, not alphabetical. */
function gradeSortWeight(grade: string): number {
  switch (grade.trim().toUpperCase()) {
    case 'STD':
      return 10;
    case 'MC 2':
    case 'MC2':
      return 20;
    case 'MC 1':
    case 'MC1':
      return 30;
    case 'KAYU LAT':
      return 40;
    default:
      return 90;
  }
}

export function buildPenerimaanHasilSawmillData(
  main: MainRow[],
  sub: SubRow[],
): PenerimaanHasilSawmillData {
  const first = main[0] ?? {};
  const header: SheetHeader = {
    noPenerimaanSt: text(first.NoPenerimaanST) || '-',
    supplier: text(first.NmSupplier) || '-',
    jenisKayu: text(first.Jenis) || '-',
    noKayuBulat: text(first.NoKayuBulat) || '-',
    noTruk: text(first.NoTruk) || '-',
    noSuket: text(first.Suket) || '-',
    tglLaporan: first.TglLaporan,
    tglMasuk: first.TglMasuk,
  };

  // Length columns: distinct lengths, sorted numerically.
  const columnMap = new Map<string, LengthColumn>();
  for (const row of main) {
    const raw = toFloat(row.Panjang);
    const key = lengthKey(raw);
    if (!columnMap.has(key)) {
      columnMap.set(key, { key, label: lengthLabel(raw), raw });
    }
  }
  const lengthColumns = [...columnMap.values()].sort((a, b) => a.raw - b.raw);

  // Detail rows: one per grade, thickness, width and width unit. Pieces land in
  // the cell for their own length.
  const detailMap = new Map<string, DetailRow>();
  for (const row of main) {
    const grade = text(row.NamaGrade) || 'Tanpa Grade';
    const tebal = toFloat(row.Tebal);
    const lebar = toFloat(row.Lebar);
    const uom = text(row.IdTblLebar) || '-';
    const key = `${grade}|${tebal}|${lebar}|${uom}`;

    let detail = detailMap.get(key);
    if (!detail) {
      detail = {
        grade,
        tebal,
        lebar,
        uom,
        cells: new Map<string, number>(),
        totalPcs: 0,
        totalTon: 0,
      };
      detailMap.set(key, detail);
    }

    // The divisor is the whole reason this report is not printable by accident.
    const pieces = Math.round(toFloat(row.JmlhBatang) / QUANTITY_DIVISOR);
    const ton = toFloat(row.Hasil) / QUANTITY_DIVISOR;
    const columnKey = lengthKey(toFloat(row.Panjang));
    detail.cells.set(columnKey, (detail.cells.get(columnKey) ?? 0) + pieces);
    detail.totalPcs += pieces;
    detail.totalTon += ton;
  }

  const details = [...detailMap.values()].sort(
    (a, b) =>
      gradeSortWeight(a.grade) - gradeSortWeight(b.grade) ||
      a.grade.localeCompare(b.grade) ||
      a.tebal - b.tebal ||
      a.lebar - b.lebar ||
      a.uom.localeCompare(b.uom),
  );

  // Grade groups, each with its thickness groups.
  const gradeMap = new Map<string, GradeGroup>();
  for (const detail of details) {
    let group = gradeMap.get(detail.grade);
    if (!group) {
      group = {
        grade: detail.grade,
        tebalGroups: [],
        totals: new Map<string, number>(),
        totalPcs: 0,
        totalTon: 0,
      };
      gradeMap.set(detail.grade, group);
    }
    let tebalGroup = group.tebalGroups.find((g) => g.tebal === detail.tebal);
    if (!tebalGroup) {
      tebalGroup = { tebal: detail.tebal, rows: [] };
      group.tebalGroups.push(tebalGroup);
    }
    tebalGroup.rows.push(detail);
    for (const column of lengthColumns) {
      group.totals.set(
        column.key,
        (group.totals.get(column.key) ?? 0) + (detail.cells.get(column.key) ?? 0),
      );
    }
    group.totalPcs += detail.totalPcs;
    group.totalTon += detail.totalTon;
  }

  const gradeGroups = [...gradeMap.values()].sort(
    (a, b) => gradeSortWeight(a.grade) - gradeSortWeight(b.grade) || a.grade.localeCompare(b.grade),
  );

  const totalsByLength = new Map<string, number>();
  for (const column of lengthColumns) {
    totalsByLength.set(
      column.key,
      details.reduce((sum, detail) => sum + (detail.cells.get(column.key) ?? 0), 0),
    );
  }

  const subRows: SubLine[] = sub.map((row) => ({
    idGradeKb: Math.round(toFloat(row.IdGradeKB)),
    namaGrade: text(row.NamaGrade),
    berat: toFloat(row.Berat),
  }));

  return {
    header,
    lengthColumns,
    gradeGroups,
    totalsByLength,
    totalPcs: details.reduce((sum, detail) => sum + detail.totalPcs, 0),
    totalTon: details.reduce((sum, detail) => sum + detail.totalTon, 0),
    subRows,
    subTotalBerat: subRows.reduce((sum, row) => sum + row.berat, 0),
  };
}

const metaRow = (label: string, value: string): string =>
  `<tr>
            <td class="meta-label">${escapeHtml(label)}</td>
            <td class="meta-separator">:</td>
            <td>${escapeHtml(value)}</td>
          </tr>`;

const renderMeta = (data: PenerimaanHasilSawmillData): string =>
  `<table class="meta-layout">
        <tbody>
          <tr>
            <td style="width: 33%; padding-right: 8px;">
              <table class="meta-block">
                <tbody>
                  ${metaRow('No. Penerimaan ST', data.header.noPenerimaanSt)}
                  ${metaRow('No. Kayu Bulat', data.header.noKayuBulat)}
                  ${metaRow('Tanggal Laporan', fmtDate(data.header.tglLaporan))}
                </tbody>
              </table>
            </td>
            <td style="width: 34%; padding: 0 8px;">
              <table class="meta-block">
                <tbody>
                  ${metaRow('Supplier', data.header.supplier)}
                  ${metaRow('No.Truk', data.header.noTruk)}
                  ${metaRow(
                    'No. Plat',
                    // The reference looks this up from the round-log header
                    // table. SP_LapPenerimaanSTSawmill has no NoPlat column, so
                    // there is nothing to print - and printing the truck number
                    // here instead would be a different number under the wrong
                    // label.
                    '-',
                  )}
                </tbody>
              </table>
            </td>
            <td style="width: 33%; padding-left: 8px;">
              <table class="meta-block">
                <tbody>
                  ${metaRow('Jenis Kayu', data.header.jenisKayu)}
                  ${metaRow('No.Suket', data.header.noSuket)}
                  ${metaRow('Tanggal Masuk', fmtDate(data.header.tglMasuk))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>`;

const renderTally = (data: PenerimaanHasilSawmillData): string => {
  const { lengthColumns } = data;
  const width = 6 + lengthColumns.length;

  if (data.gradeGroups.length === 0) {
    return `<table class="report-table hasil-sawmill-table"><tbody>${buildEmptyTableRow(width)}</tbody></table>`;
  }

  let lineNumber = 0;
  const blocks = data.gradeGroups
    .map((group) => {
      const rowSpan = group.tebalGroups.reduce((sum, g) => sum + g.rows.length, 0);
      let printedGrade = false;

      const rows = group.tebalGroups
        .map((tebalGroup) =>
          tebalGroup.rows
            .map((detail) => {
              const cells = lengthColumns
                .map(
                  (column) =>
                    `          <td class="number">${escapeHtml(fmtInt(detail.cells.get(column.key) ?? 0))}</td>`,
                )
                .join('\n');
              lineNumber++;
              const gradeCell =
                !printedGrade
                  ? `            <td class="data-cell grade-cell" rowspan="${rowSpan}">${escapeHtml(group.grade)}</td>\n            `
                  : '';
              if (!printedGrade) printedGrade = true;
              return `<tr class="${lineNumber % 2 === 0 ? 'row-odd' : 'row-even'}">
          ${gradeCell}<td class="center">${escapeHtml(fmtDim(detail.tebal))}</td>
          <td class="center">${escapeHtml(fmtDim(detail.lebar))}</td>
          <td class="center">${escapeHtml(detail.uom)}</td>
${cells}
          <td class="number" style="font-weight: bold;">${escapeHtml(fmtInt(detail.totalPcs))}</td>
          <td class="number" style="font-weight: bold;">${escapeHtml(fmtTon(detail.totalTon))}</td>
        </tr>`;
            })
            .join('\n        '),
        )
        .join('\n        ');

      return `${rows}
        <tr class="grade-total-row">
          <td colspan="4" class="center">Total ${escapeHtml(group.grade)}</td>
${lengthColumns
  .map(
    (column) =>
      `          <td class="number">${escapeHtml(fmtInt(group.totals.get(column.key) ?? 0))}</td>`,
  )
  .join('\n')}
          <td class="number">${escapeHtml(fmtInt(group.totalPcs))}</td>
          <td class="number">${escapeHtml(fmtTon(group.totalTon))}</td>
        </tr>`;
    })
    .join('\n        ');

  return `<table class="report-table hasil-sawmill-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 15%;" rowspan="2">Nama Grade</th>
        <th style="width: 6%;" rowspan="2">Tebal</th>
        <th style="width: 6%;" rowspan="2">Lebar</th>
        <th style="width: 5%;" rowspan="2">@</th>
        <th colspan="${lengthColumns.length}">Panjang</th>
        <th style="width: 7%;" rowspan="2">Jumlah<br>Pcs</th>
        <th style="width: 8%;" rowspan="2">Ton</th>
      </tr>
      <tr class="headers-row">
${lengthColumns.map((column) => `        <th>${escapeHtml(column.label)}</th>`).join('\n')}
      </tr>
    </thead>
    <tbody>
        ${blocks}
        <tr class="totals-row">
          <td colspan="4" class="center">Total</td>
${data.lengthColumns
  .map(
    (column) =>
      `          <td class="number">${escapeHtml(fmtInt(data.totalsByLength.get(column.key) ?? 0))}</td>`,
  )
  .join('\n')}
          <td class="number">${escapeHtml(fmtInt(data.totalPcs))}</td>
          <td class="number">${escapeHtml(fmtTon(data.totalTon))}</td>
        </tr>
    </tbody>
  </table>`;
};

const renderSubSummary = (data: PenerimaanHasilSawmillData): string => {
  if (data.subRows.length === 0) return '';
  const body = data.subRows
    .map(
      (row, index) => `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
            <td class="center">${row.idGradeKb}</td>
            <td class="label">${escapeHtml(row.namaGrade)}</td>
            <td class="number">${escapeHtml(fmtTon(row.berat))}</td>
          </tr>`,
    )
    .join('\n          ');

  return `<div class="sub-summary">
    <p class="section-label">Berat Kayu Bulat (dari SP Sub)</p>
    <table class="report-table sub-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 12%;">Id Grade</th>
          <th style="width: 58%;">Nama Grade</th>
          <th style="width: 30%;">Berat</th>
        </tr>
      </thead>
      <tbody>
          ${body}
          <tr class="totals-row">
            <td colspan="2" class="center">Total</td>
            <td class="number">${escapeHtml(fmtTon(data.subTotalBerat))}</td>
          </tr>
      </tbody>
    </table>
  </div>`;
};

export const penerimaanStHasilSawmillReport: ReportDefinition<
  { noPenST: string },
  PenerimaanHasilSawmillData
> = {
  type: 'penerimaan-st-hasil-sawmill',
  title: 'Laporan Penerimaan ST Hasil Sawmill',
  paramsSchema: z.object({
    noPenST: z.string().trim().min(1).max(MAX_NO_PEN_ST),
  }),

  async fetchData(params, { pool }) {
    const conn = await pool;
    const main = await conn
      .request()
      .input('NoPenST', sql.VarChar(MAX_NO_PEN_ST), params.noPenST)
      .execute('SP_LapPenerimaanSTSawmill');
    const sub = await conn
      .request()
      .input('NoPenST', sql.VarChar(MAX_NO_PEN_ST), params.noPenST)
      .execute('SP_LapPenerimaanSTSawmill_Sub');
    return buildPenerimaanHasilSawmillData(
      (main.recordset ?? []) as MainRow[],
      (sub.recordset ?? []) as SubRow[],
    );
  },

  render(data, meta) {
    // No subtitle: the reference prints the title and puts the receipt number
    // in the header block, once.
    return renderWpsReportPage({
      title: 'Laporan Penerimaan ST Hasil Sawmill',
      bodyHtml: `${renderMeta(data)}
  ${renderTally(data)}
  ${renderSubSummary(data)}`,
      style: 'hasil_sawmill',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
