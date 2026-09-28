import sql from "mssql";
import {
  MONTHS_SHORT_ID,
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderMeta } from "../types";
import { buildEmptyTable, renderWpsReportPage } from "./template";
import { fmtInt, fmtM3, fmtRatio, shareRatio, toRoman } from "./penjualan-shared";

/**
 * Laporan Timeline Rekap Penjualan Per-Produk — SP_LapJualPerProdukTimeLine.
 *
 * Unlike the other three recaps this one breaks the sales down by month, so the
 * column count follows the period: a one-month range gets one month column, a
 * twelve-month range gets twelve. The month columns are generated from the
 * period itself (first to last month, inclusive) rather than from the rows, so
 * a month with no sales still appears as a column and the two reports keep the
 * same shape between periods.
 *
 * The layout is sized for portrait. The legacy blade gives the six fixed columns
 * 48% of the width and floors each month column at 3.5%, which only fits up to
 * fourteen month columns — beyond that the table would run off the page in the
 * legacy tool too, so the same limit is kept here rather than silently
 * switching to landscape.
 *
 * Rows are grouped product -> thickness -> size, then flattened back out for
 * display with the thickness printed once per group and the product name printed
 * on the middle row of its block (the legacy blade's `$middleProductRow`).
 *
 * Month headings are Indonesian abbreviations (Agt, Sep, Okt ...) to match the
 * rest of the service; the legacy blade used Carbon's English `M` format.
 */

interface SpRow {
  Product?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
  BJM3?: unknown;
  TglJual?: unknown;
}

/** One calendar column: the "YYYY-MM" key plus its Indonesian heading. */
interface MonthColumn {
  key: string;
  short: string;
}

interface TimelineRow {
  /** Tebal|Lebar|Panjang, four decimals — the legacy size key. */
  sizeKey: string;
  lebar: number | null;
  panjang: number | null;
  jmlhBatang: number;
  /** m3 per month key; every month in the period is present. */
  months: Map<string, number>;
  total: number;
  ratio: number | null;
}

interface TebalGroup {
  tebal: number | null;
  rows: TimelineRow[];
}

interface TimelineProduct {
  name: string;
  roman: string;
  rows: TimelineRow[];
  tebalGroups: TebalGroup[];
  monthTotals: Map<string, number>;
  total: number;
  ratio: number | null;
}

interface TimelineData {
  months: MonthColumn[];
  products: TimelineProduct[];
  grandTotal: number;
  monthTotals: Map<string, number>;
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

/** The "YYYY-MM" a TglJual value falls in, or null when it is missing. */
const monthKeyOf = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})/.exec(value.trim());
    if (match) return `${match[1]}-${match[2]}`;
  }
  return null;
};

/**
 * Every month from tglAwal's month to tglAkhir's month, inclusive. A reversed
 * period yields the start month alone rather than nothing, so the table still
 * has its Total columns. Capped at 60 months so a far-future end date cannot
 * build an unbounded column list.
 */
export function buildMonthColumns(
  tglAwal: string,
  tglAkhir: string,
): MonthColumn[] {
  const start = /^(\d{4})-(\d{2})/.exec(tglAwal);
  const end = /^(\d{4})-(\d{2})/.exec(tglAkhir) ?? start;
  if (!start || !end) return [];

  const columns: MonthColumn[] = [];
  let year = Number(start[1]);
  let month = Number(start[2]);
  const lastYear = Number(end[1]);
  const lastMonth = Number(end[2]);

  while (
    (year < lastYear || (year === lastYear && month <= lastMonth)) &&
    columns.length < 60
  ) {
    columns.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      short: MONTHS_SHORT_ID[month - 1] ?? String(month),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return columns;
}

export function buildTimelineData(
  rows: SpRow[],
  months: MonthColumn[],
): TimelineData {
  const products = new Map<string, TimelineProduct>();
  const monthTotals = new Map<string, number>(months.map((m) => [m.key, 0]));
  let grandTotal = 0;

  for (const row of rows) {
    const name = toText(row.Product);
    if (name === "") continue;

    const m3 = toFloat(row.M3) ?? 0;
    const monthKey = monthKeyOf(row.TglJual);
    // The same size sold on several dates in a month is one row, so the size
    // key deliberately excludes the date.
    const sizeKey = [row.Tebal, row.Lebar, row.Panjang]
      .map((value) => {
        const parsed = toFloat(value);
        return parsed === null ? "" : parsed.toFixed(4);
      })
      .join("|");

    let product = products.get(name);
    if (!product) {
      product = {
        name,
        roman: "",
        rows: [],
        tebalGroups: [],
        monthTotals: new Map(months.map((m) => [m.key, 0])),
        total: 0,
        ratio: null,
      };
      products.set(name, product);
    }

    let detail = product.rows.find((candidate) => candidate.sizeKey === sizeKey);
    if (!detail) {
      detail = {
        sizeKey,
        lebar: toFloat(row.Lebar),
        panjang: toFloat(row.Panjang),
        jmlhBatang: 0,
        months: new Map(months.map((m) => [m.key, 0])),
        total: 0,
        ratio: null,
      };
      product.rows.push(detail);
    }
    detail.jmlhBatang += Math.round(toFloat(row.JmlhBatang) ?? 0);

    // A month outside the period column set cannot happen (the SP filters by
    // period), but guarding keeps a stray date from creating a phantom column.
    if (monthKey !== null && detail.months.has(monthKey)) {
      detail.months.set(monthKey, detail.months.get(monthKey)! + m3);
      product.monthTotals.set(monthKey, product.monthTotals.get(monthKey)! + m3);
      monthTotals.set(monthKey, monthTotals.get(monthKey)! + m3);
    }
    detail.total += m3;
    product.total += m3;
    grandTotal += m3;
  }

  const list = [...products.values()];
  list.forEach((product, index) => {
    product.roman = toRoman(index + 1);
    product.ratio = shareRatio(product.total, grandTotal);
    for (const row of product.rows) {
      row.ratio = shareRatio(row.total, product.total);
    }

    // Group the flattened rows by thickness, in first-appearance order. The
    // thickness is the leading segment of the size key, so no re-parsing of the
    // original value is needed.
    const groups = new Map<string, TebalGroup>();
    for (const row of product.rows) {
      const key = row.sizeKey.split("|")[0]!;
      let group = groups.get(key);
      if (!group) {
        group = { tebal: key === "" ? null : Number(key), rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
    }
    product.tebalGroups = [...groups.values()];
  });

  return { months, products: list, grandTotal, monthTotals };
}

/** Legacy $fmtSummaryRatio: one decimal, thousands separated, no space before %. */
const fmtPctOne = (value: number | null): string =>
  value === null ? "" : `${formatNumber(value, 1)}%`;

/** A month cell is blank when the month sold nothing, as in the legacy blade. */
const monthCell = (value: number | undefined): string =>
  value !== undefined && value > 0 ? escapeHtml(fmtM3(value)) : "";

const monthHeaderCells = (
  months: MonthColumn[],
  indent: string,
  widthPercent: number,
): string =>
  months
    .map(
      (month) =>
        `${indent}<th style="width: ${widthPercent}%;">${escapeHtml(month.short)}</th>`,
    )
    .join("\n");

const monthValueCells = (
  months: MonthColumn[],
  values: Map<string, number>,
  indent: string,
): string =>
  months
    .map((month) => `${indent}<td class="number">${monthCell(values.get(month.key))}</td>`)
    .join("\n");

/**
 * Explicit column widths, in percent, that add up to exactly 100.
 *
 * Declaring them in CSS cannot express "the month columns take whatever is
 * left": under `table-layout: fixed` Chromium scales every declared width up
 * when the total falls short of 100%, so the leftover was shared out
 * proportionally and a single-month period ended up with a month column 47% of
 * the page wide — wider than the product name it was meant to sit beside.
 *
 * The five narrow columns take fixed shares, sized from what they actually have
 * to hold. Measured off the rendered page at 10px, the widest thing in each is
 * its heading, not its data: "Lebar" is 24.7pt and "Panjang" 33.6pt, while the
 * data under them only needs 18.6pt. At 5% and 6% the two headings overhung
 * their column lines by 2.7pt and 3.2pt and ran into the neighbouring column,
 * so each share is set to the heading's width plus the 6pt of cell padding
 * around it.
 *
 * The months are capped at 56% in total, which is what keeps the product name
 * wider than a month column at every period length: the five fixed columns
 * take 32.7% and the product name is left at least 11.3%. A month column starts
 * at 12% and is squeezed as months multiply.
 *
 * "Sub Total" and the share beside it are one header cell with colspan="2", so
 * the browser divides that span evenly rather than by the two declared shares:
 * the two numbers below are the size of the span, not of each column. The span
 * therefore has to be twice the wider of the two requirements, or the volume
 * figure ("117.2376", 31.2pt) clips by a couple of points.
 *
 * That cap is the trade. Holding a full figure in a month column needs about
 * 6.7%, so 56% only covers eight months; past that the figures start to clip.
 * The page does turn landscape past four months, which buys 37% more width,
 * but no orientation fits eighteen columns of figures on A4.
 */
export function columnWidths(monthCount: number): {
  produk: number;
  tebal: number;
  lebar: number;
  panjang: number;
  month: number;
  subTotal: number;
  ratio: number;
} {
  const n = Math.max(1, monthCount);
  const monthTotal = Math.min(56, Math.max(12, 12 * n));
  // subTotal and ratio are the halves of one colspan=2 header cell; see above.
  const fixed = { tebal: 5.5, lebar: 5.7, panjang: 7.5, subTotal: 7, ratio: 7 };
  const fixedTotal = Object.values(fixed).reduce((a, b) => a + b, 0);
  return {
    produk: Math.round((100 - monthTotal - fixedTotal) * 10) / 10,
    ...fixed,
    month: Math.round((monthTotal / n) * 10) / 10,
  };
}

/**
 * "Sub Total" heads the pair of columns on the right — the volume and the share
 * of the product — so it is one header cell with colspan="2", as the legacy
 * blade had it. Its width is the sum of the two columns it spans, which is what
 * `table-layout: fixed` needs in order to divide them.
 */
const totalHeaderCell = (
  label: string,
  indent: string,
  w: { subTotal: number; ratio: number },
): string =>
  `${indent}<th colspan="2" style="width: ${Math.round((w.subTotal + w.ratio) * 10) / 10}%;">${escapeHtml(label)}</th>`;

const renderDetailTable = (data: TimelineData): string => {
  const w = columnWidths(data.months.length);
  let globalRowIndex = 0;

  const productBlocks = data.products.map((product, productIndex) => {
    // The product name is printed once, on the middle row of its block.
    const rowCount = product.tebalGroups.reduce((sum, g) => sum + g.rows.length, 0);
    const middleRow = rowCount > 0 ? Math.ceil(rowCount / 2) : 1;
    let currentRow = 0;

    const detailRows = product.tebalGroups
      .map((group) =>
        group.rows
          .map((row, indexInGroup) => {
            globalRowIndex += 1;
            currentRow += 1;
            const zebra = globalRowIndex % 2 === 1 ? "row-odd" : "row-even";
            const divider =
              currentRow === 1 && productIndex > 0 ? " product-divider" : "";
            return `<tr class="data-row ${zebra}${divider}">
            <td class="product-name-cell">${currentRow === middleRow ? escapeHtml(product.name) : ""}</td>
            <td class="center">${indexInGroup === 0 ? escapeHtml(fmtInt(group.tebal)) : ""}</td>
            <td class="center">${escapeHtml(fmtInt(row.lebar))}</td>
            <td class="center">${escapeHtml(fmtInt(row.panjang))}</td>
${monthValueCells(data.months, row.months, "            ")}
            <td class="number">${row.total > 0 ? escapeHtml(fmtM3(row.total)) : ""}</td>
            <td class="number">${row.ratio !== null && row.ratio > 0 ? escapeHtml(fmtRatio(row.ratio)) : ""}</td>
          </tr>`;
          })
          .join("\n          "),
      )
      .join("\n          ");

    return `${detailRows}
        <tr class="totals-row">
          <td class="center" colspan="4">Total ${escapeHtml(product.name)}</td>
${monthValueCells(data.months, product.monthTotals, "          ")}
          <td class="number">${product.total > 0 ? escapeHtml(fmtM3(product.total)) : ""}</td>
          <td class="number">100.00</td>
        </tr>`;
  });

  return `<table class="report-table detail-table">
    <thead>
      <tr class="headers-row">
        <th style="width: ${w.produk}%;">Produk</th>
        <th style="width: ${w.tebal}%;">Tebal</th>
        <th style="width: ${w.lebar}%;">Lebar</th>
        <th style="width: ${w.panjang}%;">Panjang</th>
${monthHeaderCells(data.months, "        ", w.month)}
${totalHeaderCell("Sub Total", "        ", w)}
      </tr>
    </thead>
    <tbody>
      ${productBlocks.join("\n        ")}
    </tbody>
  </table>`;
};

const renderSummary = (data: TimelineData): string => {
  // The summary drops the three dimension columns the detail table carries, so
  // its product column takes more of the width; the month and total columns
  // keep the same shares.
  const w = columnWidths(data.months.length);
  const summaryWidths = {
    produk: Math.round((w.produk + w.tebal + w.lebar + w.panjang) * 10) / 10,
    month: w.month,
    subTotal: w.subTotal,
    ratio: w.ratio,
  };

  const rows = data.products
    .map(
      (product, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
          <td>${escapeHtml(product.name)}</td>
${monthValueCells(data.months, product.monthTotals, "          ")}
          <td class="number">${product.total > 0 ? escapeHtml(fmtM3(product.total)) : ""}</td>
          <td class="number">${escapeHtml(fmtPctOne(product.ratio))}</td>
        </tr>`,
    )
    .join("\n        ");

  return `<div class="summary-title">Rangkuman Hasil :</div>
  <table class="report-table summary-table">
    <thead>
      <tr class="headers-row">
        <th style="width: ${summaryWidths.produk}%;">Produk</th>
${monthHeaderCells(data.months, "        ", summaryWidths.month)}
${totalHeaderCell("Total", "        ", summaryWidths)}
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals-row">
        <td class="center">Grand Total</td>
${monthValueCells(data.months, data.monthTotals, "        ")}
        <td class="number">${data.grandTotal > 0 ? escapeHtml(fmtM3(data.grandTotal)) : ""}</td>
        <td class="number">100.0%</td>
      </tr>
    </tbody>
  </table>`;
};

export const timelineRekapPenjualanPerProdukReport: ReportDefinition<
  PeriodParams,
  TimelineData
> = {
  type: "timeline-rekap-penjualan-per-produk",
  title: "Laporan Timeline Rekap Penjualan Per-Produk",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapJualPerProdukTimeLine");
    return buildTimelineData(
      (result.recordset ?? []) as SpRow[],
      buildMonthColumns(params.tglAwal, params.tglAkhir),
    );
  },

  render(data: TimelineData, meta: RenderMeta<PeriodParams>) {
    const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;

    const bodyHtml =
      data.products.length > 0
        ? `${renderDetailTable(data)}
  ${renderSummary(data)}`
        : buildEmptyTable(1);

    return renderWpsReportPage({
      title: "Laporan Timeline Rekap Penjualan Per-Produk",
      subtitle,
      bodyHtml,
      style: "timeline_penjualan",
      // The table grows a column for every month the period covers. Past four
      // the fixed columns are squeezed until the product name wraps three deep,
      // so the page turns sideways and every column gets the room it needs.
      landscape: data.months.length > 4,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
