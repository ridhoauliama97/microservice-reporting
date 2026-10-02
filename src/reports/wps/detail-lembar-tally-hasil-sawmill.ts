import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { periodParamsSchema, type PeriodParams } from "../period-params";

/**
 * SPWps_DetailLembarTallyHasilSawmill — "Laporan Tally Hasil Sawmill Detail".
 * Ported from open-api-report's DetailLembarTallyHasilSawmillReportService +
 * detail-lembar-tally-hasil-sawmill-pdf.blade.php.
 *
 * Company each tally sheet (NoSTSawmill): a two-column meta block (No. Meja /
 * No. ST / Tanggal / Operator | Supplier / Jenis Kayu / No KB / No.Plat), then a
 * report-table of that sheet's lines (No|Tebal|Lebar|UOMTblLebar|Panjang|
 * UOMPanjang|Jmlh Batang|Ton) with a Total row. After all sheets, a Rangkuman
 * Grand Total table listing one row per sheet.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};



export const detailLembarTallyHasilSawmillReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "detail-lembar-tally-hasil-sawmill",
  title: "Laporan Tally Hasil Sawmill Detail",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SPWps_DetailLembarTallyHasilSawmill");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const headers: Array<Record<string, any>> = [];
    const seen = new Set<string>();
    const lines: Record<string, Array<Record<string, unknown>>> = {};
    let totals: Record<string, { pcs: number; ton: number }> = {};
    for (const r of rows) {
      const key = String(r.NoSTSawmill ?? "");
      if (!seen.has(key)) {
        seen.add(key);
        headers.push({ key });
        lines[key] = [];
        totals[key] = { pcs: 0, ton: 0 };
      }
      lines[key].push(r);
      totals[key].pcs += toFloat(r.JmlhBatang);
      totals[key].ton += toFloat(r.Ton);
    }
    const groupsHtml = headers
      .map((h) => {
        const key = h.key;
        const first = lines[key][0] as Record<string, unknown>;
        const noMeja = String(first.NoMeja ?? "-");
        const noSt = String(first.NoSTSawmill ?? "-");
        const tanggal = String(first.TglSawmill ?? "");
        const operator = String(first.Operator ?? "-");
        const supplier = String(first.NmSupplier ?? "-");
        const jenis = String(first.Jenis ?? "-");
        const noKb = String(first.NoKayuBulat ?? "-");
        const noPlat = String(first.NoPlat ?? "-");
        let sPcs = 0, sTon = 0;
        const rowsHtml = lines[key]
          .map((r, i) => {
            const pcs = toFloat(r.JmlhBatang);
            const ton = toFloat(r.Ton);
            sPcs += pcs;
            sTon += ton;
            return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td>${escapeHtml(String(r.NoUrut ?? i + 1))}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td>${escapeHtml(String(r.IdUOMTblLebar ?? "-"))}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td>${escapeHtml(String(r.IdUOMPanjang ?? "-"))}</td>
      <td class="number">${formatNumber(pcs, 0)}</td>
      <td class="number">${formatNumber(ton, 4)}</td>
    </tr>`;
          })
          .join("\n");
        const meta = `<table class="meta-table" style="width:100%;margin:0 0 6px 0;">
  <tr>
    <td style="width:50%;vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td class="meta-label" style="width:72px;">No. Meja</td><td>:</td><td>${escapeHtml(noMeja)}</td></tr>
        <tr><td class="meta-label">No. ST</td><td>:</td><td>${escapeHtml(noSt)}</td></tr>
        <tr><td class="meta-label">Tanggal</td><td>:</td><td>${escapeHtml(formatTanggalId(tanggal.slice(0, 10)))}</td></tr>
        <tr><td class="meta-label">Operator</td><td>:</td><td>${escapeHtml(operator)}</td></tr>
      </table>
    </td>
    <td style="width:50%;vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td class="meta-label" style="width:80px;">Supplier</td><td>:</td><td>${escapeHtml(supplier)}</td></tr>
        <tr><td class="meta-label">Jenis Kayu</td><td>:</td><td>${escapeHtml(jenis)}</td></tr>
        <tr><td class="meta-label">No KB</td><td>:</td><td>${escapeHtml(noKb)}</td></tr>
        <tr><td class="meta-label">No.Plat</td><td>:</td><td>${escapeHtml(noPlat)}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
        return `<table style="width:100%;border-collapse:collapse;border:0;"><tr><td style="width:100%;padding:0;">
${meta}
<table class="report-table">
  <thead><tr class="headers-row"><th style="width:6%;">No</th><th style="width:9%;">Tebal</th><th style="width:9%;">Lebar</th><th style="width:14%;">UOM Tbl Lebar</th><th style="width:10%;">Panjang</th><th style="width:14%;">UOM Panjang</th><th style="width:14%;">Jmlh Batang</th><th style="width:24%;">Ton</th></tr></thead>
  <tbody>
${rowsHtml}
    <tr class="totals-row"><td colspan="6" class="totals-label">Total</td><td class="number">${formatNumber(sPcs, 0)}</td><td class="number">${formatNumber(sTon, 4)}</td></tr>
  </tbody>
</table>
</td></tr></table>`;
      })
      .join("<div style=\"height:10px\"></div>");

    const rangkumanRows = headers
      .map((h, i) => {
        const key = h.key;
        const first = lines[key][0] as Record<string, unknown>;
        const t = totals[key];
        return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(String(first.NoMeja ?? ""))}</td>
      <td>${escapeHtml(String(first.NoSTSawmill ?? ""))}</td>
      <td>${escapeHtml(String(first.NoKayuBulat ?? ""))}</td>
      <td class="number">${formatNumber(t.pcs, 0)}</td>
      <td class="number">${formatNumber(t.ton, 4)}</td>
    </tr>`;
      })
      .join("\n");

    const bodyHtml = `${groupsHtml}
${headers.length ? `<div class="section-title" style="page-break-before:always;">Rangkuman Grand Total</div>
<table class="report-table">
  <thead><tr class="headers-row"><th style="width:8%;">No</th><th style="width:12%;">No. Meja</th><th style="width:22%;">No. ST</th><th style="width:22%;">No KB</th><th style="width:16%;">Total Batang</th><th style="width:20%;">Total Ton</th></tr></thead>
  <tbody>
${rangkumanRows}
  </tbody>
</table>` : `<table class="report-table"><tbody><tr><td colspan="6" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`}`;

    return renderWpsReportPage({
      title: "Laporan Tally Hasil Sawmill Detail",
      subtitle: `Periode : ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
