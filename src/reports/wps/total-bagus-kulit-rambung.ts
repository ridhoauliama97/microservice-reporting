import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";

/**
 * "Laporan Total Bagus/Kulit Rambung". Ported from open-api-report's
 * TotalBagusKulitRambungReportService (a custom query, no stored procedure).
 *
 * The query joins STSawmillKG_d / MstGradeKB / STSawmill_h / STSawmill_d /
 * KayuBulat_h / MstJenisKayu to count boards by (Jenis, Kategori, Tebal,
 * Lebar, Panjang), split into Bagus (IsBagusKulit=1) and Kulit
 * (IsBagusKulit=2). grade_id is fixed to 9, mirroring the service config.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const paramsSchema = z.object({ tanggal: z.string().min(1) });

export const totalBagusKulitRambungReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  Array<Record<string, unknown>>
> = {
  type: "total-bagus-kulit-rambung",
  title: "Laporan Total Bagus/Kulit Rambung",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("grade_id", sql.Int, 9)
      .input("report_date", sql.Date, params.tanggal)
      .query(`
SELECT
  COALESCE(F.Jenis, '-') AS Jenis,
  COALESCE(B.NamaGrade, '-') AS Kategori,
  D.Tebal,
  D.Lebar,
  D.Panjang,
  SUM(CASE WHEN D.IsBagusKulit = 1 THEN ISNULL(D.JmlhBatang, 0) ELSE 0 END) AS Bagus,
  SUM(CASE WHEN D.IsBagusKulit = 2 THEN ISNULL(D.JmlhBatang, 0) ELSE 0 END) AS Kulit
FROM STSawmillKG_d A
LEFT JOIN MstGradeKB B ON B.IdGradeKB = A.IdGradeKB
LEFT JOIN STSawmill_h C ON C.NoSTSawmill = A.NoSTSawmill
LEFT JOIN STSawmill_d D ON D.NoSTSawmill = A.NoSTSawmill AND D.NoUrut = A.NoUrut
LEFT JOIN KayuBulat_h E ON E.NoKayuBulat = C.NoKayuBulat
LEFT JOIN MstJenisKayu F ON F.IdJenisKayu = E.IdJenisKayu
WHERE A.IdGradeKB = @grade_id AND CAST(C.TglSawmill AS date) = @report_date
GROUP BY COALESCE(F.Jenis, '-'), COALESCE(B.NamaGrade, '-'), D.Tebal, D.Lebar, D.Panjang
ORDER BY Jenis, Kategori, D.Tebal, D.Lebar, D.Panjang`);
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    let bagus = 0;
    let kulit = 0;
    const bodyRows = rows
      .map((r, i) => {
        const bgs = toFloat(r.Bagus);
        const k = toFloat(r.Kulit);
        bagus += bgs;
        kulit += k;
        return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(String(r.Jenis ?? ""))}</td>
      <td>${escapeHtml(String(r.Kategori ?? ""))}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td class="number">${formatNumber(bgs, 0)}</td>
      <td class="number">${formatNumber(k, 0)}</td>
    </tr>`;
      })
      .join("\n");

    return renderWpsReportPage({
      title: "Laporan Total Bagus/Kulit Rambung",
      subtitle: `Per Tanggal : ${escapeHtml(String(meta.params.tanggal))}`,
      bodyHtml: `<table class="report-table">
  <thead>
    <tr><th style="width:6%;">No</th><th style="width:22%;">Jenis</th><th style="width:20%;">Kategori</th><th style="width:10%;">Tebal</th><th style="width:10%;">Lebar</th><th style="width:10%;">Panjang</th><th style="width:11%;">Bagus</th><th style="width:11%;">Kulit</th></tr>
  </thead>
  <tbody>
${bodyRows || `    <tr><td colspan="8" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
  </tbody>
</table>${rows.length ? `<table class="report-table"><tbody><tr class="totals-row"><td class="center" colspan="6">Total</td><td class="number">${formatNumber(bagus, 0)}</td><td class="number">${formatNumber(kulit, 0)}</td></tr></tbody></table>` : ""}`,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
