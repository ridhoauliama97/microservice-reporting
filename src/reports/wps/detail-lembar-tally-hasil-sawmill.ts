import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId, toDateKey } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SPWps_DetailLembarTallyHasilSawmill — "Laporan Tally Hasil Sawmill Detail".
 * Ported from open-api-report's DetailLembarTallyHasilSawmillReportService +
 * detail-lembar-tally-hasil-sawmill-pdf.blade.php.
 *
 * Company each tally sheet (NoSTSawmill): a two-column meta block (No. Meja /
 * No. ST / Tanggal / Operator | Supplier / Jenis Kayu / No KB / No.Plat), then a
 * report-table of that sheet's lines (No|Tebal|Lebar|UOMTblLebar|Panjang|
 * UOMPanjang|Jmlh Batang|Ton) with a Total row. After all sheets, a Rangkuman
 * Grand Total table listing one row per sheet and closing with the report-wide
 * Grand Total row.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};



const mapSizeUomIdx = (id: unknown): string => {
  const i = Number(id);
  if (i === 1) return "mm";
  if (i === 2) return "cm";
  if (i === 3) return "inch";
  return "-";
};
const mapLengthUomIdx = (id: unknown): string => {
  const i = Number(id);
  if (i === 1) return "mm";
  if (i === 2) return "cm";
  if (i === 3) return "m";
  if (i === 4) return "feet";
  return "-";
};

export const detailLembarTallyHasilSawmillReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "detail-lembar-tally-hasil-sawmill",
  title: "Laporan Tally Hasil Sawmill Detail",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SPWps_DetailLembarTallyHasilSawmill");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const headers: Array<Record<string, any>> = [];
    const seen = new Set<string>();
    const lines: Record<string, Array<Record<string, unknown>>> = {};
    let totals: Record<string, { pcs: number; ton: number }> = {};
    for (const r of rows) {
      const key = String(r.NoSTSawmill ?? "");
      if (!seen.has(key)) {
        seen.add(key);
        headers.push({ key });
        lines[key] = [];
        totals[key] = { pcs: 0, ton: 0 };
      }
      lines[key].push(r);
      totals[key].pcs += toFloat(r.JmlhBatang);
      totals[key].ton += toFloat(r.Ton);
    }
    const groupsHtml = headers
      .map((h) => {
        const key = h.key;
        const first = lines[key][0] as Record<string, unknown>;
        const noMeja = String(first.NoMeja ?? "-");
        const noSt = String(first.NoSTSawmill ?? "-");
        const tanggal = toDateKey(first.TglSawmill);
        const operator = String(first.Operator ?? "-");
        const supplier = String(first.NmSupplier ?? "-");
        const jenis = String(first.Jenis ?? "-");
        const noKb = String(first.NoKayuBulat ?? "-");
        const noPlat = String(first.NoPlat ?? "-");
        let sPcs = 0, sTon = 0;
        const rowsHtml = lines[key]
          .map((r, i) => {
            const pcs = toFloat(r.JmlhBatang);
            const ton = toFloat(r.Ton);
            sPcs += pcs;
            sTon += ton;
            const isLast = i === lines[key].length - 1;
            return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}${isLast ? " row-last" : ""}">
      <td>${escapeHtml(String(r.NoUrut ?? i + 1))}</td>
      <td>${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td>${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td>${escapeHtml(mapSizeUomIdx(r.IdUOMTblLebar))}</td>
      <td class="number">${formatNumber(toFloat(r.Panjang), 0)}</td>
      <td>${escapeHtml(mapLengthUomIdx(r.IdUOMPanjang))}</td>
      <td class="number">${formatNumber(pcs, 0)}</td>
      <td class="number">${formatNumber(ton, 4)}</td>
    </tr>`;
          })
          .join("\n");
        const meta = `<table class="meta-layout">
  <tbody>
    <tr>
      <td style="width:50%;padding-right:14px;">
        <table class="meta-block">
          <tbody>
            <tr><td class="meta-label">No. Meja</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(noMeja)}</td></tr>
            <tr><td class="meta-label">No. ST</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(noSt)}</td></tr>
            <tr><td class="meta-label">Tanggal</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(formatTanggalId(tanggal))}</td></tr>
            <tr><td class="meta-label">Operator</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(operator)}</td></tr>
          </tbody>
        </table>
      </td>
      <td style="width:50%;padding-left:14px;">
        <table class="meta-block">
          <tbody>
            <tr><td class="meta-label">Supplier</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(supplier)}</td></tr>
            <tr><td class="meta-label">Jenis Kayu</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(jenis)}</td></tr>
            <tr><td class="meta-label">No KB</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(noKb)}</td></tr>
            <tr><td class="meta-label">No.Plat</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(noPlat)}</td></tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>`;
        return `<div class="tally-sheet">
${meta}
<table class="report-table">
  <thead><tr class="headers-row"><th style="width:6%;">No</th><th style="width:9%;">Tebal</th><th style="width:9%;">Lebar</th><th style="width:14%;">UOM Tbl Lebar</th><th style="width:10%;">Panjang</th><th style="width:14%;">UOM Panjang</th><th style="width:14%;">Jmlh Batang</th><th style="width:24%;">Ton</th></tr></thead>
  <tbody>
${rowsHtml}
    <tr class="totals-row"><td colspan="6" class="totals-label">Total</td><td class="number">${formatNumber(sPcs, 0)}</td><td class="number">${formatNumber(sTon, 4)}</td></tr>
  </tbody>
</table>
</div>`;
      })
      .join("");

    const rangkumanRows = headers
      .map((h, i) => {
        const key = h.key;
        const first = lines[key][0] as Record<string, unknown>;
        const t = totals[key];
        return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(String(first.NoMeja ?? ""))}</td>
      <td>${escapeHtml(String(first.NoSTSawmill ?? ""))}</td>
      <td>${escapeHtml(String(first.NoKayuBulat ?? ""))}</td>
      <td class="number">${formatNumber(t.pcs, 0)}</td>
      <td class="number">${formatNumber(t.ton, 4)}</td>
    </tr>`;
      })
      .join("\n");

    // The Rangkuman closes with a report-wide Grand Total row, not one total
    // per sheet.
    const grandPcs = headers.reduce((s, h) => s + totals[h.key].pcs, 0);
    const grandTon = headers.reduce((s, h) => s + totals[h.key].ton, 0);
    const grandTotalRow = `    <tr class="totals-row"><td colspan="4" class="totals-label">Grand Total</td><td class="number">${formatNumber(grandPcs, 0)}</td><td class="number">${formatNumber(grandTon, 4)}</td></tr>`;

    const bodyHtml = `${groupsHtml}
${headers.length ? `<div class="page-break"></div>
<div class="section-title">Rangkuman Grand Total</div>
<table class="report-table">
  <thead><tr class="headers-row"><th style="width:8%;">No</th><th style="width:12%;">No. Meja</th><th style="width:22%;">No. ST</th><th style="width:22%;">No KB</th><th style="width:16%;">Total Batang</th><th style="width:20%;">Total Ton</th></tr></thead>
  <tbody>
${rangkumanRows}
${grandTotalRow}
  </tbody>
</table>` : `<table class="report-table"><tbody><tr><td colspan="6" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`}`;

    return renderWpsReportPage({
      title: "Laporan Tally Hasil Sawmill Detail",
      subtitle: `Periode : ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["detail-lembar-tally-hasil-sawmill"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
