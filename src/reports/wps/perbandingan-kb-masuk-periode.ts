import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { z } from "zod";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * Special-case report: two-period comparison with trend coloring (green up /
 * red down / gray flat + arrows). Ported from
 * open-api-report's PerbandinganKbMasukPeriode1Dan2ReportService +
 * perbandingan-kb-masuk-periode-1-dan-2-pdf.blade.php. SP takes 4 dates.
 */

export interface DualPeriodParams {
  periode1Awal: string;
  periode1Akhir: string;
  periode2Awal: string;
  periode2Akhir: string;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const dualPeriodParamsSchema = z.object({
  periode1Awal: isoDate,
  periode1Akhir: isoDate,
  periode2Awal: isoDate,
  periode2Akhir: isoDate,
});

/** Legacy rule: ratio = (ton2 - ton1) / ton1 * 100; 999% when the base is 0. */
const calculatePercent = (ton1: number, ton2: number): number => {
  if (ton1 === 0 && ton2 === 0) return 0;
  if (ton1 === 0) return 999;
  return ((ton2 - ton1) / ton1) * 100;
};


export const perbandinganKbMasukReport: ReportDefinition<
  DualPeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "perbandingan-kb-masuk-periode-1-dan-2",
  title: "Laporan Perbandingan KB Masuk Periode 1 dan 2",
  paramsSchema: dualPeriodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("Periode1Awal", sql.Date, params.periode1Awal)
      .input("Periode1Akhir", sql.Date, params.periode1Akhir)
      .input("Periode2Awal", sql.Date, params.periode2Awal)
      .input("Periode2Akhir", sql.Date, params.periode2Akhir)
      .execute("SP_LapPerbandinganKbMasukPeriode1dan2");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const { periode1Awal, periode1Akhir, periode2Awal, periode2Akhir } = meta.params;

    let totalTon1 = 0;
    let totalTon2 = 0;
    const bodyRows = rows
      .map((raw, index) => {
        const ton1 = typeof raw.Ton1 === "number" && Number.isFinite(raw.Ton1) ? raw.Ton1 : 0;
        const ton2 = typeof raw.Ton2 === "number" && Number.isFinite(raw.Ton2) ? raw.Ton2 : 0;
        totalTon1 += ton1;
        totalTon2 += ton2;

        const percent = calculatePercent(ton1, ton2);
        const trendClass = percent > 0 ? "trend-up" : percent < 0 ? "trend-down" : "trend-flat";
        const trendIcon = percent > 0 ? "↑" : percent < 0 ? "↓" : "→";
        const percentText = Math.abs(percent) < 0.0000001 ? "" : formatNumber(percent, 0);

        return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(String(raw.NmSupplier ?? ""))}</td>
        <td class="center">${escapeHtml(String(raw.NoTlp ?? ""))}</td>
        <td class="number">${fmtTon(ton1)}</td>
        <td class="number">${fmtTon(ton2)}</td>
        <td class="number ${trendClass}">${percentText !== "" ? `${percentText}% <span class="trend-arrow">${trendIcon}</span>` : ""}</td>
      </tr>`;
      })
      .join("\n    ");

    const totalPercent = calculatePercent(totalTon1, totalTon2);
    const totalTrendClass = totalPercent > 0 ? "trend-up" : totalPercent < 0 ? "trend-down" : "trend-flat";
    const totalTrendIcon = totalPercent > 0 ? "↑" : totalPercent < 0 ? "↓" : "→";
    const totalPercentText = Math.abs(totalPercent) < 0.0000001 ? "" : formatNumber(totalPercent, 0);

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 30px;">No</th>
      <th style="width: 25%;">Nama Supplier</th>
      <th style="width: 120px;">No.Tlp/HP</th>
      <th style="width: 80px;">Ton1</th>
      <th style="width: 80px;">Ton2</th>
      <th style="width: 110px;">Persen (%)</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(6)}
    ${rows.length > 0
      ? `<tr class="totals-row">
      <td colspan="3" class="center">Grand Total</td>
      <td class="number">${fmtTon(totalTon1)}</td>
      <td class="number">${fmtTon(totalTon2)}</td>
      <td class="number ${totalTrendClass}">${totalPercentText !== "" ? `${totalPercentText}% <span style="margin-left: 3px; font-weight: bold;">${totalTrendIcon}</span>` : ""}</td>
    </tr>`
      : ""}
  </tbody>
</table>`;

    return renderTwoSubtitlePage(
      "Laporan Perbandingan KB Masuk Periode 1 dan 2",
      `Periode 1: ${formatTanggalId(periode1Awal)} s/d ${formatTanggalId(periode1Akhir)}`,
      `Periode 2: ${formatTanggalId(periode2Awal)} s/d ${formatTanggalId(periode2Akhir)}`,
      bodyHtml,
      meta,
    );
  },
};

const fmtTon = (value: number): string => formatNumber(value, 4);

/** Shell variant with TWO subtitle lines (dual-period reports). */
function renderTwoSubtitlePage(
  title: string,
  subtitle1: string,
  subtitle2: string,
  bodyHtml: string,
  meta: { requestedBy: string; generatedAt: Date },
): RenderResult {
  return renderWpsReportPage({
    title,
    subtitle: "",
    bodyHtml: `<p class="report-subtitle" style="margin: 0 0 2px 0;">${escapeHtml(subtitle1)}</p>
<p class="report-subtitle" style="margin: 0 0 20px 0;">${escapeHtml(subtitle2)}</p>
${bodyHtml}`,
    style: "perbandingan_kb_masuk_periode",
    printedBy: meta.requestedBy,
    printedAt: formatPrintedAt(meta.generatedAt),
  });
}
