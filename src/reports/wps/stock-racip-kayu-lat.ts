import sql from "mssql";
import {
  buildReportTable,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: stock per Racip Kayu Lat, grouped per Jenis with a
 * "Jumlah" row each. Ported from open-api-report's
 * StockRacipKayuLatReportService + stock-racip-kayu-lat-pdf.blade.php.
 * The SP takes a single @TglAkhir date; body params: { tgl }.
 */

interface StockRow extends Record<string, unknown> {
  Jenis: string | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  JmlhBatang: number | null;
  Hasil: number | null;
}

const fmtInt = (value: unknown): string => formatNumber(Math.round(toFloat(value)), 0);

const fmt4 = (value: number | null | undefined): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
};

const DETAIL_COLUMNS: ReportColumn[] = [
  { label: "No", kind: "no", width: "40px" },
  { label: "Tebal (mm)", kind: "int", field: "Tebal" },
  { label: "Lebar (mm)", kind: "int", field: "Lebar" },
  { label: "Panjang (ft)", kind: "int", field: "Panjang" },
  { label: "Jumlah Batang (pcs)", kind: "int", field: "JmlhBatang" },
  { label: "Hasil", kind: "number", field: "Hasil" },
];

export const stockRacipKayuLatReport: ReportDefinition<
  { tgl: string },
  StockRow[]
> = {
  type: "stock-racip-kayu-lat",
  title: "Laporan Stok Racip Kayu Lat",
  paramsSchema: z.object({
    tgl: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  }),

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAkhir", sql.Date, params.tgl)
      .execute("sp_LapStockRacipKayuLat");
    const rows = (result.recordset ?? []) as StockRow[];

    // Legacy ordering: Jenis, Tebal, Lebar, Panjang.
    return rows.sort(
      (a, b) =>
        [String(a.Jenis ?? ""), a.Tebal, a.Lebar, a.Panjang]
          .toString()
          .localeCompare([String(b.Jenis ?? ""), b.Tebal, b.Lebar, b.Panjang].toString()),
    );
  },

  render(rows, meta) {
    // Group per Jenis in first-appearance order (rows are already sorted).
    const groups: Array<{ jenis: string; rows: StockRow[] }> = [];
    for (const row of rows) {
      const jenis = String(row.Jenis ?? "").trim() || "Tanpa Jenis";
      const last = groups[groups.length - 1];
      if (last && last.jenis === jenis) last.rows.push(row);
      else groups.push({ jenis, rows: [row] });
    }

    const sections = groups
      .map(
        (group) => {
          const sumBatang = group.rows.reduce((sum, r) => sum + toFloat(r.JmlhBatang), 0);
          const sumHasil = group.rows.reduce((sum, r) => sum + toFloat(r.Hasil), 0);
          const table = buildReportTable({
            columns: DETAIL_COLUMNS,
            rows: group.rows,
            totals: {
              label: "Jumlah",
              colspan: 4,
              values: { JmlhBatang: sumBatang, Hasil: sumHasil },
            },
          });
          return `<p class="group-title">${escapeHtml(group.jenis)}</p>${table}`;
        },
      )
      .join("\n");

    const bodyHtml =
      groups.length > 0
        ? sections
        : `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Stok Racip Kayu Lat",
      subtitle: `Per Tanggal : ${formatTanggalId(meta.params.tgl)}`,
      bodyHtml,
      extraCss: `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; }
`,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
