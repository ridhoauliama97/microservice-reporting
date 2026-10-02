import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapStockSTKering — "Laporan Stock ST Kering". Ported from open-api-report's
 * StockSTKeringReportService + stock-st-kering-pdf.blade.php.
 *
 * Takes a single @EndDate. Rows are grouped by Jenis, then by Produk; each
 * product gets its own table of the SP's columns, a "Sub Total {produk}" row
 * and, after the last product of a Jenis, a "Total {jenis}" row. Negative Pcs
 * / Ton cells are flagged.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

// SP column order: matches the live result set.
const COLUMNS = ["Status", "Jenis", "Produk", "NoST", "DateCreate", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Ton", "IdLokasi"] as const;
const PCS_COL = "JmlhBatang";
const TON_COL = "Ton";

const LABELS: Record<string, string> = {
  Status: "Status", Jenis: "Jenis", Produk: "Produk", NoST: "No ST", DateCreate: "Tanggal",
  Tebal: "Tebal", Lebar: "Lebar", Panjang: "Panjang", JmlhBatang: "Jmlh Batang", Ton: "Ton", IdLokasi: "Lokasi",
};

const paramsSchema = z.object({ tglAkhir: z.string().min(1) });

const isDate = (col: string): boolean => col === "DateCreate";
const isNumeric = (col: string): boolean => ["Tebal", "Lebar", "Panjang", "JmlhBatang", "Ton"].includes(col);
const isPc = (col: string): boolean => col === PCS_COL;
const isTon = (col: string): boolean => col === TON_COL;

interface StockRow extends Record<string, unknown> {}

export const stockStKeringReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  StockRow[]
> = {
  type: "stock-st-kering",
  title: "Laporan Stock ST Kering",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request().input("EndDate", sql.Date, params.tglAkhir).execute("SP_LapStockSTKering");
    return (result.recordset ?? []) as StockRow[];
  },

  render(rows, meta) {
    // Group by Jenis -> Produk -> rows
    const byJenis = new Map<string, Map<string, StockRow[]>>();
    for (const r of rows) {
      const jenis = String(r.Jenis ?? "").trim() || "Tanpa Jenis";
      const produk = String(r.Produk ?? "").trim() || "Tanpa Produk";
      let p = byJenis.get(jenis);
      if (!p) { p = new Map(); byJenis.set(jenis, p); }
      const list = p.get(produk) ?? [];
      list.push(r);
      p.set(produk, list);
    }

    const groups: string[] = [];
    for (const [jenis, produks] of byJenis) {
      let jtPcs = 0, jtTon = 0;
      const produkHtml: string[] = [];
      for (const [produk, prow] of produks) {
        let pcs = 0, ton = 0;
        const rowsHtml = prow
          .map((r, i) => {
            const isNeg = (r[TON_COL] !== undefined && toFloat(r[TON_COL]) < 0) || (r[PCS_COL] !== undefined && toFloat(r[PCS_COL]) < 0);
            const cells = COLUMNS.map((col) => {
              const v = r[col];
              if (isDate(col)) return `<td class="center">${escapeHtml(formatTanggalId(String(v ?? "")))}</td>`;
              if (isTon(col)) return `<td class="number">${formatNumber(toFloat(v), 4)}</td>`;
              if (isPc(col)) return `<td class="number">${formatNumber(toFloat(v), 0)}</td>`;
              if (isNumeric(col)) return `<td class="number">${formatNumber(toFloat(v), 0)}</td>`;
              return `<td>${escapeHtml(String(v ?? ""))}</td>`;
            }).join("");
            pcs += toFloat(r[PCS_COL]);
            ton += toFloat(r[TON_COL]);
            return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}"><td class="center">${i + 1}</td>${cells}</tr>`;
          })
          .join("\n");
        jtPcs += pcs; jtTon += ton;
        const pcsIdx = COLUMNS.indexOf(PCS_COL);
        const tonIdx = COLUMNS.indexOf(TON_COL);
        const firstSummary = Math.min(pcsIdx, tonIdx);
        let subRow: string;
        if (firstSummary >= 0) {
          const colCells = COLUMNS.map((col, idx) => {
            if (idx < firstSummary) return "";
            if (col === PCS_COL) return `<td class="number" style="font-weight:bold;">${formatNumber(pcs, 0)}</td>`;
            if (col === TON_COL) return `<td class="number" style="font-weight:bold;">${formatNumber(ton, 4)}</td>`;
            return `<td></td>`;
          }).join("");
          subRow = `<tr class="totals-row"><td colspan="${firstSummary + 1}" class="center" style="font-weight:bold;">Sub Total ${escapeHtml(produk)}</td>${colCells}</tr>`;
          // Note: colspan covers No + tableColumns[0..firstSummary-1]. tableColumns[firstSummary] must be PCS or firstSummary col.
        } else {
          subRow = `<tr class="totals-row"><td colspan="${COLUMNS.length + 1}" class="number">Jumlah ${escapeHtml(produk)} : ${prow.length} baris</td></tr>`;
        }
        produkHtml.push(`<p class="produk-title">${escapeHtml(produk)}</p>
<table class="report-table">
  <thead><tr class="headers-row"><th>No</th>${COLUMNS.map((c) => `<th>${escapeHtml(LABELS[c])}</th>`).join("")}</tr></thead>
  <tbody>
${rowsHtml}
${subRow}
  </tbody>
</table>`);
      }
      groups.push(`<p class="jenis-title">${escapeHtml(jenis)}</p>${produkHtml.join("\n")}
<table class="report-table">
  <tbody>
    <tr class="totals-row"><td colspan="${COLUMNS.indexOf(PCS_COL) + 1}" class="center" style="font-weight:bold;">Total ${escapeHtml(jenis)}</td><td class="number" style="font-weight:bold;">${formatNumber(jtPcs, 0)}</td><td class="number" style="font-weight:bold;">${formatNumber(jtTon, 4)}</td><td></td></tr>
  </tbody>
</table>`);
    }

    const bodyHtml = groups.length ? groups.join("\n") : `<table class="report-table"><tbody><tr><td colspan="${COLUMNS.length + 1}" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;
    const subtitle = meta.params?.tglAkhir ? `Per ${formatTanggalId(String(meta.params.tglAkhir).slice(0, 10))}` : "";
    return renderWpsReportPage({
      title: "Laporan Stock ST Kering",
      subtitle,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
