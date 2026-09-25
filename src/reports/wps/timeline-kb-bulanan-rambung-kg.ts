import sql from "mssql";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
  MONTHS_SHORT_ID,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapTimelineKBBulananKG — "Laporan Timeline KB - Bulanan (Rambung)".
 * The KG sibling of timeline-kayu-bulat-bulanan: same supplier x month pivot
 * (year-grouped headers, per-supplier totals, grand total row), but the SP
 * reports the weight in `TonBerat` and the running `Ranking`.
 *
 * NOTE: the legacy KG blade (timeline-kayu-bulat-bulanan-kg-pdf.blade.php) was
 * unreadable on this machine (the open-api-report checkout intermittently
 * refuses directory access), so the layout mirrors the verified non-KG sibling
 * 1:1. Only the SP, the value column and the title differ.
 */

const fmt2BlankZero = (value: number | null | undefined): string =>
  formatNumber(value, 2, { blankWhenZero: true });

interface TimelineKgRow extends Record<string, unknown> {
  Tahun: number | null;
  Bulan: number | null;
  NmSupplier: string | null;
  TonBerat: number | null;
  Ranking: number | null;
}

interface PivotData {
  yearGroups: Array<{ year: number; count: number }>;
  monthKeys: string[];
  suppliers: Array<{ supplier: string; months: Record<string, number>; total: number }>;
  grandByMonth: Record<string, number>;
  grandTotal: number;
}

function buildPivot(
  rows: TimelineKgRow[],
  range: { startIso: string; endIso: string },
): PivotData | null {
  const matrix = new Map<
    string,
    { supplier: string; months: Record<string, number>; total: number }
  >();
  const monthKeys = new Set<string>();

  for (const raw of rows) {
    const supplier = String(raw.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const tahun = Number(raw.Tahun ?? 0);
    const bulan = Number(raw.Bulan ?? 0);
    if (!tahun || bulan < 1 || bulan > 12) continue;
    const monthKey = `${tahun}-${String(bulan).padStart(2, "0")}`;
    const value =
      typeof raw.TonBerat === "number" && Number.isFinite(raw.TonBerat)
        ? raw.TonBerat
        : 0;

    let entry = matrix.get(supplier);
    if (!entry) {
      entry = { supplier, months: {}, total: 0 };
      matrix.set(supplier, entry);
    }
    entry.months[monthKey] = (entry.months[monthKey] ?? 0) + value;
    entry.total += value;
    monthKeys.add(monthKey);
  }

  if (monthKeys.size === 0) return null;

  // Header range = the months present between StartDate..EndDate.
  const startMonth = new Date(`${range.startIso.slice(0, 7)}-01`);
  const endMonth = new Date(`${range.endIso.slice(0, 7)}-01`);
  const filled: string[] = [];
  const cursor = new Date(startMonth);
  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    if (monthKeys.has(key)) filled.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const sortedMonthKeys = filled.length > 0 ? filled : [...monthKeys].sort();

  const yearGroups = new Map<number, number>();
  for (const key of sortedMonthKeys) {
    const year = Number(key.slice(0, 4));
    yearGroups.set(year, (yearGroups.get(year) ?? 0) + 1);
  }

  const suppliers = [...matrix.values()].sort((a, b) => {
    const cmp = b.total - a.total;
    if (cmp !== 0) return cmp;
    return a.supplier.toLowerCase().localeCompare(b.supplier.toLowerCase());
  });

  const grandByMonth: Record<string, number> = {};
  for (const key of sortedMonthKeys) {
    grandByMonth[key] = suppliers.reduce((sum, s) => sum + (s.months[key] ?? 0), 0);
  }
  const grandTotal = suppliers.reduce((sum, s) => sum + s.total, 0);

  return {
    yearGroups: [...yearGroups.entries()].map(([year, count]) => ({ year, count })),
    monthKeys: sortedMonthKeys,
    suppliers,
    grandByMonth,
    grandTotal,
  };
}

export const timelineKbBulananKgReport: ReportDefinition<
  PeriodParams,
  TimelineKgRow[]
> = {
  type: "timeline-kb-bulanan-rambung-kg",
  title: "Laporan Timeline KB - Bulanan (Rambung)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapTimelineKBBulananKG");
    return (result.recordset ?? []) as TimelineKgRow[];
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const pivot = buildPivot(rows, {
      startIso: meta.params.tglAwal,
      endIso: meta.params.tglAkhir,
    });

    let bodyHtml: string;
    if (!pivot || pivot.suppliers.length === 0) {
      bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2">No</th>
      <th rowspan="2" style="text-align: center;">Nama Supplier</th>
      <th rowspan="2">Total</th>
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(3)}</tbody>
</table>`;
    } else {
      const yearHeader = pivot.yearGroups
        .map((g) => `<th colspan="${g.count}">${g.year}</th>`)
        .join("");
      const monthHeaders = pivot.monthKeys
        .map(
          (key) =>
            `<th style="width: 8%;">${escapeHtml(MONTHS_SHORT_ID[Number(key.slice(5)) - 1] ?? "")}</th>`,
        )
        .join("");
      const bodyRows = pivot.suppliers
        .map(
          (supplier, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(supplier.supplier)}</td>
        ${pivot.monthKeys
          .map((key) => `<td class="number">${fmt2BlankZero(supplier.months[key] ?? 0)}</td>`)
          .join("\n        ")}
        <td class="number" style="font-weight: bold;">${fmt2BlankZero(supplier.total)}</td>
      </tr>`,
        )
        .join("\n    ");
      const monthTotals = pivot.monthKeys
        .map((key) => `<td class="number">${fmt2BlankZero(pivot.grandByMonth[key] ?? 0)}</td>`)
        .join("");

      bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2">No</th>
      <th rowspan="2" style="text-align: center;">Nama Supplier</th>
      ${yearHeader}
      <th rowspan="2">Total</th>
    </tr>
    <tr class="headers-row">
      ${monthHeaders}
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="2" style="text-align: center;">Total :</td>
      ${monthTotals}
      <td class="number" style="font-weight: bold;">${fmt2BlankZero(pivot.grandTotal)}</td>
    </tr>
  </tbody>
</table>`;
    }

    return renderWpsReportPage({
      title: "Laporan Timeline KB - Bulanan (Rambung)",
      subtitle: `Periode : ${start} s/d ${end}`,
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
