import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { renderWpsReportPage } from "./template";

/**
 * SPWps_LapDashboardCCAkhir — "Laporan Dashboard Cross Cut Akhir".
 *
 * Ported from DashboardCrossCutAkhirReportService and
 * cross-cut-akhir-pdf.blade.php. The service deliberately uses CCMasuk for
 * daily inflow, KeluarALL for daily outflow, CCAkhir for the latest ending
 * balance, and sums CTR across the period. It does not recalculate a running
 * balance from the individual movement columns.
 */

interface DashboardCcRow extends Record<string, unknown> {
  DATE: Date | string | null;
  Jenis: string | null;
  NamaGrade: string | null;
  CCMasuk: number | string | null;
  KeluarALL: number | string | null;
  CCAkhir: number | string | null;
  CTR: number | string | null;
}

interface DashboardCell {
  in: number;
  out: number;
}

interface DashboardGridRow {
  date: string;
  cells: Record<string, DashboardCell>;
}

interface DashboardData {
  dates: string[];
  columns: string[];
  rows: DashboardGridRow[];
  sAkhirByColumn: Record<string, number>;
  percentByColumn: Record<string, number>;
  ctrByColumn: Record<string, number>;
  totals: {
    sAkhir: number;
    ctr: number;
  };
}

const REPORT_TITLE = "Laporan Dashboard Cross Cut Akhir";
const CTR_DIVISOR = 65;
// Legacy config/reports.php column order. Missing live keys are appended in
// the service's alphabetical order after these configured keys.
const COLUMN_ORDER = [
  "JABON FILB A/A",
  "JABON FILB C/C",
  "JABON ISOBO",
  "JABON NISOBO",
  "PULAI ISOBO",
  "PULAI NISOBO",
  "PULAI TASOBO",
  "RAMBUNG A/B",
  "RAMBUNG C/C",
  "RAMBUNG FILB A/A",
  "RAMBUNG FILB A/B",
  "RAMBUNG FILB A/C",
  "RAMBUNG FILB C/C",
];

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let normalized = value.trim();
  if (normalized === "") return 0;

  if (normalized.includes(".") && normalized.includes(",")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replaceAll(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(",", ".");
  } else {
    normalized = normalized.replaceAll(",", "");
  }

  const match = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(normalized);
  const parsed = Number(match?.[0] ?? normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveDateValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return [
      value.getFullYear().toString().padStart(4, "0"),
      (value.getMonth() + 1).toString().padStart(2, "0"),
      value.getDate().toString().padStart(2, "0"),
    ].join("-");
  }

  const raw = String(value).trim();
  if (raw === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) {
    return `${iso[1].padStart(4, "0")}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return [
    parsed.getFullYear().toString().padStart(4, "0"),
    (parsed.getMonth() + 1).toString().padStart(2, "0"),
    parsed.getDate().toString().padStart(2, "0"),
  ].join("-");
};

const normalizeDisplayToken = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("FJLB", "FILB")
    .replace(/\s+/g, " ")
    .trim();

const buildDisplayKey = (jenis: unknown, grade: unknown): string =>
  `${normalizeDisplayToken(jenis)} ${normalizeDisplayToken(grade)}`.trim();

const buildDateRange = (startDate: string, endDate: string): string[] => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const dates: string[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
};

const applyColumnOrder = (keys: string[]): string[] => {
  const sorted = [...new Set(keys)].sort(compareText);
  const ordered = COLUMN_ORDER.filter((key) => sorted.includes(key));
  const remaining = sorted.filter((key) => !ordered.includes(key));
  return [...ordered, ...remaining];
};

/** Builds the pivot consumed by the legacy dashboard layout. */
export function buildViewModel(
  rows: DashboardCcRow[],
  startDate = "",
  endDate = "",
): DashboardData {
  const dateMap = new Set<string>();
  const daily = new Map<string, Map<string, DashboardCell>>();
  const allKeys = new Set<string>();
  const latestByKey = new Map<string, { date: string; value: number }>();
  const ctrSumByKey = new Map<string, number>();
  const hasCtrColumn = rows.some((row) =>
    Object.prototype.hasOwnProperty.call(row, "CTR"),
  );

  for (const row of rows) {
    const date = resolveDateValue(row.DATE);
    if (date === null) continue;

    const key = buildDisplayKey(row.Jenis, row.NamaGrade);
    if (key === "") continue;

    dateMap.add(date);
    allKeys.add(key);

    let dateCells = daily.get(date);
    if (!dateCells) {
      dateCells = new Map<string, DashboardCell>();
      daily.set(date, dateCells);
    }
    const cell = dateCells.get(key) ?? { in: 0, out: 0 };
    cell.in += toFloat(row.CCMasuk);
    cell.out += toFloat(row.KeluarALL);
    dateCells.set(key, cell);

    const latest = latestByKey.get(key);
    const value = toFloat(row.CCAkhir);
    if (!latest || date >= latest.date) latestByKey.set(key, { date, value });

    if (hasCtrColumn) {
      ctrSumByKey.set(key, (ctrSumByKey.get(key) ?? 0) + toFloat(row.CTR));
    }
  }

  const dates = dateMap.size > 0
    ? [...dateMap].sort(compareText)
    : buildDateRange(startDate, endDate);
  const columns = applyColumnOrder([...allKeys]);

  const gridRows: DashboardGridRow[] = dates.map((date) => {
    const cells: Record<string, DashboardCell> = {};
    for (const key of columns) {
      cells[key] = daily.get(date)?.get(key) ?? { in: 0, out: 0 };
    }
    return { date, cells };
  });

  const sAkhirByColumn: Record<string, number> = {};
  const ctrByColumn: Record<string, number> = {};
  let sAkhirTotal = 0;
  let ctrTotal = 0;

  for (const key of columns) {
    const sAkhir = latestByKey.get(key)?.value ?? 0;
    const ctr = hasCtrColumn ? (ctrSumByKey.get(key) ?? 0) : sAkhir / CTR_DIVISOR;
    sAkhirByColumn[key] = sAkhir;
    ctrByColumn[key] = ctr;
    sAkhirTotal += sAkhir;
    ctrTotal += ctr;
  }

  const percentByColumn: Record<string, number> = {};
  for (const key of columns) {
    percentByColumn[key] = sAkhirTotal > 0
      ? (sAkhirByColumn[key] / sAkhirTotal) * 100
      : 0;
  }

  return {
    dates,
    columns,
    rows: gridRows,
    sAkhirByColumn,
    percentByColumn,
    ctrByColumn,
    totals: { sAkhir: sAkhirTotal, ctr: ctrTotal },
  };
}

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/(\d{2})\d{2}$/, "$1");

const formatMovement = (value: number): string =>
  formatNumber(value, 1, { blankWhenZero: true });

const formatBalance = (value: number): string => formatNumber(value, 1);
const formatCtr = (value: number): string => formatNumber(value, 2);
const formatPercent = (value: number): string => `${formatNumber(value, 1)}%`;

const DASHBOARD_CC_CSS = `
  .report-table { table-layout: auto; }
  .report-table tfoot { display: table-row-group; }
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tfoot .totals-row td {
    font-weight: bold;
    font-size: 11px;
    border-top: 1px solid #000;
    border-right: 1px solid #000;
    border-bottom: 0;
    border-left: 0;
  }
  td.number {
    font-family: Calibri, "DejaVu Sans", sans-serif;
    white-space: nowrap;
  }
  td.label { white-space: nowrap; }
  .summary-table { width: 230px; }
  .summary-table .totals-row td { border: 1px solid #000 !important; }
`;

const buildMainTable = (data: DashboardData): string => {
  const groupHeaders = data.columns
    .map((column) => `<th colspan="2">${escapeHtml(column)}</th>`)
    .join("\n      ");
  const secondHeader = data.columns.length
    ? `<tr class="headers-row">${data.columns
        .map(() => "<th>Masuk</th>\n      <th>Keluar</th>")
        .join("\n      ")}</tr>`
    : "";

  const bodyRows = data.rows.length
    ? data.rows
        .map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
                            <td class="data-cell label" style="text-align: center;">${escapeHtml(formatTanggalPendek(row.date))}</td>
                            ${data.columns.map((column) => {
                              const cell = row.cells[column] ?? { in: 0, out: 0 };
                              return `<td class="data-cell number">${escapeHtml(formatMovement(cell.in))}</td>
                            <td class="data-cell number">${escapeHtml(formatMovement(cell.out))}</td>`;
                            }).join("\n                            ")}
                          </tr>`)
        .join("\n")
    : `<tr class="data-row row-odd"><td colspan="${1 + data.columns.length * 2}" style="text-align: center;">Data tidak tersedia.</td></tr>`;

  const sAkhirCells = data.columns
    .map((column) => `<td class="number">${escapeHtml(formatBalance(data.sAkhirByColumn[column] ?? 0))}</td>
                              <td class="number">${escapeHtml(formatPercent(data.percentByColumn[column] ?? 0))}</td>`)
    .join("\n                              ");
  const ctrCells = data.columns
    .map((column) => `<td class="number" colspan="2" style="text-align: center;">${escapeHtml(formatCtr(data.ctrByColumn[column] ?? 0))}</td>`)
    .join("\n                              ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 58px;">Tanggal</th>
      ${groupHeaders}
    </tr>
    ${secondHeader}
  </thead>
  <tbody>
    ${bodyRows}
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
</table>`;
};

const buildSummaryTable = (data: DashboardData): string =>
  `<p class="section-title">Total</p>
<table class="summary-table">
  <tr class="totals-row">
    <td class="label" style="width: 90px;">S Akhir</td>
    <td class="number">${escapeHtml(formatBalance(data.totals.sAkhir))}</td>
  </tr>
  <tr class="totals-row">
    <td class="label"># Ctr</td>
    <td class="number">${escapeHtml(formatCtr(data.totals.ctr))}</td>
  </tr>
</table>`;

export const dashboardCrossCutAkhirReport: ReportDefinition<
  PeriodParams,
  DashboardData
> = {
  type: "dashboard-cross-cut-akhir",
  title: REPORT_TITLE,
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapDashboardCCAkhir");

    const recordset = Array.isArray(result.recordsets)
      ? result.recordsets[0] ?? result.recordset ?? []
      : result.recordset ?? [];
    return buildViewModel(
      recordset as unknown as DashboardCcRow[],
      params.tglAwal,
      params.tglAkhir,
    );
  },

  render(data, meta) {
    const subtitle = `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`;
    return renderWpsReportPage({
      title: REPORT_TITLE,
      subtitle,
      bodyHtml: `${buildMainTable(data)}\n${buildSummaryTable(data)}`,
      extraCss: DASHBOARD_CC_CSS,
      printedBy: meta.requestedBy || "sistem",
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
