import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
} from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition, RenderMeta } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapProduktivitasDashboard — "Laporan Dashboard RU". Ported from
 * DashboardRuReportService and dashboard-ru-pdf.blade.php.
 *
 * The SP takes a single as-of date and returns a long, spreadsheet-shaped
 * result: one row per (day, group, sub-item) with the value in ValueNya. The
 * legacy service pivots that into a matrix, declares a fixed set of nine
 * column groups (44 sub-columns in total), and renders one row per day plus a
 * G.T. and an AVG row, both of which the SP computes itself.
 *
 * Notes on fidelity:
 *
 * - The column groups are a hard-coded list, not derived from the data, so a
 *   group missing from the result renders as a column of blanks. "Saldo ST PBL
 *   Hidup" is one of those today: the SP never returns it. Columns the SP does
 *   return but the list omits (SR-UR, SR-UT) are not displayed.
 * - Values arrive with a comma decimal separator and are normalised to a dot,
 *   keeping their original decimal count. A value of exactly "0" renders blank.
 * - Kiln & Dryer cells keep a leading ">" or "<" and are coloured blue or red.
 *   Stock Kayu Bulat Hidup unit columns turn orange and then red past
 *   thresholds (5/7 for JB-UT, JTG-UT, RB-UT and 15/19 for PL-UT).
 * - "Stock KB Non Pulai" is the grand-total RB figure divided by 100.
 *
 * The legacy service also declares OPTIONAL_COLUMNS, but it is only consulted
 * by its health check, never by the report, so it is not reproduced.
 */

const MONTHS_FULL_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Fixed column layout: source (SP group), header label, and its sub-columns. */
const GROUP_DEFINITIONS: ReadonlyArray<{ source: string; label: string; subs: readonly string[] }> = [
  { source: "Penerimaan Kayu Bulat", label: "Penerimaan Kayu Bulat", subs: ["JB", "JMR", "JTG", "PL", "RB"] },
  { source: "Saldo ST PBL Hidup", label: "ST PBL<br>Hidup", subs: ["RB"] },
  {
    // `source` must match the SP's Seleksi_1 value exactly: a mismatch here
    // silently blanks the whole 15-column group instead of failing loudly.
    source: "Stock Kayu Bulat Hidup",
    label: "Stock Kayu Bulat Hidup",
    subs: [
      "JB", "JB-UR", "JB-UT",
      "JMR", "JMR-UR", "JMR-UT",
      "JTG", "JTG-UR", "JTG-UT",
      "PL", "PL-UR", "PL-UT",
      "RB", "RB-UR", "RB-UT",
    ],
  },
  { source: "Kiln & Dryer", label: "Saldo Kiln & Dryer", subs: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] },
  { source: "Sawmill Bansaw", label: "Sawmill Bansaw", subs: ["Meja", "Ton", "-/+MJ"] },
  { source: "Sawmill SLP", label: "Sawmill SLP", subs: ["Meja", "H.M", "Ton"] },
  { source: "Sawmill SLP 1", label: "Sawmill SLP 1", subs: ["Meja", "H.M", "Btg"] },
  { source: "Vacuum Tube 1", label: "Vacuum Tube 1", subs: ["Chr", "Mnt"] },
  { source: "Vacuum Tube 2", label: "Vacuum Tube 2", subs: ["Chr", "Mnt"] },
];

const STOCK_GROUP_SOURCE = "Stock Kayu Bulat Hidup";
const KILN_GROUP_SOURCE = "Kiln & Dryer";
const STOCK_NON_PULAI_KEY = `${STOCK_GROUP_SOURCE}::RB`;
const FOOTER_LABELS = ["G.T.", "AVG"] as const;

/**
 * Sub-column width in relative units, per group. The legacy blade used a flat
 * 48px for every sub-column, which was too narrow for the groups that carry a
 * longer value or header: the single "ST PBL Hidup" column holds a full
 * balance, the Kiln & Dryer cells hold "JTG-38" or ">RB-44", and Sawmill
 * Bansaw's third header is "-/+MJ". The No column is sized separately below.
 */
const GROUP_SUB_WIDTH: Record<string, number> = {
  "Penerimaan Kayu Bulat": 48,
  "Saldo ST PBL Hidup": 64,
  "Stock Kayu Bulat Hidup": 48,
  "Kiln & Dryer": 54,
  "Sawmill Bansaw": 52,
  "Sawmill SLP": 48,
  "Sawmill SLP 1": 48,
  "Vacuum Tube 1": 48,
  "Vacuum Tube 2": 48,
};

/** Wide enough for the G.T. and AVG labels that legacy's 28px clipped. */
const NO_COLUMN_WIDTH = 56;

interface SubColumn {
  key: string;
  groupSource: string;
  label: string;
  /** Relative width, used to build the colgroup. */
  width: number;
}

interface RuRow extends Record<string, unknown> {
  Tanggal: unknown;
  Seleksi_1: unknown;
  Seleksi_1_Isi: unknown;
  ValueNya: unknown;
}

interface RuCellRow {
  label: string;
  isFooter: boolean;
  cells: Record<string, string>;
}

interface DashboardRuData {
  subColumns: SubColumn[];
  /** Column index where each group starts, for the 2px separator. */
  groupStartIndexes: Set<number>;
  /** Column index where each stock type starts inside the stock group. */
  stockTypeStartIndexes: Set<number>;
  rows: RuCellRow[];
  stockKbNonPulai: number;
}

const paramsSchema = z.object({
  tgl: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
});

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/**
 * Legacy parseLocalizedNumber. Handles a leading ">" / "<" prefix, then decides
 * which of "," / "." is the decimal separator: when both appear the last one
 * wins, when only one appears a trailing group of exactly three digits is
 * treated as a thousands group. Returns the value with its original decimal
 * count so the display can round-trip it.
 */
function parseLocalizedNumber(value: unknown): { value: number; decimals: number; prefix: string } | null {
  let normalized = toText(value);
  if (normalized === "") return null;

  let prefix = "";
  if (normalized.startsWith(">") || normalized.startsWith("<")) {
    prefix = normalized[0]!;
    normalized = normalized.slice(1).trim();
  }
  normalized = normalized.replace(/ /g, "");

  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(normalized)) return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  let decimalSeparator: string | null = null;

  if (lastComma !== -1 && lastDot !== -1) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma !== -1 ? "," : ".";
    const parts = normalized.split(separator);
    if (parts.length > 2) {
      // "1.234.567" is thousands-separated only if every group after the first
      // is exactly three digits.
      const allThousands = parts.slice(1).every((part) => part.length === 3);
      decimalSeparator = allThousands ? null : separator;
    } else if (parts[parts.length - 1]!.length !== 3) {
      decimalSeparator = separator;
    }
  }

  let decimals = 0;
  if (decimalSeparator !== null) {
    decimals = normalized.length - normalized.lastIndexOf(decimalSeparator) - 1;
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandSeparator).join("").split(decimalSeparator).join(".");
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? { value: parsed, decimals, prefix } : null;
}

/** Legacy formatDisplayValue: number_format(value, decimals, '.', ','). */
const formatDisplayValue = (value: string): string => {
  const parsed = parseLocalizedNumber(value);
  if (parsed === null) return value;
  return `${parsed.prefix}${formatNumber(parsed.value, parsed.decimals)}`;
};

/** Legacy normalizeValue: a bare "0" renders as blank. */
const normalizeValue = (value: unknown): string => {
  const normalized = toText(value);
  return normalized === "0" ? "" : formatDisplayValue(normalized);
};

/**
 * The blade's own $parseCellNumber, used only to decide a cell's colour. It is
 * simpler than parseLocalizedNumber: it just drops >, < and spaces, then treats
 * a trailing three-digit group after a lone separator as thousands.
 */
function parseCellNumber(value: string): number | null {
  let normalized = toText(value);
  if (normalized === "") return null;
  normalized = normalized.replace(/[>< ]/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandSeparator).join("").split(decimalSeparator).join(".");
  } else if (lastComma !== -1) {
    const parts = normalized.split(",");
    normalized =
      parts.length === 2 && parts[1]!.length === 3 ? parts.join("") : parts.join(".");
  } else if (lastDot !== -1) {
    const parts = normalized.split(".");
    normalized = parts.length === 2 && parts[1]!.length === 3 ? parts.join("") : normalized;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Colour thresholds for the stock group's unit ("-UT") columns. */
const UT_THRESHOLDS: Record<string, [number, number]> = {
  "RB-UT": [5, 7],
  "JB-UT": [5, 7],
  "JTG-UT": [5, 7],
  "PL-UT": [15, 19],
};

const cellToneClass = (column: SubColumn, value: string): string => {
  if (column.groupSource === KILN_GROUP_SOURCE) {
    if (value.includes(">")) return " tone-blue";
    if (value.includes("<")) return " tone-red";
    return "";
  }
  if (column.groupSource !== STOCK_GROUP_SOURCE) return "";

  const number = parseCellNumber(value);
  if (number === null) return "";
  const thresholds = UT_THRESHOLDS[column.label];
  if (!thresholds) return "";
  const [orange, red] = thresholds;
  if (number >= red) return " tone-red";
  if (number >= orange) return " tone-orange";
  return "";
};

export function buildDashboardRuData(rows: RuRow[]): DashboardRuData {
  const matrix = new Map<string, Map<string, Map<string, string>>>();
  for (const row of rows) {
    const tanggal = toText(row.Tanggal);
    const group = toText(row.Seleksi_1);
    const sub = toText(row.Seleksi_1_Isi);
    if (tanggal === "" || group === "" || sub === "") continue;

    let byGroup = matrix.get(tanggal);
    if (!byGroup) {
      byGroup = new Map();
      matrix.set(tanggal, byGroup);
    }
    let bySub = byGroup.get(group);
    if (!bySub) {
      bySub = new Map();
      byGroup.set(group, bySub);
    }
    bySub.set(sub, normalizeValue(row.ValueNya));
  }

  const subColumns: SubColumn[] = [];
  const groupStartIndexes = new Set<number>();
  for (const group of GROUP_DEFINITIONS) {
    groupStartIndexes.add(subColumns.length);
    for (const sub of group.subs) {
      subColumns.push({
        key: `${group.source}::${sub}`,
        groupSource: group.source,
        label: sub,
        width: GROUP_SUB_WIDTH[group.source] ?? 48,
      });
    }
  }

  // A thicker rule whenever the stock type changes, e.g. JB / JB-UR / JB-UT.
  const stockTypeStartIndexes = new Set<number>();
  let previousStockType: string | null = null;
  subColumns.forEach((column, index) => {
    if (column.groupSource !== STOCK_GROUP_SOURCE) return;
    const stockType = column.label.split("-")[0]!;
    if (previousStockType !== null && stockType !== previousStockType) {
      stockTypeStartIndexes.add(index);
    }
    previousStockType = stockType;
  });

  // Two-digit labels are days and sort naturally; everything else is a footer.
  const daily: string[] = [];
  const footers: string[] = [];
  for (const label of matrix.keys()) {
    if (/^\d{2}$/.test(label)) daily.push(label);
    else footers.push(label);
  }
  daily.sort((left, right) => Number(left) - Number(right));
  const orderedLabels = [
    ...daily,
    ...FOOTER_LABELS.filter((label) => footers.includes(label)),
  ];

  const builtRows: RuCellRow[] = orderedLabels.map((label) => {
    const byGroup = matrix.get(label);
    const cells: Record<string, string> = {};
    for (const column of subColumns) {
      cells[column.key] = byGroup?.get(column.groupSource)?.get(column.label) ?? "";
    }
    return {
      label,
      isFooter: (FOOTER_LABELS as readonly string[]).includes(label),
      cells,
    };
  });

  const grandTotalRow = builtRows.find((row) => row.label === "G.T.");
  const rb = parseCellNumber(grandTotalRow?.cells[STOCK_NON_PULAI_KEY] ?? "") ?? 0;

  return {
    subColumns,
    groupStartIndexes,
    stockTypeStartIndexes,
    rows: builtRows,
    stockKbNonPulai: rb / 100,
  };
}

/** Legacy formatSummaryDecimal: two decimals and no thousands separator. */
const formatSummaryDecimal = (value: number): string => value.toFixed(2);

export const dashboardRuReport: ReportDefinition<{ tgl: string }, DashboardRuData> = {
  type: "dashboard-ru",
  title: "Laporan Dashboard RU",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("Periode", sql.Date, params.tgl)
      .execute("SP_LapProduktivitasDashboard");
    return buildDashboardRuData((result.recordset ?? []) as RuRow[]);
  },

  render(data, meta: RenderMeta<{ tgl: string }>) {
    // Each sub-column carries its own relative width (see GROUP_SUB_WIDTH), so
    // the colgroup is built from the column list rather than a flat ratio.
    const totalWidth =
      NO_COLUMN_WIDTH + data.subColumns.reduce((sum, column) => sum + column.width, 0);
    const pct = (units: number): string => `${((units / totalWidth) * 100).toFixed(4)}%`;

    const colgroup = `<colgroup>
      <col style="width: ${pct(NO_COLUMN_WIDTH)};">
      ${data.subColumns
        .map((column) => `<col style="width: ${pct(column.width)};">`)
        .join("\n      ")}
    </colgroup>`;

    const groupHeader = GROUP_DEFINITIONS.map(
      (group) =>
        `<th colspan="${group.subs.length}" class="group-start">${renderGroupLabel(group.label)}</th>`,
    );

    const bodyRows = data.rows
      .map(
        (row, index) => `<tr class="${row.isFooter ? "total-row" : (index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
      <td class="center no-column">${escapeHtml(row.label)}</td>
      ${data.subColumns
        .map((column, columnIndex) => {
          const value = row.cells[column.key] ?? "";
          const classes = ["number"];
          if (data.groupStartIndexes.has(columnIndex)) classes.push("group-start");
          if (data.stockTypeStartIndexes.has(columnIndex)) classes.push("stock-type-start");
          classes.push(cellToneClass(column, value).trim());
          return `<td class="${classes.filter(Boolean).join(" ")}">${escapeHtml(value)}</td>`;
        })
        .join("\n        ")}
    </tr>`,
      )
      .join("\n      ");

    const bodyHtml = `<table class="report-table dashboard-ru">
    ${colgroup}
    <thead>
      <tr>
        <th rowspan="2" class="no-column">No</th>
        ${groupHeader.join("\n        ")}
      </tr>
      <tr>
        ${data.subColumns
          .map((column, index) => {
            const classes = ["sub-header"];
            if (data.groupStartIndexes.has(index)) classes.push("group-start");
            if (data.stockTypeStartIndexes.has(index)) classes.push("stock-type-start");
            return `<th class="${classes.join(" ")}">${escapeHtml(column.label)}</th>`;
          })
          .join("\n        ")}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(1 + data.subColumns.length)}
    </tbody>
  </table>
  <div class="section-title">Rangkuman</div>
  <table class="summary-table">
    <tbody>
      <tr>
        <td style="width: 110px;">Stock KB Non Pulai</td>
        <td style="width: 14px;">:</td>
        <td>(tronton)</td>
      </tr>
      <tr>
        <td style="width: 110px;">Total</td>
        <td style="width: 14px;">:</td>
        <td>${escapeHtml(formatSummaryDecimal(data.stockKbNonPulai))}</td>
      </tr>
    </tbody>
  </table>`;

    const parsed = new Date(`${meta.params.tgl}T00:00:00`);
    const periodLabel = Number.isNaN(parsed.getTime())
      ? ""
      : `${MONTHS_FULL_ID[parsed.getMonth()]} ${parsed.getFullYear()}`;

    return renderWpsReportPage({
      // Title only. The legacy blade rendered an empty subtitle element, and the
      // month/year in the heading already says which period this is. Omitting it
      // makes the template give the heading its own bottom gap instead.
      title: `Laporan Dashboard RU ${periodLabel}`,
      bodyHtml,
      style: "dashboard_ru",
      // The legacy blade prints 44 sub-columns on A4 portrait at 7px. Landscape
      // gives each column ~36% more room at a readable size.
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};

/** Escapes each line of a group label, keeping only the <br> separators raw. */
const renderGroupLabel = (label: string): string =>
  label.split("<br>").map(escapeHtml).join("<br>");
