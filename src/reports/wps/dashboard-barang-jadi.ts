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

export interface DashboardBarangJadiRow extends Record<string, unknown> {
  DATE: Date | string | null;
  Jenis: string | null;
  NamaBarangJadi: string | null;
  MasukALL: number | string | null;
  KeluarALL: number | string | null;
  Akhir: number | string | null;
  CTR: number | string | null;
}

export interface DashboardBarangJadiCell {
  in: number;
  out: number;
}

export interface DashboardBarangJadiGridRow {
  date: string;
  cells: Record<string, DashboardBarangJadiCell>;
}

export interface DashboardBarangJadiData {
  dates: string[];
  columns: string[];
  rows: DashboardBarangJadiGridRow[];
  sAkhirByColumn: Record<string, number>;
  percentByColumn: Record<string, number>;
  ctrByColumn: Record<string, number>;
  totals: {
    sAkhir: number;
    ctr: number;
  };
}

const REPORT_TITLE = "Laporan Dashboard Barang Jadi";
const CTR_DIVISOR = 65;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const toFloat = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }

  let normalized = value.trim();
  if (normalized === "") {
    return 0;
  }

  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");
  if (hasDot && hasComma) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replaceAll(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (hasComma) {
    normalized = normalized.replaceAll(",", ".");
  } else {
    normalized = normalized.replaceAll(",", "");
  }

  const numericMatch = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
    normalized,
  );
  const parsed = Number(numericMatch?.[0] ?? normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveDateValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    const year = String(value.getFullYear()).padStart(4, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (raw === "") {
    return null;
  }

  const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (isoDate) {
    const year = isoDate[1].padStart(4, "0");
    const month = isoDate[2].padStart(2, "0");
    const day = isoDate[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDisplayToken = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("FJLB", "FILB")
    .replace(/\s+/g, " ")
    .trim();

const buildDisplayKey = (jenis: unknown, barangJadi: unknown): string =>
  `${normalizeDisplayToken(jenis)} ${normalizeDisplayToken(barangJadi)}`.trim();

/**
 * Converts the first result set from SPWps_LapDashboardBJ into the pivot
 * consumed by the Blade layout.
 *
 * The legacy resolver chooses MasukALL and KeluarALL for the two movement
 * columns, and chooses Akhir (not Akhir2) for the ending balance. The legacy
 * service does not recompute a running balance from Awal/MasukALL/KeluarALL;
 * it takes the latest row's Akhir instead. CTR is summed from every row; it
 * is not replaced by the fallback unless the CTR column is absent altogether,
 * matching the legacy resolver's behaviour.
 */
export function buildViewModel(
  rows: DashboardBarangJadiRow[],
  startDate = "",
  endDate = "",
): DashboardBarangJadiData {
  const dateMap = new Set<string>();
  const daily = new Map<string, Map<string, DashboardBarangJadiCell>>();
  const allKeys = new Set<string>();
  const latestByKey = new Map<string, { date: string; sAkhir: number }>();
  const ctrSumByKey = new Map<string, number>();
  const hasCtrColumn = rows.some((row) =>
    Object.prototype.hasOwnProperty.call(row, "CTR"),
  );

  for (const row of rows) {
    const date = resolveDateValue(row.DATE);
    if (date === null) {
      continue;
    }

    const key = buildDisplayKey(row.Jenis, row.NamaBarangJadi);
    if (key === "") {
      continue;
    }

    dateMap.add(date);
    allKeys.add(key);

    let dateCells = daily.get(date);
    if (!dateCells) {
      dateCells = new Map<string, DashboardBarangJadiCell>();
      daily.set(date, dateCells);
    }
    const currentCell = dateCells.get(key) ?? { in: 0, out: 0 };
    currentCell.in += toFloat(row.MasukALL);
    currentCell.out += toFloat(row.KeluarALL);
    dateCells.set(key, currentCell);

    const sAkhir = toFloat(row.Akhir);
    const currentLatest = latestByKey.get(key);
    if (!currentLatest || date >= currentLatest.date) {
      latestByKey.set(key, { date, sAkhir });
    }

    if (hasCtrColumn) {
      ctrSumByKey.set(
        key,
        (ctrSumByKey.get(key) ?? 0) + toFloat(row.CTR),
      );
    }
  }

  const dates =
    allKeys.size > 0 && dateMap.size > 0
      ? [...dateMap].sort(compareText)
      : [];
  const columns = [...allKeys].sort(compareText);
  const gridRows: DashboardBarangJadiGridRow[] = dates.map((date) => {
    const cells: Record<string, DashboardBarangJadiCell> = {};
    for (const key of columns) {
      const cell = daily.get(date)?.get(key) ?? { in: 0, out: 0 };
      cells[key] = { in: cell.in, out: cell.out };
    }
    return { date, cells };
  });

  const sAkhirByColumn: Record<string, number> = {};
  const ctrByColumn: Record<string, number> = {};
  let sAkhirTotal = 0;
  let ctrTotal = 0;

  for (const key of columns) {
    const sAkhir = latestByKey.get(key)?.sAkhir ?? 0;
    const ctr = hasCtrColumn
      ? (ctrSumByKey.get(key) ?? 0)
      : sAkhir / CTR_DIVISOR;
    sAkhirByColumn[key] = sAkhir;
    ctrByColumn[key] = ctr;
    sAkhirTotal += sAkhir;
    ctrTotal += ctr;
  }

  const percentByColumn: Record<string, number> = {};
  for (const key of columns) {
    percentByColumn[key] =
      sAkhirTotal > 0 ? (sAkhirByColumn[key] / sAkhirTotal) * 100 : 0;
  }

  return {
    dates,
    columns,
    rows: gridRows,
    sAkhirByColumn,
    percentByColumn,
    ctrByColumn,
    totals: {
      sAkhir: sAkhirTotal,
      ctr: ctrTotal,
    },
  };
}

export const buildDashboardBarangJadiViewModel = buildViewModel;

const formatMovement = (value: number): string =>
  formatNumber(value, 1, { blankWhenZero: true });

const formatBalance = (value: number): string => formatNumber(value, 2);

const formatPercent = (value: number): string => `${formatNumber(value, 2)}%`;


const buildMainTable = (data: DashboardBarangJadiData): string => {
  const groupHeaders = data.columns
    .map((column) => `<th colspan="2">${escapeHtml(column)}</th>`)
    .join("\n      ");
  const secondHeaderRow = data.columns.length
    ? `<tr class="headers-row">
      ${data.columns
        .map(() => "<th>Masuk</th>\n      <th>Keluar</th>")
        .join("\n      ")}
    </tr>`
    : "";

  const bodyRows = data.columns.length > 0 && data.rows.length > 0
    ? data.rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
                            <td class="data-cell label" style="text-align: center;">${escapeHtml(formatTanggalId(row.date))}</td>
                            ${data.columns
                              .map((column) => {
                                const cell = row.cells[column] ?? { in: 0, out: 0 };
                                return `<td class="data-cell number">${escapeHtml(formatMovement(cell.in))}</td>
                            <td class="data-cell number">${escapeHtml(formatMovement(cell.out))}</td>`;
                              })
                              .join("\n                            ")}
                          </tr>`,
        )
        .join("\n")
    : buildEmptyTableRow(1 + data.columns.length * 2);

  const sAkhirCells = data.columns
    .map(
      (column) => `<td class="number">${escapeHtml(formatBalance(data.sAkhirByColumn[column] ?? 0))}</td>
                              <td class="number">${escapeHtml(formatPercent(data.percentByColumn[column] ?? 0))}</td>`,
    )
    .join("\n                              ");
  const ctrCells = data.columns
    .map(
      (column) => `<td class="number" colspan="2" style="text-align: center;">${escapeHtml(formatBalance(data.ctrByColumn[column] ?? 0))}</td>`,
    )
    .join("\n                              ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 58px;">Tanggal</th>
      ${groupHeaders}
    </tr>
    ${secondHeaderRow}
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

const buildSummaryTable = (data: DashboardBarangJadiData): string =>
  `<p class="section-title">Total</p>
<table class="summary-table" style="width: 230px;">
  <tr class="totals-row">
    <td class="label" style="width: 90px;">S Akhir</td>
    <td class="number" style="width: 70px;">${escapeHtml(formatBalance(data.totals.sAkhir))}</td>
  </tr>
  <tr class="totals-row">
    <td class="label"># Ctr</td>
    <td class="number">${escapeHtml(formatBalance(data.totals.ctr))}</td>
  </tr>
</table>`;

export const dashboardBarangJadiReport: ReportDefinition<
  PeriodParams,
  DashboardBarangJadiData
> = {
  type: "dashboard-barang-jadi",
  title: REPORT_TITLE,
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapDashboardBJ");

    const firstRecordset = Array.isArray(result.recordsets)
      ? result.recordsets[0] ?? result.recordset ?? []
      : result.recordset ?? [];
    return buildViewModel(
      firstRecordset as unknown as DashboardBarangJadiRow[],
      params.tglAwal,
      params.tglAkhir,
    );
  },

  render(data, meta) {
    const subtitle = `Dari ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;
    const hasData = data.columns.length > 0 && data.rows.length > 0;
    const bodyHtml = hasData
      ? `${buildMainTable(data)}\n${buildSummaryTable(data)}`
      : buildEmptyTable(1 + data.columns.length * 2);

    return renderWpsReportPage({
      title: REPORT_TITLE,
      subtitle,
      bodyHtml,
      style: "dashboard_barang_jadi",
      printedBy: meta.requestedBy || "sistem",
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
