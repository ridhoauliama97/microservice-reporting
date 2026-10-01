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
 * Shared builder for the two QC Sawmill measurement reports:
 * "Laporan QC Sawmill" (SP_LapQCSawmill) and
 * "Laporan QC Sawmill - Discrepancy" (SP_LapQCSawmillDescr).
 *
 * The two procedures return IDENTICAL columns and take identical parameters -
 * verified against the live database, both are NoQc, QcTgl, QcNoMeja, NamaMeja,
 * CuttingTebal, CuttingLebar, ActualTebal, ActualLebar. The only difference
 * between the two reports is which rows get printed, so that is the only option
 * here. Both come from open-api-report's QcSawmillReportService and
 * QcSawmillDiscrepancyReportService, whose normalizeRow methods are also
 * identical.
 *
 * The tolerance rules, which are the whole point of the report:
 *
 *   DeviationTebal = ActualTebal - CuttingTebal
 *   DeviationLebar = ActualLebar - CuttingLebar
 *
 *   inaccurate if either deviation is below -0.00001  (the board came out
 *                    THINNER than the cut asked for)
 *   inaccurate if either deviation is 2 or more       (tolerance exceeded)
 *   accurate otherwise
 *
 * So the acceptable band is -0.00001 <= deviation < 2 on both thickness and
 * width, independently. A row that is thin but within tolerance is accurate; a
 * row that is thick by 1.9mm is accurate; 2.0mm is not.
 *
 * DiscrepancyOnly keeps just the inaccurate rows in the body but still counts
 * EVERY row in the group summary - that is what makes "3 of 40 boards failed"
 * readable on a table that only lists the three.
 *
 * Layout, per the blades: a meta line naming the chamber, then one table per
 * chamber-date, then a per-chamber total, then a grand-total summary. The
 * grouping is chamber first and date second, which is the order the blade
 * iterates.
 *
 * Binds @StartDate / @EndDate.
 */

const TOLERANCE = 2;
const NEGATIVE_EPSILON = 0.00001;

interface SpRow extends Record<string, unknown> {
  NoQc?: unknown;
  QcTgl?: unknown;
  QcNoMeja?: unknown;
  NamaMeja?: unknown;
  CuttingTebal?: unknown;
  CuttingLebar?: unknown;
  ActualTebal?: unknown;
  ActualLebar?: unknown;
}

export interface QcRow {
  noQc: string;
  /** ISO Y-m-d. The short and long renderings are both needed, and a
   * pre-formatted string cannot give both back. */
  qcTgl: string;
  qcNoMeja: number;
  namaMeja: string;
  cuttingTebal: number;
  cuttingLebar: number;
  actualTebal: number;
  actualLebar: number;
  deviationTebal: number;
  deviationLebar: number;
  isAccurate: boolean;
  /** Reference spells the flag "Yes"/"No" rather than printing a boolean. */
  accurate: string;
}

export interface QcStats {
  totalRows: number;
  totalAccurate: number;
  totalDiscrepancy: number;
  avgDeviationTebal: number;
  avgDeviationLebar: number;
  accurateRate: number;
}

export interface QcGroup {
  /** ISO Y-m-d, so both the short and the long date format can be printed. */
  tanggal: string;
  noMeja: number;
  namaMeja: string;
  rows: QcRow[];
  summary: QcStats;
}

export interface QcMejaGroup {
  namaMeja: string;
  noMeja: number;
  dateGroups: QcGroup[];
  summary: QcStats;
}

export interface QcData {
  mejaGroups: QcMejaGroup[];
  rangkuman: Array<{ label: string } & QcStats>;
  grandAll: { label: string } & QcStats;
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

/** ISO Y-m-d, kept so the short and long renderings can both be printed. */
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

/** d-M-y, the format the meta line and the date heading print. */
const fmtDate = (key: string): string =>
  key === '' ? '' : formatTanggalId(key).replace(/\d{4}$/, (year) => year.slice(-2));

/** j-M-Y, the format the per-date totals line prints. */
const fmtDateLong = (key: string): string => (key === '' ? '' : formatTanggalId(key));

/** Reference $formatDecimal: 2 decimals, and a true zero prints nothing. */
const fmtDec = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 2);

/** Reference $formatPercent: 1 decimal, a true zero prints nothing. */
const fmtPct = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 1);

const emptyStats = (): QcStats => ({
  totalRows: 0,
  totalAccurate: 0,
  totalDiscrepancy: 0,
  avgDeviationTebal: 0,
  avgDeviationLebar: 0,
  accurateRate: 0,
});

/**
 * The reference's normalizeRow. Exported because the tolerance rule is the
 * thing worth testing on its own - it is what decides whether a board passes.
 */
export function normalizeQcRow(row: SpRow): QcRow {
  const cuttingTebal = toFloat(row.CuttingTebal);
  const cuttingLebar = toFloat(row.CuttingLebar);
  const actualTebal = toFloat(row.ActualTebal);
  const actualLebar = toFloat(row.ActualLebar);
  const deviationTebal = actualTebal - cuttingTebal;
  const deviationLebar = actualLebar - cuttingLebar;

  const hasNegativeDeviation =
    deviationTebal < -NEGATIVE_EPSILON || deviationLebar < -NEGATIVE_EPSILON;
  const hasExceededTolerance = deviationTebal >= TOLERANCE || deviationLebar >= TOLERANCE;
  const isAccurate = !hasNegativeDeviation && !hasExceededTolerance;

  return {
    noQc: text(row.NoQc),
    qcTgl: toDateKey(row.QcTgl),
    qcNoMeja: Math.round(toFloat(row.QcNoMeja)),
    namaMeja: text(row.NamaMeja),
    cuttingTebal,
    cuttingLebar,
    actualTebal,
    actualLebar,
    deviationTebal,
    deviationLebar,
    isAccurate,
    accurate: isAccurate ? 'Yes' : 'No',
  };
}

/** Averages over ALL rows in scope, not only the ones displayed. */
function summarise(all: QcRow[]): QcStats {
  const total = all.length;
  const accurate = all.filter((row) => row.isAccurate).length;
  return {
    totalRows: total,
    totalAccurate: accurate,
    totalDiscrepancy: total - accurate,
    avgDeviationTebal:
      total > 0 ? all.reduce((sum, row) => sum + row.deviationTebal, 0) / total : 0,
    avgDeviationLebar:
      total > 0 ? all.reduce((sum, row) => sum + row.deviationLebar, 0) / total : 0,
    accurateRate: total > 0 ? (accurate / total) * 100 : 0,
  };
}

export interface BuildQcOptions {
  discrepancyOnly: boolean;
}

/**
 * Groups chamber-first then date, exactly as the blades iterate. The summary
 * counts every row even when the body shows only the failures.
 */
export function buildQcData(rows: SpRow[], options: BuildQcOptions): QcData {
  const normalized = rows.map(normalizeQcRow);

  // Chamber, then date within it.
  const byMeja = new Map<string, { namaMeja: string; noMeja: number; byDate: Map<string, QcRow[]> }>();
  for (const row of normalized) {
    const key = row.namaMeja === '' ? `Meja ${row.qcNoMeja}` : row.namaMeja;
    let meja = byMeja.get(key);
    if (!meja) {
      meja = { namaMeja: key, noMeja: row.qcNoMeja, byDate: new Map() };
      byMeja.set(key, meja);
    }
    const bucket = meja.byDate.get(row.qcTgl) ?? [];
    bucket.push(row);
    meja.byDate.set(row.qcTgl, bucket);
  }

  const mejaGroups: QcMejaGroup[] = [...byMeja.values()].map((meja) => {
    const dateKeys = [...meja.byDate.keys()].sort();
    const dateGroups: QcGroup[] = dateKeys.map((tanggal) => {
      const all = meja.byDate.get(tanggal)!;
      return {
        tanggal,
        noMeja: meja.noMeja,
        namaMeja: meja.namaMeja,
        // The summary sees every row; the body may show only the failures.
        rows: options.discrepancyOnly ? all.filter((row) => !row.isAccurate) : all,
        summary: summarise(all),
      };
    });
    const all = dateKeys.flatMap((tanggal) => meja.byDate.get(tanggal)!);
    return { namaMeja: meja.namaMeja, noMeja: meja.noMeja, dateGroups, summary: summarise(all) };
  });

  const rangkuman = mejaGroups.map((group) => ({
    label: group.namaMeja,
    ...group.summary,
  }));
  const grandAll = { label: 'Grand Total', ...summarise(normalized) };

  return { mejaGroups, rangkuman, grandAll };
}

const metaLine = (label: string, value: string): string =>
  `<table class="group-meta-table">
    <tr>
      <td class="group-meta-label">${escapeHtml(label)}</td>
      <td class="group-meta-sep">:</td>
      <td>${escapeHtml(value)}</td>
    </tr>
  </table>`;

const renderDetailTable = (group: QcGroup): string => {
  const body = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
          <td class="center data-cell">${index + 1}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.cuttingTebal))}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.cuttingLebar))}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.actualTebal))}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.actualLebar))}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.deviationTebal))}</td>
          <td class="number data-cell">${escapeHtml(fmtDec(row.deviationLebar))}</td>
          <td class="center data-cell">${escapeHtml(row.accurate)}</td>
        </tr>`,
    )
    .join('\n        ');

  return `${metaLine('Tanggal', fmtDate(group.tanggal))}
    <table class="report-table qc-table">
      <thead>
        <tr class="headers-row">
          <th rowspan="2" style="width: 4%;">No</th>
          <th colspan="2" style="width: 22%;">Cutting</th>
          <th colspan="2" style="width: 22%;">Actual</th>
          <th colspan="2" style="width: 22%;">Deviation</th>
          <th rowspan="2" style="width: 20%;">Accurate</th>
        </tr>
        <tr class="headers-row">
          <th style="width: 11%;">Tebal</th>
          <th style="width: 11%;">Lebar</th>
          <th style="width: 11%;">Tebal</th>
          <th style="width: 11%;">Lebar</th>
          <th style="width: 11%;">Tebal</th>
          <th style="width: 11%;">Lebar</th>
        </tr>
      </thead>
      <tbody>
        ${body || buildEmptyTableRow(8)}
        <tr class="totals-row">
          <td colspan="5" class="center">Per-Tanggal ${escapeHtml(fmtDateLong(group.tanggal))} :</td>
          <td class="number">${escapeHtml(fmtDec(group.summary.avgDeviationTebal))}</td>
          <td class="number">${escapeHtml(fmtDec(group.summary.avgDeviationLebar))}</td>
          <td class="center">${escapeHtml(fmtPct(group.summary.accurateRate))}</td>
        </tr>
      </tbody>
    </table>`;
};

const renderMejaTotal = (group: QcMejaGroup): string =>
  `<table class="report-table meja-total-table">
      <tbody>
        <tr class="totals-row">
          <td colspan="5" class="center">Per-Meja ${escapeHtml(group.namaMeja)} :</td>
          <td class="number" style="width: 12%;">${escapeHtml(fmtDec(group.summary.avgDeviationTebal))}</td>
          <td class="number" style="width: 12%;">${escapeHtml(fmtDec(group.summary.avgDeviationLebar))}</td>
          <td class="center" style="width: 21%;">${escapeHtml(fmtPct(group.summary.accurateRate))}</td>
        </tr>
      </tbody>
    </table>`;

const renderRangkuman = (data: QcData): string => {
  const rows = [...data.rangkuman, data.grandAll];
  return `<div class="rangkuman-qc-container">
    <h2 class="section-title" style="text-align: center;">Rangkuman Grand Total</h2>
    <table class="report-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 30%;">Kategori</th>
          <th style="width: 15%;">Total Data</th>
          <th style="width: 18%;">Rata-rata Dev Tebal</th>
          <th style="width: 18%;">Rata-rata Dev Lebar</th>
          <th style="width: 19%;">Akurasi</th>
        </tr>
      </thead>
      <tbody>
${rows
  .map(
    (row, index) => `<tr class="${index === rows.length - 1 ? 'totals-row' : index % 2 === 0 ? 'row-odd' : 'row-even'}">
          <td>${escapeHtml(row.label)}</td>
          <td class="number">${escapeHtml(formatInt(row.totalRows))}</td>
          <td class="number">${escapeHtml(fmtDec(row.avgDeviationTebal))}</td>
          <td class="number">${escapeHtml(fmtDec(row.avgDeviationLebar))}</td>
          <td class="number">${escapeHtml(fmtPct(row.accurateRate))}</td>
        </tr>`,
  )
  .join('\n        ')}
      </tbody>
    </table>
  </div>`;
};

const renderQcBody = (data: QcData): string => {
  if (data.mejaGroups.length === 0) {
    return `<table class="report-table"><tbody>${buildEmptyTableRow(8)}</tbody></table>`;
  }
  return `${data.mejaGroups
    .map(
      (group) => `<div class="meja-qc-block">
    ${metaLine('Meja', group.namaMeja)}
    ${group.dateGroups.map(renderDetailTable).join('\n    ')}
    ${renderMejaTotal(group)}
  </div>`,
    )
    .join('\n  ')}
  ${renderRangkuman(data)}`;
};

export interface QcReportOptions {
  type: string;
  title: string;
  spName: string;
  discrepancyOnly: boolean;
}

export function createQcSawmillReport(
  options: QcReportOptions,
): ReportDefinition<PeriodParams, QcData> {
  return {
    type: options.type,
    title: options.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input('StartDate', sql.Date, params.tglAwal)
        .input('EndDate', sql.Date, params.tglAkhir)
        .execute(options.spName);
      return buildQcData((result.recordset ?? []) as SpRow[], {
        discrepancyOnly: options.discrepancyOnly,
      });
    },

    render(data, meta) {
      const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
      return renderWpsReportPage({
        title: options.title,
        subtitle: `Periode ${period}`,
        bodyHtml: renderQcBody(data),
        style: 'qc_sawmill',
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

/** Laporan QC Sawmill — every measurement, flagged accurate or not. */
export const qcSawmillReport = createQcSawmillReport({
  type: 'qc-sawmill',
  title: 'Laporan QC Sawmill',
  spName: 'SP_LapQCSawmill',
  discrepancyOnly: false,
});

/**
 * Laporan QC Sawmill - Discrepancy — same procedure shape, failures only.
 * The group summaries still count every measurement, so the accuracy percentage
 * stays honest while the body lists just the rejected boards.
 */
export const qcSawmillDiscrepancyReport = createQcSawmillReport({
  type: 'qc-sawmill-discrepancy',
  title: 'Laporan QC Sawmill - Discrepancy',
  spName: 'SP_LapQCSawmillDescr',
  discrepancyOnly: true,
});
