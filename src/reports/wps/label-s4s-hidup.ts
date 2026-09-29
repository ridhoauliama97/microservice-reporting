import { z } from 'zod'
import { escapeHtml, formatNumber, formatPrintedAt } from '../../templates/html'
import type { ReportDefinition } from '../types'
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from './template'

/**
 * Two reports over the same live-label population, both with a stored procedure
 * that takes no parameters at all: they are snapshots of the stock that still
 * has no DateUsage, not a period query.
 *
 *   SP_LapS4SPerJenisKayu              Jenis -> rows
 *   SP_LapS4SHidupPerProdukdanPerJenis Jenis -> Produk -> rows
 *
 * Both are laid out as a lettered Jenis heading, a detail table beneath it, and
 * one Rangkuman table at the end. The legacy blades did this too but split the
 * detail into one table per grade and the summary into one table per Jenis,
 * which meant repeating the header a dozen times; here the grade (or product)
 * is a column instead and the summary is a single table with the Jenis cell
 * spanning its own rows.
 *
 * Two things the legacy got wrong and are corrected here:
 *
 *   The summary read `Pcs`, a column the procedure does not return. Every
 *   summary figure was therefore zero. The real column is JmlhBatang.
 *
 *   NULL is the common case, not an edge case: 80 of the 96 rows
 *   SP_LapS4SHidupPerProdukdanPerJenis returns for the live stock have no
 *   Produk at all. They are grouped under a bare "A1." prefix, which sorts
 *   first because the empty key is read as "-" and "-" sorts before letters.
 */

/** Neither procedure takes a parameter, so there is nothing to ask for. */
const NO_PARAMS = z.object({});

export interface LabelMeasure {
  grade: string;
  tebal: number;
  lebar: number;
  panjang: number;
  batang: number;
  kubik: number;
}

/** A product under a Jenis, or a bare row group for the per-jenis variant. */
export interface LabelGroup {
  /** "A1." or "A2. ISOBO 40"; the name is empty when there is no product. */
  label: string;
  name: string;
  rows: LabelMeasure[];
  totalBatang: number;
  totalKubik: number;
}

export interface LabelJenis {
  /** "A. JABON" */
  label: string;
  name: string;
  groups: LabelGroup[];
  totalBatang: number;
  totalKubik: number;
}

export interface LabelSummaryRow {
  /**
   * How many rows the Jenis cell spans, and 0 for every row after the first.
   * The renderer emits the cell only when this is non-zero, so a non-zero value
   * on a continuation row would put a second overlapping cell in the table.
   */
  jenisSpan: number;
  jenis: string;
  detail: string;
  batang: number;
  kubik: number;
}

export interface LabelData {
  jenis: LabelJenis[];
  summary: LabelSummaryRow[];
}

interface SpRow extends Record<string, unknown> {
  Jenis?: unknown;
  Produk?: unknown;
  NamaGrade?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  Kubik?: unknown;
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown, fallback = '-'): string => {
  const s = String(value ?? '').trim();
  return s === '' ? fallback : s;
};

/** Legacy $alphaIndexToLabel: A, B, ... then wraps at 26. */
export const alphaLabel = (index: number): string =>
  String.fromCharCode(65 + (index % 26));

const measure = (row: SpRow): LabelMeasure => ({
  grade: text(row.NamaGrade),
  tebal: toFloat(row.Tebal),
  lebar: toFloat(row.Lebar),
  panjang: toFloat(row.Panjang),
  batang: toFloat(row.JmlhBatang),
  kubik: toFloat(row.Kubik),
});

const totalOf = (rows: LabelMeasure[]): { totalBatang: number; totalKubik: number } => ({
  totalBatang: rows.reduce((sum, r) => sum + r.batang, 0),
  totalKubik: rows.reduce((sum, r) => sum + r.kubik, 0),
});

/** Groups a Jenis' rows by product, or returns them as a single group. */
function buildGroups(
  rows: SpRow[],
  jenisLetter: string,
  groupByProduct: boolean,
): LabelGroup[] {
  if (!groupByProduct) {
    const measures = rows.map(measure);
    const total = totalOf(measures);
    return [{ label: '', name: '', rows: measures, ...total }];
  }

  // The empty key reads as "-" so a NULL product sorts ahead of the named ones,
  // which is why the unnamed group is numbered A1 rather than A2.
  const byName = new Map<string, SpRow[]>();
  for (const row of rows) {
    const name = text(row.Produk, '-');
    const bucket = byName.get(name);
    if (bucket) bucket.push(row);
    else byName.set(name, [row]);
  }
  const names = [...byName.keys()].sort();

  return names.map((name, index) => {
    const prefix = `${jenisLetter}${index + 1}.`;
    const measures = byName.get(name)!.map(measure);
    return {
      label: name === '-' ? prefix : `${prefix} ${name}`,
      name,
      rows: measures,
      ...totalOf(measures),
    };
  });
}

/**
 * Shared builder for both reports. Rows are ordered by grade and then by the
 * dimensions, so the same label never appears out of order between runs.
 */
export function buildLabelData(rows: SpRow[], groupByProduct: boolean): LabelData {
  const byJenis = new Map<string, SpRow[]>();
  for (const row of rows) {
    const jenis = text(row.Jenis);
    const bucket = byJenis.get(jenis);
    if (bucket) bucket.push(row);
    else byJenis.set(jenis, [row]);
  }
  const jenisNames = [...byJenis.keys()].sort();

  const jenisList: LabelJenis[] = jenisNames.map((name, jenisIndex) => {
    const letter = alphaLabel(jenisIndex);
    const groups = buildGroups(byJenis.get(name)!, letter, groupByProduct);
    for (const group of groups) {
      group.rows.sort(
        (a, b) =>
          a.grade.localeCompare(b.grade) ||
          a.tebal - b.tebal ||
          a.lebar - b.lebar ||
          a.panjang - b.panjang,
      );
    }
    return {
      label: `${letter}. ${name}`,
      name,
      groups,
      totalBatang: groups.reduce((sum, g) => sum + g.totalBatang, 0),
      totalKubik: groups.reduce((sum, g) => sum + g.totalKubik, 0),
    };
  });

  const summary: LabelSummaryRow[] = [];
  for (const jenis of jenisList) {
    if (groupByProduct) {
      summary.push(
        ...jenis.groups.map((group, index) => ({
          // Only the first row of a Jenis carries the spanning cell. Giving every
          // row the same span emits one overlapping rowspan cell per row, and
          // the browser pushes the extras out of the table.
          jenisSpan: index === 0 ? jenis.groups.length : 0,
          jenis: jenis.name,
          detail: group.label,
          batang: group.totalBatang,
          kubik: group.totalKubik,
        })),
      );
    } else {
      // The per-jenis report summarises by grade, so one row per grade even
      // when a grade was never split out in the detail table.
      const byGrade = new Map<string, LabelMeasure[]>();
      for (const group of jenis.groups) {
        for (const row of group.rows) {
          const bucket = byGrade.get(row.grade);
          if (bucket) bucket.push(row);
          else byGrade.set(row.grade, [row]);
        }
      }
      const grades = [...byGrade.keys()].sort();
      summary.push(
        ...grades.map((grade, index) => {
          const total = totalOf(byGrade.get(grade)!);
          return {
            jenisSpan: index === 0 ? grades.length : 0,
            jenis: jenis.name,
            detail: grade,
            batang: total.totalBatang,
            kubik: total.totalKubik,
          };
        }),
      );
    }
  }

  return { jenis: jenisList, summary };
}

const fmtInt = (value: number): string => formatNumber(value, 0, { blankWhenZero: true });
const fmt4 = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });

const DETAIL_HEAD = `<thead>
      <tr class="headers-row">
        <th style="width: 4%;">No</th>
        <th style="width: 21%;">Nama Grade</th>
        <th style="width: 15%;">Tebal (mm)</th>
        <th style="width: 15%;">Lebar (mm)</th>
        <th style="width: 15%;">Panjang (ft)</th>
        <th style="width: 15%;">Jmlh Batang (Pcs)</th>
        <th style="width: 15%;">Kubik (m3)</th>
      </tr>
    </thead>`;

/** One detail table: every label under this Jenis (or this product). */
function renderDetail(rows: LabelMeasure[], totalLabel: string): string {
  const body = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${index + 1}</td>
        <td class="label data-cell">${escapeHtml(row.grade)}</td>
        <td class="center data-cell">${escapeHtml(fmtInt(row.tebal))}</td>
        <td class="center data-cell">${escapeHtml(fmtInt(row.lebar))}</td>
        <td class="center data-cell">${escapeHtml(fmtInt(row.panjang))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.batang))}</td>
        <td class="number data-cell">${escapeHtml(fmt4(row.kubik))}</td>
      </tr>`,
    )
    .join('\n      ');

  const total = totalOf(rows);
  return `<table class="report-table label-detail-table">
    ${DETAIL_HEAD}
    <tbody>
      ${body || `<tr><td colspan="7" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`}
      <tr class="totals-row">
        <td colspan="5" class="blank" style="text-align: center;">${escapeHtml(totalLabel)}</td>
        <td class="number">${escapeHtml(fmtInt(total.totalBatang))}</td>
        <td class="number">${escapeHtml(fmt4(total.totalKubik))}</td>
      </tr>
    </tbody>
  </table>`;
}

/** The single Rangkuman table, with the Jenis cell spanning its own rows. */
function renderSummary(data: LabelData, detailHeading: string): string {
  const body = data.summary
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
      ${
        row.jenisSpan > 0
          ? `<td class="label data-cell" rowspan="${row.jenisSpan}">${escapeHtml(row.jenis)}</td>`
          : ''
      }
      <td class="label data-cell">${escapeHtml(row.detail)}</td>
      <td class="number data-cell">${escapeHtml(fmtInt(row.batang))}</td>
      <td class="number data-cell">${escapeHtml(fmt4(row.kubik))}</td>
    </tr>`,
    )
    .join('\n    ');

  const grandBatang = data.summary.reduce((sum, r) => sum + r.batang, 0);
  const grandKubik = data.summary.reduce((sum, r) => sum + r.kubik, 0);

  return `<div class="section-title">Rangkuman</div>
<table class="report-table label-summary-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 24%;">Jenis</th>
      <th style="width: 40%;">${escapeHtml(detailHeading)}</th>
      <th style="width: 18%;">Jmlh Batang (Pcs)</th>
      <th style="width: 18%;">Kubik (m3)</th>
    </tr>
  </thead>
  <tbody>
    ${
      body ||
      `<tr><td colspan="4" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`
    }
    <tr class="totals-row">
      <td colspan="2" class="blank" style="text-align: center;">Total</td>
      <td class="number">${escapeHtml(fmtInt(grandBatang))}</td>
      <td class="number">${escapeHtml(fmt4(grandKubik))}</td>
    </tr>
  </tbody>
</table>`;
}

function renderBody(data: LabelData, detailHeading: string, groupByProduct: boolean): string {
  if (data.jenis.length === 0) {
    return `<table class="report-table label-summary-table"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;
  }

  const parts: string[] = [];
  for (const jenis of data.jenis) {
    parts.push(`<div class="group-title">${escapeHtml(jenis.label)}</div>`);
    for (const group of jenis.groups) {
      if (groupByProduct) {
        parts.push(`<div class="product-title">${escapeHtml(group.label)}</div>`);
        parts.push(renderDetail(group.rows, `Jumlah ${jenis.name}`));
      } else {
        parts.push(renderDetail(group.rows, `Jumlah ${jenis.name}`));
      }
    }
  }
  parts.push(renderSummary(data, detailHeading));
  return parts.join('\n  ');
}

export interface LabelReportOptions {
  type: string;
  title: string;
  storedProcedure: string;
  /** true when the result set carries the Produk column. */
  groupByProduct: boolean;
  /** Column heading of the Rangkuman table's second column. */
  detailHeading: string;
}

export function createLabelReport(
  options: LabelReportOptions,
): ReportDefinition<z.infer<typeof NO_PARAMS>, LabelData> {
  return {
    type: options.type,
    title: options.title,
    paramsSchema: NO_PARAMS,

    async fetchData(_params, { pool }) {
      const conn = await pool;
      const result = await conn.request().execute(options.storedProcedure);
      return buildLabelData((result.recordset ?? []) as SpRow[], options.groupByProduct);
    },

    render(data, meta) {
      return renderWpsReportPage({
        title: options.title,
        bodyHtml: renderBody(data, options.detailHeading, options.groupByProduct),
        style: 'label_s4s_hidup',
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const labelS4SHidupPerJenisKayuReport = createLabelReport({
  type: 'label-s4s-hidup-per-jenis-kayu',
  title: 'Laporan Label S4S (Hidup) Per-Jenis Kayu',
  storedProcedure: 'SP_LapS4SPerJenisKayu',
  groupByProduct: false,
  detailHeading: 'Nama Grade',
});

export const labelS4SHidupPerProdukPerJenisKayuReport = createLabelReport({
  type: 'label-s4s-hidup-per-produk-per-jenis-kayu',
  title: 'Laporan Label S4S (Hidup) Per-Produk dan Per-Jenis Kayu',
  storedProcedure: 'SP_LapS4SHidupPerProdukdanPerJenis',
  groupByProduct: true,
  detailHeading: 'Produk',
});
