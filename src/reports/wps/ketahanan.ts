import sql from "mssql";
import { escapeHtml, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Shared factory for the WPS "Ketahanan Barang Dagang" (stock coverage) reports.
 *
 * Cross Cut Akhir and Finger Joint expose the same Jenis / Stockm3 / m3 shape
 * and the same legacy layout, so only the stored procedure and the title
 * differ. Ported from ketahanan-barang-cc-akhir-pdf.blade.php and
 * ketahanan-barang-finger-joint-pdf.blade.php.
 *
 * The legacy service maps Stock <- Stockm3, Penjualan <- m3,
 * Avg Penjualan <- AvgPenjualan (falling back to Penjualan) and derives
 * Ketahanan = Stock / Avg Penjualan when the SP does not provide it (0 when the
 * average is 0). Values print with 2 decimals and NO thousands separator;
 * zero/empty render as "-".
 */

interface KetahananRow extends Record<string, unknown> {
  Jenis: string | null;
  /**
   * The two source measures. Optional because their names are configurable:
   * the m3 reports read Stockm3 and m3, Sawn Timber reads StockTon and Ton.
   * Indexed by `stockField` / `salesField` at build time.
   */
  Stockm3?: number | null;
  m3?: number | null;
  /** Optional: the SP may omit it, in which case Penjualan is used. */
  AvgPenjualan?: number | null;
  /** Optional: derived as Stock / Avg Penjualan when the SP omits it. */
  Ketahanan?: number | null;
}

export interface KetahananView {
  Jenis: string;
  Stock: number;
  Penjualan: number;
  AvgPenjualan: number;
  Ketahanan: number;
}

export interface KetahananOptions {
  type: string;
  title: string;
  storedProcedure: string;
  /**
   * Source column for Stock. Default "Stockm3" (the m3 reports). Sawn Timber
   * returns the same measure as "StockTon" - the reference resolves it by
   * candidate match and lands on StockTon, not Stock.
   */
  stockField?: string;
  /** Source column for Penjualan. Default "m3"; Sawn Timber returns "Ton". */
  salesField?: string;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replaceAll(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmt2OrBlank: 2 decimals, no separator, "-" when ~zero/empty. */
const fmt2OrBlank = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "-";
  if (Math.abs(value) < 0.0000001) return "-";
  const [intPart, decPart] = value.toFixed(2).split(".");
  return `${intPart}.${decPart}`;
};

/** Legacy subtitle date format: d-M-y (2-digit year). */
const fmtTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

export function buildKetahananView(
  rows: KetahananRow[],
  stockField = "Stockm3",
  salesField = "m3",
): KetahananView[] {
  return rows.map((row) => {
    const stock = toFloat(row[stockField]);
    const penjualan = toFloat(row[salesField]);
    const avgPenjualan =
      row.AvgPenjualan === null || row.AvgPenjualan === undefined
        ? penjualan
        : toFloat(row.AvgPenjualan);
    const ketahanan =
      row.Ketahanan === null || row.Ketahanan === undefined
        ? avgPenjualan > 0
          ? stock / avgPenjualan
          : 0
        : toFloat(row.Ketahanan);

    return {
      Jenis: String(row.Jenis ?? ""),
      Stock: stock,
      Penjualan: penjualan,
      AvgPenjualan: avgPenjualan,
      Ketahanan: ketahanan,
    };
  });
}

export function createKetahananReport(
  options: KetahananOptions,
): ReportDefinition<PeriodParams, KetahananView[]> {
  const stockField = options.stockField ?? "Stockm3";
  const salesField = options.salesField ?? "m3";
  return {
    type: options.type,
    title: options.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("StartDate", sql.Date, params.tglAwal)
        .input("EndDate", sql.Date, params.tglAkhir)
        .execute(options.storedProcedure);
      return buildKetahananView(
        (result.recordset ?? []) as KetahananRow[],
        stockField,
        salesField,
      );
    },

    render(rows, meta) {
      const bodyRows = rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(row.Jenis)}</td>
        <td class="center">${fmt2OrBlank(row.Stock)}</td>
        <td class="center">${fmt2OrBlank(row.Penjualan)}</td>
        <td class="center">${fmt2OrBlank(row.AvgPenjualan)}</td>
        <td class="center">${fmt2OrBlank(row.Ketahanan)}</td>
      </tr>`,
        )
        .join("\n    ");

      const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 6%;">No</th>
      <th style="width: 44%;">Jenis</th>
      <th style="width: 12%;">Stock</th>
      <th style="width: 12%;">Penjualan</th>
      <th style="width: 14%;">Avg Penjualan</th>
      <th style="width: 12%;">Ketahanan</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(6)}
  </tbody>
</table>`;

      return renderWpsReportPage({
        title: options.title,
        subtitle: `Periode ${fmtTanggalPendek(meta.params.tglAwal)} s/d ${fmtTanggalPendek(meta.params.tglAkhir)}`,
        bodyHtml,
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}
