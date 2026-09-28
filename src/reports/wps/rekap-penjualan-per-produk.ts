import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderMeta } from "../types";
import { buildEmptyTable, renderWpsReportPage } from "./template";
import {
  fmtM3,
  fmtPct,
  renderPenjualanDetailTable,
  shareRatio,
  type PenjualanDetailRow,
} from "./penjualan-shared";

/**
 * Laporan Rekap Penjualan Per-Produk — SP_LapJualPerProduk.
 *
 * Rows arrive one per product/size and are folded into a section per product
 * (first-appearance order, which is the order the SP returns them in). Each
 * section shows every size with its share of the product total, plus a running
 * ratio that stops being printed once it passes 70% — the legacy blade only
 * shows the running figure while `$cumulative <= 70`, so the column goes blank
 * for the tail of a long product instead of repeating a 100% total.
 *
 * The Rangkuman table below the sections repeats the product totals with each
 * product's share of the grand total.
 */

interface SpRow {
  Product?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
  BJM3?: unknown;
}

interface ProductSection {
  name: string;
  rows: PenjualanDetailRow[];
  /** Running ratios, shown only while at or below 70%. */
  cumulative: Array<number | null>;
  totalM3: number;
  summaryRatio: number | null;
}

interface RekapPenjualanPerProdukData {
  products: ProductSection[];
  grandTotalM3: number;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function buildRekapPenjualanPerProduk(
  rows: SpRow[],
): RekapPenjualanPerProdukData {
  const byProduct = new Map<string, ProductSection>();

  for (const row of rows) {
    const name = toText(row.Product);
    if (name === "") continue;

    let section = byProduct.get(name);
    if (!section) {
      section = {
        name,
        rows: [],
        cumulative: [],
        totalM3: 0,
        summaryRatio: null,
      };
      byProduct.set(name, section);
    }

    const m3 = toFloat(row.M3) ?? 0;
    section.rows.push({
      tebal: toFloat(row.Tebal),
      lebar: toFloat(row.Lebar),
      panjang: toFloat(row.Panjang),
      jmlhBatang: Math.round(toFloat(row.JmlhBatang) ?? 0),
      m3,
      ratio: null,
    });
    section.totalM3 += m3;
  }

  const products = [...byProduct.values()];
  const grandTotalM3 = products.reduce((sum, p) => sum + p.totalM3, 0);

  for (const product of products) {
    product.summaryRatio = shareRatio(product.totalM3, grandTotalM3);
    let running = 0;
    for (const row of product.rows) {
      row.ratio = shareRatio(row.m3, product.totalM3);
      if (row.ratio === null) {
        product.cumulative.push(null);
        continue;
      }
      running += row.ratio;
      // The legacy blade hides the running figure past 70%.
      product.cumulative.push(running <= 70.0000001 ? running : null);
    }
  }

  return { products, grandTotalM3 };
}

/**
 * The Rangkuman is a four-column table of its own — No, Produk, Total (m3),
 * Persentase (%) — closed by a ruled Grand Total row. The legacy blade emitted
 * a bare three-column list with no header and no borders, so its figures had
 * nothing to line up against.
 */
const renderSummary = (data: RekapPenjualanPerProdukData): string => {
  const rows = data.products
    .map(
      (product, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(product.name)}</td>
            <td class="number">${escapeHtml(fmtM3(product.totalM3))}</td>
            <td class="number">${escapeHtml(fmtPct(product.summaryRatio))}</td>
          </tr>`,
    )
    .join("\n          ");

  return `<div class="summary-title">Rangkuman</div>
  <table class="summary-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 34px;">No</th>
        <th>Produk</th>
        <th style="width: 88px;">Total (m3)</th>
        <th style="width: 96px;">Persentase (%)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals-row">
        <td class="center" colspan="2">Grand Total</td>
        <td class="number">${escapeHtml(fmtM3(data.grandTotalM3))}</td>
        <td class="number">100.00 %</td>
      </tr>
    </tbody>
  </table>`;
};

export const rekapPenjualanPerProdukReport: ReportDefinition<
  PeriodParams,
  RekapPenjualanPerProdukData
> = {
  type: "rekap-penjualan-per-produk",
  title: "Laporan Rekap Penjualan Per-Produk",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapJualPerProduk");
    return buildRekapPenjualanPerProduk((result.recordset ?? []) as SpRow[]);
  },

  render(data: RekapPenjualanPerProdukData, meta: RenderMeta<PeriodParams>) {
    const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;

    const bodyHtml =
      data.products.length > 0
        ? `${data.products
            .map(
              (
                product,
              ) => `<div class="section-title">Produk : ${escapeHtml(product.name)}</div>
  ${renderPenjualanDetailTable({
    rows: product.rows,
    cumulative: product.cumulative,
    totalM3: product.totalM3,
    totalRatio: product.summaryRatio,
    totalLabel: "Total",
  })}`,
            )
            .join("\n  ")}
  ${renderSummary(data)}`
        : buildEmptyTable(1);

    return renderWpsReportPage({
      title: "Laporan Rekap Penjualan Per-Produk",
      subtitle,
      bodyHtml,
      style: "rekap_penjualan",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
