import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId, toDateKey } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SPWps_RekapPcsTellyHasilSawmill — "Laporan Rekap Jumlah (Pcs) Telly Hasil
 * Sawmill". Ported from open-api-report's RekapPcsTellyHasilSawmillReportService +
 * rekap-pcs-telly-hasil-sawmill-pdf.blade.php.
 *
 * Grouped per document (one page of header: supplier / tanggal / no_kayu_bulat
 * | suket / jenis_kayu / no_plat), then per NamaGrade with the tebal/lebar/pcs
 * rows of that grade. Tebal groups are rendered as small tables (Tebal|Lebar|Pcs).
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

export const rekapPcsTellyHasilSawmillReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "rekap-pcs-telly-hasil-sawmill",
  title: "Laporan Rekap Jumlah (Pcs) Telly Hasil Sawmill",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SPWps_RekapPcsTellyHasilSawmill");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    // Build documents keyed by header identity (as the service does).
    const docs = new Map<string, { header: any; grades: Map<string, Map<number, { tebal: number; rows: Array<{ tebal: number; lebar: number; pcs: number }>; total: number }>>; total: number }>();
    for (const r of rows) {
      const header = {
        supplier: String(r.NmSupplier ?? "-"),
        tanggal: toDateKey(r.TglSawmill),
        no_kayu_bulat: String(r.NoKayuBulat ?? "-"),
        suket: String(r.Suket ?? "-"),
        jenis_kayu: String(r.Jenis ?? "-"),
        no_plat: String(r.NoPlat ?? "-"),
      };
      const dkey = [header.supplier, header.tanggal, header.no_kayu_bulat, header.suket, header.jenis_kayu, header.no_plat].join("|");
      let doc = docs.get(dkey);
      if (!doc) {
        doc = { header, grades: new Map(), total: 0 };
        docs.set(dkey, doc);
      }
      const gname = String(r.NamaGrade ?? "").trim() || "Tanpa Grade";
      let gradeMap = doc.grades.get(gname);
      if (!gradeMap) {
        gradeMap = new Map();
        doc.grades.set(gname, gradeMap);
      }
      const tkey = Number(toFloat(r.Tebal));
      let tb = gradeMap.get(tkey);
      if (!tb) {
        tb = { tebal: tkey, rows: [], total: 0 };
        gradeMap.set(tkey, tb);
      }
      const pcs = toFloat(r.JmlhBatang);
      tb.rows.push({ tebal: tkey, lebar: toFloat(r.Lebar), pcs });
      tb.total += pcs;
      doc.total += pcs;
    }

    const docBlocks: string[] = [];
    for (const doc of docs.values()) {
      const header = doc.header;
      const gradeHtml: string[] = [];
      for (const [gname, gradeMap] of doc.grades) {
        const tebalGroups = [...gradeMap.values()].sort((a, b) => a.tebal - b.tebal);
        // A grade's tebal groups are laid out TWO PER ROW (47.5% each with a 5%
        // gutter between), so a grade with four thicknesses is two grid rows of
        // two tables, not one row of four. Each table is closed by a
        // right-aligned "Jmlh Tebal {n}" line.
        const pane = (tg: (typeof tebalGroups)[number]): string => {
          const rowsHtml = tg.rows
            .map((r, i) => `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}${i === tg.rows.length - 1 ? " row-last" : ""}"><td>${formatNumber(r.tebal, 0)}</td><td>${formatNumber(r.lebar, 0)}</td><td class="number">${formatNumber(r.pcs, 0)}</td></tr>`)
            .join("\n");
          return `<td style="width:47.5%;">
  <table class="tebal-table">
    <thead><tr class="headers-row"><th style="width:33%;">Tebal</th><th style="width:33%;">Lebar</th><th style="width:34%;">Pcs</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  <div class="tebal-total">Jmlh Tebal ${formatNumber(tg.tebal, 0)} : <strong>${formatNumber(tg.total, 0)}</strong></div>
</td>`;
        };
        const rows: string[] = [];
        for (let i = 0; i < tebalGroups.length; i += 2) {
          const pair = tebalGroups.slice(i, i + 2).map(pane);
          // An unpaired last group still gets the gutter cell so the row keeps
          // its 47.5 / 5 / 47.5 widths.
          if (pair.length === 1) pair.push(`<td class="split-gap"></td>`);
          rows.push(`<tr>${pair.join("")}</tr>`);
        }
        const tables = `<table class="split-layout"><tbody>${rows.join("")}</tbody></table>`;
        const gradeTotal = [...gradeMap.values()].reduce((s, tg) => s + tg.total, 0);
        gradeHtml.push(`<div class="grade-title">${escapeHtml(gname)}</div>${tables}
<div class="grade-total">Jmlh ${escapeHtml(gname)} : <strong>${formatNumber(gradeTotal, 0)}</strong></div>`);
      }
      const meta = `<hr style="margin:10px 0;" />
<table class="meta-layout">
  <tr>
    <td style="width:50%;padding-right:14px;vertical-align:top;">
      <table class="meta-block">
        <tr><td class="meta-label">Nama Supplier</td><td class="meta-separator">:</td><td>${escapeHtml(header.supplier)}</td></tr>
        <tr><td class="meta-label">Tanggal Masuk</td><td class="meta-separator">:</td><td>${escapeHtml(formatTanggalId(header.tanggal))}</td></tr>
        <tr><td class="meta-label">No.Kayu Bulat</td><td class="meta-separator">:</td><td>${escapeHtml(header.no_kayu_bulat)}</td></tr>
      </table>
    </td>
    <td style="width:50%;padding-left:14px;vertical-align:top;">
      <table class="meta-block">
        <tr><td class="meta-label">No.Surat Ket</td><td class="meta-separator">:</td><td>${escapeHtml(header.suket)}</td></tr>
        <tr><td class="meta-label">Jenis Kayu</td><td class="meta-separator">:</td><td>${escapeHtml(header.jenis_kayu)}</td></tr>
        <tr><td class="meta-label">No Plat</td><td class="meta-separator">:</td><td>${escapeHtml(header.no_plat)}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
      const footerSummary = `<table class="footer-summary">
  <tbody>
    <tr>
      <td class="left">Jmlh Per- Tanggal ${escapeHtml(formatTanggalId(header.tanggal))} : <strong>${formatNumber(doc.total, 0)}</strong></td>
      <td class="right">Jmlh Per- ${escapeHtml(header.supplier)} : <strong>${formatNumber(doc.total, 0)}</strong></td>
    </tr>
  </tbody>
</table>`;
      docBlocks.push(`${meta}${gradeHtml.join("\n")}${footerSummary}`);
    }

    const bodyHtml = docBlocks.length ? docBlocks.join("\n") : `<table class="report-table"><tbody><tr><td colspan="3" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Jumlah (Pcs) Telly Hasil Sawmill",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["rekap-pcs-telly-hasil-sawmill"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
