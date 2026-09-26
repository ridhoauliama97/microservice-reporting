import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapRekapProduksiLaminatingPerJenisPerGrade — "Laporan Rekap Produksi
 * Laminating Per-Jenis & Per-Grade (m3)". Ported from
 * RekapProduksiLaminatingPerJenisPerGradeReportService +
 * rekap-produksi-laminating-per-jenis-per-grade-pdf.blade.php.
 *
 * Rows are sorted by Jenis then NamaGrade and grouped per Jenis. Each group
 * closes with a "Sub Total" row and a grand-total table follows the last group.
 *
 * Deliberately NOT shared with the Cross Cut Akhir or Finger Joint variants:
 * this one has five flow columns, labels the per-group row "Sub Total" (they
 * say "Total" and "Jumlah" respectively) and keeps an active grand total.
 */

interface ProduksiGradeRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaGrade: string | null;
  Moulding: number | string | null;
  Sanding: number | string | null;
  WIP: number | string | null;
  Reproses: number | string | null;
  Output: number | string | null;
}

const FLOW_KEYS = ["InMoulding", "InSanding", "InWIP", "InReproses", "Output"] as const;
type FlowKey = (typeof FLOW_KEYS)[number];

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.trim();
  if (normalized === "" || normalized === "-") return 0;
  let result = normalized.replaceAll(" ", "");
  if (result.includes(",") && result.includes(".")) {
    result = result.lastIndexOf(",") > result.lastIndexOf(".")
      ? result.replaceAll(".", "").replaceAll(",", ".")
      : result.replaceAll(",", "");
  } else if (result.includes(",")) {
    result = result.replaceAll(",", ".");
  }
  const parsed = Number(result);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const readFlows = (row: ProduksiGradeRow): Record<FlowKey, number> => ({
  InMoulding: toFloat(row.Moulding),
  InSanding: toFloat(row.Sanding),
  InWIP: toFloat(row.WIP),
  InReproses: toFloat(row.Reproses),
  Output: toFloat(row.Output),
});

const emptyFlows = (): Record<FlowKey, number> => ({
  InMoulding: 0,
  InSanding: 0,
  InWIP: 0,
  InReproses: 0,
  Output: 0,
});

const HEADERS = `
        <th style="width: 5%;">No</th>
        <th style="width: 20%;">Jenis Kayu</th>
        <th style="width: 20%;">Nama Grade</th>
        <th style="width: 11%;">In Moulding</th>
        <th style="width: 11%;">In Sanding</th>
        <th style="width: 11%;">In WIP</th>
        <th style="width: 11%;">In Reproses</th>
        <th style="width: 11%;">Output</th>`;

const buildGroupTable = (jenis: string, rows: ProduksiGradeRow[]): string => {
  const totals = emptyFlows();
  const bodyRows = rows
    .map((row, index) => {
      const values = readFlows(row);
      for (const key of FLOW_KEYS) totals[key] += values[key];
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(String(row.Jenis ?? ""))}</td>
        <td>${escapeHtml(String(row.NamaGrade ?? ""))}</td>
        <td class="number">${escapeHtml(fmt(values.InMoulding))}</td>
        <td class="number">${escapeHtml(fmt(values.InSanding))}</td>
        <td class="number">${escapeHtml(fmt(values.InWIP))}</td>
        <td class="number">${escapeHtml(fmt(values.InReproses))}</td>
        <td class="number">${escapeHtml(fmt(values.Output))}</td>
      </tr>`;
    })
    .join("\n      ");
  const totalCells = FLOW_KEYS
    .map((key) => `<td class="number">${escapeHtml(fmt(totals[key]))}</td>`)
    .join("\n        ");

  return `<div class="group-title">${escapeHtml(jenis)}</div>
  <table class="report-table grade-table" style="margin-bottom: 12px;">
    <thead>
      <tr class="headers-row">${HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(8)}
      <tr class="totals-row">
        <td colspan="3" class="center">Sub Total</td>
        ${totalCells}
      </tr>
    </tbody>
  </table>`;
};

const buildEmptyGradeTable = (): string => `<table class="report-table">
  <thead>
    <tr class="headers-row">${HEADERS}
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(8)}</tbody>
</table>`;

const buildGrandTotalTable = (grand: Record<FlowKey, number>): string =>
  `<table class="report-table grade-table" style="margin-top: 6px;">
    <tbody>
      <tr class="totals-row">
        <td colspan="3" class="center">Total</td>
        ${FLOW_KEYS.map((key) => `<td class="number" style="width: 11%;">${escapeHtml(fmt(grand[key]))}</td>`).join("\n        ")}
      </tr>
    </tbody>
  </table>`;

export const rekapProduksiLaminatingPerJenisPerGradeReport: ReportDefinition<
  PeriodParams,
  ProduksiGradeRow[]
> = {
  type: "rekap-produksi-laminating-per-jenis-per-grade",
  title: "Laporan Rekap Produksi Laminating Per-Jenis & Per-Grade (m3)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiLaminatingPerJenisPerGrade");
    const rows = (result.recordset ?? []) as ProduksiGradeRow[];
    rows.sort((left, right) => {
      const jenis = compareText(String(left.Jenis ?? ""), String(right.Jenis ?? ""));
      if (jenis !== 0) return jenis;
      return compareText(String(left.NamaGrade ?? ""), String(right.NamaGrade ?? ""));
    });
    return rows;
  },

  render(rows, meta) {
    const grouped = new Map<string, ProduksiGradeRow[]>();
    for (const row of rows) {
      const jenis = String(row.Jenis ?? "").trim() || "JENIS";
      const bucket = grouped.get(jenis);
      if (bucket) bucket.push(row);
      else grouped.set(jenis, [row]);
    }

    const grand = emptyFlows();
    for (const row of rows) {
      const values = readFlows(row);
      for (const key of FLOW_KEYS) grand[key] += values[key];
    }

    const bodyHtml = rows.length > 0
      ? `${[...grouped.entries()]
          .map(([jenis, groupRows]) => buildGroupTable(jenis, groupRows))
          .join("\n  ")}\n  ${buildGrandTotalTable(grand)}`
      : buildEmptyGradeTable();

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi Laminating Per-Jenis & Per-Grade (m3)",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_produksi_laminating_per_jenis_per_grade",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
