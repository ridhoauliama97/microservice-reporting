import sql from "mssql";
import { renderWpsReportPage } from "./template";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapTimelineKBHarianKG — "Laporan Timeline KB - Harian (Rambung)". The KG
 * sibling of timeline-kayu-bulat-harian: same supplier x day matrix (compact
 * dd-Mmm date headers + nowrap, per the earlier layout fix), but the SP
 * reports the weight in `TonBerat` plus a `Ranking`.
 *
 * NOTE: the legacy KG blade (timeline-kayu-bulat-harian-kg-pdf.blade.php) was
 * unreadable on this machine (the open-api-report checkout intermittently
 * refuses directory access), so the layout mirrors the verified non-KG sibling
 * 1:1. Only the SP, the value column and the title differ.
 */

interface TimelineKgRow extends Record<string, unknown> {
  Tanggal: Date | string | null;
  NmSupplier: string | null;
  TonBerat: number | null;
  Ranking: number | null;
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

function buildPivot(rows: TimelineKgRow[]): PivotData | null {
  const matrix = new Map<
    string,
    { supplier: string; byDate: Record<string, number>; total: number }
  >();
  const dateKeys = new Set<string>();

  for (const raw of rows) {
    const supplier = String(raw.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const dateKey =
      raw.Tanggal instanceof Date
        ? raw.Tanggal.toISOString().slice(0, 10)
        : typeof raw.Tanggal === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.Tanggal)
          ? raw.Tanggal.slice(0, 10)
          : null;
    if (dateKey === null) continue;
    const value =
      typeof raw.TonBerat === "number" && Number.isFinite(raw.TonBerat)
        ? raw.TonBerat
        : 0;

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

  const sortedKeys = [...dateKeys].sort();
  const dateLabels: Record<string, string> = {};
  for (const key of sortedKeys) {
    // Compact label ("06-Sep"): the full "06-Sep-2026" wraps mid-date in a
    // fixed-layout day column (fixed earlier for the non-KG sibling).
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

const TIMELINE_HARIAN_KG_CSS = `
  .report-table th { white-space: nowrap; }
  .report-table thead th:nth-child(2), .report-table tbody td:nth-child(2) { width: 20%; }
  .report-table tbody td:nth-child(2) { white-space: nowrap; }
`;

export const timelineKbHarianKgReport: ReportDefinition<
  PeriodParams,
  TimelineKgRow[]
> = {
  type: "timeline-kb-harian-rambung-kg",
  title: "Laporan Timeline KB - Harian (Rambung)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapTimelineKBHarianKG");
    return (result.recordset ?? []) as TimelineKgRow[];
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const pivot = buildPivot(rows);

    let bodyHtml: string;
    if (!pivot || pivot.suppliers.length === 0) {
      bodyHtml = `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;
    } else {
      const headers = pivot.dateKeys
        .map((key) => `<th>${escapeHtml(pivot.dateLabels[key] ?? key)}</th>`)
        .join("");
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
      const dateTotals = pivot.dateKeys
        .map((key) => `<td class="number">${fmt2BlankZero(pivot.grandByDate[key] ?? 0)}</td>`)
        .join("");

      bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>Nama Supplier</th>
      ${headers}
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="2" style="text-align: center;">Total :</td>
      ${dateTotals}
      <td class="number" style="font-weight: bold;">${fmt2BlankZero(pivot.grandTotal)}</td>
    </tr>
  </tbody>
</table>`;
    }

    return renderWpsReportPage({
      title: "Laporan Timeline KB - Harian (Rambung)",
      subtitle: `Periode : ${start} s/d ${end}`,
      bodyHtml,
      extraCss: TIMELINE_HARIAN_KG_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
