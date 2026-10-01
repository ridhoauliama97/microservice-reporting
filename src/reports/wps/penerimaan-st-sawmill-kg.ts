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
 * SPWps_LapRekapPenerimaanSawmilRp — "Laporan Penerimaan ST Dari Sawmill -
 * Timbang KG".
 *
 * NOT a straight port: the reference's own PDF for this report is broken, and
 * this is built from its intent plus the procedure's verified shape.
 *
 * The reference's blade reads $inputRows, $outputRows, $totalInputKb,
 * $totalOutputSt and $rendemen, but PenerimaanStSawmillKgController passes only
 * rows, groupedRows, summary and the two resolved column names. None of those
 * five variables are ever provided, so the blade takes the "no data" branch
 * and the reference PDF is a stub - it always takes the empty branch no matter what
 * the procedure returns. There is no working output to match against, so the
 * table below follows what the blade's markup is plainly asking for, with every
 * figure taken from columns verified on the live database.
 *
 * Columns verified against the live database (17 of them): InOut,
 * NoPenerimaanST, TglLaporan, NoKayuBulat, NmSupplier, NmSupplier2,
 * NmSupplier3, NoTruk, Jenis, NoMeja, NamaGrade, Harga, JmlhBatang, KBTon,
 * STTon, NamaGrade1, Ket.
 *
 * How the procedure encodes the two sides of the scale:
 *
 *   InOut = 1  INPUT  - round log coming in. KBTon is the weight, NoTruk the
 *                      truck count, NmSupplier2 the supplier name without the
 *                      "(Truk : n)" suffix, and NamaGrade the incoming grade
 *                      with its size code: "RAMBUNG - AFKIR-100".
 *   InOut = 0  OUTPUT - sawn output. STTon is the weight and NamaGrade1 the
 *                      outgoing grade, which is the incoming grade's family
 *                      with the size code dropped: "AFKIR", "MC 1", "STD".
 *                      These rows carry no supplier at all.
 *
 * That last point is why the supplier has to be backfilled: the OUTPUT rows
 * share a NoPenerimaanST with the INPUT rows but leave NmSupplier NULL, and
 * they carry the name in NmSupplier3 instead. So the INPUT row for a receipt is
 * taken as the canonical supplier for the whole receipt, exactly as the
 * reference does, and the OUTPUT rows inherit it. Without that step every
 * OUTPUT line would be attributed to "Tanpa Supplier".
 *
 * The grade code is also what makes the report work: "RAMBUNG - AFKIR-100"
 * becomes "AFKIR" on the way out, so input and output cannot be matched row by
 * row. They are totalled by their own side and compared through RENDEMEN,
 * which is total ST / total KB. Grade-level input/output percentages are each
 * side's own share, printed in their own column - a percentage of what, which
 * the column heading states.
 *
 * @Supplier is declared by the procedure but the reference never binds it
 * (parameter_count is 2, so only the dates go across) and the procedure's
 * default returns every supplier. Binding a name here instead returns nothing,
 * verified: ABI, AHONG and a "%" wildcard all produced zero rows while the
 * unbound default returned 23857. The parameter is therefore not exposed.
 */

const COLUMNS = 7;
/**
 * A missing grade and a missing supplier are different holes, so they get
 * different labels. Bucketing either under the other's name would put
 * "Tanpa Supplier" into the Grade column.
 */
const FALLBACK_GRADE = 'Tanpa Grade';

interface SpRow extends Record<string, unknown> {
  InOut?: unknown;
  NoPenerimaanST?: unknown;
  NmSupplier?: unknown;
  NmSupplier2?: unknown;
  NmSupplier3?: unknown;
  NoTruk?: unknown;
  NamaGrade?: unknown;
  NamaGrade1?: unknown;
  KBTon?: unknown;
  STTon?: unknown;
}

export interface GradeLine {
  grade: string;
  trucks: number;
  kbTon: number;
  stTon: number;
  /** Share of the input or output side total, as a percentage. */
  percent: number;
}

export interface PenerimaanData {
  input: GradeLine[];
  output: GradeLine[];
  totalInputKb: number;
  totalOutputSt: number;
  rendemen: number;
  supplier: string;
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

const isInput = (row: SpRow): boolean => Math.trunc(toFloat(row.InOut)) === 1;

/**
 * The supplier for a receipt, taken from its INPUT row. "ABI J (Truk : 102)"
 * is the same supplier as "ABI J", so NmSupplier2 is preferred where present.
 */
function resolveSuppliers(rows: SpRow[]): Map<number, string> {
  const byReceipt = new Map<string, string>();
  for (const row of rows) {
    const receipt = text(row.NoPenerimaanST);
    if (receipt === '') continue;
    const named = text(row.NmSupplier2) || text(row.NmSupplier);
    // An INPUT row wins: it is the row the procedure populated.
    if (!isInput(row)) continue;
    if (named !== '' || !byReceipt.has(receipt)) byReceipt.set(receipt, named);
  }

  const byIndex = new Map<number, string>();
  rows.forEach((row, index) => {
    const receipt = text(row.NoPenerimaanST);
    if (receipt === '') return;
    const direct = text(row.NmSupplier2) || text(row.NmSupplier) || text(row.NmSupplier3);
    byIndex.set(index, direct || byReceipt.get(receipt) || '');
  });
  return byIndex;
}

interface Tally {
  trucks: Set<string>;
  kbTon: number;
  stTon: number;
}

const newTally = (): Tally => ({ trucks: new Set(), kbTon: 0, stTon: 0 });

export function buildPenerimaanData(rows: SpRow[]): PenerimaanData {
  const suppliers = resolveSuppliers(rows);

  const inputTally = new Map<string, Tally>();
  const outputTally = new Map<string, Tally>();
  const supplierNames = new Set<string>();

  rows.forEach((row, index) => {
    const supplier = suppliers.get(index) ?? '';
    if (supplier !== '') supplierNames.add(supplier);

    if (isInput(row)) {
      const grade = text(row.NamaGrade) || FALLBACK_GRADE;
      const tally = inputTally.get(grade) ?? newTally();
      // NoTruk repeats across the grade lines of one truck, so a set is what
      // counts trucks rather than tallying the same truck once per grade.
      const truck = text(row.NoTruk);
      if (truck !== '') tally.trucks.add(truck);
      tally.kbTon += toFloat(row.KBTon);
      inputTally.set(grade, tally);
      return;
    }

    const grade = text(row.NamaGrade1) || text(row.NamaGrade) || FALLBACK_GRADE;
    const tally = outputTally.get(grade) ?? newTally();
    tally.stTon += toFloat(row.STTon);
    outputTally.set(grade, tally);
  });

  const toLines = (tally: Map<string, Tally>, side: 'input' | 'output'): GradeLine[] => {
    const total = [...tally.values()].reduce(
      (sum, entry) => sum + (side === 'input' ? entry.kbTon : entry.stTon),
      0,
    );
    return [...tally.entries()]
      .map(([grade, entry]) => {
        const measure = side === 'input' ? entry.kbTon : entry.stTon;
        return {
          grade,
          trucks: entry.trucks.size,
          kbTon: entry.kbTon,
          stTon: entry.stTon,
          percent: total > 0 ? (measure / total) * 100 : 0,
        };
      })
      .sort((left, right) => right.percent - left.percent || left.grade.localeCompare(right.grade));
  };

  const input = toLines(inputTally, 'input');
  const output = toLines(outputTally, 'output');
  const totalInputKb = input.reduce((sum, line) => sum + line.kbTon, 0);
  const totalOutputSt = output.reduce((sum, line) => sum + line.stTon, 0);

  return {
    input,
    output,
    totalInputKb,
    totalOutputSt,
    rendemen: totalInputKb > 0 ? (totalOutputSt / totalInputKb) * 100 : 0,
    supplier: supplierNames.size === 1 ? [...supplierNames][0]! : `${supplierNames.size} supplier`,
  };
}

/** Reference $formatDetail blanks at ~zero rather than printing "0.00". */
const fmt2 = (value: number): string => formatNumber(value, 2, { blankWhenZero: true });
const fmt4 = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });
const fmtPct1 = (value: number): string => formatNumber(value, 1, { blankWhenZero: true });

const renderInputRow = (line: GradeLine, index: number, first: boolean, span: number): string =>
  `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
          ${first ? `          <td class="data-cell section-cell" rowspan="${span}">INPUT</td>\n          ` : ''}<td class="data-cell grade">${escapeHtml(line.grade)}</td>
          <td class="data-cell center">${escapeHtml(formatInt(line.trucks))}</td>
          <td class="data-cell number">${escapeHtml(fmt2(line.kbTon))}</td>
          <td class="data-cell center"></td>
          <td class="data-cell number">${escapeHtml(fmtPct1(line.percent))}</td>
          <td class="data-cell center"></td>
        </tr>`;

const renderOutputRow = (line: GradeLine, index: number, first: boolean, span: number): string =>
  `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
          ${first ? `          <td class="data-cell section-cell" rowspan="${span}">OUTPUT</td>\n          ` : ''}<td class="data-cell grade-output">${escapeHtml(line.grade)}</td>
          <td class="data-cell center"></td>
          <td class="data-cell center"></td>
          <td class="data-cell number">${escapeHtml(fmt4(line.stTon))}</td>
          <td class="data-cell center"></td>
          <td class="data-cell number">${escapeHtml(fmtPct1(line.percent))}</td>
        </tr>`;

function renderTable(data: PenerimaanData): string {
  if (data.input.length === 0 && data.output.length === 0) {
    return `<table class="report-table penerimaan-st-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;
  }

  const sections: string[] = [];
  if (data.input.length > 0) {
    sections.push(
      data.input.map((line, index) => renderInputRow(line, index, index === 0, data.input.length)).join('\n        '),
    );
  }
  if (data.output.length > 0) {
    sections.push(
      data.output.map((line, index) => renderOutputRow(line, index, index === 0, data.output.length)).join('\n        '),
    );
  }

  return `<table class="report-table penerimaan-st-table">
      <colgroup>
        <col style="width: 12%;">
        <col style="width: 30%;">
        <col style="width: 10%;">
        <col style="width: 12%;">
        <col style="width: 12%;">
        <col style="width: 12%;">
        <col style="width: 12%;">
      </colgroup>
      <thead>
        <tr class="headers-row">
          <th>Kategori</th>
          <th>Grade</th>
          <th>Jmlh Truk</th>
          <th>KB (Ton)</th>
          <th>ST (Ton)</th>
          <th>Persentase Input (%)</th>
          <th>Persentase Output (%)</th>
        </tr>
      </thead>
      <tbody>
        ${sections.join('\n        ')}
        <tr class="totals-row">
          <td colspan="3" class="center">Jumlah:</td>
          <td class="number">${escapeHtml(fmt2(data.totalInputKb))}</td>
          <td class="number">${escapeHtml(fmt4(data.totalOutputSt))}</td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="rendemen-row">RENDEMEN : ${escapeHtml(formatNumber(data.rendemen, 1))}%</div>`;
}

export const penerimaanStSawmillKgReport: ReportDefinition<PeriodParams, PenerimaanData> = {
  type: 'penerimaan-st-sawmill-kg',
  title: 'Laporan Penerimaan ST Dari Sawmill - Timbang KG',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input('TglAwal', sql.Date, params.tglAwal)
      .input('TglAkhir', sql.Date, params.tglAkhir)
      .execute('SPWps_LapRekapPenerimaanSawmilRp');
    return buildPenerimaanData((result.recordset ?? []) as SpRow[]);
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Penerimaan ST Dari Sawmill - Timbang KG',
      // Period only. The reference prints nothing else here, and the receipt
      // count is a figure I derived rather than one the legacy sheet shows.
      subtitle: `Periode ${period}`,
      bodyHtml: renderTable(data),
      style: 'penerimaan_st_sawmill',
      // Portrait. Seven columns, and the reference's own layout is portrait
      // too - the grade names are the widest thing on the page and they read
      // better with room to breathe than stretched across a landscape sheet.
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
