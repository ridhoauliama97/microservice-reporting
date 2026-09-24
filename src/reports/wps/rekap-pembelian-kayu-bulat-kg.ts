import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  MONTHS_SHORT_ID,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapRekapPembelianKayuBulat — "Laporan Rekap Pembelian Kayu Bulat (Ton)
 * - Timbang KG". Year x month pivot (Jan..Des) of monthly purchase tonnage,
 * limited to the last 11 years — the KG sibling of rekap-pembelian-kayu-bulat
 * (legacy RekapPembelianKayuBulatKgReportService +
 * rekap-pembelian-kg-pdf.blade.php). The SP takes no parameters.
 */

const MONTH_LABELS = MONTHS_SHORT_ID; // Jan, Feb, ... Des

/**
 * Column widths sized for the landscape content width (~805px): Tahun + 12
 * month columns + Total. Each month column fits the widest formatted value
 * ("12,757.3950") on one line; nowrap guards against a 2-line split if a
 * future period posts a larger figure.
 */
const YEAR_WIDTH = 52;
const MONTH_WIDTH = 59;
const TOTAL_WIDTH = 86;

/** Keeps every tonnage on a single line (legacy numbers never wrapped). */
const REKAP_PEMBELIAN_CSS = `
  .report-table td.number, .report-table th { white-space: nowrap; }
`;

/** 4 decimals, blank when ~zero (legacy $fmt). */
const fmt = (value: number): string => formatNumber(value, 4, { blankWhenZero: true });

interface YearPivotRow {
  tahun: number;
  months: Record<number, number>;
  total: number;
}

function buildPivot(rows: Array<Record<string, unknown>>): {
  years: YearPivotRow[];
  startYear: number;
  endYear: number;
} {
  const endYear = new Date().getFullYear();
  // Legacy KG variant shows the current year plus 5 previous years (6 rows).
  const startYear = endYear - 5;

  const years = new Map<number, YearPivotRow>();
  for (let year = startYear; year <= endYear; year++) {
    years.set(year, { tahun: year, months: {}, total: 0 });
  }

  for (const raw of rows) {
    const year = Number(raw.Tahun ?? 0);
    const month = Number(raw.Bulan ?? 0);
    const ton = typeof raw.Ton === "number" && Number.isFinite(raw.Ton) ? raw.Ton : 0;
    const entry = years.get(year);
    if (!entry || month < 1 || month > 12) continue;
    entry.months[month] = (entry.months[month] ?? 0) + ton;
    entry.total += ton;
  }

  return {
    years: [...years.values()].sort((a, b) => a.tahun - b.tahun),
    startYear,
    endYear,
  };
}

const buildTableHtml = (years: YearPivotRow[]): string => {
  const monthHeaders = MONTH_LABELS.map(
    (label) => `<th style="width: ${MONTH_WIDTH}px;">${escapeHtml(label)}</th>`,
  ).join("");

  const bodyRows = years
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center" style="width: ${YEAR_WIDTH}px; font-weight: bold; font-size: 11px;">${escapeHtml(String(row.tahun))}</td>
        ${MONTH_LABELS.map(
          (_, monthIndex) => `<td class="number" style="width: ${MONTH_WIDTH}px;">${fmt(row.months[monthIndex + 1] ?? 0)}</td>`,
        ).join("\n        ")}
        <td class="number" style="width: ${TOTAL_WIDTH}px; font-weight: bold; font-size: 11px;">${fmt(row.total)}</td>
      </tr>`,
    )
    .join("\n    ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: ${YEAR_WIDTH}px;">Tahun</th>
      ${monthHeaders}
      <th style="width: ${TOTAL_WIDTH}px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    ${years.length === 0 ? `<tr><td class="center" colspan="${2 + MONTH_LABELS.length}">Tidak ada data.</td></tr>` : ""}
  </tbody>
</table>`;
};

export const rekapPembelianKayuBulatKgReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "rekap-pembelian-kayu-bulat-kg",
  title: "Laporan Rekap Pembelian Kayu Bulat (Ton) - Timbang KG",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    // The SP takes no parameters; the period is part of the API contract for
    // consistency with rekap-pembelian-kayu-bulat (validated, then ignored).
    void params;
    const conn = await pool;
    const result = await conn
      .request()
      .execute("SP_LapRekapPembelianKayuBulat");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const { years, startYear, endYear } = buildPivot(rows);

    return renderWpsReportPage({
      title: "Laporan Rekap Pembelian Kayu Bulat (Ton) - Timbang KG",
      subtitle: `Periode ${startYear} s/d ${endYear}`,
      bodyHtml: buildTableHtml(years),
      // 14 columns (Tahun + 12 bulan + Total) need the landscape content width.
      landscape: true,
      extraCss: REKAP_PEMBELIAN_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
