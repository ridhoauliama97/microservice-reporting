import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapStokOpnameSTDetail — "Laporan Stok Opname ST Detail Pada KD". Ported
 * from open-api-report's StokOpnameStDetailKdReportService +
 * stok-opname-st-detail-kd-pdf.blade.php.
 *
 * SP takes @NoProcKD. One row per line item with columns No|No ST|Tanggal|Jenis|
 * No KB|Tebal|Lebar|Panjang|UOM|UOM|Pcs|Ton and a Total row (Pcs + Ton sums).
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const paramsSchema = z.object({ noProcKd: z.string().trim().min(1) });

export const stokOpnameStDetailKdReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  Array<Record<string, unknown>>
> = {
  type: "stok-opname-st-detail-kd",
  title: "Laporan Stok Opname ST Detail Pada KD",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request().input("NoProcKD", sql.VarChar(13), params.noProcKd).execute("SP_LapStokOpnameSTDetail");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    let totalPcs = 0;
    let totalTon = 0;
    const bodyRows = rows
      .map((r, i) => {
        const pcs = toFloat(r.JmlhBatang);
        const ton = toFloat(r.Ton);
        totalPcs += pcs;
        totalTon += ton;
        return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(String(r.NoST ?? ""))}</td>
      <td>${escapeHtml(formatTanggalId(String(r.DateCreate ?? "").slice(0, 10)))}</td>
      <td>${escapeHtml(String(r.Jenis ?? ""))}</td>
      <td>${escapeHtml(String(r.NoKayuBulat ?? ""))}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td class="center">${escapeHtml(String(r.UOMLebar ?? ""))}</td>
      <td class="center">${escapeHtml(String(r.UOMPanjang ?? ""))}</td>
      <td class="number">${formatNumber(pcs, 0)}</td>
      <td class="number">${formatNumber(ton, 4)}</td>
    </tr>`;
      })
      .join("\n");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr>
      <th style="width:4%;">No</th>
      <th style="width:10%;">No ST</th>
      <th style="width:8%;">Tanggal</th>
      <th style="width:20%;">Jenis</th>
      <th style="width:10%;">No KB</th>
      <th style="width:7%;">Tebal</th>
      <th style="width:7%;">Lebar</th>
      <th style="width:7%;">Panjang</th>
      <th style="width:6%;">UOM Lebar &amp; Tebal</th>
      <th style="width:7%;">UOM Panjang</th>
      <th style="width:7%;">Pcs</th>
      <th style="width:7%;">Ton</th>
    </tr>
  </thead>
  <tbody>
${bodyRows || `    <tr><td colspan="12" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
  </tbody>
</table>${rows.length ? `<table class="report-table"><tbody>
  <tr class="totals-row"><td colspan="10" class="center">Total</td><td class="number">${formatNumber(totalPcs, 0)}</td><td class="number">${formatNumber(totalTon, 4)}</td></tr>
</tbody></table>` : ""}`;

    return renderWpsReportPage({
      title: "Laporan Stok Opname ST Detail Pada KD",
      subtitle: "",
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
