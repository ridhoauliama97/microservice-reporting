import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapReprosesHidupDetail — "Laporan Reproses (Hidup) Detail".
 * Ported from ReprosesHidupDetailReportService and
 * reproses-hidup-detail-pdf.blade.php. The legacy detail uses three decimals
 * for M3 and has no subtitle.
 */

interface ReprosesHidupRow extends Record<string, unknown> {
  NoReproses: string | null;
  Tanggal: Date | string | null;
  NoSPK: string | null;
  Jenis: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Panjang: number | string | null;
  JmlhBatang: number | string | null;
  M3: number | string | null;
  Lokasi: string | null;
}

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replaceAll(".", "").replaceAll(",", ".")
      : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(normalized)
      ? normalized.replaceAll(",", "")
      : normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtDate = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!match) return raw;
  return formatTanggalId(match[1]).replace(/\d{4}$/, (year) => year.slice(-2));
};

const fmtWhole = (value: unknown): string => {
  if (value === null || value === "") return "";
  return formatNumber(Math.round(toNumber(value)), 0);
};

const fmtM3 = (value: unknown): string => {
  if (value === null || value === "") return "";
  return formatNumber(toNumber(value), 3);
};

export const reprosesHidupDetailReport: ReportDefinition<
  Record<never, never>,
  ReprosesHidupRow[]
> = {
  type: "reproses-hidup-detail",
  title: "Laporan Reproses (Hidup) Detail",
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SP_LapReprosesHidupDetail");
    const raw = (result.recordset ?? []) as Array<Record<string, unknown>>;
    const rows = raw.map((row) => {
      const jenis = toText(row.Jenis);
      const grade = toText(row.NamaGrade);
      return {
        ...row,
        NoReproses: toText(row.NoReproses) || null,
        Tanggal: row.DateCreate ?? null,
        NoSPK: toText(row.NoSPK) || null,
        Lokasi: toText(row.IdLokasi) || null,
        M3: row.Kubik ?? null,
        Jenis: jenis !== "" ? `${jenis}${grade !== "" ? ` - ${grade}` : ""}` : grade || null,
      } as ReprosesHidupRow;
    });
    rows.sort((left, right) => {
      const byDate = toText(right.Tanggal).localeCompare(toText(left.Tanggal));
      if (byDate !== 0) return byDate;
      return toText(left.NoReproses).localeCompare(toText(right.NoReproses));
    });
    return rows;
  },

  render(rows, meta) {
    const totalM3 = rows.reduce((sum, row) => sum + toNumber(row.M3), 0);
    const bodyRows = rows
      .map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(toText(row.NoReproses))}</td>
        <td class="center">${escapeHtml(fmtDate(row.Tanggal))}</td>
        <td class="center">${escapeHtml(toText(row.NoSPK))}</td>
        <td class="label">${escapeHtml(toText(row.Jenis))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.Panjang))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.JmlhBatang))}</td>
        <td class="number m3-total">${escapeHtml(fmtM3(row.M3))}</td>
        <td class="center">${escapeHtml(toText(row.Lokasi))}</td>
      </tr>`)
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>No Reproses</th>
      <th>Tanggal</th>
      <th>No SPK</th>
      <th>Jenis</th>
      <th>Tebal</th>
      <th>Lebar</th>
      <th>Panjang</th>
      <th>Jumlah Batang</th>
      <th>M3</th>
      <th>Lokasi</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(11)}
    ${rows.length > 0 ? `<tr class="totals-row">
      <td colspan="9" class="center">Total</td>
      <td class="number">${fmtM3(totalM3)}</td>
      <td></td>
    </tr>` : ""}
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Reproses (Hidup) Detail",
      subtitle: "",
      bodyHtml,
      style: "reproses_hidup_detail",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
