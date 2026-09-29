import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import type { ReportDefinition } from '../types'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from './template'

/**
 * The two S4S dashboards. They are built here rather than through the shared
 * `createDashboardPivotReport` because they do not work the way it does:
 *
 *   v1 (SPWps_LapDashboardS4S) has a FIXED group list. Only five Jenis+Grade
 *      combinations are ever shown, and a combination with no activity in the
 *      period still gets a column of zeros. Anything outside the five is
 *      dropped. The ending balance is not in the result set: it is computed as
 *      awal + masuk - keluar, with keluar = jual + keluar, and the container
 *      count is that balance over 65.
 *
 *   v2 (SPWps_LapDashboardS4S2) takes its columns from whatever the procedure
 *      returns, and tracks the ending balance per grade id, so a Jenis reported
 *      under several grades adds the latest balance of each instead of one
 *      overwriting the other.
 *
 * The shared pivot takes the balance straight from a column and derives its
 * column list from the data, so neither variant fits it.
 */

/** The five combinations v1 shows, in the legacy order, with their captions. */
export const S4S_GROUP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['RAMBUNG A/B', 'Rambung S4S A/B'],
  ['RAMBUNG A/C', 'Rambung S4S A/C'],
  ['RAMBUNG C/C', 'Rambung S4S C/C'],
  ['JABON NISOBO', 'Jabon Nisobo S4S'],
  ['PULAI NISOBO', 'Pulai Nisobo S4S'],
];

/** Cubic metres of S4S per container. The legacy default and the only value. */
const CTR_DIVISOR = 65;
const EPS = 1e-7;

const toFloat = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  let normalized = value.trim();
  if (normalized === '') return 0;
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replaceAll('.', '').replaceAll(',', '.')
        : normalized.replaceAll(',', '');
  } else if (normalized.includes(',')) {
    normalized = normalized.replaceAll(',', '.');
  }
  const match = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(normalized);
  const parsed = Number(match?.[0] ?? normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim());
  if (match) {
    return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  }
  return '';
};

const normalizeToken = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

const displayKey = (jenis: unknown, grade: unknown): string =>
  `${normalizeToken(jenis)} ${normalizeToken(grade)}`.trim();

export const eachDay = (startIso: string, endIso: string): string[] => {
  const days: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

export interface S4SRow extends Record<string, unknown> {
  DATE?: unknown;
  Jenis?: unknown;
  NamaGrade?: unknown;
  idGrade?: unknown;
  S4SAwal?: unknown;
  S4SMasuk?: unknown;
  S4SJual?: unknown;
  S4SKeluar?: unknown;
  S4SAkhir?: unknown;
  CTR?: unknown;
}

export interface Movement {
  masuk: number;
  keluar: number;
}

export interface S4SGroup {
  label: string;
  masuk: number;
  keluar: number;
  akhir: number;
  container: number;
  percent: number;
  /** Movement per ISO date, for this group alone. */
  daily: Map<string, Movement>;
}

export interface S4SDashboardData {
  dates: string[];
  groups: S4SGroup[];
  totals: { akhir: number; container: number };
}

/** Adds a day's movement to a group, creating the day entry on first use. */
const addMovement = (group: S4SGroup, date: string, masuk: number, keluar: number): void => {
  const day = group.daily.get(date) ?? { masuk: 0, keluar: 0 };
  day.masuk += masuk;
  day.keluar += keluar;
  group.daily.set(date, day);
};

/** Fills in the derived figures once every group is known. */
const finish = (groups: S4SGroup[]): S4SDashboardData => {
  const akhirTotal = groups.reduce((sum, group) => sum + group.akhir, 0);
  for (const group of groups) {
    group.percent = akhirTotal > 0 ? (group.akhir / akhirTotal) * 100 : 0;
  }
  return {
    dates: [],
    groups,
    totals: {
      akhir: akhirTotal,
      container: groups.reduce((sum, group) => sum + group.container, 0),
    },
  };
};

/**
 * v1: five fixed groups, a running balance and a derived container count.
 *
 * The procedure repeats the same opening balance on every day of the period,
 * so the last non-zero value wins — the rule the legacy service used. Only the
 * five whitelisted combinations are shown; everything else is dropped.
 */
export function buildS4SDashboardV1(
  rows: S4SRow[],
  startIso: string,
  endIso: string,
): S4SDashboardData {
  const allowed = new Set(S4S_GROUP_LABELS.map(([key]) => key));
  const byKey = new Map<string, S4SGroup>();
  for (const [key, label] of S4S_GROUP_LABELS) {
    byKey.set(key, {
      label,
      masuk: 0,
      keluar: 0,
      akhir: 0,
      container: 0,
      percent: 0,
      daily: new Map(),
    });
  }

  // The opening balance is shared by every row of a group, so it is tracked
  // apart from the running totals.
  const awalByKey = new Map<string, number>();

  for (const row of rows) {
    const date = toDateKey(row.DATE);
    if (date === '') continue;
    const key = displayKey(row.Jenis, row.NamaGrade);
    if (!allowed.has(key)) continue;
    const group = byKey.get(key)!;

    const masuk = toFloat(row.S4SMasuk);
    const keluar = toFloat(row.S4SJual) + toFloat(row.S4SKeluar);
    group.masuk += masuk;
    group.keluar += keluar;
    addMovement(group, date, masuk, keluar);

    const awal = toFloat(row.S4SAwal);
    const current = awalByKey.get(key) ?? 0;
    if (Math.abs(awal) > EPS || Math.abs(current) < EPS) awalByKey.set(key, awal);
  }

  for (const [key, group] of byKey) {
    group.akhir = (awalByKey.get(key) ?? 0) + group.masuk - group.keluar;
    group.container = group.akhir / CTR_DIVISOR;
  }

  const data = finish([...byKey.values()]);
  data.dates = eachDay(startIso, endIso);
  return data;
}

/**
 * v2: columns come from the data, and the ending balance is the sum of the
 * latest S4SAkhir of each grade inside a Jenis.
 */
export function buildS4SDashboardV2(
  rows: S4SRow[],
  startIso: string,
  endIso: string,
): S4SDashboardData {
  const byKey = new Map<string, S4SGroup>();
  const latestByKeyAndGrade = new Map<string, Map<string, { date: string; value: number }>>();
  const hasCtrColumn = rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'CTR'));
  const ctrByKey = new Map<string, number>();

  for (const row of rows) {
    const date = toDateKey(row.DATE);
    if (date === '') continue;
    const key = displayKey(row.Jenis, row.NamaGrade);
    if (key === '') continue;

    let group = byKey.get(key);
    if (!group) {
      group = { label: key, masuk: 0, keluar: 0, akhir: 0, container: 0, percent: 0, daily: new Map() };
      byKey.set(key, group);
      latestByKeyAndGrade.set(key, new Map());
    }

    const masuk = toFloat(row.S4SMasuk);
    const keluar = toFloat(row.S4SKeluar);
    group.masuk += masuk;
    group.keluar += keluar;
    addMovement(group, date, masuk, keluar);

    const gradeKey = String(row.idGrade ?? '').trim() === '' ? '__DEFAULT__' : String(row.idGrade);
    const byGrade = latestByKeyAndGrade.get(key)!;
    const current = byGrade.get(gradeKey);
    if (current === undefined || date >= current.date) {
      byGrade.set(gradeKey, { date, value: toFloat(row.S4SAkhir) });
    }

    if (hasCtrColumn) {
      ctrByKey.set(key, (ctrByKey.get(key) ?? 0) + toFloat(row.CTR));
    }
  }

  for (const [key, group] of byKey) {
    let akhir = 0;
    for (const entry of latestByKeyAndGrade.get(key)!.values()) akhir += entry.value;
    group.akhir = akhir;
    group.container = hasCtrColumn ? (ctrByKey.get(key) ?? 0) : akhir / CTR_DIVISOR;
  }

  const data = finish([...byKey.values()]);
  data.dates = eachDay(startIso, endIso);
  return data;
}

const fmtMovement = (value: number): string => formatNumber(value, 1, { blankWhenZero: true });
const fmtBalance = (value: number): string => formatNumber(value, 1);
const fmtPercent = (value: number): string => `${formatNumber(value, 1)}%`;
const fmtCtr = (value: number): string => formatNumber(value, 2);

function renderS4SGrid(data: S4SDashboardData): string {
  const groups = data.groups;
  if (groups.length === 0 || data.dates.length === 0) {
    return `<table class="report-table dashboard-s4s-table"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;
  }

  const headerGroups = groups
    .map((group) => `<th colspan="2">${escapeHtml(group.label)}</th>`)
    .join('\n      ');
  const subHeader = groups.map(() => '<th>Masuk</th>\n      <th>Keluar</th>').join('\n      ');

  const body = data.dates
    .map((date, index) => {
      const cells = groups
        .map((group) => {
          const cell = group.daily.get(date);
          return `<td class="number data-cell">${escapeHtml(fmtMovement(cell?.masuk ?? 0))}</td>\n        <td class="number data-cell">${escapeHtml(fmtMovement(cell?.keluar ?? 0))}</td>`;
        })
        .join('\n        ');
      return `<tr class="data-row ${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center data-cell">${escapeHtml(formatTanggalId(date))}</td>
        ${cells}
      </tr>`;
    })
    .join('\n      ');

  const sAkhirCells = groups
    .map(
      (group) =>
        `<td class="number">${escapeHtml(fmtBalance(group.akhir))}</td>\n        <td class="number">${escapeHtml(fmtPercent(group.percent))}</td>`,
    )
    .join('\n      ');

  const ctrCells = groups
    .map(
      (group) =>
        `<td class="number" colspan="2" style="text-align: center;">${escapeHtml(fmtCtr(group.container))}</td>`,
    )
    .join('\n      ');

  return `<table class="report-table dashboard-s4s-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 72px;">Tanggal</th>
      ${headerGroups}
    </tr>
    <tr class="headers-row">
      ${subHeader}
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
  <tfoot>
    <tr class="totals-row">
      <td class="label">S Akhir</td>
      ${sAkhirCells}
    </tr>
    <tr class="totals-row">
      <td class="label"># Ctr</td>
      ${ctrCells}
    </tr>
  </tfoot>
</table>
<p class="section-title">Total</p>
<table class="summary-table">
  <tr class="totals-row">
    <td class="label" style="width: 90px;">S Akhir</td>
    <td class="number">${escapeHtml(fmtBalance(data.totals.akhir))}</td>
  </tr>
  <tr class="totals-row">
    <td class="label"># Ctr</td>
    <td class="number">${escapeHtml(fmtCtr(data.totals.container))}</td>
  </tr>
</table>`;
}

export interface S4SDashboardOptions {
  type: string;
  title: string;
  storedProcedure: string;
  build: (rows: S4SRow[], startIso: string, endIso: string) => S4SDashboardData;
  style: 'dashboard_s4s' | 'dashboard_s4s_v2';
}

export function createS4SDashboard(
  options: S4SDashboardOptions,
): ReportDefinition<PeriodParams, S4SDashboardData> {
  return {
    type: options.type,
    title: options.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input('TglAwal', sql.Date, params.tglAwal)
        .input('TglAkhir', sql.Date, params.tglAkhir)
        .execute(options.storedProcedure);
      return options.build(
        (result.recordset ?? []) as S4SRow[],
        params.tglAwal,
        params.tglAkhir,
      );
    },

    render(data, meta) {
      return renderWpsReportPage({
        title: options.title,
        subtitle: `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
        bodyHtml: renderS4SGrid(data),
        style: options.style,
        landscape: true,
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const dashboardS4SReport = createS4SDashboard({
  type: 'dashboard-s4s',
  title: 'Laporan Dashboard S4S',
  storedProcedure: 'SPWps_LapDashboardS4S',
  build: buildS4SDashboardV1,
  style: 'dashboard_s4s',
});

export const dashboardS4SV2Report = createS4SDashboard({
  type: 'dashboard-s4s-v2',
  title: 'Laporan Dashboard S4S v2',
  storedProcedure: 'SPWps_LapDashboardS4S2',
  build: buildS4SDashboardV2,
  style: 'dashboard_s4s_v2',
});
