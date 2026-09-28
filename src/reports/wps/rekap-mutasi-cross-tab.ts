import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import {
  buildDisplayHeader,
  buildStatRows,
  COLUMN_KEYS,
  dayLabel,
  metricCells,
  readMetrics,
  type Metrics,
} from "./rekap-mutasi-shared";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapRekapMutasi — "Laporan Rekap Mutasi (Cross Tab)". Ported from
 * RekapMutasiCrossTabReportService and rekap-mutasi-cross-tab-pdf.blade.php.
 *
 * One day per row across the ten product balances, then an Avg / Min / Max
 * table underneath.
 *
 * The same procedure also backs the plain "Rekap Mutasi" report's health check,
 * but that report's data comes from the mutasi procedures instead - see
 * rekap-mutasi.ts. The column mapping, number parsing and formatters are shared
 * with the Discrepancy report in rekap-mutasi-shared.ts.
 */

interface MutasiRow extends Record<string, unknown> {
  Tanggal: unknown;
}

interface CrossTabData {
  rows: Array<{ day: string; metrics: Metrics }>;
  statRows: Array<{ label: string; metrics: Metrics }>;
}

export function buildCrossTabData(rawRows: MutasiRow[]): CrossTabData {
  return {
    rows: rawRows.map((row) => ({
      day: dayLabel(row.Tanggal),
      metrics: readMetrics(row),
    })),
    statRows: buildStatRows(rawRows),
  };
}

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

export const rekapMutasiCrossTabReport: ReportDefinition<
  PeriodParams,
  CrossTabData
> = {
  type: "rekap-mutasi-cross-tab",
  title: "Laporan Rekap Mutasi (Cross Tab)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapMutasi");
    return buildCrossTabData((result.recordset ?? []) as MutasiRow[]);
  },

  render(data, meta) {
    const bodyRows = data.rows
      .map(
        (
          row,
          index,
        ) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(row.day)}</td>
        ${metricCells(row.metrics)}
      </tr>`,
      )
      .join("\n      ");

    const statBody = data.statRows
      .map(
        (
          row,
          index,
        ) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
        <td class="center"><strong>${escapeHtml(row.label)}</strong></td>
        ${metricCells(row.metrics)}
      </tr>`,
      )
      .join("\n      ");

    const columnCount = 1 + COLUMN_KEYS.length;

    const bodyHtml = `<table class="report-table cross-tab">
    ${buildDisplayHeader("")}
    <tbody>
      ${bodyRows || buildEmptyTableRow(columnCount)}
    </tbody>
  </table>
  ${
    data.statRows.length > 0
      ? `<table class="report-table cross-tab stats-table">
    ${buildDisplayHeader()}
    <tbody>
      ${statBody}
    </tbody>
  </table>`
      : ""
  }`;

    return renderWpsReportPage({
      title: "Laporan Rekap Mutasi (Cross Tab)",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_mutasi_cross_tab",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
