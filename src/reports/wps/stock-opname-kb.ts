import sql from "mssql";
import {
  buildReportTable,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: stock opname detail per balok (13 columns) + a
 * "Rangkuman" list (distinct NoKayuBulat, total Pcs, total Ton). Ported
 * from open-api-report's StockOpnameKayuBulatReportService +
 * stock-opname-pdf.blade.php. The SP takes no parameters.
 */

interface OpnameRow extends Record<string, unknown> {
  NoKayuBulat: string | null;
  DateCreate: string | Date | null;
  Jenis: string | null;
  NmSupplier: string | null;
  Suket: string | null;
  NoPlat: string | null;
  NoTruk: number | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  Pcs: number | null;
  Ton: number | null;
}

const COLUMNS: ReportColumn[] = [
  { label: "No", kind: "no", width: "30px" },
  { label: "No KB", kind: "label", field: "NoKayuBulat", width: "82px", align: "center" },
  { label: "Tanggal", kind: "date", field: "DateCreate", width: "72px" },
  { label: "Jenis Kayu", kind: "label", field: "Jenis", width: "72px", align: "center" },
  { label: "Supplier", kind: "label", field: "NmSupplier", width: "95px" },
  { label: "No Suket", kind: "label", field: "Suket", width: "170px" },
  { label: "No Plat", kind: "label", field: "NoPlat", width: "80px", align: "center" },
  { label: "No Truk", kind: "label", field: "NoTruk", width: "52px", align: "center" },
  { label: "Tebal", kind: "int", field: "Tebal", width: "42px" },
  { label: "Lebar", kind: "int", field: "Lebar", width: "42px" },
  { label: "Panjang", kind: "int", field: "Panjang", width: "52px" },
  { label: "Pcs", kind: "int", field: "Pcs", width: "38px", bold: true },
  { label: "Jmlh Ton", kind: "number", field: "Ton", width: "66px", bold: true },
];

const toFloat = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const stockOpnameKbReport: ReportDefinition<
  Record<never, never>,
  OpnameRow[]
> = {
  type: "stock-opname-kb",
  title: "Laporan Stock Opname Kayu Bulat",
  paramsSchema: z.object({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("sp_LapStockOpnameKB");
    return (result.recordset ?? []) as OpnameRow[];
  },

  render(rows, meta) {
    const totalPcs = rows.reduce((sum, row) => sum + toFloat(row.Pcs), 0);
    const totalTon = rows.reduce((sum, row) => sum + toFloat(row.Ton), 0);
    const totalNoKayuBulat = new Set(
      rows.map((row) => String(row.NoKayuBulat ?? "")),
    ).size;

    const rangkuman = `<div class="section-title">Rangkuman</div>
<ul class="rangkuman-list">
  <li>Total No Kayu Bulat:<strong> ${totalNoKayuBulat}</strong></li>
  <li>Total Pcs: <strong>${formatNumber(totalPcs, 0)} Pcs</strong></li>
  <li>Total Ton: <strong>${formatNumber(totalTon, 4)} Ton</strong></li>
</ul>`;

    const bodyHtml = `${buildReportTable({
      columns: COLUMNS,
      rows,
      emptyMessage: "Tidak ada data.",
    })}
${rangkuman}`;

    return renderWpsReportPage({
      title: "Laporan Stock Opname Kayu Bulat",
      subtitle: "",
      bodyHtml,
      extraCss: OPNAME_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};

const totalPcs = 0; // replaced inline in render (kept for readability of rangkuman)

const OPNAME_CSS = `
  .rangkuman-list { margin: 0 0 10px 18px; padding: 0; font-size: 10px; list-style: none; }
  .rangkuman-list li { margin-bottom: 2px; }
  .rangkuman-list strong { font-family: Calibri, "DejaVu Sans", sans-serif; }
`;
