import sql from "mssql";
import { escapeHtml, formatPrintedAt, formatTanggalId } from "../../templates/html";
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
 * The two export recap reports are the same report read along different axes:
 *
 * - Rekap Penjualan Ekspor Per-Produk dan Per-Buyer  (SP_LapJualPerProdukPerBuyer)
 *   product -> buyer -> sizes, subtotals from BJM3 / PembeliBJM3
 * - Rekap Penjualan Ekspor Per-Buyer dan Per-Produk  (SP_LapJualPerBuyerPerProduk)
 *   buyer -> product -> sizes, subtotals from PembeliM3 / PembeliBJM3
 *
 * Their legacy services are the same 226 lines with the grouping and the two
 * subtotal columns swapped, and their two blades differ only in one CSS class
 * name. So both come from one factory: the caller says which field is the outer
 * axis, which is the inner one, and where each level's subtotal comes from.
 *
 * Both blades sort the outer groups by share descending and the inner groups by
 * subtotal descending, so the numbering shown is a display rank, not the
 * alphabetical order the service built them in.
 */

interface SpRow {
  Product?: unknown;
  Pembeli?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
  BJM3?: unknown;
  PembeliBJM3?: unknown;
  PembeliM3?: unknown;
}

/** One inner group (a buyer, or a product) with its size lines. */
interface InnerGroup {
  name: string;
  rows: PenjualanDetailRow[];
  totalM3: number;
  summaryRatio: number | null;
}

/** One outer group (a product, or a buyer) with its inner groups. */
interface OuterGroup {
  name: string;
  inners: InnerGroup[];
  totalM3: number;
  summaryRatio: number | null;
}

interface RekapPenjualanEksporData {
  groups: OuterGroup[];
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

export interface RekapPenjualanEksporAxis {
  /** Report type key. */
  type: string;
  title: string;
  spName: string;
  /** "Product" for the Per-Produk report, "Pembeli" for the Per-Buyer one. */
  outerField: "Product" | "Pembeli";
  innerField: "Product" | "Pembeli";
  /** Human label for the outer sections and the Rangkuman's second column. */
  outerLabel: string;
  /** Caption of the inner section line, e.g. "Buyer : DHB". */
  innerTitlePrefix: string;
  /** Column holding the inner group's subtotal, e.g. "PembeliBJM3". */
  innerTotalField: "PembeliBJM3" | "PembeliM3";
  /** Column holding the outer group's subtotal, e.g. "BJM3". */
  outerTotalField: "BJM3" | "PembeliM3";
  /** Column counting inner groups in the Rangkuman, e.g. "Jumlah Buyer". */
  innerCountLabel: string;
}

export function buildRekapPenjualanEkspor(
  rows: SpRow[],
  axis: RekapPenjualanEksporAxis,
): RekapPenjualanEksporData {
  const groups = new Map<string, OuterGroup>();

  for (const row of rows) {
    // The outer axis drops empty names; the inner one shows "-" in their place,
    // matching the two legacy normalisers.
    const outerName = toText(row[axis.outerField]);
    if (outerName === "") continue;
    const innerName = toText(row[axis.innerField]) || "-";

    let group = groups.get(outerName);
    if (!group) {
      group = { name: outerName, inners: [], totalM3: 0, summaryRatio: null };
      groups.set(outerName, group);
    }

    let inner = group.inners.find((candidate) => candidate.name === innerName);
    if (!inner) {
      inner = { name: innerName, rows: [], totalM3: 0, summaryRatio: null };
      group.inners.push(inner);
    }

    inner.rows.push({
      tebal: toFloat(row.Tebal),
      lebar: toFloat(row.Lebar),
      panjang: toFloat(row.Panjang),
      jmlhBatang: Math.round(toFloat(row.JmlhBatang) ?? 0),
      m3: toFloat(row.M3) ?? 0,
      ratio: null,
    });

    // The subtotal columns are totals repeated on every line of the group, not
    // per-line figures, so each line overwrites the previous value. Taking the
    // last one matches the legacy assignment.
    inner.totalM3 = toFloat(row[axis.innerTotalField]) ?? 0;
    group.totalM3 = toFloat(row[axis.outerTotalField]) ?? 0;
  }

  const outerGroups = [...groups.values()];
  const grandTotalM3 = outerGroups.reduce((sum, g) => sum + g.totalM3, 0);

  for (const group of outerGroups) {
    group.summaryRatio = shareRatio(group.totalM3, grandTotalM3);
    for (const inner of group.inners) {
      inner.summaryRatio = shareRatio(inner.totalM3, group.totalM3);
      for (const row of inner.rows) {
        row.ratio = shareRatio(row.m3, inner.totalM3);
      }
    }
  }

  // Display order: biggest outer group first, then biggest inner group.
  outerGroups.sort((a, b) => (b.summaryRatio ?? 0) - (a.summaryRatio ?? 0));
  for (const group of outerGroups) {
    group.inners.sort((a, b) => b.totalM3 - a.totalM3);
  }

  return { groups: outerGroups, grandTotalM3 };
}

const renderSummary = (
  data: RekapPenjualanEksporData,
  axis: RekapPenjualanEksporAxis,
): string => {
  const rows = data.groups
    .map(
      (group, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(group.name)}</td>
            <td class="center">${group.inners.length}</td>
            <td class="number">${escapeHtml(fmtM3(group.totalM3))}</td>
            <td class="number">${escapeHtml(fmtPct(group.summaryRatio))}</td>
          </tr>`,
    )
    .join("\n          ");

  return `<div class="summary-title">Rangkuman Hasil :</div>
  <table class="report-table summary-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 8%;">No</th>
        <th>${escapeHtml(axis.outerLabel)}</th>
        <th>${escapeHtml(axis.innerCountLabel)}</th>
        <th>Total M3</th>
        <th>Rasio (%)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals-row">
        <td class="center" colspan="3">Grand Total</td>
        <td class="number">${escapeHtml(fmtM3(data.grandTotalM3))}</td>
        <td class="number">100.00 %</td>
      </tr>
    </tbody>
  </table>`;
};

/** Shared factory for the two "Rekap Penjualan Ekspor" reports. */
export function createRekapPenjualanEksporReport(
  axis: RekapPenjualanEksporAxis,
): ReportDefinition<PeriodParams, RekapPenjualanEksporData> {
  return {
    type: axis.type,
    title: axis.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("StartDate", sql.Date, params.tglAwal)
        .input("EndDate", sql.Date, params.tglAkhir)
        .execute(axis.spName);
      return buildRekapPenjualanEkspor(
        (result.recordset ?? []) as SpRow[],
        axis,
      );
    },

    render(data: RekapPenjualanEksporData, meta: RenderMeta<PeriodParams>) {
      const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;

      const bodyHtml =
        data.groups.length > 0
          ? `${data.groups
              .map(
                (group, groupIndex) => `<div class="section-title">${groupIndex + 1}. ${escapeHtml(axis.outerLabel)} : ${escapeHtml(group.name)}</div>
  ${group.inners
    .map(
      (inner) => `<div class="group-title">${escapeHtml(axis.innerTitlePrefix)} : ${escapeHtml(inner.name)}</div>
  ${renderPenjualanDetailTable({
    rows: inner.rows,
    totalM3: inner.totalM3,
    totalRatio: inner.summaryRatio,
    totalLabel: "Total ",
    // The heading above and the table below share one left edge.
    indented: true,
  })}`,
    )
    .join("\n  ")}`,
              )
              .join("\n  ")}
  ${renderSummary(data, axis)}`
          : buildEmptyTable(1);

      return renderWpsReportPage({
        title: axis.title,
        subtitle,
        bodyHtml,
        style: "rekap_penjualan",
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

/** Exported so tests exercise the same axis wiring the reports ship with. */
export const PER_PRODUK_PER_BUYER_AXIS: RekapPenjualanEksporAxis = {
  type: "rekap-penjualan-ekspor-per-produk-per-buyer",
  title: "Laporan Rekap Penjualan Ekspor Per-Produk dan Per-Buyer",
  spName: "SP_LapJualPerProdukPerBuyer",
  outerField: "Product",
  innerField: "Pembeli",
  outerLabel: "Produk",
  innerTitlePrefix: "Buyer",
  innerTotalField: "PembeliBJM3",
  outerTotalField: "BJM3",
  innerCountLabel: "Jumlah Buyer",
};

export const PER_BUYER_PER_PRODUK_AXIS: RekapPenjualanEksporAxis = {
  type: "rekap-penjualan-ekspor-per-buyer-per-produk",
  title: "Laporan Rekap Penjualan Ekspor Per-Buyer dan Per-Produk",
  spName: "SP_LapJualPerBuyerPerProduk",
  outerField: "Pembeli",
  innerField: "Product",
  outerLabel: "Buyer",
  innerTitlePrefix: "Produk",
  innerTotalField: "PembeliBJM3",
  outerTotalField: "PembeliM3",
  innerCountLabel: "Jumlah Produk",
};

export const rekapPenjualanEksporPerProdukPerBuyerReport =
  createRekapPenjualanEksporReport(PER_PRODUK_PER_BUYER_AXIS);

export const rekapPenjualanEksporPerBuyerPerProdukReport =
  createRekapPenjualanEksporReport(PER_BUYER_PER_PRODUK_AXIS);
