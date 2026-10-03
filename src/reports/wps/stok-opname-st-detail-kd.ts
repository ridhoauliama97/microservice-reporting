import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId, toDateKey } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapStokOpnameSTDetail — "Laporan Stok Opname ST Detail Pada KD". Ported
 * from open-api-report's StokOpnameStDetailKdReportService +
 * stok-opname-st-detail-kd-pdf.blade.php.
 *
 * SP takes @NoProcKD. Above the table sits the header block the blade reads from
 * dbo.KD_h (No KD / Ruang KD / Tanggal Masuk / Tanggal Keluar). One row per
 * line item with columns No|No ST|Tanggal|Jenis|No KB|Tebal (mm)|Lebar (mm)|
 * Panjang (feet)|Pcs|Ton and a Total row (Pcs + Ton sums).
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

interface OpnameData {
  header: { noProcKd: string; noRuangKd: string; tglMasuk: string; tglKeluar: string };
  rows: Array<Record<string, unknown>>;
}

export const stokOpnameStDetailKdReport: ReportDefinition<z.infer<typeof paramsSchema>, OpnameData> = {
  type: "stok-opname-st-detail-kd",
  title: "Laporan Stok Opname ST Detail Pada KD",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    const result = await request.input("NoProcKD", sql.VarChar(13), params.noProcKd).execute("SP_LapStokOpnameSTDetail");
    const rows = (result.recordset ?? []) as Array<Record<string, unknown>>;
    // The blade reads the four header fields straight from dbo.KD_h (TOP 1 on
    // NoProcKD); the SP result set does not carry them. Same query, same
    // parameter binding - the value is never concatenated into the SQL.
    const headerResult = await request
      .input("NoProcKdLookup", sql.VarChar(13), params.noProcKd)
      .query("SELECT TOP 1 NoProcKD, NoRuangKD, TglMasuk, TglKeluar FROM dbo.KD_h WHERE NoProcKD = @NoProcKdLookup");
    const h = (headerResult.recordset?.[0] ?? {}) as Record<string, unknown>;
    return {
      header: {
        noProcKd: String(h.NoProcKD ?? params.noProcKd),
        // Column is declared "NoRuangKD" in dbo.KD_h — keep the exact casing.
        noRuangKd: h.NoRuangKD === null || h.NoRuangKD === undefined ? "-" : String(h.NoRuangKD),
        tglMasuk: formatTanggalId(toDateKey(h.TglMasuk)),
        tglKeluar: formatTanggalId(toDateKey(h.TglKeluar)),
      },
      rows,
    };
  },

  render({ header, rows }, meta) {
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
      <td class="center">${escapeHtml(String(r.NoST ?? ""))}</td>
      <td class="tanggal-cell">${escapeHtml(formatTanggalId(toDateKey(r.DateCreate)))}</td>
      <td>${escapeHtml(String(r.Jenis ?? ""))}</td>
      <td class="center">${escapeHtml(String(r.NoKayuBulat ?? ""))}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td class="number">${formatNumber(pcs, 0)}</td>
      <td class="number">${formatNumber(ton, 4)}</td>
    </tr>`;
      })
      .join("\n");

    const metaBlock = `<table class="meta-table">
  <tbody>
    <tr>
      <td class="meta-label">No KD</td><td class="meta-sep">:</td><td>${escapeHtml(header.noProcKd)}</td>
      <td class="meta-label">Ruang KD</td><td class="meta-sep">:</td><td>${escapeHtml(header.noRuangKd)}</td>
    </tr>
    <tr>
      <td class="meta-label">Tanggal Masuk</td><td class="meta-sep">:</td><td>${escapeHtml(header.tglMasuk)}</td>
      <td class="meta-label">Tanggal Keluar</td><td class="meta-sep">:</td><td>${escapeHtml(header.tglKeluar)}</td>
    </tr>
  </tbody>
</table>`;

    const bodyHtml = `${metaBlock}<table class="data-table">
  <thead>
    <tr>
      <th style="width:4%;">No</th>
      <th style="width:10%;">No ST</th>
      <th style="width:10%;">Tanggal</th>
      <th style="width:17%;">Jenis</th>
      <th style="width:10%;">No KB</th>
      <th style="width:9%;">Tebal (mm)</th>
      <th style="width:9%;">Lebar (mm)</th>
      <th style="width:10%;">Panjang (feet)</th>
      <th style="width:6%;">Pcs</th>
      <th style="width:10%;">Ton</th>
    </tr>
  </thead>
  <tbody>
${bodyRows || `    <tr><td colspan="10" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
${rows.length ? `
    <tr class="totals-row"><td colspan="8" class="center">Total</td><td class="number">${formatNumber(totalPcs, 0)}</td><td class="number">${formatNumber(totalTon, 4)}</td></tr>` : ""}
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Stok Opname ST Detail Pada KD",
      subtitle: "",
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["stok-opname-st-detail-kd"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
