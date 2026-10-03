import { z } from "zod";
import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId, toDateKey } from "../../templates/html";
import { renderWpsReportPage, EMPTY_DATA_MESSAGE } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapStockSTBasah — "Laporan Stock ST Basah". Ported from open-api-report's
 * StockSTBasahReportService + stock-st-basah-pdf.blade.php.
 *
 * Takes a single @EndDate. Rows are grouped by Jenis, then by Produk; Jenis and
 * Produk are printed as headings, not as columns. Each product gets its own
 * table plus a "Sub Total {produk}" row, and the last product of a Jenis also
 * carries the "Total {jenis}" row. A row whose Pcs or Ton is negative is red.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

// Table columns, in the blade's order (stock-st-basah-pdf.blade.php picks the
// desired columns out of the SP result set and renames them). Jenis and Produk
// are NOT columns: they are the two grouping headings printed above each table.
const COLUMNS = ["NoST", "DateCreate", "Tebal", "Lebar", "Panjang", "IdLokasi", "JmlhBatang", "Ton"] as const;
const PCS_COL = "JmlhBatang";
const TON_COL = "Ton";

const LABELS: Record<string, string> = {
  NoST: "Nomor ST", DateCreate: "Tanggal", Tebal: "Tebal (mm)", Lebar: "Lebar (mm)",
  Panjang: "Panjang (ft)", IdLokasi: "Lokasi", JmlhBatang: "Jmlh Batang", Ton: "Ton",
};

/**
 * Column geometry.
 *
 * The blade computes `No` at 4% and splits the rest evenly, but its sheet is
 * `table-layout: auto`, so those percentages are only a hint: the nowrap
 * headers ("Tebal (mm)", "Panjang (ft)") each push their column wider than the
 * share they were given and run over the next rule. Pinning the columns with a
 * <colgroup> and `table-layout: fixed` makes the shares real.
 */
/**
 * Column geometry.
 *
 * The blade computes `No` at 4% and splits the rest evenly, but with
 * `table-layout: auto` those percentages are only a hint and the nowrap
 * headers ("Tebal (mm)", "Panjang (ft)", "30-Mar-2026") each push past the
 * share they were given, running over the next rule. A <colgroup> plus
 * `table-layout: fixed` makes the shares real; the numbers below are sized to
 * each header's own width inside the sheet's 75% table.
 */
/** The shared column geometry for the two stock sheets, sized to fit at 11px
 *  with the Noto Sans figures the sheets now use. Percentages total 93%; the
 *  remainder is handed back by `table-layout: fixed`, so every column ends up
 *  a little above its minimum. */
/** The shared column geometry for the two stock sheets, sized to fit at 11px
 *  with the Noto Sans figures and the 11px bold headers the sheets now use.
 *  Percentages total 93.5%; `table-layout: fixed` hands the remainder back, so
 *  every column ends up a little above its minimum. */
const COLGROUP = `<colgroup>
    <col style="width:5%"><col style="width:12%"><col style="width:13%"><col style="width:11%">
    <col style="width:11%"><col style="width:12%"><col style="width:8%"><col style="width:13.5%">
    <col style="width:8%">
  </colgroup>`;

const paramsSchema = z.object({ tglAkhir: z.string().min(1) });

const isDate = (col: string): boolean => col === "DateCreate";
const isNumeric = (col: string): boolean => ["Tebal", "Lebar", "Panjang", "JmlhBatang", "Ton"].includes(col);
const isPc = (col: string): boolean => col === PCS_COL;
const isTon = (col: string): boolean => col === TON_COL;

interface StockRow extends Record<string, unknown> {}

export const stockStBasahReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  StockRow[]
> = {
  type: "stock-st-basah",
  title: "Laporan Stock ST Basah",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request().input("EndDate", sql.Date, params.tglAkhir).execute("SP_LapStockSTBasah");
    return (result.recordset ?? []) as StockRow[];
  },

  render(rows, meta) {
    // Group by Jenis -> Produk -> rows
    const byJenis = new Map<string, Map<string, StockRow[]>>();
    for (const r of rows) {
      const jenis = String(r.Jenis ?? "").trim() || "Tanpa Jenis";
      const produk = String(r.Produk ?? "").trim() || "Tanpa Grade";
      let p = byJenis.get(jenis);
      if (!p) { p = new Map(); byJenis.set(jenis, p); }
      const list = p.get(produk) ?? [];
      list.push(r);
      p.set(produk, list);
    }

    const firstSummary = Math.min(COLUMNS.indexOf(PCS_COL), COLUMNS.indexOf(TON_COL));

    /** "Sub Total {produk}" (and "Total {jenis}"): label spans the leading
     *  columns, figures land under Pcs and Ton. */
    const summaryRow = (label: string, pcs: number, ton: number, rowCount: number): string => {
      if (firstSummary < 0) {
        return `<tr class="totals-row"><td colspan="${COLUMNS.length + 1}" class="number">${escapeHtml(label)} : ${rowCount} baris</td></tr>`;
      }
      const colCells = COLUMNS.map((col, idx) => {
        if (idx < firstSummary) return "";
        if (col === PCS_COL) return `<td class="number" style="font-weight:bold;">${formatNumber(pcs, 0)}</td>`;
        if (col === TON_COL) return `<td class="number" style="font-weight:bold;">${formatNumber(ton, 4)}</td>`;
        return `<td></td>`;
      }).join("");
      return `<tr class="totals-row"><td colspan="${firstSummary + 1}" class="center" style="font-weight:bold;">${escapeHtml(label)}</td>${colCells}</tr>`;
    };

    const groups: string[] = [];
    for (const [jenis, produks] of byJenis) {
      let jtPcs = 0, jtTon = 0;
      const produkEntries = [...produks.entries()];
      const produkHtml: string[] = [];
      for (const [produk, prow] of produkEntries) {
        let pcs = 0, ton = 0;
        const rowsHtml = prow
          .map((r, i) => {
            // The blade paints a whole row red when Pcs or Ton is negative.
            const isNeg = toFloat(r[PCS_COL]) < 0 || toFloat(r[TON_COL]) < 0;
            const cells = COLUMNS.map((col) => {
              const v = r[col];
              if (isDate(col)) return `<td class="center">${escapeHtml(formatTanggalId(toDateKey(v)))}</td>`;
              if (isTon(col)) return `<td class="number">${formatNumber(toFloat(v), 4)}</td>`;
              if (isPc(col)) return `<td class="number">${formatNumber(toFloat(v), 0)}</td>`;
              if (isNumeric(col)) return `<td class="number">${formatNumber(toFloat(v), 0)}</td>`;
              return `<td>${escapeHtml(String(v ?? ""))}</td>`;
            }).join("");
            pcs += toFloat(r[PCS_COL]);
            ton += toFloat(r[TON_COL]);
            return `<tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}${isNeg ? " row-negative" : ""}"><td class="center">${i + 1}</td>${cells}</tr>`;
          })
          .join("\n");
        jtPcs += pcs; jtTon += ton;
        // The "Total {jenis}" row closes the last product's table, as in the
        // blade — it is not a table of its own.
        const isLastProduk = produk === produkEntries[produkEntries.length - 1][0];
        const totalRows = summaryRow(`Sub Total ${produk}`, pcs, ton, prow.length) +
          (isLastProduk ? `\n${summaryRow(`Total ${jenis}`, jtPcs, jtTon, prow.length)}` : "");
        produkHtml.push(`<p class="produk-title">${escapeHtml(produk)}</p>
<table class="report-table" style="table-layout: fixed;">
    ${COLGROUP}
  <thead>
    <tr class="headers-row"><th>No</th>${COLUMNS.map((c) => `<th>${escapeHtml(LABELS[c])}</th>`).join("")}</tr>
  </thead>
  <tbody>
${rowsHtml}
${totalRows}
  </tbody>
</table>`);
      }
      groups.push(`<p class="jenis-title">${escapeHtml(jenis)}</p>${produkHtml.join("\n")}`);
    }

    const bodyHtml = groups.length ? groups.join("\n") : `<table class="report-table"><tbody><tr><td colspan="${COLUMNS.length + 1}" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;
    const subtitle = meta.params?.tglAkhir ? `Per ${formatTanggalId(String(meta.params.tglAkhir).slice(0, 10))}` : "";
    return renderWpsReportPage({
      title: "Laporan Stock ST Basah",
      subtitle,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["stock-st-basah"],
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
