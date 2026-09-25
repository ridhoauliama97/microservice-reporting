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
 * SP_LapBJHidupPerProduk — "Laporan Saldo Barang Jadi Hidup Per-Jenis
 * Per-Produk". Ported from open-api-report's
 * SaldoBarangJadiHidupPerJenisPerProdukReportService +
 * saldo-barang-jadi-hidup-per-jenis-per-produk-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters). Rows are grouped per Jenis, then
 * per NamaBarangJadi: each product gets a small Tebal / Lebar / Panjang / Pcs
 * / M3 table closed by a "Subtotal <product>" row, and every Jenis ends with a
 * "Total (M3) Per-Jenis <jenis>" band.
 */

interface SaldoProdukRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaBarangJadi: string | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  Pcs: number | null;
  M3: number | null;
}

interface ProductGroup {
  name: string;
  rows: SaldoProdukRow[];
  totalPcs: number;
  totalM3: number;
}

interface JenisGroup {
  name: string;
  products: ProductGroup[];
  totalM3: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtPcs: whole number, blank when 0 (dimensions + Pcs). */
const fmtPcs = (value: unknown): string => {
  const num = toFloat(value);
  if (Math.round(num) === 0) return "";
  return formatNumber(Math.round(num), 0);
};

/** Legacy $fmtM3: 4 decimals, blank when ~0. */
const fmtM3 = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

const CSS = `
  .section-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  .product-title { font-weight: bold; margin: 6px 0 2px 20px; }
  .report-table { margin-left: 20px; width: calc(100% - 20px); table-layout: fixed; }
  .report-table thead th { padding: 2px 3px; }
  .report-table tbody td { padding: 1px 3px; overflow-wrap: normal; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .report-table tbody tr.totals-row td.blank { text-align: center; }
  /* Summary "Total (M3) Per-Jenis" sits flush left, aligned with the
     "JABON" section title (only the product tables are indented) and has no
     border. */
  .report-table-summary { margin-left: 0; margin-top: 4px; border-collapse: collapse; border-spacing: 0; border: 0; }
  .report-table-summary td { padding: 1px 4px; border: 0 !important; }
  .report-table-summary tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border: 0 !important; }
`;

function groupRows(rows: SaldoProdukRow[]): JenisGroup[] {
  const jenisMap = new Map<string, Map<string, ProductGroup>>();

  for (const row of rows) {
    const jenis = String(row.Jenis ?? "") || "LAINNYA";
    const produk = String(row.NamaBarangJadi ?? "") || "-";
    let products = jenisMap.get(jenis);
    if (!products) {
      products = new Map<string, ProductGroup>();
      jenisMap.set(jenis, products);
    }
    let group = products.get(produk);
    if (!group) {
      group = { name: produk, rows: [], totalPcs: 0, totalM3: 0 };
      products.set(produk, group);
    }
    group.rows.push(row);
    group.totalPcs += toFloat(row.Pcs);
    group.totalM3 += toFloat(row.M3);
  }

  // Legacy: ksort($groups) and ksort(products) with SORT_NATURAL |
  // SORT_FLAG_CASE, then rows sorted by Tebal / Lebar / Panjang.
  const naturalCompare = (left: string, right: string): number =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

  return [...jenisMap.entries()]
    .sort(([left], [right]) => naturalCompare(left, right))
    .map(([jenis, products]) => {
      const sortedProducts = [...products.entries()]
        .sort(([left], [right]) => naturalCompare(left, right))
        .map(([name, group]) => {
          const sortedRows = [...group.rows].sort(
            (left, right) =>
              toFloat(left.Tebal) - toFloat(right.Tebal) ||
              toFloat(left.Lebar) - toFloat(right.Lebar) ||
              toFloat(left.Panjang) - toFloat(right.Panjang),
          );
          return {
            ...group,
            rows: sortedRows,
            totalPcs: sortedRows.reduce((sum, row) => sum + toFloat(row.Pcs), 0),
            totalM3: sortedRows.reduce((sum, row) => sum + toFloat(row.M3), 0),
          };
        });
      return {
        name: jenis,
        products: sortedProducts,
        totalM3: sortedProducts.reduce((sum, product) => sum + product.totalM3, 0),
      };
    });
}

const buildProductTable = (group: ProductGroup): string => {
  const bodyRows = group.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="number">${fmtPcs(row.Tebal)}</td>
        <td class="number">${fmtPcs(row.Lebar)}</td>
        <td class="number">${fmtPcs(row.Panjang)}</td>
        <td class="number">${fmtPcs(row.Pcs)}</td>
        <td class="number">${fmtM3(row.M3)}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="product-title">Produk : ${escapeHtml(group.name)}</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 5%;">No</th>
      <th>Tebal</th>
      <th>Lebar</th>
      <th>Panjang</th>
      <th style="width: 15%;">Pcs</th>
      <th style="width: 15%;">M3</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="4" class="blank">Subtotal ${escapeHtml(group.name)}</td>
      <td class="number">${fmtPcs(group.totalPcs)}</td>
      <td class="number">${fmtM3(group.totalM3)}</td>
    </tr>
  </tbody>
</table>`;
};

const buildBodyHtml = (rows: SaldoProdukRow[], generatedAt: Date): string => {
  if (rows.length === 0) {
    return `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;
  }

  return groupRows(rows)
    .map(
      (jenisGroup) => `<div class="section-title">${escapeHtml(jenisGroup.name)}</div>
  ${jenisGroup.products.map(buildProductTable).join("\n  ")}
  <table class="report-table-summary">
    <tbody>
      <tr class="totals-row">
        <td class="blank">Total (M3) Per-Jenis ${escapeHtml(jenisGroup.name)}</td>
        <td class="number" style="width: 29.75%;">${fmtM3(jenisGroup.totalM3)}</td>
      </tr>
    </tbody>
  </table>`,
    )
    .join("\n");
};

export const saldoBarangJadiHidupPerJenisPerProdukReport: ReportDefinition<
  Record<never, never>,
  SaldoProdukRow[]
> = {
  type: "saldo-barang-jadi-hidup-per-jenis-per-produk",
  title: "Laporan Saldo Barang Jadi Hidup Per-Jenis Per-Produk",
  // The SP takes no parameters — reject any params loudly.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SP_LapBJHidupPerProduk");
    return (result.recordset ?? []) as SaldoProdukRow[];
  },

  render(rows, meta) {
    // Legacy subtitle: "Per <generation date>" in d-M-y (2-digit year).
    const generatedDate = formatTanggalId(meta.generatedAt.toISOString().slice(0, 10))
      .replace(/\d{4}$/, (year) => year.slice(-2));
    return renderWpsReportPage({
      title: "Laporan Saldo Barang Jadi Hidup Per-Jenis Per-Produk",
      subtitle: `Per ${generatedDate}`,
      bodyHtml: buildBodyHtml(rows, meta.generatedAt),
      extraCss: CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
