import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatPrintedAt, formatTanggalId, toDateKey } from "../../templates/html";
import { renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapTracingST — "Laporan Tracing ST". Ported from open-api-report's
 * TracingStReportService + tracing-st-pdf.blade.php.
 *
 * First row is filtered to a single NoST by the SP (@NoProduk is actually the
 * NoST value). Each traced ST is laid out as a meta block (No ST / No Kayu
 * Bulat / Supplier / No Truk) followed by six step tables: Tanggal Masuk
 * Balok, Tanggal Mulai Racip (day: Umur tunggu), Tanggal Selesai Racip (day:
 * Umur racip), Tanggal Stick (day: Umur stick + optional Balok ke Stick),
 * Tanggal Masuk KD (day: Umur tunggu KD), Tanggal Keluar KD (day: Lama KD).
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
const fmtT = (v: unknown): string => {
  const k = toDateKey(v);
  return k ? formatTanggalId(k) : "-";
};
const tf = (v: unknown): string => (v === null || v === undefined || String(v).trim() === "" ? "-" : String(v));

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
    /** One step box: bold name on the left, date on the right, and the
     *  day-count line underneath (blank when the step has no day count). */
    const step = (name: string, date: string, day?: string): string =>
      `<table class="step">
  <tr>
    <td class="step-name">${escapeHtml(name)}</td>
    <td class="step-date">${escapeHtml(date)}</td>
  </tr>
  ${day ? `<tr><td colspan="2" class="day">${escapeHtml(day)}</td></tr>` : ""}
</table>`;

    // The blade repeats "Laporan Tracing ST" above every traced ST, one ST per
    // page. The page shell already prints that title once, so each card omits it
    // and the cards are simply separated by a page break.
    const cards = rows
      .map((r) => {
        const balokToStick =
          r.BalokToStick !== null && r.BalokToStick !== undefined && String(r.BalokToStick).trim() !== ""
            ? ` | Balok ke Stick ${fmtNum(r.BalokToStick)} hari`
            : "";
        return `<div class="trace-card">
  <table class="meta">
    <tr><td class="label">No ST</td><td class="value">${escapeHtml(tf(r.NoST))}</td></tr>
    <tr><td class="label">No Kayu Bulat</td><td class="value">${escapeHtml(tf(r.NoKayuBulat))}</td></tr>
    <tr><td class="label">Supplier</td><td class="value">${escapeHtml(tf(r.NmSupplier))}</td></tr>
    <tr><td class="label">No Truk</td><td class="value">${escapeHtml(tf(r.NoTruk))}</td></tr>
  </table>
  <div class="section">
${step("Tanggal Masuk Balok", fmtT(r.TglMasuk))}
${step("Tanggal Mulai Racip", fmtT(r.TglMulai), fmtDay(r.UT, "Umur tunggu"))}
${step("Tanggal Selesai Racip", fmtT(r.TglSelesai), fmtDay(r.UR, "Umur racip"))}
${step("Tanggal Stick", fmtT(r.TglStick), fmtDay(r["U-Stick"], "Umur stick") + balokToStick)}
${step("Tanggal Masuk KD", fmtT(r.TglMasukKD), fmtDay(r["UT-KD"], "Umur tunggu KD"))}
${step("Tanggal Keluar KD", fmtT(r.TglKeluar), fmtDay(r.LamaKD, "Lama KD"))}
  </div>
</div>`;
      })
      .join(`<div class="page-break"></div>\n`);

    return renderWpsReportPage({
      title: "Laporan Tracing ST",
      subtitle: "",
      bodyHtml: cards.length ? cards : `<p>Tidak ada data</p>`,
      extraCss: WPS_REFERENCE_CSS["tracing-st"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
