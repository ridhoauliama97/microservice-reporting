import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapRekapMutasiV2 — "Laporan Discrepancy Rekap Mutasi". Ported from
 * DiscrepancyRekapMutasiReportService and
 * discrepancy-rekap-mutasi-pdf.blade.php.
 *
 * The stored procedure is called three times with a different @UsingMode, and
 * each call feeds a different section:
 *
 *   mode 1  whole period      -> "Stock (Non SPK)", one row per day
 *   mode 2  end date only     -> "Stock Ber-SPK", a single snapshot row
 *   mode 3  whole period      -> "Stock Total" plus the "Statistik Stock"
 *                               table (Avg / Min / Max)
 *
 * UsingMode is an internal switch of the report, not a user-facing parameter,
 * so the API takes only the period. The SP's TotalAkhir column is never
 * displayed; only the ten product columns below are.
 */

type Metrics = Record<string, number | null>;

/** SP column -> header label, in display order. */
const DISPLAY_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["KB", "Zero Kayu Bulat"],
  ["KBKG", "Zero Kayu Bulat KG"],
  ["ST", "Stock Sawn Timber"],
  ["S4S", "Zero S4S"],
  ["FJ", "Zero Finger Joint"],
  ["MLD", "Zero Moulding"],
  ["LMT", "Zero Laminating"],
  ["CCAkhir", "Zero CCAkhir"],
  ["SAND", "Zero Sanding"],
  ["BJadi", "Zero Barang Jadi"],
];

const COLUMN_KEYS = DISPLAY_COLUMNS.map(([key]) => key);
const COLUMN_LABELS = DISPLAY_COLUMNS.map(([, label]) => label);
/** KBKG is head-count/weight, so it prints as a whole number. */
const KG_COLUMN = "KBKG";

interface MutasiV2Row extends Record<string, unknown> {
  Tanggal: unknown;
}

interface DiscrepancyData {
  nonSpkRows: Array<{ day: string; metrics: Metrics }>;
  berSpkRow: Metrics | null;
  totalRow: Metrics | null;
  statRows: Array<{ label: string; metrics: Metrics }>;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/**
 * Legacy toFloat: accepts numbers and numeric strings, and for strings
 * disambiguates "1.234,56" (European) from "1,234.56" (US) by looking at
 * which separator comes last.
 */
const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let normalized = value.trim();
  if (normalized === "") return null;
  normalized = normalized.replace(/ /g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    normalized = normalized.replace(/,/g, ".");
  }

  return Number.isFinite(Number(normalized)) ? Number(normalized) : null;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmt: four decimals, no blank-at-zero. Null prints empty. */
const fmt = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 4);

const fmtKg = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 0);

const formatMetric = (key: string, value: number | null): string =>
  key === KG_COLUMN ? fmtKg(value) : fmt(value);

/** "01".."31", from date('d', ...) in the legacy service. */
const dayLabel = (value: unknown): string => {
  if (value instanceof Date) return String(value.getDate()).padStart(2, "0");
  const iso = /^(\d{4}-\d{2})-(\d{2})/.exec(toText(value));
  return iso ? iso[2]! : "";
};

const readMetrics = (row: Record<string, unknown> | undefined): Metrics => {
  const metrics: Metrics = {};
  for (const key of COLUMN_KEYS) metrics[key] = toFloat(row?.[key]);
  return metrics;
};

export function buildDiscrepancyData(
  nonSpkRaw: MutasiV2Row[],
  berSpkRaw: MutasiV2Row[],
  statsRaw: MutasiV2Row[],
): DiscrepancyData {
  const nonSpkRows = nonSpkRaw.map((row) => ({
    day: dayLabel(row.Tanggal),
    metrics: readMetrics(row),
  }));

  const berSpkRow = berSpkRaw.length > 0 ? readMetrics(berSpkRaw[0]) : null;

  const statRows: DiscrepancyData["statRows"] =
    statsRaw.length === 0
      ? []
      : (["Avg", "Min", "Max"] as const).map((label) => {
          const metrics: Metrics = {};
          for (const key of COLUMN_KEYS) {
            const values = statsRaw
              .map((row) => toFloat(row[key]))
              .filter((value): value is number => value !== null);
            if (values.length === 0) {
              metrics[key] = null;
            } else if (label === "Avg") {
              metrics[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
            } else if (label === "Min") {
              metrics[key] = Math.min(...values);
            } else {
              metrics[key] = Math.max(...values);
            }
          }
          return { label, metrics };
        });

  // With stats rows available the total is simply the last stats row; only if
  // there are none does it fall back to adding the Ber-SPK snapshot onto the
  // last non-SPK day.
  let totalRow: Metrics | null = null;
  if (statsRaw.length > 0) {
    totalRow = readMetrics(statsRaw[statsRaw.length - 1]);
  } else if (berSpkRow && nonSpkRows.length > 0) {
    totalRow = {};
    for (const key of COLUMN_KEYS) {
      totalRow[key] = (nonSpkRows[nonSpkRows.length - 1]!.metrics[key] ?? 0) + (berSpkRow[key] ?? 0);
    }
  }

  return { nonSpkRows, berSpkRow, totalRow, statRows };
}

const buildHeader = (): string => `<thead>
      <tr class="headers-row">
        <th style="width: 46px;"></th>
        ${COLUMN_LABELS.map((label) => `<th>${escapeHtml(label)}</th>`).join("\n        ")}
      </tr>
    </thead>`;

const metricCells = (metrics: Metrics): string =>
  COLUMN_KEYS.map((key) => `<td class="number">${escapeHtml(formatMetric(key, metrics[key] ?? null))}</td>`).join(
    "\n        ",
  );

/** One section table: header plus either its rows or the shared empty state. */
const buildSectionTable = (bodyRows: string): string =>
  `<table class="report-table">
    ${buildHeader()}
    <tbody>
      ${bodyRows || buildEmptyTableRow(1 + COLUMN_KEYS.length)}
    </tbody>
  </table>`;

export const discrepancyRekapMutasiReport: ReportDefinition<PeriodParams, DiscrepancyData> = {
  type: "discrepancy-rekap-mutasi",
  title: "Laporan Discrepancy Rekap Mutasi",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const run = async (tglAwal: string, tglAkhir: string, mode: number): Promise<MutasiV2Row[]> => {
      const result = await conn
        .request()
        .input("TglAwal", sql.Date, tglAwal)
        .input("TglAkhir", sql.Date, tglAkhir)
        .input("UsingMode", sql.TinyInt, mode)
        .execute("SP_LapRekapMutasiV2");
      return (result.recordset ?? []) as MutasiV2Row[];
    };

    // Mode 2 is a snapshot: it is called with the end date on both sides.
    const [nonSpkRaw, berSpkRaw, statsRaw] = await Promise.all([
      run(params.tglAwal, params.tglAkhir, 1),
      run(params.tglAkhir, params.tglAkhir, 2),
      run(params.tglAwal, params.tglAkhir, 3),
    ]);

    return buildDiscrepancyData(nonSpkRaw, berSpkRaw, statsRaw);
  },

  render(data, meta) {
    const nonSpkBody = data.nonSpkRows
      .map(
        (row, index) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(row.day)}</td>
        ${metricCells(row.metrics)}
      </tr>`,
      )
      .join("\n      ");

    const berSpkBody = data.berSpkRow
      ? `<tr class="totals-row">
        <td class="center">Total</td>
        ${metricCells(data.berSpkRow)}
      </tr>`
      : "";

    const totalBody = data.totalRow
      ? `<tr class="totals-row">
        <td class="center">Total</td>
        ${metricCells(data.totalRow)}
      </tr>`
      : "";

    const statBody = data.statRows
      .map(
        (row, index) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(row.label)}</td>
        ${metricCells(row.metrics)}
      </tr>`,
      )
      .join("\n      ");

    const statsSection =
      data.statRows.length > 0
        ? `<div class="section-title">Statistik Stock</div>
  <table class="report-table stats-table">
    ${buildHeader()}
    <tbody>
      ${statBody}
    </tbody>
  </table>`
        : "";

    const bodyHtml = `<div class="section-title">Stock (Non SPK)</div>
  ${buildSectionTable(nonSpkBody)}
  <div class="section-title">Stock Ber-SPK</div>
  ${buildSectionTable(berSpkBody)}
  <div class="section-title">Stock Total</div>
  ${buildSectionTable(totalBody)}
  ${statsSection}`;

    return renderWpsReportPage({
      title: "Laporan Discrepancy Rekap Mutasi",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "discrepancy_rekap_mutasi",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
