import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapCCAkhirHidupDetail — "Laporan Cross Cut Akhir (Hidup) Detail". Ported
 * from open-api-report's CrossCutAkhirHidupDetailReportService +
 * cc-akhir-hidup-detail-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters). The legacy service:
 *  - aliases DateCreate -> Tanggal, IdLokasi -> Lokasi, Kubik -> M3;
 *  - renders "Jenis - NamaGrade" in the Jenis column ($jenisDisplay);
 *  - sorts Tanggal DESC, then NoCCAkhir ASC.
 * Column order follows the legacy blade (M3 comes before Lokasi here).
 */

interface CcHidupRow extends Record<string, unknown> {
  NoCCAkhir: string | null;
  Tanggal: Date | string | null;
  NoSPK: string | null;
  /** "Jenis - NamaGrade" (legacy $jenisDisplay). */
  Jenis: string | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  JmlhBatang: number | null;
  M3: number | null;
  Lokasi: string | null;
}

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

/** Legacy $fmtDate: d-M-y (2-digit year). */
const fmtDate = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!iso) return raw;
  return formatTanggalId(iso[1]).replace(/(\d{2})\d{2}$/, "$1");
};

/** Legacy $fmtInt / $fmtDim: whole numbers with separators. */
const fmtWhole = (value: unknown): string => {
  if (value === null || value === "") return "";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return formatNumber(Math.round(num), 0);
};

/** Legacy $fmtM3: 4 decimals. */
const fmtM3 = (value: unknown): string => {
  if (value === null || value === "") return "";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return formatNumber(num, 4);
};

export const crossCutAkhirHidupDetailReport: ReportDefinition<
  Record<never, never>,
  CcHidupRow[]
> = {
  type: "cross-cut-akhir-hidup-detail",
  title: "Laporan Cross Cut Akhir (Hidup) Detail",
  // The SP takes no parameters — reject any params loudly.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SP_LapCCAkhirHidupDetail");
    const raw = (result.recordset ?? []) as Array<Record<string, unknown>>;

    const rows = raw.map((row) => {
      const jenis = toText(row.Jenis);
      const grade = toText(row.NamaGrade);
      return {
        ...row,
        NoCCAkhir: toText(row.NoCCAkhir) || null,
        // Legacy blade key aliases.
        Tanggal: row.DateCreate ?? null,
        Lokasi: toText(row.IdLokasi) || null,
        M3: row.Kubik ?? null,
        Jenis:
          jenis !== ""
            ? `${jenis}${grade !== "" ? ` - ${grade}` : ""}`
            : grade !== ""
              ? grade
              : null,
      } as CcHidupRow;
    });

    // Legacy usort: Tanggal DESC, then NoCCAkhir ASC.
    rows.sort((left, right) => {
      const byDate = toText(right.Tanggal).localeCompare(toText(left.Tanggal));
      if (byDate !== 0) return byDate;
      return toText(left.NoCCAkhir).localeCompare(toText(right.NoCCAkhir));
    });

    return rows;
  },

  render(rows, meta) {
    const totalM3 = rows.reduce(
      (sum, row) => sum + (typeof row.M3 === "number" ? row.M3 : 0),
      0,
    );

    const bodyRows = rows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(toText(row.NoCCAkhir))}</td>
        <td class="center">${escapeHtml(fmtDate(row.Tanggal))}</td>
        <td class="center">${escapeHtml(toText(row.NoSPK))}</td>
        <td class="label">${escapeHtml(toText(row.Jenis))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Panjang))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.JmlhBatang))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtM3(row.M3))}</td>
        <td class="center">${escapeHtml(toText(row.Lokasi))}</td>
      </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 32px;">No</th>
      <th style="width: 84px;">No CCAkhir</th>
      <th style="width: 76px;">Tanggal</th>
      <th style="width: 74px;">No SPK</th>
      <th>Jenis</th>
      <th style="width: 44px;">Tebal</th>
      <th style="width: 50px;">Lebar</th>
      <th style="width: 56px;">Panjang</th>
      <th style="width: 66px;">Jumlah Batang</th>
      <th style="width: 56px;">M3</th>
      <th style="width: 54px;">Lokasi</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td class="center" colspan="11">Tidak ada data.</td></tr>`}
    ${
      rows.length > 0
        ? `<tr class="totals-row">
      <td colspan="9" class="center">Total</td>
      <td class="number">${fmtM3(totalM3)}</td>
      <td></td>
    </tr>`
        : ""
    }
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Cross Cut Akhir (Hidup) Detail",
      subtitle: "",
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
