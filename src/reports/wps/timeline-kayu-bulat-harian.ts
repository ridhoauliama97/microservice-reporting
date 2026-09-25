import sql from "mssql";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: supplier x day timeline pivot (daily Ton per
 * supplier, sorted by total desc) with a totals row. Ported from
 * open-api-report's TimelineKayuBulatHarianReportService +
 * timeline-kayu-bulat-harian-pdf.blade.php. SP: @StartDate/@EndDate.
 */

interface TimelineRow extends Record<string, unknown> {
  Tanggal: Date | null;
  NmSupplier: string | null;
  KBTon: number | null;
  Ranking: string | null;
}

const fmt2BlankZero = (value: number | null | undefined): string =>
  formatNumber(value, 2, { blankWhenZero: true });

interface PivotData {
  dateKeys: string[];
  dateLabels: Record<string, string>;
  suppliers: Array<{ supplier: string; byDate: Record<string, number>; total: number }>;
  grandByDate: Record<string, number>;
  grandTotal: number;
}

function buildPivot(rows: TimelineRow[]): PivotData | null {
  const matrix = new Map<
    string,
    { supplier: string; byDate: Record<string, number>; total: number }
  >();
  const dateKeys = new Set<string>();

  for (const raw of rows) {
    const supplier = String(raw.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const dateKey = raw.Tanggal instanceof Date ? raw.Tanggal.toISOString().slice(0, 10) : null;
    if (dateKey === null) continue;
    const value = typeof raw.KBTon === "number" && Number.isFinite(raw.KBTon) ? raw.KBTon : 0;

    let entry = matrix.get(supplier);
    if (!entry) {
      entry = { supplier, byDate: {}, total: 0 };
      matrix.set(supplier, entry);
    }
    entry.byDate[dateKey] = (entry.byDate[dateKey] ?? 0) + value;
    entry.total += value;
    dateKeys.add(dateKey);
  }

  if (dateKeys.size === 0) return null;

  const dateLabels: Record<string, string> = {};
  const sortedKeys = [...dateKeys].sort();
  for (const key of sortedKeys) {
    // Compact label ("06-Sep") — the full "06-Sep-2026" wraps mid-date in a
    // fixed-layout day column.
    const [day, month] = formatTanggalId(key).split("-");
    dateLabels[key] = `${day}-${month}`;
  }

  const suppliers = [...matrix.values()].sort((a, b) => {
    const cmp = b.total - a.total;
    if (cmp !== 0) return cmp;
    return a.supplier.toLowerCase().localeCompare(b.supplier.toLowerCase());
  });

  const grandByDate: Record<string, number> = {};
  for (const key of sortedKeys) {
    grandByDate[key] = suppliers.reduce((sum, s) => sum + (s.byDate[key] ?? 0), 0);
  }
  const grandTotal = suppliers.reduce((sum, s) => sum + s.total, 0);

  return { dateKeys: sortedKeys, dateLabels, suppliers, grandByDate, grandTotal };
}

export const timelineKbHarianReport: ReportDefinition<
  PeriodParams,
  TimelineRow[]
> = {
  type: "timeline-kayu-bulat-harian",
  title: "Laporan Time Line Kayu Bulat - Harian (JTG/PLI)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapTimelineKBHarian");
    return (result.recordset ?? []) as TimelineRow[];
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const pivot = buildPivot(rows);

    let bodyHtml: string;
    if (!pivot || pivot.suppliers.length === 0) {
      bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>Nama Supplier</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(3)}</tbody>
</table>`;
    } else {
      const bodyRows = pivot.suppliers
        .map(
          (supplier, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(supplier.supplier)}</td>
        ${pivot.dateKeys
          .map((key) => `<td class="number">${fmt2BlankZero(supplier.byDate[key] ?? 0)}</td>`)
          .join("\n        ")}
        <td class="number" style="font-weight: bold;">${fmt2BlankZero(supplier.total)}</td>
      </tr>`,
        )
        .join("\n    ");
      const dateHeaders = pivot.dateKeys
        .map((key) => `<th>${escapeHtml(pivot.dateLabels[key] ?? key)}</th>`)
        .join("");
      const dateTotals = pivot.dateKeys
        .map((key) => `<td class="number">${fmt2BlankZero(pivot.grandByDate[key] ?? 0)}</td>`)
        .join("");

      bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 36px;">No</th>
      <th style="width: 190px; text-align: left;">Nama Supplier</th>
      ${dateHeaders}
      <th style="width: 72px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="2" class="center">Total</td>
      ${dateTotals}
      <td class="number" style="font-weight: bold;">${fmt2BlankZero(pivot.grandTotal)}</td>
    </tr>
  </tbody>
</table>`;
    }

    return renderWpsReportPage({
      title: "Laporan Time Line Kayu Bulat - Harian (JTG/PLI)",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      style: "timeline_kayu_bulat_harian",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
