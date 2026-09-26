import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * Shared factory for the WPS "(Hidup) Detail" stock-on-hand reports.
 *
 * Cross Cut Akhir and Finger Joint share one layout: a live snapshot (the SP
 * takes no parameters) listing every open item with a closing M3 total. The
 * legacy services only differ in the item-number column and the volume column
 * name, so the aliasing, sorting and table live here once.
 *
 * Ported from cc-akhir-hidup-detail-pdf.blade.php and
 * finger-joint-hidup-detail-pdf.blade.php.
 */

export interface HidupRow extends Record<string, unknown> {
  /** Item number column, normalised from the legacy per-product name. */
  no: string;
  /** Legacy aliases applied by the service. */
  tanggal: Date | string | null;
  noSpk: string | null;
  /** "Jenis - NamaGrade" (legacy $jenisDisplay). */
  jenis: string | null;
  tebal: number | string | null;
  lebar: number | string | null;
  panjang: number | string | null;
  jumlahBatang: number | string | null;
  m3: number | string | null;
  lokasi: string | null;
}

export interface HidupDetailOptions {
  type: string;
  title: string;
  storedProcedure: string;
  /** Item-number column as named by the SP (e.g. "NoCCAkhir", "NoFJ"). */
  numberColumn: string;
  /** Volume column as named by the SP ("Kubik" for CCA, "M3" for FJ). */
  volumeColumn: string;
  /** Legacy header labels, which differ slightly per product. */
  labels: {
    number: string;
    spk: string;
    batang: string;
  };
  /** Legacy per-column widths in px. */
  widths: {
    no: string;
    number: string;
    tanggal: string;
    spk: string;
    tebal: string;
    lebar: string;
    panjang: string;
    batang: string;
    m3: string;
    lokasi: string;
  };
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

/** Legacy $fmtDate: d-M-y (2-digit year). */
const fmtDate = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!iso) return raw;
  return formatTanggalId(iso[1]).replace(/\d{4}$/, (year) => year.slice(-2));
};

/** Legacy $fmtInt / $fmtDim: whole numbers with separators. */
const fmtWhole = (value: unknown): string => {
  if (value === null || value === "") return "";
  return formatNumber(Math.round(toNumber(value)), 0);
};

/** Legacy $fmtM3: 4 decimals. */
const fmtM3 = (value: unknown): string => {
  if (value === null || value === "") return "";
  return formatNumber(toNumber(value), 4);
};

/** Applies the legacy column aliases and the "Jenis - Grade" display value. */
export function normalizeHidupRows(
  raw: Array<Record<string, unknown>>,
  options: Pick<HidupDetailOptions, "numberColumn" | "volumeColumn">,
): HidupRow[] {
  return raw.map((row) => {
    const jenis = toText(row.Jenis);
    const grade = toText(row.NamaGrade);
    return {
      no: toText(row[options.numberColumn]) || null,
      // Legacy blade key aliases.
      tanggal: row.DateCreate ?? null,
      lokasi: toText(row.IdLokasi) || null,
      m3: row[options.volumeColumn] ?? null,
      noSpk: toText(row.NoSPK) || null,
      tebal: row.Tebal ?? null,
      lebar: row.Lebar ?? null,
      panjang: row.Panjang ?? null,
      jumlahBatang: row.JmlhBatang ?? null,
      jenis:
        jenis !== ""
          ? `${jenis}${grade !== "" ? ` - ${grade}` : ""}`
          : grade !== ""
            ? grade
            : null,
    } as unknown as HidupRow;
  });
}

export function createHidupDetailReport(
  options: HidupDetailOptions,
): ReportDefinition<Record<never, never>, HidupRow[]> {
  return {
    type: options.type,
    title: options.title,
    // The SP takes no parameters — reject any params loudly.
    paramsSchema: z.strictObject({}),

    async fetchData(_params, { pool }) {
      const conn = await pool;
      const result = await conn.request().execute(options.storedProcedure);
      const raw = (result.recordset ?? []) as Array<Record<string, unknown>>;

      const rows = normalizeHidupRows(raw, options);

      // Legacy usort: Tanggal DESC, then item number ASC.
      rows.sort((left, right) => {
        const byDate = toText(right.tanggal).localeCompare(toText(left.tanggal));
        if (byDate !== 0) return byDate;
        return toText(left.no).localeCompare(toText(right.no));
      });

      return rows;
    },

    render(rows, meta) {
      const totalM3 = rows.reduce((sum, row) => sum + toNumber(row.m3), 0);

      const bodyRows = rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(toText(row.no))}</td>
        <td class="center">${escapeHtml(fmtDate(row.tanggal))}</td>
        <td class="center">${escapeHtml(toText(row.noSpk))}</td>
        <td class="label">${escapeHtml(toText(row.jenis))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.tebal))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.lebar))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.panjang))}</td>
        <td class="center">${escapeHtml(fmtWhole(row.jumlahBatang))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtM3(row.m3))}</td>
        <td class="center">${escapeHtml(toText(row.lokasi))}</td>
      </tr>`,
        )
        .join("\n    ");

      const w = options.widths;
      const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: ${w.no};">No</th>
      <th style="width: ${w.number};">${escapeHtml(options.labels.number)}</th>
      <th style="width: ${w.tanggal};">Tanggal</th>
      <th style="width: ${w.spk};">${escapeHtml(options.labels.spk)}</th>
      <th>Jenis</th>
      <th style="width: ${w.tebal};">Tebal</th>
      <th style="width: ${w.lebar};">Lebar</th>
      <th style="width: ${w.panjang};">Panjang</th>
      <th style="width: ${w.batang};">${escapeHtml(options.labels.batang)}</th>
      <th style="width: ${w.m3};">M3</th>
      <th style="width: ${w.lokasi};">Lokasi</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(11)}
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
        title: options.title,
        subtitle: "",
        bodyHtml,
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}
