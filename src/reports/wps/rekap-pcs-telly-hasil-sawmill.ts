import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { periodParamsSchema, type PeriodParams } from "../period-params";

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
        tanggal: String(r.TglSawmill ?? ""),
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
        const tables = tebalGroups
          .map((tg) => {
            const rowsHtml = tg.rows
              .map((r, i) => `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}"><td>${formatNumber(r.tebal, 0)}</td><td>${formatNumber(r.lebar, 0)}</td><td class="number">${formatNumber(r.pcs, 0)}</td></tr>`)
              .join("\n");
            return `<table class="report-table" style="width:100%;margin-bottom:6px;">
  <thead><tr class="headers-row"><th style="width:33%;">Tebal</th><th style="width:33%;">Lebar</th><th style="width:34%;">Pcs</th></tr></thead>
  <tbody>
${rowsHtml}
    <tr class="totals-row"><td colspan="2" class="center">Total</td><td class="number">${formatNumber(tg.total, 0)}</td></tr>
  </tbody>
</table>`;
          })
          .join("\n");
        gradeHtml.push(`<div class="grade-title" style="font-weight:bold;margin:8px 0 4px 0;">${escapeHtml(gname)}</div>${tables}`);
      }
      const meta = `<hr style="margin:10px 0;" />
<table style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="width:50%;vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td class="meta-label" style="width:110px;font-weight:bold;">Nama Supplier</td><td>:</td><td>${escapeHtml(header.supplier)}</td></tr>
        <tr><td class="meta-label" style="font-weight:bold;">Tanggal Masuk</td><td>:</td><td>${escapeHtml(formatTanggalId(header.tanggal.slice(0, 10)))}</td></tr>
        <tr><td class="meta-label" style="font-weight:bold;">No.Kayu Bulat</td><td>:</td><td>${escapeHtml(header.no_kayu_bulat)}</td></tr>
      </table>
    </td>
    <td style="width:50%;vertical-align:top;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td class="meta-label" style="width:110px;font-weight:bold;">No.Surat Ket</td><td>:</td><td>${escapeHtml(header.suket)}</td></tr>
        <tr><td class="meta-label" style="font-weight:bold;">Jenis Kayu</td><td>:</td><td>${escapeHtml(header.jenis_kayu)}</td></tr>
        <tr><td class="meta-label" style="font-weight:bold;">No Plat</td><td>:</td><td>${escapeHtml(header.no_plat)}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
      docBlocks.push(`${meta}${gradeHtml.join("\n")}`);
    }

    const bodyHtml = docBlocks.length ? docBlocks.join("\n") : `<table class="report-table"><tbody><tr><td colspan="3" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Jumlah (Pcs) Telly Hasil Sawmill",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
