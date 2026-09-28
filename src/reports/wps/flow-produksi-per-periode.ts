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
 * SPWps_LapFlowProduksiPerPeriode — "Laporan Flow Produksi Per-Periode".
 * Ported from FlowProduksiPerPeriodeReportService +
 * flow-produksi-per-periode-pdf.blade.php.
 *
 * A single wide table: one row per wood group, with the SP's twelve flow
 * columns, followed by a totals row and a set of reconciliation lines that
 * subtract one total from another and print the result in parentheses when it
 * is negative.
 */

/** SP columns, in display order, with the legacy header for each. */
const FLOW_COLUMNS: Array<{ key: string; label: string; unit: string }> = [
  { key: "KBTonBeli", label: "Pembelian KB", unit: "Ton" },
  { key: "KBRacip", label: "KB diRacip", unit: "Ton" },
  { key: "STRacipan", label: "ST Hasil Racip", unit: "Ton" },
  { key: "STVacuumStick", label: "ST Siap Vacuum Stick", unit: "Ton" },
  { key: "STKDIn", label: "ST Hasil Racip - ST Masuk KD", unit: "Ton" },
  { key: "STKDOut", label: "ST Keluar KD", unit: "Ton" },
  { key: "STm3Input", label: "ST Pakai di S4S", unit: "Ton" },
  { key: "WIPBersihOutput", label: "WIP Bersih S4S", unit: "m3" },
  { key: "WIPFJInput", label: "WIP Pakai di FJ", unit: "m3" },
  { key: "WIPFJOutput", label: "WIP Hasil FJ", unit: "m3" },
  { key: "WIPMouldingInput", label: "WIP Pakai di Moulding", unit: "m3" },
  { key: "WIPMouldingOutput", label: "WIP hasil Moulding", unit: "m3" },
];

const FLOW_KEYS = FLOW_COLUMNS.map((column) => column.key);

interface FlowRow extends Record<string, unknown> {
  Group: string | null;
}

interface FlowData {
  rows: Array<{ no: number; group: string; values: Record<string, number> }>;
  totals: Record<string, number>;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.trim().replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

/** Legacy formatSignedTon: negatives are wrapped in parentheses. */
const formatSignedTon = (value: number): string => {
  const formatted = formatNumber(Math.abs(value), 4);
  return value < 0 ? `(${formatted}) (Ton)` : `${formatted} (Ton)`;
};

/** Legacy formatSignedM3: same, but an exact zero prints as just "(m3)". */
const formatSignedM3 = (value: number): string => {
  if (Math.abs(value) < 0.0000001) return "(m3)";
  const formatted = formatNumber(Math.abs(value), 4);
  return value < 0 ? `(${formatted}) (m3)` : `${formatted} (m3)`;
};

/** Legacy summary_lines: label (may be blank) plus a reconciliation sentence. */
const SUMMARY_LINES: Array<{ label: string; text: (t: Record<string, number>) => string }> = [
  { label: "Kayu Bulat (KB)", text: (t) => `Pembelian - Racip = ${formatSignedTon(t.KBTonBeli! - t.KBRacip!)}` },
  { label: "Sawn Timber (ST)", text: (t) => `ST Hasil Racip - ST Siap Vaccum Stick = ${formatSignedTon(t.STRacipan! - t.STVacuumStick!)}` },
  { label: "", text: (t) => `ST Hasil Racip - ST Masuk KD = ${formatSignedTon(t.STRacipan! - t.STKDIn!)}` },
  { label: "WIP", text: (t) => `ST Keluar KD - ST Pakai di S4S = ${formatSignedTon(t.STKDOut! - t.STm3Input!)}` },
  { label: "", text: (t) => `WIP Bersih S4S - WIP Pakai di FJ = ${formatSignedM3(t.WIPBersihOutput! - t.WIPFJInput!)}` },
  { label: "", text: (t) => `WIP Hasil FJ - WIP Moulding = ${formatSignedM3(t.WIPFJOutput! - t.WIPMouldingInput!)}` },
];

export const flowProduksiPerPeriodeReport: ReportDefinition<
  PeriodParams,
  FlowData
> = {
  type: "flow-produksi-per-periode",
  title: "Laporan Flow Produksi Per-Periode",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapFlowProduksiPerPeriode");

    const totals: Record<string, number> = {};
    for (const key of FLOW_KEYS) totals[key] = 0;

    const rows = ((result.recordset ?? []) as FlowRow[]).map((row, index) => {
      const values: Record<string, number> = {};
      for (const key of FLOW_KEYS) {
        const value = toFloat(row[key]);
        values[key] = value;
        totals[key] = value + (totals[key] ?? 0);
      }
      return { no: index + 1, group: String(row.Group ?? "").trim(), values };
    });

    return { rows, totals };
  },

  render(data, meta) {
    const bodyRows = data.rows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${row.no}</td>
        <td class="label">${escapeHtml(row.group)}</td>
        ${FLOW_KEYS.map((key) => `<td class="number">${escapeHtml(fmt(row.values[key] ?? 0))}</td>`).join("\n        ")}
      </tr>`,
      )
      .join("\n      ");

    const totalCells = FLOW_KEYS
      .map((key) => `<td class="number">${escapeHtml(fmt(data.totals[key] ?? 0))}</td>`)
      .join("\n        ");

    const summaryHtml = SUMMARY_LINES.map(
      (line) => `<tr>
      <td class="label" style="width: 130px;">${escapeHtml(line.label)}</td>
      <td>${escapeHtml(line.text(data.totals))}</td>
    </tr>`,
    ).join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 3%;">No</th>
      <th style="width: 7.46%;">Group Kayu</th>
      ${FLOW_COLUMNS
        .map((column) => `<th style="width: 7.46%;">${escapeHtml(column.label)}<br>(${escapeHtml(column.unit)})</th>`)
        .join("\n      ")}
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(2 + FLOW_KEYS.length)}
    <tr class="totals-row">
      <td colspan="2" class="center">Total</td>
      ${totalCells}
    </tr>
  </tbody>
</table>
<table class="summary-table">
  <tbody>
    ${summaryHtml}
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Flow Produksi Per-Periode",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "flow_produksi_per_periode",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
