import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import { escapeHtml, formatNumber, formatPrintedAt, MONTHS_SHORT_ID } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: year x month pivot (Jan..Des) of monthly purchase
 * tonnage, limited to the last 11 years. Ported from
 * open-api-report's RekapPembelianKayuBulatReportService +
 * rekap-pembelian-pdf.blade.php. The SP takes no parameters.
 */

const MONTH_LABELS = MONTHS_SHORT_ID; // Jan, Feb, ... Des

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
  const startYear = endYear - 10;

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
    years: rows.length > 0 ? [...years.values()].sort((a, b) => a.tahun - b.tahun) : [],
    startYear,
    endYear,
  };
}

const buildTableHtml = (years: YearPivotRow[]): string => {
  const monthHeaders = MONTH_LABELS.map(
    (label) => `<th>${escapeHtml(label)}</th>`,
  ).join("");
  const bodyRows = years
    .map(
      (row) => `<tr class="data-row ${years.indexOf(row) % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center" style="font-weight: bold; font-size: 11px;">${escapeHtml(String(row.tahun))}</td>
        ${MONTH_LABELS.map(
          (label, index) => `<td class="number">${formatNumber(row.months[index + 1] ?? 0, 4, { blankWhenZero: true })}</td>`,
        ).join("\n        ")}
        <td class="number" style="font-weight: bold; font-size: 11px;">${formatNumber(row.total, 4, { blankWhenZero: true })}</td>
      </tr>`,
    )
    .join("\n    ");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 48px;">Tahun</th>
      ${monthHeaders}
      <th style="width: 74px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    ${years.length === 0 ? buildEmptyTableRow(2 + MONTH_LABELS.length) : ""}
  </tbody>
</table>`;
}

export const rekapPembelianKayuBulatReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "rekap-pembelian-kayu-bulat",
  title: "Laporan Rekap Pembelian Kayu Bulat (Ton)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    void params;
    const conn = await pool;
    const result = await conn
      .request()
      .execute("SPWps_LapRekapPembelianKayuBulat");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const { years, startYear, endYear } = buildPivot(rows);

    return renderWpsReportPage({
      title: "Laporan Rekap Pembelian Kayu Bulat (Ton)",
      subtitle: `Periode ${startYear} s/d ${endYear}`,
      bodyHtml: buildTableHtml(years),
      // 14 columns (Tahun + 12 bulan + Total) do not fit the portrait content
      // width — landscape keeps every tonnage on a single line.
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
