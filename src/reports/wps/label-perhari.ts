import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SPWps_LapLabelPerhari — "Laporan Label Perhari". Ported from
 * LabelPerhariReportService and label-perhari-pdf.blade.php.
 *
 * The SP returns one row per label detail. The legacy service groups them by
 * the "Ket" (product) column, then by label number, and collapses each label
 * group into a single row: repeated machine / jenis / dimension values are
 * de-duplicated and joined with " / ", and pcs and berat are summed.
 *
 * Weight is unit-stamped per product: anything whose name contains "ST" is
 * measured in Ton, everything else in m3.
 *
 * The legacy blade also chunks each category at 300 rows and forces a page
 * break between chunks; that behaviour is kept.
 */

interface LabelRow extends Record<string, unknown> {
  NoLabel: string | null;
  NoUrut: number | string | null;
  NoSPK: string | null;
  NoSPKAsal: string | null;
  Mesin: string | null;
  Jenis: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Panjang: number | string | null;
  JmlhBatang: number | string | null;
  Berat: number | string | null;
  Ket: string | null;
}

interface LabelGroup {
  noLabel: string;
  noUrut: string;
  noSpk: string;
  noSpkAsal: string;
  mesin: string;
  jenis: string;
  tebal: string;
  lebar: string;
  panjang: string;
  pcs: number;
  berat: number;
}

interface LabelCategory {
  no: number;
  name: string;
  rows: LabelGroup[];
  totalPcs: number;
  totalBerat: number;
}

interface LabelData {
  categories: LabelCategory[];
  labelCount: number;
  totalPcs: number;
  totalBerat: number;
}

const CATEGORY_ORDER = [
  "ST",
  "S4S",
  "FJ",
  "MLD",
  "LMT",
  "CCA",
  "SAND",
  "BJ",
] as const;
const CHUNK_SIZE = 300;

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy nullableFloat: null for anything that is not numeric. */
const nullableFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmt: four decimals, blank at ~zero. */
const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

/** Legacy $fmtInt: whole number, blank at zero. */
const fmtInt = (value: number): string =>
  Math.abs(value) < 0.0000001 ? "" : formatNumber(Math.round(value), 0);

/** Weight unit depends on the product: "ST" in the name means Ton. */
const weightUnit = (categoryName: string): string =>
  categoryName.toUpperCase().includes("ST") ? "Ton" : "m3";

const fmtWeightWithUnit = (value: number, categoryName: string): string => {
  const formatted = fmt(value);
  return formatted === "" ? "" : `${formatted} ${weightUnit(categoryName)}`;
};

const pushUniqueString = (bucket: string[], value: string): void => {
  if (value !== "" && !bucket.includes(value)) bucket.push(value);
};

const pushUniqueFormatted = (
  bucket: string[],
  value: number | null,
  decimals: number,
): void => {
  if (value === null) return;
  const formatted = formatNumber(value, decimals);
  if (!bucket.includes(formatted)) bucket.push(formatted);
};

const implodeValues = (values: string[]): string =>
  values.length === 0 ? "-" : values.join(" / ");

/** Groups the SP rows by product and then by label, exactly like the legacy service. */
export function buildLabelCategories(rows: LabelRow[]): LabelData {
  const grouped = new Map<
    string,
    {
      labels: Map<string, LabelGroup & { values: LabelValues }>;
      totalPcs: number;
      totalBerat: number;
    }
  >();

  for (const row of rows) {
    const category = toText(row.Ket) || "LAINNYA";
    const noLabel = toText(row.NoLabel);
    // Rows without a label are kept apart by a synthetic key, like the legacy md5 fallback.
    const labelKey =
      noLabel !== "" ? noLabel : `__EMPTY__:${JSON.stringify(row)}`;

    let bucket = grouped.get(category);
    if (!bucket) {
      bucket = { labels: new Map(), totalPcs: 0, totalBerat: 0 };
      grouped.set(category, bucket);
    }

    const pcs = nullableFloat(row.JmlhBatang) ?? 0;
    const berat = nullableFloat(row.Berat) ?? 0;

    let group = bucket.labels.get(labelKey);
    if (!group) {
      group = {
        noLabel,
        noUrut: "",
        noSpk: "",
        noSpkAsal: "",
        mesin: "",
        jenis: "",
        tebal: "",
        lebar: "",
        panjang: "",
        pcs: 0,
        berat: 0,
        values: {
          noUrut: [],
          mesin: [],
          jenis: [],
          tebal: [],
          lebar: [],
          panjang: [],
        },
      };
      bucket.labels.set(labelKey, group);
    }

    if (group.noSpk === "") group.noSpk = toText(row.NoSPK);
    if (group.noSpkAsal === "") group.noSpkAsal = toText(row.NoSPKAsal);
    pushUniqueFormatted(group.values.noUrut, nullableFloat(row.NoUrut), 0);
    pushUniqueString(group.values.mesin, toText(row.Mesin));
    pushUniqueString(group.values.jenis, toText(row.Jenis));
    pushUniqueFormatted(group.values.tebal, nullableFloat(row.Tebal), 0);
    pushUniqueFormatted(group.values.lebar, nullableFloat(row.Lebar), 0);
    pushUniqueFormatted(group.values.panjang, nullableFloat(row.Panjang), 1);
    group.pcs += pcs;
    group.berat += berat;

    bucket.totalPcs += pcs;
    bucket.totalBerat += berat;
  }

  const orderedKeys = [
    ...CATEGORY_ORDER.filter((key) => grouped.has(key)),
    ...[...grouped.keys()].filter(
      (key) => !(CATEGORY_ORDER as readonly string[]).includes(key),
    ),
  ];

  const categories: LabelCategory[] = orderedKeys.map((name, index) => {
    const bucket = grouped.get(name)!;
    const rowsOut: LabelGroup[] = [...bucket.labels.values()]
      .map((group) => ({
        noLabel: group.noLabel,
        noUrut: implodeValues(group.values.noUrut),
        noSpk: group.noSpk,
        noSpkAsal: group.noSpkAsal,
        mesin: implodeValues(group.values.mesin),
        jenis: implodeValues(group.values.jenis),
        tebal: implodeValues(group.values.tebal),
        lebar: implodeValues(group.values.lebar),
        panjang: implodeValues(group.values.panjang),
        pcs: group.pcs,
        berat: group.berat,
      }))
      .sort((left, right) => {
        const byLabel = compareText(left.noLabel, right.noLabel);
        return byLabel !== 0 ? byLabel : compareText(left.noUrut, right.noUrut);
      });

    return {
      no: index + 1,
      name,
      rows: rowsOut,
      totalPcs: bucket.totalPcs,
      totalBerat: bucket.totalBerat,
    };
  });

  return {
    categories,
    labelCount: categories.reduce((sum, c) => sum + c.rows.length, 0),
    totalPcs: categories.reduce((sum, c) => sum + c.totalPcs, 0),
    totalBerat: categories.reduce((sum, c) => sum + c.totalBerat, 0),
  };
}

interface LabelValues {
  noUrut: string[];
  mesin: string[];
  jenis: string[];
  tebal: string[];
  lebar: string[];
  panjang: string[];
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Column widths as percentages of the table, not pixels.
 *
 * The legacy blade used fixed pixel widths totalling 748px, which is wider than
 * A4 portrait's content box. Under a fixed table layout the only auto-sized
 * column (Jenis) then collapsed to zero width and wrapped one character per
 * line, turning 4k rows into 528 pages. Percentages always add up to the page
 * width, so no column can collapse: the values below keep the legacy
 * proportions but leave Jenis enough room for the longest wood name.
 */
const DETAIL_COLUMN_WIDTHS = [
  "4%", // No
  "11%", // No Label
  "7%", // Urut
  "9%", // No SPK
  "9%", // SPK Asal
  "12%", // Mesin
  "13%", // Jenis
  "6%", // Tebal
  "6%", // Lebar
  "6%", // Panjang
  "6%", // Pcs
  "11%", // Berat - carries a value plus a unit, e.g. "0.4443 Ton"
];

const DETAIL_LABELS = [
  "No",
  "No Label",
  "Urut",
  "No SPK",
  "SPK Asal",
  "Mesin",
  "Jenis",
  "Tebal",
  "Lebar",
  "Panjang",
  "Pcs",
  "Berat",
];

const DETAIL_COLGROUP = `<colgroup>
      ${DETAIL_COLUMN_WIDTHS.map((width) => `<col style="width: ${width};">`).join("\n      ")}
    </colgroup>`;

const DETAIL_HEADERS = DETAIL_LABELS.map(
  (label) =>
    `<th style="width: ${DETAIL_COLUMN_WIDTHS[DETAIL_LABELS.indexOf(label)]};">${escapeHtml(label)}</th>`,
).join("");

const buildCategoryChunk = (
  category: LabelCategory,
  rows: LabelGroup[],
  startIndex: number,
): string => {
  const bodyRows = rows
    .map(
      (
        row,
        index,
      ) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${startIndex + index + 1}</td>
      <td class="center">${escapeHtml(row.noLabel)}</td>
      <td class="center">${escapeHtml(row.noUrut)}</td>
      <td class="center">${escapeHtml(row.noSpk)}</td>
      <td class="center">${escapeHtml(row.noSpkAsal)}</td>
      <td class="center">${escapeHtml(row.mesin)}</td>
      <td class="label">${escapeHtml(row.jenis)}</td>
      <td class="center">${escapeHtml(row.tebal)}</td>
      <td class="center">${escapeHtml(row.lebar)}</td>
      <td class="center">${escapeHtml(row.panjang)}</td>
      <td class="number">${escapeHtml(fmtInt(row.pcs))}</td>
      <td class="number">${escapeHtml(fmtWeightWithUnit(row.berat, category.name))}</td>
    </tr>`,
    )
    .join("\n      ");

  return `<table class="report-table label-perhari-detail">
    ${DETAIL_COLGROUP}
    <thead>
      <tr class="headers-row">${DETAIL_HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(12)}
      <tr class="totals-row">
        <td colspan="10" class="center">Total ${escapeHtml(category.name)}</td>
        <td class="number">${escapeHtml(fmtInt(category.totalPcs))}</td>
        <td class="number">${escapeHtml(fmtWeightWithUnit(category.totalBerat, category.name))}</td>
      </tr>
    </tbody>
  </table>`;
};

export const labelPerhariReport: ReportDefinition<PeriodParams, LabelData> = {
  type: "label-perhari",
  title: "Laporan Label Perhari",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapLabelPerhari");
    return buildLabelCategories((result.recordset ?? []) as LabelRow[]);
  },

  render(data, meta) {
    const sections = data.categories.map((category) => {
      const chunks: string[] = [];
      for (let i = 0; i < Math.max(1, category.rows.length); i += CHUNK_SIZE) {
        chunks.push(
          buildCategoryChunk(
            category,
            category.rows.slice(i, i + CHUNK_SIZE),
            i,
          ),
        );
      }
      const title = `<div class="section-title">${category.no}. ${escapeHtml(category.name)}</div>`;
      return `${title}\n${chunks.join('\n<div class="chunk-page-break"></div>\n')}`;
    });

    // Four columns, matching the legacy summary. The category number moves into
    // the Kategori cell so it still lines up with the section titles above:
    // 1. ST, 2. S4S, and so on.
    const summaryRows = data.categories
      .map(
        (category) => `<tr class="data-row">
      <td class="label">${category.no}. ${escapeHtml(category.name)}</td>
      <td class="number">${escapeHtml(fmtInt(category.rows.length))}</td>
      <td class="number">${escapeHtml(fmtInt(category.totalPcs))}</td>
      <td class="number">${escapeHtml(fmtWeightWithUnit(category.totalBerat, category.name))}</td>
    </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `${sections.join("\n  ")}
  <div class="section-title">Rangkuman</div>
  <table class="report-table label-perhari-summary">
    <thead>
      <tr class="headers-row">
        <th style="width: 80px;">Kategori</th>
        <th style="width: 84px;">Jumlah</th>
        <th style="width: 90px;">Total Pcs</th>
        <th style="width: 90px;">Total Berat</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRows || buildEmptyTableRow(4)}
      <tr class="totals-row">
        <td class="center">Grand Total</td>
        <td class="number">${escapeHtml(fmtInt(data.labelCount))}</td>
        <td class="number">${escapeHtml(fmtInt(data.totalPcs))}</td>
        <td class="number">${escapeHtml(formatNumber(data.totalBerat, 2, { blankWhenZero: true }))}</td>
      </tr>
    </tbody>
  </table>`;

    return renderWpsReportPage({
      title: "Laporan Label Perhari",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "label_perhari",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
