import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * SP_LapRekapRendemenRambungPerSupplier + ...SUB — "Laporan Rekap Rendemen
 * Rambung Per Supplier". Ported from
 * open-api-report's RekapRendemenRambungPerSupplierService +
 * rekap-rendemen-rambung-per-supplier-pdf.blade.php.
 *
 * Two sections: "Detail Transaksi" (one row per transaction, sorted by
 * rendemen descending) and "Rangkuman Per Supplier" (the SUB SP: SLP and
 * Bansaw side by side plus their combined Total, also sorted by total
 * rendemen descending, with a tfoot Total row).
 *
 * Legacy formatting quirk reproduced on purpose: the detail table and the
 * summary KBTon columns use Indonesian grouping (1.234,56) while the summary
 * ST columns use English grouping (1,234.5678) — see fmtId / fmtEn.
 */

interface RendemenDetailRow extends Record<string, unknown> {
  NmSupplier: string | null;
  NoTruk: number | null;
  Group: string | null;
  KBTon: number | null;
  STTon: number | null;
}

interface RendemenSummaryRow extends Record<string, unknown> {
  NmSupplier: string | null;
  SLPKBton: number | null;
  SLPstton: number | null;
  SLPPersen: number | null;
  BansawKBton: number | null;
  Bansawstton: number | null;
  BansawPersen: number | null;
}

interface RendemenData {
  details: RendemenDetailRow[];
  summary: RendemenSummaryRow[];
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtID: number_format(v, 2, ',', '.') — Indonesian grouping, blank when 0. */
const fmtId = (value: number, decimals = 2): string => {
  if (Math.abs(value) < 0.0000001) return "";
  const [intPart, decPart] = value.toFixed(decimals).split(".");
  const int = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals > 0 ? `${int},${decPart}` : int;
};

/** Legacy $fmtEN: number_format(v, 4, '.', ',') — English grouping, blank when 0. */
const fmtEn = (value: number, decimals = 4): string =>
  formatNumber(value, decimals, { blankWhenZero: true });

const rendemenOf = (kb: number, st: number): number =>
  kb > 0 ? (st / kb) * 100 : 0;

/** Percent cell: 2 decimals + "%" when the KB base is > 0, else blank/"-". */
const fmtPercent = (percent: number, base: number, dash: boolean): string => {
  if (base <= 0) return dash ? "-" : "";
  return `${formatNumber(percent, 2)}%`;
};

const RENDEMEN_CSS = `
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tfoot td { font-weight: bold; font-size: 11px; background: #fff; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

function buildDetailHtml(rows: RendemenDetailRow[]): string {
  const sorted = [...rows].sort(
    (left, right) =>
      rendemenOf(toFloat(right.KBTon), toFloat(right.STTon)) -
      rendemenOf(toFloat(left.KBTon), toFloat(left.STTon)),
  );

  const bodyRows = sorted
    .map((row, index) => {
      const kb = toFloat(row.KBTon);
      const st = toFloat(row.STTon);
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(String(row.NmSupplier ?? "-"))}</td>
        <td class="center">${escapeHtml(row.NoTruk === null || row.NoTruk === undefined ? "-" : String(row.NoTruk))}</td>
        <td class="center">${escapeHtml(String(row.Group ?? "-"))}</td>
        <td class="number">${fmtId(kb)}</td>
        <td class="number">${fmtId(st)}</td>
        <td class="number" style="font-weight: bold;">${fmtPercent(rendemenOf(kb, st), kb, true)}</td>
      </tr>`;
    })
    .join("\n    ");

  return `<div class="section-title">Detail Transaksi</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 30px;">No</th>
      <th style="width: 26%;">Nama Supplier</th>
      <th style="width: 70px;">No Truk</th>
      <th style="width: 70px;">Group</th>
      <th style="width: 80px;">KB Ton</th>
      <th style="width: 80px;">ST Ton</th>
      <th style="width: 80px;">Rendemen</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr class="data-row row-odd"><td class="center" colspan="7">Tidak ada data.</td></tr>`}
  </tbody>
</table>`;
}

function buildSummaryHtml(rows: RendemenSummaryRow[]): string {
  if (rows.length === 0) return "";

  const sorted = [...rows].sort((left, right) => {
    const leftKb = toFloat(left.SLPKBton) + toFloat(left.BansawKBton);
    const leftSt = toFloat(left.SLPstton) + toFloat(left.Bansawstton);
    const rightKb = toFloat(right.SLPKBton) + toFloat(right.BansawKBton);
    const rightSt = toFloat(right.SLPstton) + toFloat(right.Bansawstton);
    return rendemenOf(rightKb, rightSt) - rendemenOf(leftKb, leftSt);
  });

  const totals = { slpKb: 0, slpSt: 0, bsKb: 0, bsSt: 0, totKb: 0, totSt: 0 };

  const bodyRows = sorted
    .map((row, index) => {
      const slpKb = toFloat(row.SLPKBton);
      const slpSt = toFloat(row.SLPstton);
      const slpPct = toFloat(row.SLPPersen);
      const bsKb = toFloat(row.BansawKBton);
      const bsSt = toFloat(row.Bansawstton);
      const bsPct = toFloat(row.BansawPersen);
      const totKb = slpKb + bsKb;
      const totSt = slpSt + bsSt;

      totals.slpKb += slpKb;
      totals.slpSt += slpSt;
      totals.bsKb += bsKb;
      totals.bsSt += bsSt;
      totals.totKb += totKb;
      totals.totSt += totSt;

      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td>${escapeHtml(String(row.NmSupplier ?? "-").trim())}</td>
        <td class="number">${fmtId(slpKb)}</td>
        <td class="number">${fmtEn(slpSt, 4)}</td>
        <td class="number">${fmtPercent(slpPct, slpKb, false)}</td>
        <td class="number">${fmtId(bsKb)}</td>
        <td class="number">${fmtEn(bsSt, 4)}</td>
        <td class="number">${fmtPercent(bsPct, bsKb, false)}</td>
        <td class="number" style="font-weight: bold;">${fmtId(totKb)}</td>
        <td class="number" style="font-weight: bold;">${fmtEn(totSt, 4)}</td>
        <td class="number" style="font-weight: bold;">${fmtPercent(rendemenOf(totKb, totSt), totKb, false)}</td>
      </tr>`;
    })
    .join("\n    ");

  const footRow = `<tr>
        <td class="center">Total</td>
        <td class="number">${fmtId(totals.slpKb)}</td>
        <td class="number">${fmtEn(totals.slpSt, 4)}</td>
        <td class="number">${fmtPercent(rendemenOf(totals.slpKb, totals.slpSt), totals.slpKb, false)}</td>
        <td class="number">${fmtId(totals.bsKb)}</td>
        <td class="number">${fmtEn(totals.bsSt, 4)}</td>
        <td class="number">${fmtPercent(rendemenOf(totals.bsKb, totals.bsSt), totals.bsKb, false)}</td>
        <td class="number">${fmtId(totals.totKb)}</td>
        <td class="number">${fmtEn(totals.totSt, 4)}</td>
        <td class="number">${fmtPercent(rendemenOf(totals.totKb, totals.totSt), totals.totKb, false)}</td>
      </tr>`;

  return `<div class="section-title">Rangkuman Per Supplier</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 150px;">Supplier</th>
      <th colspan="3">SLP</th>
      <th colspan="3">Bansaw</th>
      <th colspan="3">Total</th>
    </tr>
    <tr class="headers-row">
      <th style="width: 65px;">KBTon</th>
      <th style="width: 65px;">STTon</th>
      <th style="width: 50px;">%</th>
      <th style="width: 65px;">KBTon</th>
      <th style="width: 65px;">STTon</th>
      <th style="width: 50px;">%</th>
      <th style="width: 65px;">KBTon</th>
      <th style="width: 65px;">STTon</th>
      <th style="width: 60px;">%</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
  </tbody>
  <tfoot>
    ${footRow}
  </tfoot>
</table>`;
}

const buildBodyHtml = (data: RendemenData): string =>
  `${buildDetailHtml(data.details)}
${buildSummaryHtml(data.summary)}`;

export const rekapRendemenRambungPerSupplierReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "rekap-rendemen-rambung-per-supplier",
  title: "Laporan Rekap Rendemen Rambung Per Supplier",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [detailResult, summaryResult] = await Promise.all([
      conn
        .request()
        .input("StartDate", sql.Date, params.tglAwal)
        .input("EndDate", sql.Date, params.tglAkhir)
        .execute("SP_LapRekapRendemenRambungPerSupplier"),
      conn
        .request()
        .input("StartDate", sql.Date, params.tglAwal)
        .input("EndDate", sql.Date, params.tglAkhir)
        .execute("SP_LapRekapRendemenRambungPerSupplierSUB"),
    ]);

    return [
      ...(detailResult.recordset ?? []),
      // The sub rows are carried alongside; render() splits them by shape.
      ...(summaryResult.recordset ?? []),
    ] as Array<Record<string, unknown>>;
  },

  render(rows, meta): RenderResult {
    const isSummaryRow = (row: Record<string, unknown>): boolean =>
      row.SLPKBton !== undefined ||
      row.SLPstton !== undefined ||
      row.BansawKBton !== undefined ||
      row.Bansawstton !== undefined;

    const data: RendemenData = {
      details: rows.filter((row) => !isSummaryRow(row)) as RendemenDetailRow[],
      summary: rows.filter(isSummaryRow) as RendemenSummaryRow[],
    };

    return renderWpsReportPage({
      title: "Laporan Rekap Rendemen Rambung Per Supplier",
      subtitle: `Periode: ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml: buildBodyHtml(data),
      extraCss: RENDEMEN_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
