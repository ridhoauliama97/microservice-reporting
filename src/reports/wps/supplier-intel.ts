import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapSupplierIntel — "Laporan Supplier Intel". Ported from
 * open-api-report's SupplierIntelReportService + supplier-intel-pdf.blade.php.
 *
 * One flat table over the SP's five columns: Nama Supplier / Tanggal Masuk /
 * Jumlah Truk / Ton (KB) / M3 (ST). Date cells are centered dd-M-y, truck
 * counts centered, tonnages right-aligned in 4 decimals and bold. No totals
 * row (the legacy blade has none).
 *
 * NOTE: the SP declares @TglAkhir before @TglAwal; both are bound by name so
 * the order is irrelevant.
 */

interface SupplierIntelRow extends Record<string, unknown> {
  NamaSupplier: string | null;
  DateIn: Date | string | null;
  JlhTruk: number | null;
  TonKB: number | null;
  M3ST: number | null;
}

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

/** Legacy $formatDate: d-M-y (2-digit year). */
const formatDateCell = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatTanggalId(raw.slice(0, 10)).replace(/-\d{4}$/, (m) => `-${m.slice(-2)}`) : raw;
};

/** Legacy $formatFourDecimals: 4 decimals, empty for null. */
const fmtFour = (value: unknown): string => {
  if (value === null || value === "") return "";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return formatNumber(num, 4);
};

const COLUMNS: Array<{ field: keyof SupplierIntelRow; label: string }> = [
  { field: "NamaSupplier", label: "Nama Supplier" },
  { field: "DateIn", label: "Tanggal Masuk" },
  { field: "JlhTruk", label: "Jumlah Truk" },
  { field: "TonKB", label: "Ton (KB)" },
  { field: "M3ST", label: "M3 (ST)" },
];

export const supplierIntelReport: ReportDefinition<
  PeriodParams,
  SupplierIntelRow[]
> = {
  type: "supplier-intel",
  title: "Laporan Supplier Intel",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SP_LapSupplierIntel");
    return (result.recordset ?? []) as SupplierIntelRow[];
  },

  render(rows, meta) {
    const bodyRows = rows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(toText(row.NamaSupplier))}</td>
        <td class="center">${escapeHtml(formatDateCell(row.DateIn))}</td>
        <td class="center">${escapeHtml(toText(row.JlhTruk))}</td>
        <td class="number" style="font-weight: bold;">${fmtFour(row.TonKB)}</td>
        <td class="number" style="font-weight: bold;">${fmtFour(row.M3ST)}</td>
      </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 34px;">No</th>
      ${COLUMNS.map(
        (column) => `<th>${escapeHtml(column.label)}</th>`,
      ).join("\n      ")}
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(1 + COLUMNS.length)}
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Supplier Intel",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
