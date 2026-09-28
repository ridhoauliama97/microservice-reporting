import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
} from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition, RenderMeta } from "../types";
import {
  buildEmptyTableRow,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";

/**
 * Laporan Koordinat Tanah — keyed by one No SPK, not by a period.
 *
 * Unlike every other report in this batch it reads TWO stored procedures: the
 * main one for the header, the products and the land list, and
 * SP_PrintPersentaseCariKoordinat for the GPS percentage breakdown. Both take
 * the same @NoSPK.
 *
 * The main SP is a cross join of the SPK's products against the lands it draws
 * on, so it returns the same product on every row and the same land on every
 * row. The legacy service de-duplicates both sides into two separate tables,
 * which is what this port does too.
 *
 * For the 2023 export SPKs the product columns come back NULL, so the Produk SPK
 * table is legitimately empty and shows the shared empty state.
 */

const paramsSchema = z.object({
  noSpk: z.string().trim().min(1).max(50),
});

export type KoordinatTanahParams = z.infer<typeof paramsSchema>;

interface SpRow {
  NoSPK?: unknown;
  Tanggal?: unknown;
  Buyer?: unknown;
  Tujuan?: unknown;
  Jenis?: unknown;
  NamaBarangJadi?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  Bundle?: unknown;
  PcsPerBundle?: unknown;
  Keterangan?: unknown;
  NamaTanah?: unknown;
  NamaPemilik?: unknown;
  DesaKelurahan?: unknown;
  KabupatenKota?: unknown;
  Provinsi?: unknown;
  NoSuratTanah?: unknown;
  Luas?: unknown;
  Koordinat?: unknown;
  Periode?: unknown;
}

interface GpsRow {
  Jenis?: unknown;
  Total?: unknown;
  Persen?: unknown;
  Koordinat?: unknown;
  NamaPemilik?: unknown;
  Tahun?: unknown;
}

interface ProductRow {
  jenis: string;
  namaBarangJadi: string;
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  bundle: number | null;
  pcsPerBundle: number | null;
  keterangan: string;
}

interface LandRow {
  namaTanah: string;
  namaPemilik: string;
  desaKelurahan: string;
  kabupatenKota: string;
  provinsi: string;
  noSuratTanah: string;
  luas: number | null;
  koordinat: string;
  periode: string;
}

interface GpsPercentageRow {
  jenis: string;
  koordinat: string;
  namaPemilik: string;
  tahun: string;
  total: number;
  persen: number;
}

interface KoordinatTanahData {
  noSpk: string;
  header: { noSpk: string; tanggal: string; buyer: string; tujuan: string };
  products: ProductRow[];
  lands: LandRow[];
  gpsPercentages: GpsPercentageRow[];
  gpsTotal: number;
  /** Distinct Periode values seen in the main SP's rows. */
  periodCount: number;
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

/** A date cell as dd-Mmm-yyyy, or blank when the value is missing. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) {
    const month = [
      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
      "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
    ][value.getUTCMonth()];
    return `${String(value.getUTCDate()).padStart(2, "0")}-${month}-${value.getUTCFullYear()}`;
  }
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      const month = [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
      ][Number(match[2]) - 1];
      return `${match[3]}-${month}-${match[1]}`;
    }
    return value.trim();
  }
  return "";
};

/** Natural, case-insensitive comparison, standing in for strnatcasecmp. */
const naturalCompare = (left: string, right: string): number => {
  const chunk = /(\d+|\D+)/g;
  const a = left.toLowerCase().match(chunk) ?? [];
  const b = right.toLowerCase().match(chunk) ?? [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

/** De-duplicates the cross-joined rows into the product and land tables. */
export function buildKoordinatTanahData(
  rows: SpRow[],
  gpsRows: GpsRow[],
  requestedSpk: string,
): KoordinatTanahData {
  const first = rows[0] ?? {};

  const products = new Map<string, ProductRow>();
  const lands = new Map<string, LandRow>();
  const periods = new Set<string>();

  for (const row of rows) {
    const product = {
      jenis: toText(row.Jenis),
      namaBarangJadi: toText(row.NamaBarangJadi),
      tebal: toFloat(row.Tebal),
      lebar: toFloat(row.Lebar),
      panjang: toFloat(row.Panjang),
      bundle: toFloat(row.Bundle),
      pcsPerBundle: toFloat(row.PcsPerBundle),
      keterangan: toText(row.Keterangan),
    };
    const productKey = [
      product.jenis,
      product.namaBarangJadi,
      product.tebal ?? "",
      product.lebar ?? "",
      product.panjang ?? "",
      product.bundle ?? "",
      product.pcsPerBundle ?? "",
      product.keterangan,
    ].join("|");
    // A row where every product column is blank is the join producing nothing
    // for this SPK, not a real product line. Checked on the key having content
    // rather than against a literal run of separators, which is easy to
    // miscount.
    if (productKey.replace(/\|/g, "") !== "" && !products.has(productKey)) {
      products.set(productKey, product);
    }

    const land = {
      namaTanah: toText(row.NamaTanah),
      namaPemilik: toText(row.NamaPemilik),
      desaKelurahan: toText(row.DesaKelurahan),
      kabupatenKota: toText(row.KabupatenKota),
      provinsi: toText(row.Provinsi),
      noSuratTanah: toText(row.NoSuratTanah),
      luas: toFloat(row.Luas),
      koordinat: toText(row.Koordinat),
      periode: fmtDate(row.Periode),
    };
    const landKey = [
      land.namaTanah,
      land.namaPemilik,
      land.desaKelurahan,
      land.kabupatenKota,
      land.provinsi,
      land.noSuratTanah,
      land.luas ?? "",
      land.koordinat,
      land.periode,
    ].join("|");
    if (landKey.replace(/\|/g, "") !== "" && !lands.has(landKey)) {
      lands.set(landKey, land);
    }

    const periode = toText(row.Periode);
    if (periode !== "") periods.add(periode);
  }

  const gpsPercentages = gpsRows.map((row) => ({
    jenis: toText(row.Jenis),
    koordinat: toText(row.Koordinat),
    namaPemilik: toText(row.NamaPemilik),
    tahun: toText(row.Tahun),
    total: Math.round((toFloat(row.Total) ?? 0) * 10000) / 10000,
    persen: Math.round((toFloat(row.Persen) ?? 0) * 100) / 100,
  }));

  return {
    noSpk: requestedSpk,
    header: {
      noSpk: toText(first.NoSPK) || requestedSpk,
      tanggal: fmtDate(first.Tanggal),
      buyer: toText(first.Buyer),
      tujuan: toText(first.Tujuan),
    },
    products: [...products.values()].sort((left, right) => {
      for (const field of ["jenis", "namaBarangJadi"] as const) {
        const compare = naturalCompare(left[field], right[field]);
        if (compare !== 0) return compare;
      }
      for (const field of ["tebal", "lebar", "panjang"] as const) {
        const diff = (left[field] ?? 0) - (right[field] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    }),
    lands: [...lands.values()].sort((left, right) => {
      const byPeriod = naturalCompare(left.periode, right.periode);
      if (byPeriod !== 0) return byPeriod;
      const byOwner = naturalCompare(left.namaPemilik, right.namaPemilik);
      if (byOwner !== 0) return byOwner;
      return naturalCompare(left.namaTanah, right.namaTanah);
    }),
    gpsPercentages,
    gpsTotal: gpsPercentages.reduce((sum, row) => sum + row.total, 0),
    periodCount: periods.size,
  };
}

const PRODUCT_COLUMNS: ReportColumn[] = [
  { kind: "no", label: "No", width: "5%" },
  { kind: "label", label: "Jenis", field: "jenis", width: "14%" },
  { kind: "label", label: "Nama Barang Jadi", field: "namaBarangJadi", width: "17%" },
  { kind: "number", label: "Tebal", field: "tebal", width: "8%", format: (v) => formatNumber(v, 0), align: "center" },
  { kind: "number", label: "Lebar", field: "lebar", width: "8%", format: (v) => formatNumber(v, 0), align: "center" },
  { kind: "number", label: "Panjang", field: "panjang", width: "10%", format: (v) => formatNumber(v, 0), align: "center" },
  { kind: "number", label: "Bundle", field: "bundle", width: "8%", format: (v) => formatNumber(v, 0), align: "center" },
  { kind: "number", label: "Pcs/Bundle", field: "pcsPerBundle", width: "12%", format: (v) => formatNumber(v, 0), align: "center" },
  { kind: "label", label: "Keterangan", field: "keterangan" },
];

const GPS_COLUMNS: ReportColumn[] = [
  { kind: "no", label: "No", width: "5%" },
  { kind: "label", label: "Jenis", field: "jenis", width: "22%" },
  { kind: "number", label: "Total", field: "total", width: "9%" },
  { kind: "number", label: "Persen", field: "persen", width: "9%", format: (v) => `${formatNumber(v, 2)}%` },
  { kind: "label", label: "Nama Pemilik", field: "namaPemilik", width: "20%" },
  { kind: "label", label: "Tahun", field: "tahun", width: "8%", align: "center" },
  { kind: "label", label: "Koordinat", field: "koordinat", width: "27%" },
];

const LAND_COLUMNS: ReportColumn[] = [
  { kind: "no", label: "No", width: "5%" },
  { kind: "label", label: "Periode", field: "periode", width: "8%", align: "center" },
  { kind: "label", label: "Nama Tanah", field: "namaTanah", width: "11%" },
  { kind: "label", label: "Nama Pemilik", field: "namaPemilik", width: "13%" },
  { kind: "label", label: "Desa/Kelurahan", field: "desaKelurahan", width: "13%" },
  { kind: "label", label: "Kab/Kota", field: "kabupatenKota", width: "12%" },
  { kind: "label", label: "Provinsi", field: "provinsi", width: "10%" },
  { kind: "label", label: "No Surat Tanah", field: "noSuratTanah", width: "12%" },
  { kind: "number", label: "Luas", field: "luas", width: "8%", format: (v) => formatNumber(v, 0) },
  { kind: "label", label: "Koordinat", field: "koordinat", width: "12%" },
];

/**
 * Renders a body table plus its header band. `extraRowHtml` appends a total row
 * inside the same tbody — the shared builder has no hook for that, and a row
 * outside the tbody would be dropped by the browser.
 */
const renderTable = (
  columns: ReportColumn[],
  rows: Array<Record<string, unknown>>,
  extraRowHtml = "",
): string => {
  const headers = columns
    .map((column) => `<th${column.width ? ` style="width: ${column.width};"` : ""}>${escapeHtml(column.label)}</th>`)
    .join("");
  const body = rows.length
    ? rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            ${columns
              .map((column) => {
                if (column.kind === "no") return `<td class="center">${index + 1}</td>`;
                const value = row[column.field!];
                if (column.kind === "number") {
                  const text = column.format
                    ? column.format(value as number)
                    : formatNumber(value as number, 4);
                  return `<td class="${column.align === "center" ? "center" : "number"}">${escapeHtml(text)}</td>`;
                }
                return `<td class="${column.align === "center" ? "center" : "label"}">${escapeHtml(value)}</td>`;
              })
              .join("")}
          </tr>`,
        )
        .join("\n          ")
    : buildEmptyTableRow(columns.length);

  return `<table class="report-table">
    <thead>
      <tr class="headers-row">${headers}
      </tr>
    </thead>
    <tbody>
      ${body}${extraRowHtml}
    </tbody>
  </table>`;
};

export const koordinatTanahReport: ReportDefinition<
  KoordinatTanahParams,
  KoordinatTanahData
> = {
  type: "koordinat-tanah",
  title: "Laporan Koordinat Tanah",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    // Two independent requests: mssql request objects are single-use, and the
    // pool is what gives us the concurrency here.
    const [main, gps] = await Promise.all([
      conn
        .request()
        .input("NoSPK", sql.VarChar(50), params.noSpk)
        .execute("SP_PrintCariKoordinatTanah"),
      conn
        .request()
        .input("NoSPK", sql.VarChar(50), params.noSpk)
        .execute("SP_PrintPersentaseCariKoordinat"),
    ]);
    return buildKoordinatTanahData(
      (main.recordset ?? []) as SpRow[],
      (gps.recordset ?? []) as GpsRow[],
      params.noSpk,
    );
  },

  render(data: KoordinatTanahData, meta: RenderMeta<KoordinatTanahParams>) {
    const gpsTotalRow =
      data.gpsPercentages.length > 0
        ? `
      <tr class="totals-row">
        <td class="center" colspan="2">Total</td>
        <td class="number">${escapeHtml(formatNumber(data.gpsTotal, 4))}</td>
        <td colspan="4"></td>
      </tr>`
        : "";

    const bodyHtml = `<table class="meta-grid">
    <tr>
      <td style="width: 50%;">
        <table>
          <tr>
            <td class="meta-label">No SPK</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.noSpk)}</td>
          </tr>
          <tr>
            <td class="meta-label">Tanggal</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.tanggal)}</td>
          </tr>
        </table>
      </td>
      <td style="width: 50%;">
        <table>
          <tr>
            <td class="meta-label">Buyer</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.buyer)}</td>
          </tr>
          <tr>
            <td class="meta-label">Tujuan</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.header.tujuan)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div class="section-title">Produk SPK</div>
  ${renderTable(
    PRODUCT_COLUMNS,
    data.products as unknown as Array<Record<string, unknown>>,
  )}
  <div class="section-title">Persentase Koordinat GPS</div>
  ${renderTable(
    GPS_COLUMNS,
    data.gpsPercentages as unknown as Array<Record<string, unknown>>,
    gpsTotalRow,
  )}
  <div class="section-title">Daftar Koordinat Tanah</div>
  ${renderTable(
    LAND_COLUMNS,
    data.lands as unknown as Array<Record<string, unknown>>,
  )}
  <div class="ringkasan">Ringkasan: ${data.products.length} produk, ${data.lands.length} tanah, ${data.gpsPercentages.length} baris persentase GPS, ${data.periodCount} periode sumber.</div>`;

    return renderWpsReportPage({
      title: "Laporan Koordinat Tanah",
      bodyHtml,
      style: "koordinat_tanah",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
