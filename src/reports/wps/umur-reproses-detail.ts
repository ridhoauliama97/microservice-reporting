import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
} from "../../templates/html";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapUmurReproses — "Laporan Umur Reproses Detail". Rows are grouped by
 * displayed product + dimensions, zero-total rows are removed, and the four
 * cut-offs are validated in non-decreasing order like the legacy request.
 */

interface UmurReprosesRow extends Record<string, unknown> {
  Jenis: string | null;
  NamaGrade: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Panjang: number | string | null;
  Period1: number | string | null;
  Period2: number | string | null;
  Period3: number | string | null;
  Period4: number | string | null;
  Period5: number | string | null;
}

const paramsSchema = z
  .object({
    umur1: z.coerce.number().int().min(0).default(15),
    umur2: z.coerce.number().int().min(0).default(30),
    umur3: z.coerce.number().int().min(0).default(60),
    umur4: z.coerce.number().int().min(0).default(90),
  })
  .superRefine((values, ctx) => {
    if (values.umur2 < values.umur1) {
      ctx.addIssue({ code: "custom", path: ["umur2"], message: "Umur2 harus lebih besar atau sama dengan umur1." });
    }
    if (values.umur3 < values.umur2) {
      ctx.addIssue({ code: "custom", path: ["umur3"], message: "Umur3 harus lebih besar atau sama dengan umur2." });
    }
    if (values.umur4 < values.umur3) {
      ctx.addIssue({ code: "custom", path: ["umur4"], message: "Umur4 harus lebih besar atau sama dengan umur3." });
    }
  });
type UmurReprosesParams = z.infer<typeof paramsSchema>;

const AGE_KEYS = ["Period1", "Period2", "Period3", "Period4", "Period5"] as const;
type AgeKey = (typeof AGE_KEYS)[number];

interface UmurReprosesNormalized {
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
  keep: boolean;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableFloat = (value: unknown): number | null =>
  value === null || value === undefined ? null : toFloat(value);

const dimensionKey = (value: number | null): string =>
  value === null ? "null" : value.toFixed(8);

const fmtDimension = (value: number | null): string =>
  value === null || Math.abs(value) < 0.0000001
    ? ""
    : formatNumber(value, 0, { blankWhenZero: true });

const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const compareDimension = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
};

const normalizeRows = (rows: UmurReprosesRow[]): UmurReprosesNormalized[] => {
  const prepared = rows.map((row) => {
    const jenis = String(row.Jenis ?? "").trim();
    const grade = String(row.NamaGrade ?? "").trim();
    const display = jenis !== "" ? `${jenis}${grade !== "" ? ` - ${grade}` : ""}` : grade;
    const periods = AGE_KEYS.map((key) => toFloat(row[key]));
    return {
      Jenis: display,
      keep: jenis !== "",
      Tebal: nullableFloat(row.Tebal),
      Lebar: nullableFloat(row.Lebar),
      Panjang: nullableFloat(row.Panjang),
      Period1: periods[0],
      Period2: periods[1],
      Period3: periods[2],
      Period4: periods[3],
      Period5: periods[4],
      Total: periods.reduce((sum, value) => sum + value, 0),
    };
  });

  const grouped = new Map<string, UmurReprosesNormalized>();
  for (const row of prepared) {
    const key = [
      row.Jenis.toUpperCase(),
      dimensionKey(row.Tebal),
      dimensionKey(row.Lebar),
      dimensionKey(row.Panjang),
    ].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, row);
      continue;
    }
    for (const ageKey of AGE_KEYS) existing[ageKey] += row[ageKey];
    existing.Total = AGE_KEYS.reduce((sum, key2) => sum + existing[key2], 0);
  }

  const filtered = [...grouped.values()].filter(
    (row) => row.keep && row.Jenis !== "" && Math.abs(row.Total) > 0.0000001,
  );
  filtered.sort((left, right) => {
    const jenis = left.Jenis.toUpperCase().localeCompare(right.Jenis.toUpperCase());
    if (jenis !== 0) return jenis;
    return compareDimension(left.Tebal, right.Tebal) ||
      compareDimension(left.Lebar, right.Lebar) ||
      compareDimension(left.Panjang, right.Panjang);
  });
  return filtered;
};

export const umurReprosesDetailReport: ReportDefinition<
  UmurReprosesParams,
  UmurReprosesNormalized[]
> = {
  type: "umur-reproses-detail",
  title: "Laporan Umur Reproses Detail",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn.request()
      .input("Umur1", sql.Int, params.umur1)
      .input("Umur2", sql.Int, params.umur2)
      .input("Umur3", sql.Int, params.umur3)
      .input("Umur4", sql.Int, params.umur4)
      .execute("SP_LapUmurReproses");
    return normalizeRows((result.recordset ?? []) as UmurReprosesRow[]);
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
    const grand: Record<AgeKey | "Total", number> = {
      Period1: 0,
      Period2: 0,
      Period3: 0,
      Period4: 0,
      Period5: 0,
      Total: 0,
    };
    for (const row of rows) {
      for (const key of AGE_KEYS) grand[key] += row[key];
      grand.Total += row.Total;
    }

    const bodyRows = rows.map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(row.Jenis)}</td>
        <td class="center">${escapeHtml(fmtDimension(row.Tebal))}</td>
        <td class="center">${escapeHtml(fmtDimension(row.Lebar))}</td>
        <td class="center">${escapeHtml(fmtDimension(row.Panjang))}</td>
        ${AGE_KEYS.map((key) => `<td class="number">${escapeHtml(fmt(row[key]))}</td>`).join("\n        ")}
        <td class="number total-cell">${escapeHtml(fmt(row.Total))}</td>
      </tr>`).join("\n      ");

    const bodyHtml = `<table class="report-table">
    <thead>
      <tr class="headers-row">
        <th>No</th>
        <th>Jenis</th>
        <th>Tebal</th>
        <th>Lebar</th>
        <th>Panjang</th>
        ${ageLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("\n        ")}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(11)}
      ${rows.length > 0 ? `<tr class="totals-row">
        <td colspan="5" class="center">Total</td>
        ${AGE_KEYS.map((key) => `<td class="number">${escapeHtml(fmt(grand[key]))}</td>`).join("\n        ")}
        <td class="number">${escapeHtml(fmt(grand.Total))}</td>
      </tr>` : ""}
    </tbody>
  </table>`;

    return renderWpsReportPage({
      title: "Laporan Umur Reproses Detail",
      subtitle: "",
      bodyHtml,
      style: "umur_reproses_detail",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
