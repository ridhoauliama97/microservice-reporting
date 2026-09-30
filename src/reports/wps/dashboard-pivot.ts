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
 * Shared factory for the WPS "dashboard" reports: a daily movement grid
 * (Masuk / Keluar per jenis+grade) with an ending-balance and CTR footer.
 *
 * CCAkhir and Finger Joint use the same layout and the same legacy column
 * semantics; only the stored procedure and the source column names differ.
 * The legacy services (DashboardCrossCutAkhirReportService and
 * DashboardFingerJointReportService) are the same code with a different SP,
 * so the pivot lives here once and each report supplies its own mapping.
 *
 * Ported from cross-cut-akhir-pdf.blade.php / finger-joint-pdf.blade.php.
 */

export interface DashboardRow extends Record<string, unknown> {
  DATE: Date | string | null;
  Jenis: string | null;
  /**
   * Optional: the m3 dashboards key their columns on Jenis + NamaGrade, but
   * SPWps_LapDashboardSawnTimber has no grade column and keys on Jenis alone.
   * A missing grade contributes an empty token, so the key is just the Jenis.
   */
  NamaGrade?: string | null;
}

export interface DashboardCell {
  in: number;
  out: number;
}

export interface DashboardGridRow {
  date: string;
  cells: Record<string, DashboardCell>;
}

export interface DashboardData {
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

export interface DashboardReportOptions {
  /** Registry key, e.g. "dashboard-finger-joint". */
  type: string;
  title: string;
  storedProcedure: string;
  /** Source columns the pivot reads. Legacy renames these per product. */
  columns: {
    inflow: string;
    outflow: string;
    balance: string;
    ctr: string;
  };
  /**
   * Legacy config/reports.php `column_order`. Missing live keys are appended
   * in the service's alphabetical order after these configured keys.
   */
  columnOrder: string[];
  /** Legacy `ctr_divisor`, only used when the SP has no CTR column. */
  ctrDivisor: number;
  style: Parameters<typeof renderWpsReportPage>[0]["style"];
  /**
   * Landscape for the wide variants. The m3 dashboards carry 8-13 product
   * columns and fit portrait; the Sawn Timber dashboard has ten ST types, so 21
   * columns land in portrait only just inside the page and the figures get
   * cramped.
   */
  landscape?: boolean;
}

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

// Both legacy services uppercase, collapse whitespace and rewrite the FJLB
// typo to FILB, so a "FJLB A/A" and "FILB A/A" land in the same column.
const normalizeDisplayToken = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("FJLB", "FILB")
    .replace(/\s+/g, " ")
    .trim();

const buildDisplayKey = (jenis: unknown, grade: unknown): string =>
  `${normalizeDisplayToken(jenis)} ${normalizeDisplayToken(grade)}`.trim();

const applyColumnOrder = (keys: string[], columnOrder: string[]): string[] => {
  const sorted = [...new Set(keys)].sort(compareText);
  const ordered = columnOrder.filter((key) => sorted.includes(key));
  const remaining = sorted.filter((key) => !ordered.includes(key));
  return [...ordered, ...remaining];
};

/** Builds the pivot consumed by the legacy dashboard layout. */
export function buildDashboardPivot(
  rows: DashboardRow[],
  options: Pick<DashboardReportOptions, "columns" | "columnOrder" | "ctrDivisor">,
): DashboardData {
  const { inflow, outflow, balance, ctr } = options.columns;
  const dateMap = new Set<string>();
  const daily = new Map<string, Map<string, DashboardCell>>();
  const allKeys = new Set<string>();
  const latestByKey = new Map<string, { date: string; value: number }>();
  const ctrSumByKey = new Map<string, number>();
  const hasCtrColumn = rows.some((row) =>
    Object.prototype.hasOwnProperty.call(row, ctr),
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
    cell.in += toFloat(row[inflow]);
    cell.out += toFloat(row[outflow]);
    dateCells.set(key, cell);

    const latest = latestByKey.get(key);
    const value = toFloat(row[balance]);
    if (!latest || date >= latest.date) latestByKey.set(key, { date, value });

    if (hasCtrColumn) {
      ctrSumByKey.set(key, (ctrSumByKey.get(key) ?? 0) + toFloat(row[ctr]));
    }
  }

  const dates = allKeys.size > 0 && dateMap.size > 0
    ? [...dateMap].sort(compareText)
    : [];
  const columns = applyColumnOrder([...allKeys], options.columnOrder);

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
    const columnCtr = hasCtrColumn
      ? (ctrSumByKey.get(key) ?? 0)
      : sAkhir / options.ctrDivisor;
    sAkhirByColumn[key] = sAkhir;
    ctrByColumn[key] = columnCtr;
    sAkhirTotal += sAkhir;
    ctrTotal += columnCtr;
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
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const formatMovement = (value: number): string =>
  formatNumber(value, 1, { blankWhenZero: true });

const formatBalance = (value: number): string => formatNumber(value, 1);
const formatCtr = (value: number): string => formatNumber(value, 2);
const formatPercent = (value: number): string => `${formatNumber(value, 1)}%`;

const buildMainTable = (data: DashboardData): string => {
  const groupHeaders = data.columns
    .map((column) => `<th colspan="2">${escapeHtml(column)}</th>`)
    .join("\n      ");
  const secondHeader = data.columns.length
    ? `<tr class="headers-row">${data.columns
        .map(() => "<th>Masuk</th>\n      <th>Keluar</th>")
        .join("\n      ")}</tr>`
    : "";

  const bodyRows = data.columns.length > 0 && data.rows.length > 0
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
    : buildEmptyTableRow(1 + data.columns.length * 2);

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

export function createDashboardPivotReport(
  options: DashboardReportOptions,
): ReportDefinition<PeriodParams, DashboardData> {
  return {
    type: options.type,
    title: options.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute(options.storedProcedure);

      const recordset = Array.isArray(result.recordsets)
        ? result.recordsets[0] ?? result.recordset ?? []
        : result.recordset ?? [];
      return buildDashboardPivot(recordset as unknown as DashboardRow[], options);
    },

    render(data, meta) {
      const subtitle = `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`;
      const hasData = data.columns.length > 0 && data.rows.length > 0;
      const bodyHtml = hasData
        ? `${buildMainTable(data)}\n${buildSummaryTable(data)}`
        : buildEmptyTable(1 + data.columns.length * 2);
      return renderWpsReportPage({
        title: options.title,
        subtitle,
        bodyHtml,
        style: options.style,
        landscape: options.landscape,
        printedBy: meta.requestedBy || "sistem",
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}
