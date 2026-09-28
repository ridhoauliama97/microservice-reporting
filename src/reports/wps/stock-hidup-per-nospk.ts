import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import type { ReportDefinition, RenderMeta } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapSemuaStockHidupPerSPK — "Laporan Stock Hidup Per No SPK" and its
 * "(Discrepancy)" variant. Ported from StockHidupPerNoSpkReportService and
 * StockHidupPerNoSpkDiscrepancyReportService with their two blades.
 *
 * The two legacy services are the same code with two differences: the
 * @UsingMode they pass (3 for the plain report, 1 for Discrepancy) and the
 * title. The plain one additionally reads NoContract and Tujuan, but neither
 * blade renders those columns, so they are not reproduced. The two modes return
 * genuinely different data - for 31-Aug-2026, 307 rows and 486.9738 m3 against
 * 196 rows and 204.6185 m3 - so both reports are needed.
 *
 * Rows arrive flat and are folded into category -> SPK -> detail, then sorted:
 * categories in a fixed order (unknown ones after, alphabetically), SPKs
 * naturally with the placeholder "-" last, and details by Jenis then thickness,
 * width and length.
 *
 * The parameter is a single as-of date, so the body takes `{ tgl }`.
 */

const CATEGORY_ORDER = ["ST", "S4S", "FJ", "MLD", "LMT", "CCAKHIR", "SAND", "BJADI"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  ST: "ST",
  BJADI: "Barang Jadi",
  CCAKHIR: "CC Akhir",
  FJ: "Finger Joint",
  LMT: "Laminating",
  S4S: "S4S",
  SAND: "Sanding",
  MLD: "Moulding",
};

const paramsSchema = z.object({
  tgl: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
});

interface SpkRow extends Record<string, unknown> {
  Kategori: unknown;
  NoSPK: unknown;
  Jenis: unknown;
  Tebal: unknown;
  Lebar: unknown;
  Panjang: unknown;
  Pcs: unknown;
  Umur: unknown;
  Total: unknown;
  Buyer: unknown;
}

interface DetailRow {
  jenis: string;
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  pcs: number | null;
  umur: number | null;
  total: number;
}

interface SpkGroup {
  noSpk: string;
  buyer: string;
  rows: DetailRow[];
  total: number;
}

interface Category {
  name: string;
  label: string;
  spks: SpkGroup[];
  total: number;
}

interface StockHidupData {
  categories: Category[];
  summary: { totalSpk: number; totalCategories: number; grandTotal: number };
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const nullableFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Legacy $fmtNumber: two decimals with the trailing zeros stripped. */
const fmtNumber = (value: number | null): string => {
  if (value === null) return "";
  const [intPart, decPart] = value.toFixed(2).split(".");
  const trimmed = decPart.replace(/0+$/, "");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${trimmed ? `.${trimmed}` : ""}`;
};

/** Legacy $fmtTotal: always four decimals. */
const fmtTotal = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 4);

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
    const xn = /^\d/.test(x);
    const yn = /^\d/.test(y);
    if (xn && yn) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

const categoryLabel = (name: string): string => CATEGORY_LABELS[name] ?? name;

export function buildStockHidupData(rows: SpkRow[]): StockHidupData {
  const byCategory = new Map<string, Map<string, SpkGroup>>();
  let totalSpk = 0;
  let grandTotal = 0;

  for (const row of rows) {
    const name = toText(row.Kategori) || "LAINNYA";
    const noSpk = toText(row.NoSPK) || "-";
    const total = nullableFloat(row.Total) ?? 0;

    let spks = byCategory.get(name);
    if (!spks) {
      spks = new Map();
      byCategory.set(name, spks);
    }

    let spk = spks.get(noSpk);
    if (!spk) {
      spk = { noSpk, buyer: toText(row.Buyer), rows: [], total: 0 };
      spks.set(noSpk, spk);
      totalSpk += 1;
    }

    spk.rows.push({
      jenis: toText(row.Jenis),
      tebal: nullableFloat(row.Tebal),
      lebar: nullableFloat(row.Lebar),
      panjang: nullableFloat(row.Panjang),
      pcs: nullableFloat(row.Pcs),
      umur: nullableFloat(row.Umur),
      total,
    });
    spk.total += total;
    grandTotal += total;
  }

  // Fixed order first, then anything unrecognised, alphabetically.
  const orderedNames = [
    ...CATEGORY_ORDER.filter((name) => byCategory.has(name)),
    ...[...byCategory.keys()]
      .filter((name) => !(CATEGORY_ORDER as readonly string[]).includes(name))
      .sort(naturalCompare),
  ];

  const categories: Category[] = orderedNames.map((name) => {
    const spks = byCategory.get(name)!;
    const orderedSpks = [...spks.values()].sort((left, right) => {
      // The "-" placeholder sorts last regardless.
      if (left.noSpk === "-" && right.noSpk !== "-") return 1;
      if (right.noSpk === "-" && left.noSpk !== "-") return -1;
      return naturalCompare(left.noSpk, right.noSpk);
    });

    for (const spk of orderedSpks) {
      spk.rows.sort((left, right) => {
        if (left.jenis !== right.jenis) return left.jenis < right.jenis ? -1 : 1;
        for (const field of ["tebal", "lebar", "panjang"] as const) {
          const diff = (left[field] ?? 0) - (right[field] ?? 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
    }

    return {
      name,
      label: categoryLabel(name),
      spks: orderedSpks,
      total: orderedSpks.reduce((sum, spk) => sum + spk.total, 0),
    };
  });

  return {
    categories,
    summary: {
      totalSpk,
      totalCategories: categories.length,
      grandTotal,
    },
  };
}

const DETAIL_HEADERS = `
        <th style="width: 40px;">No</th>
        <th>Jenis</th>
        <th style="width: 86px;">No SPK</th>
        <th style="width: 110px;">Buyer</th>
        <th style="width: 50px;">Umur</th>
        <th style="width: 50px;">Tebal</th>
        <th style="width: 56px;">Lebar</th>
        <th style="width: 60px;">Panjang</th>
        <th style="width: 52px;">Pcs</th>
        <th style="width: 90px;">Total (m3)</th>`;

const renderCategoryTable = (category: Category): string => {
  // Row numbering runs across the whole category, not per SPK.
  let rowNo = 1;
  const bodyRows = category.spks
    .map((spk) => {
      const spkLabel = spk.noSpk === "-" ? "Tanpa No SPK" : spk.noSpk;
      return spk.rows
        .map((row) => {
          // Legacy prints the counter and only then increments, and picks the
          // zebra from the pre-increment value - so the first row is "row-odd".
          const current = rowNo;
          rowNo += 1;
          return `<tr class="${current % 2 === 1 ? "row-odd" : "row-even"}">
          <td class="center">${current}</td>
          <td>${escapeHtml(row.jenis)}</td>
          <td class="center">${escapeHtml(spkLabel)}</td>
          <td class="center">${escapeHtml(spk.buyer)}</td>
          <td class="number">${escapeHtml(fmtNumber(row.umur))}</td>
          <td class="number">${escapeHtml(fmtNumber(row.tebal))}</td>
          <td class="number">${escapeHtml(fmtNumber(row.lebar))}</td>
          <td class="number">${escapeHtml(fmtNumber(row.panjang))}</td>
          <td class="number">${escapeHtml(fmtNumber(row.pcs))}</td>
          <td class="number">${escapeHtml(fmtTotal(row.total))}</td>
        </tr>`;
        })
        .join("\n        ");
    })
    .join("\n        ");

  return `<div class="section-title">Kategori : ${escapeHtml(category.label)}</div>
  <table class="report-table spk-category">
    <thead>
      <tr class="headers-row">${DETAIL_HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(10)}
      <tr class="totals-row">
        <td colspan="9" class="center">Total Kategori ${escapeHtml(category.label)} : </td>
        <td class="number">${escapeHtml(fmtTotal(category.total))}</td>
      </tr>
    </tbody>
  </table>`;
};

const renderSummary = (data: StockHidupData): string => `<div class="summary-title">Rangkuman</div>
  <table class="summary-table">
    <tbody>
      <tr>
        <td>Total No SPK</td>
        <td class="number">${escapeHtml(formatNumber(data.summary.totalSpk, 0))}</td>
      </tr>
      <tr>
        <td>Total Kategori</td>
        <td class="number">${escapeHtml(formatNumber(data.summary.totalCategories, 0))}</td>
      </tr>
      ${data.categories
        .map(
          (category) => `<tr>
        <td>Total ${escapeHtml(category.label)}</td>
        <td class="number">${escapeHtml(fmtTotal(category.total))}</td>
      </tr>`,
        )
        .join("\n      ")}
      <tr class="totals-row">
        <td>Grand Total (m3)</td>
        <td class="number">${escapeHtml(fmtTotal(data.summary.grandTotal))}</td>
      </tr>
    </tbody>
  </table>`;

interface StockHidupSpec {
  type: string;
  title: string;
  /** Stored procedure switch: 3 for the plain report, 1 for Discrepancy. */
  usingMode: number;
}

/** Shared factory for the two "Stock Hidup Per No SPK" reports. */
export function createStockHidupPerNoSpkReport(
  spec: StockHidupSpec,
): ReportDefinition<{ tgl: string }, StockHidupData> {
  return {
    type: spec.type,
    title: spec.title,
    paramsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("TglAkhir", sql.Date, params.tgl)
        .input("UsingMode", sql.TinyInt, spec.usingMode)
        .execute("SP_LapSemuaStockHidupPerSPK");
      return buildStockHidupData((result.recordset ?? []) as SpkRow[]);
    },

    render(data, meta: RenderMeta<{ tgl: string }>) {
      const bodyHtml =
        data.categories.length > 0
          ? `${data.categories.map(renderCategoryTable).join("\n  ")}
  ${renderSummary(data)}`
          : `<table class="report-table"><tbody>${buildEmptyTableRow(1)}</tbody></table>`;

      return renderWpsReportPage({
        title: spec.title,
        subtitle: `Per Tanggal : ${formatTanggalId(meta.params.tgl)}`,
        bodyHtml,
        style: "stock_hidup_per_nospk",
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const stockHidupPerNoSpkReport = createStockHidupPerNoSpkReport({
  type: "stock-hidup-per-nospk",
  title: "Laporan Stock Hidup Per No SPK",
  usingMode: 3,
});

export const stockHidupPerNoSpkDiscrepancyReport = createStockHidupPerNoSpkReport({
  type: "stock-hidup-per-nospk-discrepancy",
  title: "Laporan Stock Hidup Per No SPK (Discrepancy)",
  usingMode: 1,
});
