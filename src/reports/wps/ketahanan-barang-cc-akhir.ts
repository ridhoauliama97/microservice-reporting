import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * SP_LapKetahananBarangCCAkhir — "Laporan Ketahanan Barang Dagang CCAkhir"
 * (the user-facing name is "Laporan Ketahanan Barang Dagang Cross Cut Akhir").
 * Ported from open-api-report's
 * KetahananBarangDagangCrossCutAkhirReportService +
 * ketahanan-barang-cc-akhir-pdf.blade.php.
 *
 * The SP returns Jenis / Stockm3 / m3. The legacy service maps
 * Stock <- Stockm3, Penjualan <- m3, Avg Penjualan <- AvgPenjualan (falls
 * back to Penjualan) and derives Ketahanan = Stock / Avg Penjualan when the SP
 * does not provide it (0 when the average is 0). Values print with 2 decimals
 * and NO thousands separator; zero/empty render as "-".
 */

interface KetahananRow extends Record<string, unknown> {
  Jenis: string | null;
  Stockm3: number | null;
  m3: number | null;
  AvgPenjualan: number | null;
  Ketahanan: number | null;
}

interface KetahananView {
  Jenis: string;
  Stock: number;
  Penjualan: number;
  AvgPenjualan: number;
  Ketahanan: number;
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

function buildView(rows: KetahananRow[]): KetahananView[] {
  return rows.map((row) => {
    const stock = toFloat(row.Stockm3);
    const penjualan = toFloat(row.m3);
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

export const ketahananBarangCcAkhirReport: ReportDefinition<
  PeriodParams,
  KetahananView[]
> = {
  type: "ketahanan-barang-cc-akhir",
  title: "Laporan Ketahanan Barang Dagang CCAkhir",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapKetahananBarangCCAkhir");
    return buildView((result.recordset ?? []) as KetahananRow[]);
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
    ${bodyRows || `<tr><td class="center" colspan="6">Tidak ada data.</td></tr>`}
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Ketahanan Barang Dagang CCAkhir",
      subtitle: `Periode ${fmtTanggalPendek(meta.params.tglAwal)} s/d ${fmtTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
