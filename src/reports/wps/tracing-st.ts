import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt } from "../../templates/html";
import { renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapTracingST — "Laporan Tracing ST". Ported from open-api-report's
 * TracingStReportService + tracing-st-pdf.blade.php.
 *
 * Takes @NoProduk. One block per traced ST (NoST): a meta table, then six
 * step tables (Tanggal Masuk Balok / Tanggal Mulai Racip / Tanggal Selesai
 * Racip / Tanggal Stick / Tanggal Masuk KD / Tanggal Keluar KD) with the
 * per-step umur-tunggu/umur-racip/etc. line between them. Each step date and
 * day count is taken straight from the SP row.
 */

const fmtNum = (v: unknown): string => {
  const n = typeof v === "number" && Number.isFinite(v) ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v)
    : null;
  return n === null ? "-" : String(Math.round(n));
};
const fmtDay = (v: unknown, label: string): string => {
  const n = fmtNum(v);
  return n === "-" ? `${label}: - hari` : `${label}: ${n} hari`;
};

const paramsSchema = z.object({ noProduk: z.string().trim().min(1) });

export const tracingStReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  Array<Record<string, unknown>>
> = {
  type: "tracing-st",
  title: "Laporan Tracing ST",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request().input("NoProduk", sql.VarChar(20), params.noProduk).execute("SP_LapTracingST");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const cards = rows
      .map((r, idx) => {
        const tfmt = (v: unknown): string => {
          const s = String(v ?? "").trim();
          return s === "" ? "-" : s;
        };
        const card = `<div style="margin-bottom:18px;">
  <div style="font-weight:bold;font-size:13px;margin-bottom:6px;">Laporan Tracing ST</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tr><td style="width:40%;padding:2px 0;font-weight:bold;">No ST</td><td>${escapeHtml(tfmt(r.NoST))}</td></tr>
    <tr><td style="font-weight:bold;padding:2px 0;">No Kayu Bulat</td><td>${escapeHtml(tfmt(r.NoKayuBulat))}</td></tr>
    <tr><td style="font-weight:bold;padding:2px 0;">Supplier</td><td>${escapeHtml(tfmt(r.NmSupplier))}</td></tr>
    <tr><td style="font-weight:bold;padding:2px 0;">No Truk</td><td>${escapeHtml(tfmt(r.NoTruk))}</td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;border:1px solid #000;">
    <tr><td style="font-weight:bold;padding:5px 8px;border-bottom:1px solid #000;">Tanggal Masuk Balok</td><td style="padding:5px 8px;border-bottom:1px solid #000;">${escapeHtml(tfmt(r.TglMasuk))}</td></tr>
    <tr><td colspan="2" style="padding:2px 8px;color:#555;">${escapeHtml(fmtDay(r.UT, "Umur tunggu"))}</td></tr>
    <tr><td style="font-weight:bold;padding:5px 8px;border-top:1px solid #000;">Tanggal Mulai Racip</td><td style="padding:5px 8px;border-top:1px solid #000;">${escapeHtml(tfmt(r.TglMulai))}</td></tr>
    <tr><td colspan="2" style="padding:2px 8px;color:#555;">${escapeHtml(fmtDay(r.UR, "Umur racip"))}</td></tr>
    <tr><td style="font-weight:bold;padding:5px 8px;border-top:1px solid #000;">Tanggal Selesai Racip</td><td style="padding:5px 8px;border-top:1px solid #000;">${escapeHtml(tfmt(r.TglSelesai))}</td></tr>
    <tr><td colspan="2" style="padding:2px 8px;color:#555;">${escapeHtml(fmtDay(r["U-Stick"], "Umur stick"))}${r.BalokToStick !== null && r.BalokToStick !== undefined ? ` | Balok ke Stick ${escapeHtml(fmtNum(r.BalokToStick))} hari` : ""}</td></tr>
    <tr><td style="font-weight:bold;padding:5px 8px;border-top:1px solid #000;">Tanggal Masuk KD</td><td style="padding:5px 8px;border-top:1px solid #000;">${escapeHtml(tfmt(r.TglMasukKD))}</td></tr>
    <tr><td colspan="2" style="padding:2px 8px;color:#555;">${escapeHtml(fmtDay(r["UT-KD"], "Umur tunggu KD"))}</td></tr>
    <tr><td style="font-weight:bold;padding:5px 8px;border-top:1px solid #000;"> Tanggal Keluar KD</td><td style="padding:5px 8px;border-top:1px solid #000;">${escapeHtml(tfmt(r.TglKeluar))}</td></tr>
    <tr><td colspan="2" style="padding:2px 8px;color:#555;">${escapeHtml(fmtDay(r.LamaKD, "Lama KD"))}</td></tr>
  </table>
</div>`;
        return card;
      })
      .join("<div style=\"page-break-before:always;\"></div>");

    if (!rows.length) {
      return renderWpsReportPage({
        title: "Laporan Tracing ST",
        subtitle: "",
        bodyHtml: `<p>Tidak ada data</p>`,
        extraCss: `body{font-size:11px;}`,
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    }

    return renderWpsReportPage({
      title: "Laporan Tracing ST",
      subtitle: "",
      bodyHtml: `${cards}`,
      extraCss: `body{font-size:11px;}`,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
