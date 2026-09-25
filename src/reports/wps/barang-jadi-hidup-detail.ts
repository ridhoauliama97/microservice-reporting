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
 * SP_LapBJHidupDetail — "Laporan Barang Jadi (Hidup) Detail". Ported from
 * open-api-report's BarangJadiHidupDetailReportService +
 * barang-jadi-hidup-detail-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters): one flat table of the barang
 * jadi pieces still in stock. SP column aliases (DateCreate -> Tanggal,
 * IdLokasi -> Lokasi, Kubik -> M3) are applied in fetchData so render() reads
 * the same keys the legacy blade used.
 *
 * Formats: date dd-M-y, dimensions and piece counts as whole numbers, M3 in
 * 4 decimals (bold), Total row sums M3 only.
 */

interface BjHidupRow extends Record<string, unknown> {
  NoBJ: string | null;
  Tanggal: Date | string | null;
  DateUsage: Date | string | null;
  NoSPK: string | null;
  /** Legacy shows "Jenis - NamaBarangJadi" in one column. */
  Jenis: string | null;
  NamaBarangJadi: string | null;
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

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtDate: d-M-y. */
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

export const barangJadiHidupDetailReport: ReportDefinition<
  Record<never, never>,
  BjHidupRow[]
> = {
  type: "barang-jadi-hidup-detail",
  title: "Laporan Barang Jadi (Hidup) Detail",
  // The SP takes no parameters — reject any params loudly.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SP_LapBJHidupDetail");
    const raw = (result.recordset ?? []) as Array<Record<string, unknown>>;

    const rows = raw.map((row) => {
      const jenis = toText(row.Jenis);
      const barangJadi = toText(row.NamaBarangJadi);
      return {
        ...row,
        NoBJ: toText(row.NoBJ) || null,
        // Legacy blade key aliases.
        Tanggal: row.DateCreate ?? null,
        Lokasi: toText(row.IdLokasi) || null,
        M3: row.Kubik ?? null,
        // Legacy $jenisDisplay: "Jenis - NamaBarangJadi" (or the product alone).
        Jenis:
          jenis !== ""
            ? `${jenis}${barangJadi !== "" ? ` - ${barangJadi}` : ""}`
            : barangJadi !== ""
              ? barangJadi
              : null,
      } as BjHidupRow;
    });

    // Legacy usort: Tanggal DESC, then NoBJ ASC.
    rows.sort((left, right) => {
      const byDate = toText(right.Tanggal).localeCompare(toText(left.Tanggal));
      if (byDate !== 0) return byDate;
      return toText(left.NoBJ).localeCompare(toText(right.NoBJ));
    });

    return rows;
  },

  render(rows, meta) {
    const totalM3 = rows.reduce((sum, row) => sum + toFloat(row.M3), 0);

    const bodyRows = rows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(toText(row.NoBJ))}</td>
        <td class="center">${escapeHtml(fmtDate(row.Tanggal))}</td>
        <td class="center">${escapeHtml(toText(row.NoSPK))}</td>
        <td class="label">${escapeHtml(toText(row.Jenis))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Panjang))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.JmlhBatang))}</td>
        <td class="center">${escapeHtml(toText(row.Lokasi))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtM3(row.M3))}</td>
      </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 32px;">No</th>
      <th style="width: 86px;">No BJ</th>
      <th style="width: 76px;">Tanggal</th>
      <th style="width: 74px;">No SPK</th>
      <th>Jenis</th>
      <th style="width: 44px;">Tebal</th>
      <th style="width: 56px;">Lebar</th>
      <th style="width: 58px;">Panjang</th>
      <th style="width: 70px;">Jumlah Batang</th>
      <th style="width: 54px;">Lokasi</th>
      <th style="width: 56px;">M3</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td class="center" colspan="11">Tidak ada data.</td></tr>`}
    ${
      rows.length > 0
        ? `<tr class="totals-row">
      <td colspan="10" class="center">Total</td>
      <td class="number">${fmtM3(totalM3)}</td>
    </tr>`
        : ""
    }
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Barang Jadi (Hidup) Detail",
      subtitle: "",
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
