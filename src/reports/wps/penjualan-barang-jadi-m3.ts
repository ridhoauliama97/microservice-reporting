import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
} from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition, RenderMeta } from "../types";
import {
  buildEmptyTable,
  buildEmptyTableRow,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";

/**
 * Laporan Penjualan Barang Jadi (m3) — SP_LapPenjualanBarangJadi, keyed by one
 * No Jual rather than a period.
 *
 * The rows are grouped by Jenis Kayu; each group prints its own lines plus a
 * right-hand total block: one "Jmlh / <Nama Barang Jadi>" line per product name
 * in the group, then the group's own "Jmlh / <Jenis>" line, and a Grand Total
 * for the whole document at the end.
 *
 * The legacy service threw when the No Jual had no rows. Here the shared empty
 * state is shown instead: a job that fails with "no data" for a mistyped number
 * is indistinguishable from a broken pipeline, and every other report in the
 * service treats an empty result as an empty document.
 */

const paramsSchema = z.object({
  noJual: z.string().trim().min(1).max(50),
});

export type PenjualanBarangJadiParams = z.infer<typeof paramsSchema>;

interface SpRow {
  NoBJJual?: unknown;
  TglJual?: unknown;
  NoSPK?: unknown;
  Buyer?: unknown;
  NamaBarangJadi?: unknown;
  Keterangan?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
  Jenis?: unknown;
}

interface SaleRow {
  namaBarangJadi: string;
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  pcs: number;
  m3: number;
}

interface JenisGroup {
  jenis: string;
  rows: SaleRow[];
  /** m3 per Nama Barang Jadi, in first-appearance order. */
  productTotals: Array<{ name: string; total: number }>;
  totalM3: number;
}

interface PenjualanBarangJadiData {
  noJual: string;
  header: { tanggal: string; noSpk: string; buyer: string };
  groups: JenisGroup[];
  grandTotalM3: number;
  totalPcs: number;
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

/** A date as dd-Mmm-yyyy, or the raw value when it is not a date. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) {
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agt",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ][value.getUTCMonth()];
    return `${String(value.getUTCDate()).padStart(2, "0")}-${month}-${value.getUTCFullYear()}`;
  }
  return typeof value === "string" ? value.trim() : "";
};

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

export function buildPenjualanBarangJadiData(
  rows: SpRow[],
  noJual: string,
): PenjualanBarangJadiData {
  const groups = new Map<string, JenisGroup>();

  for (const row of rows) {
    const jenis = toText(row.Jenis) || "Tanpa Jenis";
    const namaBarangJadi = toText(row.NamaBarangJadi) || "Tanpa Nama";
    const m3 = toFloat(row.M3) ?? 0;

    let group = groups.get(jenis);
    if (!group) {
      group = { jenis, rows: [], productTotals: [], totalM3: 0 };
      groups.set(jenis, group);
    }
    group.rows.push({
      namaBarangJadi,
      tebal: toFloat(row.Tebal),
      lebar: toFloat(row.Lebar),
      panjang: toFloat(row.Panjang),
      pcs: Math.round(toFloat(row.JmlhBatang) ?? 0),
      m3,
    });

    const existing = group.productTotals.find((p) => p.name === namaBarangJadi);
    if (existing) existing.total += m3;
    else group.productTotals.push({ name: namaBarangJadi, total: m3 });

    group.totalM3 += m3;
  }

  for (const group of groups.values()) {
    group.totalM3 = round4(group.totalM3);
    for (const product of group.productTotals)
      product.total = round4(product.total);
  }

  const first = rows[0] ?? {};
  return {
    noJual,
    header: {
      tanggal: fmtDate(first.TglJual),
      noSpk: toText(first.NoSPK) || "-",
      buyer: toText(first.Buyer) || "-",
    },
    groups: [...groups.values()],
    grandTotalM3: round4(
      rows.reduce((sum, row) => sum + (toFloat(row.M3) ?? 0), 0),
    ),
    totalPcs: rows.reduce(
      (sum, row) => sum + Math.round(toFloat(row.JmlhBatang) ?? 0),
      0,
    ),
  };
}

const DETAIL_COLUMNS: ReportColumn[] = [
  { kind: "no", label: "No", width: "7%" },
  {
    kind: "label",
    label: "Nama Barang Jadi",
    field: "namaBarangJadi",
    width: "34%",
  },
  {
    kind: "number",
    label: "Tebal",
    field: "tebal",
    width: "10%",
    format: (v) => formatNumber(v, 0),
  },
  {
    kind: "number",
    label: "Lebar",
    field: "lebar",
    width: "10%",
    format: (v) => formatNumber(v, 0),
  },
  {
    kind: "number",
    label: "Panjang",
    field: "panjang",
    width: "11%",
    format: (v) => formatNumber(v, 0),
  },
  {
    kind: "number",
    label: "Pcs",
    field: "pcs",
    width: "12%",
    format: (v) => formatNumber(v, 0),
  },
  { kind: "number", label: "M3", field: "m3", width: "16%" },
];

const renderDetailTable = (rows: SaleRow[]): string => {
  const body = rows
    .map(
      (
        row,
        index,
      ) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(row.namaBarangJadi)}</td>
            <td class="number">${escapeHtml(formatNumber(row.tebal, 0))}</td>
            <td class="number">${escapeHtml(formatNumber(row.lebar, 0))}</td>
            <td class="number">${escapeHtml(formatNumber(row.panjang, 0))}</td>
            <td class="number">${escapeHtml(formatNumber(row.pcs, 0))}</td>
            <td class="number">${escapeHtml(formatNumber(row.m3, 4))}</td>
          </tr>`,
    )
    .join("\n          ");

  return `<table class="report-table">
    <thead>
      <tr class="headers-row">
        <th style="width: 7%;">No</th>
        <th style="width: 34%;">Nama Barang Jadi</th>
        <th style="width: 10%;">Tebal</th>
        <th style="width: 10%;">Lebar</th>
        <th style="width: 11%;">Panjang</th>
        <th style="width: 12%;">Pcs</th>
        <th style="width: 16%;">M3</th>
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(DETAIL_COLUMNS.length)}
    </tbody>
  </table>`;
};

const renderTotalBlock = (
  lines: Array<[string, number]>,
  grand = false,
): string => {
  const rows = lines
    .map(
      ([label, value]) => `<tr>
            <td class="total-label">${escapeHtml(label)}</td>
            <td class="total-value">${escapeHtml(formatNumber(value, 4))}</td>
          </tr>`,
    )
    .join("\n          ");
  return `<table class="total-line${grand ? " grand-total" : ""}">
    <tbody>
      ${rows}
    </tbody>
  </table>`;
};

export const penjualanBarangJadiM3Report: ReportDefinition<
  PenjualanBarangJadiParams,
  PenjualanBarangJadiData
> = {
  type: "penjualan-barang-jadi-m3",
  title: "Laporan Penjualan Barang Jadi (m3)",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("NoJual", sql.VarChar(50), params.noJual)
      .execute("SP_LapPenjualanBarangJadi");
    return buildPenjualanBarangJadiData(
      (result.recordset ?? []) as SpRow[],
      params.noJual,
    );
  },

  render(
    data: PenjualanBarangJadiData,
    meta: RenderMeta<PenjualanBarangJadiParams>,
  ) {
    const bodyHtml =
      data.groups.length > 0
        ? `<table class="meta-grid">
    <tr>
      <td style="width: 50%;">
        <table>
          <tr>
            <td class="meta-label">Tanggal</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.tanggal)}</td>
          </tr>
          <tr>
            <td class="meta-label">Buyer</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.buyer)}</td>
          </tr>
        </table>
      </td>
      <td style="width: 50%;">
        <table>
          <tr>
            <td class="meta-label">No SPK</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.noSpk)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${data.groups
    .map(
      (
        group,
      ) => `<div class="section-title">Jenis Kayu : ${escapeHtml(group.jenis)}</div>
  ${renderDetailTable(group.rows)}
  ${renderTotalBlock([
    ...group.productTotals.map((product): [string, number] => [
      `Jmlh / ${product.name} :`,
      product.total,
    ]),
    [`Jmlh / ${group.jenis} :`, group.totalM3],
  ])}`,
    )
    .join("\n  ")}
  ${renderTotalBlock([["Grand Total :", data.grandTotalM3]], true)}`
        : buildEmptyTable(1);

    return renderWpsReportPage({
      title: "Laporan Penjualan Barang Jadi (m3)",
      bodyHtml,
      style: "penjualan_barang_jadi_m3",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
