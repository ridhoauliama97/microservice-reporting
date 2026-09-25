import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTable, buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SPWps_LapDashboardReproses — "Laporan Dashboard Reproses".
 *
 * The legacy resolver maps daily inflow from ReprosesMasuk, daily outflow
 * from KeluarALL, and ending balance from ReprosesAkhir. Ending balances are
 * kept per product + grade first, then summed by product. CTR is calculated
 * as ending balance / 65; the SP CTR column is not used by this legacy view.
 */

interface DashboardReprosesRow extends Record<string, unknown> {
  DATE: Date | string | null;
  Jenis: string | null;
  NamaGrade: string | null;
  idGrade: string | number | null;
  ReprosesMasuk: number | string | null;
  KeluarALL: number | string | null;
  ReprosesAkhir: number | string | null;
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
  totals: { sAkhir: number; ctr: number };
}

const REPORT_TITLE = "Laporan Dashboard Reproses";
const CTR_DIVISOR = 65;
const COLUMN_ORDER = [
  "JABON A/A",
  "JABON ISOBO",
  "JABON NISOBO",
  "JABON TASOBO",
  "PULAI ISOBO",
  "PULAI NISOBO",
  "PULAI TASOBO",
  "RAMBUNG A/A",
  "RAMBUNG A/B",
  "RAMBUNG C/C",
];

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  let normalized = value.trim();
  if (normalized === "") return 0;
  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replaceAll(".", "").replaceAll(",", ".")
      : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
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
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (match) {
    return `${match[1].padStart(4, "0")}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
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

const applyColumnOrder = (keys: string[]): string[] => {
  const sorted = [...new Set(keys)].sort(compareText);
  const ordered = COLUMN_ORDER.filter((key) => sorted.includes(key));
  return [...ordered, ...sorted.filter((key) => !ordered.includes(key))];
};

export function buildViewModel(
  rows: DashboardReprosesRow[],
  startDate = "",
  endDate = "",
): DashboardData {
  if (rows.length === 0) {
    return {
      dates: [],
      columns: [],
      rows: [],
      sAkhirByColumn: {},
      percentByColumn: {},
      ctrByColumn: {},
      totals: { sAkhir: 0, ctr: 0 },
    };
  }

  const dateMap = new Set<string>();
  const daily = new Map<string, Map<string, DashboardCell>>();
  const allKeys = new Set<string>();
  const latestByKeyAndGrade = new Map<string, Map<string, { date: string; value: number }>>();

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
    cell.in += toFloat(row.ReprosesMasuk);
    cell.out += toFloat(row.KeluarALL);
    dateCells.set(key, cell);

    let latestByGrade = latestByKeyAndGrade.get(key);
    if (!latestByGrade) {
      latestByGrade = new Map();
      latestByKeyAndGrade.set(key, latestByGrade);
    }
    const gradeKey = String(row.idGrade ?? row.NamaGrade ?? "__DEFAULT__").trim() || "__DEFAULT__";
    const latest = latestByGrade.get(gradeKey);
    if (!latest || date >= latest.date) {
      latestByGrade.set(gradeKey, { date, value: toFloat(row.ReprosesAkhir) });
    }
  }

  const dates = [...dateMap].sort(compareText);
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
    const latest = latestByKeyAndGrade.get(key);
    const sAkhir = [...(latest?.values() ?? [])].reduce(
      (sum, item) => sum + item.value,
      0,
    );
    const ctr = sAkhir / CTR_DIVISOR;
    sAkhirByColumn[key] = sAkhir;
    ctrByColumn[key] = ctr;
    sAkhirTotal += sAkhir;
    ctrTotal += ctr;
  }

  const percentByColumn: Record<string, number> = {};
  for (const key of columns) {
    percentByColumn[key] = sAkhirTotal > 0 ? (sAkhirByColumn[key] / sAkhirTotal) * 100 : 0;
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
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const formatMovement = (value: number): string =>
  formatNumber(value, 1, { blankWhenZero: true });
const formatBalance = (value: number): string =>
  formatNumber(value, 1, { blankWhenZero: true });
const formatPercent = (value: number): string => `${formatNumber(value, 1)}%`;
const formatPercentForBalance = (balance: number, percent: number): string =>
  Math.abs(balance) < 0.0000001 ? "" : formatPercent(percent);
const formatCtr = (value: number): string =>
  formatNumber(value, 2, { blankWhenZero: true });
const formatTotal = (value: number): string => formatNumber(value, 2);

const formatHeaderLabel = (value: string): string =>
  escapeHtml(value).replaceAll(" ", "<br>");

const buildMainTable = (data: DashboardData, columns: string[] = data.columns): string => {
  const numericColumnCount = columns.length * 2;
  const dateColumnWidth = numericColumnCount > 0 ? 8 : 100;
  const numericColumnWidth = numericColumnCount > 0 ? 92 / numericColumnCount : 0;
  const colgroup = `<colgroup>
    <col style="width: ${dateColumnWidth}%;" />
    ${Array.from({ length: numericColumnCount }, () => `<col style="width: ${numericColumnWidth}%;" />`).join("\n    ")}
  </colgroup>`;
  const groupHeaders = columns
    .map((column) => `<th colspan="2">${formatHeaderLabel(column)}</th>`)
    .join("\n      ");
  const secondHeader = columns.length
    ? `<tr class="headers-row">${columns
        .map(() => "<th>Masuk</th>\n      <th>Keluar</th>")
        .join("\n      ")}</tr>`
    : "";
  const bodyRows = data.rows.length
    ? data.rows
        .map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
          <td class="data-cell label center">${escapeHtml(formatTanggalPendek(row.date))}</td>
          ${columns.map((column) => {
            const cell = row.cells[column] ?? { in: 0, out: 0 };
            return `<td class="data-cell number">${escapeHtml(formatMovement(cell.in))}</td>
            <td class="data-cell number">${escapeHtml(formatMovement(cell.out))}</td>`;
          }).join("\n          ")}
        </tr>`)
        .join("\n")
    : buildEmptyTableRow(1 + columns.length * 2);
  const sAkhirCells = columns
    .map((column) => {
      const balance = data.sAkhirByColumn[column] ?? 0;
      const percent = data.percentByColumn[column] ?? 0;
      return `<td class="number">${escapeHtml(formatBalance(balance))}</td>
      <td class="number">${escapeHtml(formatPercentForBalance(balance, percent))}</td>`;
    })
    .join("\n      ");
  const ctrCells = columns
    .map((column) => `<td class="number center" colspan="2">${escapeHtml(formatCtr(data.ctrByColumn[column] ?? 0))}</td>`)
    .join("\n      ");

  return `<table class="report-table dashboard-reproses-table">
  ${colgroup}
  <thead>
    <tr class="headers-row">
      <th rowspan="2">Tanggal</th>
      ${groupHeaders}
    </tr>
    ${secondHeader}
  </thead>
  <tbody>${bodyRows}</tbody>
  <tfoot>
    <tr class="totals-row"><td class="label">S Akhir</td>${sAkhirCells}</tr>
    <tr class="totals-row"><td class="label"># Ctr</td>${ctrCells}</tr>
    ${data.rows.length > 0
      ? `<tr class="table-end-line"><td colspan="${1 + columns.length * 2}"></td></tr>`
      : ""}
  </tfoot>
</table>`;
};

const buildMainTables = (data: DashboardData): string => {
  const maxColumnsPerTable = data.columns.length > 14 ? 10 : data.columns.length;
  if (maxColumnsPerTable === 0) return buildMainTable(data, []);

  const chunks: string[][] = [];
  for (let index = 0; index < data.columns.length; index += maxColumnsPerTable) {
    chunks.push(data.columns.slice(index, index + maxColumnsPerTable));
  }

  return chunks
    .map((columns, index) => {
      const label = chunks.length > 1
        ? `<p class="section-title">Dashboard Reproses — Bagian ${index + 1} dari ${chunks.length}</p>\n`
        : "";
      return `${label}${buildMainTable(data, columns)}`;
    })
    .join("\n");
};

const buildSummaryTable = (data: DashboardData): string =>
  `<p class="section-title">Total</p>
<table class="summary-table">
  <tr class="totals-row"><td class="label summary-label">S Akhir</td><td class="number">${escapeHtml(formatTotal(data.totals.sAkhir))}</td></tr>
  <tr class="totals-row"><td class="label"># Ctr</td><td class="number">${escapeHtml(formatTotal(data.totals.ctr))}</td></tr>
</table>`;

export const dashboardReprosesReport: ReportDefinition<
  PeriodParams,
  DashboardData
> = {
  type: "dashboard-reproses",
  title: REPORT_TITLE,
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SPWps_LapDashboardReproses");
    const recordset = Array.isArray(result.recordsets)
      ? result.recordsets[0] ?? result.recordset ?? []
      : result.recordset ?? [];
    return buildViewModel(
      recordset as DashboardReprosesRow[],
      params.tglAwal,
      params.tglAkhir,
    );
  },

  render(data, meta) {
    const hasData = data.columns.length > 0 && data.rows.length > 0;
    const bodyHtml = hasData
      ? `${buildMainTables(data)}\n${buildSummaryTable(data)}`
      : buildEmptyTable(1, "dashboard-reproses-table");
    return renderWpsReportPage({
      title: REPORT_TITLE,
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "dashboard_reproses",
      landscape: true,
      printedBy: meta.requestedBy || "sistem",
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
