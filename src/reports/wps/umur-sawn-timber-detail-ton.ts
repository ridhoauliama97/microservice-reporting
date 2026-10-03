import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SPWps_LapUmurST — "Laporan Umur Sawn Timber Detail (Ton)". Ported from
 * open-api-report's UmurSawnTimberDetailTonReportService +
 * umur-sawn-timber-detail-ton-pdf.blade.php.
 *
 * Fixed columns per row (Jenis, Tebal, Lebar, Panjang) plus five age buckets
 * (Period1..Period5) and a row total; a tfoot "Total" sums every bucket.
 * Buckets are labelled 0-Umur1, Umur1+1-Umur2, ..., >Umur4.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const paramsSchema = z.object({
  umur1: z.coerce.number().int().min(0).default(0),
  umur2: z.coerce.number().int().min(0).default(0),
  umur3: z.coerce.number().int().min(0).default(0),
  umur4: z.coerce.number().int().min(0).default(0),
});

interface UmurRow extends Record<string, unknown> {
  Jenis: unknown;
  Tebal: unknown;
  Lebar: unknown;
  Panjang: unknown;
  Period1: unknown;
  Period2: unknown;
  Period3: unknown;
  Period4: unknown;
  Period5: unknown;
}

export const umurStDetailTonReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  UmurRow[]
> = {
  type: "umur-sawn-timber-detail-ton",
  title: "Laporan Umur Sawn Timber Detail (Ton)",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("Umur1", sql.Int, params.umur1);
    request.input("Umur2", sql.Int, params.umur2);
    request.input("Umur3", sql.Int, params.umur3);
    request.input("Umur4", sql.Int, params.umur4);
    const result = await request.execute("SPWps_LapUmurST");
    return (result.recordset ?? []) as UmurRow[];
  },

  render(rows, meta) {
    const p = meta.params as { umur1: number; umur2: number; umur3: number; umur4: number };
    const labels = [
      `0 - ${p.umur1}`,
      `${p.umur1 + 1} - ${p.umur2}`,
      `${p.umur2 + 1} - ${p.umur3}`,
      `${p.umur3 + 1} - ${p.umur4}`,
      `> ${p.umur4}`,
    ];
    const totals = [0, 0, 0, 0, 0];
    let rowTotal = 0;
    const bodyRows = rows
      .map((r, i) => {
        const p1 = toFloat(r.Period1), p2 = toFloat(r.Period2), p3 = toFloat(r.Period3), p4 = toFloat(r.Period4), p5 = toFloat(r.Period5);
        totals[0] += p1; totals[1] += p2; totals[2] += p3; totals[3] += p4; totals[4] += p5;
        const rt = p1 + p2 + p3 + p4 + p5;
        rowTotal += rt;
        return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(String(r.Jenis ?? ""))}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td class="number">${formatNumber(p1, 4)}</td>
      <td class="number">${formatNumber(p2, 4)}</td>
      <td class="number">${formatNumber(p3, 4)}</td>
      <td class="number">${formatNumber(p4, 4)}</td>
      <td class="number">${formatNumber(p5, 4)}</td>
      <td class="number"><strong>${formatNumber(rt, 4)}</strong></td>
    </tr>`;
      })
      .join("\n");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width:5%;">No</th>
      <th>Jenis</th><th>Tebal</th><th>Lebar</th><th>Panjang</th>
      <th>${escapeHtml(labels[0])}</th><th>${escapeHtml(labels[1])}</th><th>${escapeHtml(labels[2])}</th><th>${escapeHtml(labels[3])}</th><th>${escapeHtml(labels[4])}</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
${bodyRows || `    <tr><td colspan="11" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
  </tbody>${
  rows.length
    ? `
  <tfoot>
    <tr class="totals-row">
      <td colspan="5" class="center">Total</td>
      <td class="number">${formatNumber(totals[0], 4)}</td>
      <td class="number">${formatNumber(totals[1], 4)}</td>
      <td class="number">${formatNumber(totals[2], 4)}</td>
      <td class="number">${formatNumber(totals[3], 4)}</td>
      <td class="number">${formatNumber(totals[4], 4)}</td>
      <td class="number">${formatNumber(rowTotal, 4)}</td>
    </tr>
  </tfoot>`
    : ""
}
</table>`;

    return renderWpsReportPage({
      title: "Laporan Umur Sawn Timber Detail (Ton)",
      subtitle: "",
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["umur-sawn-timber-detail-ton"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
