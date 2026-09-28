/**
 * Shared pieces for the two reports built on the "rekap mutasi" family of
 * stored procedures: "Discrepancy Rekap Mutasi" (SP_LapRekapMutasiV2, called
 * three times with different @UsingMode) and "Rekap Mutasi (Cross Tab)"
 * (SP_LapRekapMutasi, called once).
 *
 * Both present the same ten product balances under the same headers, parse
 * numbers with the same localised rule and format KBKG as a whole number, so
 * that mapping lives here rather than being written twice.
 */

import { escapeHtml, formatNumber } from "../../templates/html";

export type Metrics = Record<string, number | null>;

/** Stored-procedure column -> header label, in display order. */
export const DISPLAY_COLUMNS: ReadonlyArray<readonly [string, string]> = [
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

export const COLUMN_KEYS = DISPLAY_COLUMNS.map(([key]) => key);
export const COLUMN_LABELS = DISPLAY_COLUMNS.map(([, label]) => label);

/** KBKG is a head-count in kilograms, so it prints as a whole number. */
const KG_COLUMN = "KBKG";

/**
 * Legacy toFloat. Accepts numbers and numeric strings, and for strings
 * disambiguates "1.234,56" (European) from "1,234.56" (US) by looking at which
 * separator comes last, so a string-typed column keeps working.
 */
export const toLocalizedFloat = (value: unknown): number | null => {
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

/** Day-of-month as a zero-padded string, from date('d', ...) in the legacy code. */
export const dayLabel = (value: unknown): string => {
  if (value instanceof Date) return String(value.getDate()).padStart(2, "0");
  const iso = /^(\d{4}-\d{2})-(\d{2})/.exec(
    value === null || value === undefined ? "" : String(value).trim(),
  );
  return iso ? iso[2]! : "";
};

/** Four decimals, or whole numbers for KBKG. Null prints empty. */
export const formatMetric = (key: string, value: number | null): string => {
  if (value === null) return "";
  return formatNumber(value, key === KG_COLUMN ? 0 : 4);
};

/** Projects one raw row onto the ten display columns. */
export const readMetrics = (row: Record<string, unknown> | undefined): Metrics => {
  const metrics: Metrics = {};
  for (const key of COLUMN_KEYS) metrics[key] = toLocalizedFloat(row?.[key]);
  return metrics;
};

export const metricCells = (metrics: Metrics): string =>
  COLUMN_KEYS.map(
    (key) => `<td class="number">${formatMetric(key, metrics[key] ?? null)}</td>`,
  ).join("\n        ");

/**
 * Avg / Min / Max per column, computed over the rows that actually carry a
 * number for that column. Returns [] for an empty input.
 */
export function buildStatRows(rows: Array<Record<string, unknown>>): Array<{
  label: string;
  metrics: Metrics;
}> {
  if (rows.length === 0) return [];

  return (["Avg", "Min", "Max"] as const).map((label) => {
    const metrics: Metrics = {};
    for (const key of COLUMN_KEYS) {
      const values = rows
        .map((row) => toLocalizedFloat(row[key]))
        .filter((value): value is number => value !== null);
      if (values.length === 0) metrics[key] = null;
      else if (label === "Avg")
        metrics[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
      else if (label === "Min") metrics[key] = Math.min(...values);
      else metrics[key] = Math.max(...values);
    }
    return { label, metrics };
  });
}

/** The shared header block: a label cell plus the ten product headers. */
export const buildDisplayHeader = (firstLabel = "", firstWidth = "42px"): string => `<thead>
      <tr class="headers-row">
        <th style="width: ${escapeHtml(firstWidth)};">${escapeHtml(firstLabel)}</th>
        ${COLUMN_LABELS.map((label) => `<th>${escapeHtml(label)}</th>`).join("\n        ")}
      </tr>
    </thead>`;
