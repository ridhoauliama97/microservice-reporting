import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapUmurBarangJadi — "Laporan Umur Barang Jadi Detail". Ported from
 * open-api-report's UmurBarangJadiDetailReportService +
 * umur-barang-jadi-detail-pdf.blade.php.
 *
 * The SP buckets the stock by age using FOUR day cut-offs (legacy defaults
 * 15 / 30 / 60 / 90) and returns five period columns (Period1..Period5). Body
 * params: `{ umur1, umur2, umur3, umur4 }` in days, all optional (defaults as
 * above). The age column labels are derived from those cut-offs, so changing
 * them changes the header.
 */

interface UmurBjRow extends Record<string, unknown> {
  NoBJ: string | null;
  Jenis: string | null;
  NamaBarangJadi: string | null;
  Panjang: number | null;
  Tebal: number | null;
  Lebar: number | null;
  Period1: number | null;
  Period2: number | null;
  Period3: number | null;
  Period4: number | null;
  Period5: number | null;
}

const AGE_KEYS = ["Period1", "Period2", "Period3", "Period4", "Period5"] as const;
type AgeKey = (typeof AGE_KEYS)[number];

const paramsSchema = z.object({
  umur1: z.coerce.number().int().min(0).default(15),
  umur2: z.coerce.number().int().min(0).default(30),
  umur3: z.coerce.number().int().min(0).default(60),
  umur4: z.coerce.number().int().min(0).default(90),
});

type UmurBjParams = z.infer<typeof paramsSchema>;

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtDim: whole numbers, blank when ~0. */
const fmtDim = (value: unknown): string =>
  formatNumber(toFloat(value), 0, { blankWhenZero: true });

/** Legacy $fmt: 4 decimals, blank when ~0. */
const fmt = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

/** Legacy $fmtTotalZeroBlank: same as $fmt but used on the totals row. */
const fmtTotalZeroBlank = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

interface UmurBjNormalized extends Record<string, unknown> {
  Jenis: string;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  Period1: number;
  Period2: number;
  Period3: number;
  Period4: number;
  Period5: number;
  Total: number;
}

/** Legacy $dimensionKey: 8-decimal fixed key, or "null" for missing values. */
const dimensionKey = (value: unknown): string =>
  value === null || value === undefined ? "null" : toFloat(value).toFixed(8);

/**
 * Legacy data prep (UmurBarangJadiDetailReportService):
 *  1. "Jenis" column becomes "Jenis - NamaBarangJadi" ($jenisDisplay).
 *  2. Rows sharing (Jenis, Tebal, Lebar, Panjang) are merged, summing the five
 *     period columns.
 *  3. Rows without a Jenis display or with a ~zero total are dropped.
 *  4. Sort by Jenis (uppercased, case-insensitive) then Tebal/Lebar/Panjang
 *     ascending, missing dimensions last.
 */
function normalizeRows(rows: UmurBjRow[]): UmurBjNormalized[] {
  const prepared = rows.map((row) => {
    const jenis = String(row.Jenis ?? "").trim();
    const barangJadi = String(row.NamaBarangJadi ?? "").trim();
    const jenisDisplay =
      jenis !== "" ? `${jenis}${barangJadi !== "" ? ` - ${barangJadi}` : ""}` : barangJadi;
    const periods = AGE_KEYS.map((key) => toFloat(row[key]));
    return {
      Jenis: jenisDisplay,
      keep: jenisDisplay !== "",
      Tebal: row.Tebal === null || row.Tebal === undefined ? null : toFloat(row.Tebal),
      Lebar: row.Lebar === null || row.Lebar === undefined ? null : toFloat(row.Lebar),
      Panjang:
        row.Panjang === null || row.Panjang === undefined ? null : toFloat(row.Panjang),
      Period1: periods[0],
      Period2: periods[1],
      Period3: periods[2],
      Period4: periods[3],
      Period5: periods[4],
      Total: periods.reduce((sum, value) => sum + value, 0),
    };
  });

  // Group by displayed product + dimensions, summing the period columns.
  const grouped = new Map<string, (typeof prepared)[number]>();
  for (const row of prepared) {
    const key = [
      row.Jenis.trim().toUpperCase(),
      dimensionKey(row.Tebal),
      dimensionKey(row.Lebar),
      dimensionKey(row.Panjang),
    ].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row });
      continue;
    }
    for (const periodKey of AGE_KEYS) {
      existing[periodKey] += row[periodKey];
    }
    existing.Total = AGE_KEYS.reduce((sum, key2) => sum + existing[key2], 0);
  }

  const filtered = [...grouped.values()].filter(
    (row) => row.keep && row.Jenis.trim() !== "" && Math.abs(row.Total) > 0.0000001,
  );

  const compareDimension = (
    left: number | null,
    right: number | null,
  ): number => {
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  };

  filtered.sort((left, right) => {
    const byJenis = left.Jenis.trim().toUpperCase().localeCompare(
      right.Jenis.trim().toUpperCase(),
    );
    if (byJenis !== 0) return byJenis;
    return (
      compareDimension(left.Tebal, right.Tebal) ||
      compareDimension(left.Lebar, right.Lebar) ||
      compareDimension(left.Panjang, right.Panjang)
    );
  });

  return filtered;
}

export const umurBarangJadiDetailReport: ReportDefinition<
  UmurBjParams,
  UmurBjNormalized[]
> = {
  type: "umur-barang-jadi-detail",
  title: "Laporan Umur Barang Jadi Detail",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("Umur1", sql.Int, params.umur1)
      .input("Umur2", sql.Int, params.umur2)
      .input("Umur3", sql.Int, params.umur3)
      .input("Umur4", sql.Int, params.umur4)
      .execute("SP_LapUmurBarangJadi");
    return normalizeRows((result.recordset ?? []) as UmurBjRow[]);
  },

  render(rows, meta) {
    const { umur1, umur2, umur3, umur4 } = meta.params;
    const ageLabels = [
      `0 - ${umur1}`,
      `${umur1 + 1} - ${umur2}`,
      `${umur2 + 1} - ${umur3}`,
      `${umur3 + 1} - ${umur4}`,
      `> ${umur4}`,
    ];

    // Per-row Total = sum of the five age buckets (legacy $fmt on $row['Total']).
    const rowTotals = rows.map((row) =>
      AGE_KEYS.reduce((sum, key) => sum + toFloat(row[key]), 0),
    );
    const grand: Record<AgeKey | "Total", number> = rows.reduce(
      (acc, row, index) => {
        for (const key of AGE_KEYS) acc[key] += toFloat(row[key]);
        acc.Total += rowTotals[index];
        return acc;
      },
      { Period1: 0, Period2: 0, Period3: 0, Period4: 0, Period5: 0, Total: 0 },
    );

    const bodyRows = rows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(String(row.Jenis ?? ""))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtDim(row.Panjang))}</td>
        ${AGE_KEYS.map((key) => `<td class="number">${fmt(row[key])}</td>`).join("\n        ")}
        <td class="number" style="font-weight: bold;">${fmt(rowTotals[index])}</td>
      </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 34px;">No</th>
      <th style="width: 180px;">Jenis</th>
      <th style="width: 44px;">Tebal</th>
      <th style="width: 44px;">Lebar</th>
      <th style="width: 56px;">Panjang</th>
      ${ageLabels.map((label) => `<th style="width: 10%;">${escapeHtml(label)}</th>`).join("\n      ")}
      <th style="width: 72px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(11)}
    ${
      rows.length > 0
        ? `<tr class="totals-row">
      <td colspan="5" class="center">Total</td>
      ${AGE_KEYS.map((key) => `<td class="number">${fmtTotalZeroBlank(grand[key])}</td>`).join("\n      ")}
      <td class="number">${fmtTotalZeroBlank(grand.Total)}</td>
    </tr>`
        : ""
    }
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Umur Barang Jadi Detail",
      subtitle: "",
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
