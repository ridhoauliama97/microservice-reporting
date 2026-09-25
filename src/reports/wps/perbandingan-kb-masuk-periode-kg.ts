import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import {
  dualPeriodParamsSchema,
  type DualPeriodParams,
} from "./perbandingan-kb-masuk-periode";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * sp_LapPerbandinganKBMasukPeriode1dan2KG — "Laporan Perbanding KB Masuk
 * Periode 1 dan 2 - Timbang KG". Ported from
 * open-api-report's PerbandinganKbMasukPeriode1Dan2KgReportService +
 * perbandingan-kb-masuk-periode-1-dan-2-kg-pdf.blade.php.
 *
 * The SP takes 4 dates and returns one row per (supplier, grade) with the two
 * period tonnages (BeratTon1 / BeratTon2). Rows are grouped per supplier +
 * phone; the supplier / phone / No cells use rowspan across the supplier's
 * grade rows, and the trend column shows (Ton2 - Ton1) / Ton1 * 100 with an
 * up/down/flat arrow and matching colour.
 */

interface KgComparisonRow extends Record<string, unknown> {
  NmSupplier: string | null;
  NoTlp: string | null;
  NamaGrade: string | null;
  BeratTon1: number | null;
  BeratTon2: number | null;
}

interface GradeLine {
  grade: string;
  ton1: number;
  ton2: number;
  percent: number;
}

interface SupplierGroup {
  supplier: string;
  phone: string;
  rows: GradeLine[];
  totals: { ton1: number; ton2: number; percent: number };
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy rule: ratio = (ton2 - ton1) / ton1 * 100; 999% when the base is 0. */
const calculatePercent = (ton1: number, ton2: number): number => {
  if (ton1 === 0 && ton2 === 0) return 0;
  if (ton1 === 0) return 999;
  return ((ton2 - ton1) / ton1) * 100;
};

/** 4 decimals, blank when ~zero (legacy $formatNumber). */
const fmtNumber = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });
/** Whole percent, blank when ~zero (legacy $formatPercent). */
const fmtPercent = (value: number): string =>
  formatNumber(value, 0, { blankWhenZero: true });

const trendClass = (percent: number): string =>
  percent > 0 ? "trend-up" : percent < 0 ? "trend-down" : "trend-flat";
const trendArrow = (percent: number): string =>
  percent > 0 ? "↑" : percent < 0 ? "↓" : "=";


function buildGroups(rows: KgComparisonRow[]): {
  groups: SupplierGroup[];
  grandTon1: number;
  grandTon2: number;
} {
  const groups = new Map<string, SupplierGroup>();
  let grandTon1 = 0;
  let grandTon2 = 0;

  for (const row of rows) {
    const supplier = String(row.NmSupplier ?? "").trim();
    const phone = String(row.NoTlp ?? "").trim();
    const grade = String(row.NamaGrade ?? "").trim();
    const ton1 = toFloat(row.BeratTon1);
    const ton2 = toFloat(row.BeratTon2);

    const key = `${supplier.toLowerCase()}||${phone !== "" ? phone : "-"}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        supplier,
        phone,
        rows: [],
        totals: { ton1: 0, ton2: 0, percent: 0 },
      };
      groups.set(key, group);
    }

    const existing = group.rows.find((line) => line.grade === grade);
    if (existing) {
      existing.ton1 += ton1;
      existing.ton2 += ton2;
    } else {
      group.rows.push({ grade, ton1, ton2, percent: 0 });
    }
    group.totals.ton1 += ton1;
    group.totals.ton2 += ton2;
    grandTon1 += ton1;
    grandTon2 += ton2;
  }

  const list = [...groups.values()];
  for (const group of list) {
    // Legacy: ksort($rowsByGrade, SORT_NATURAL | SORT_FLAG_CASE).
    group.rows.sort((left, right) =>
      left.grade.localeCompare(right.grade, undefined, { sensitivity: "base" }),
    );
    for (const line of group.rows) {
      line.percent = calculatePercent(line.ton1, line.ton2);
    }
    group.totals.percent = calculatePercent(group.totals.ton1, group.totals.ton2);
  }

  // Legacy: usort by supplier name, case-insensitive.
  list.sort((left, right) =>
    left.supplier.localeCompare(right.supplier, undefined, { sensitivity: "base" }),
  );

  return { groups: list, grandTon1, grandTon2 };
}

const buildBodyHtml = (
  groups: SupplierGroup[],
  grandTon1: number,
  grandTon2: number,
): string => {
  const grandPercent = calculatePercent(grandTon1, grandTon2);

  const bodyRows = groups
    .map((group, groupIndex) => {
      const lines =
        group.rows.length > 0
          ? group.rows
          : [{ grade: "", ton1: 0, ton2: 0, percent: 0 }];
      const rowspan = Math.max(1, lines.length);
      const rowClass = groupIndex % 2 === 0 ? "row-odd" : "row-even";
      const supplierNo = groupIndex + 1;

      return lines
        .map((line, lineIndex) => {
          const prefix =
            lineIndex === 0
              ? `<td class="center" rowspan="${rowspan}">${supplierNo}</td>
            <td class="label" rowspan="${rowspan}">${escapeHtml(group.supplier)}</td>
            <td class="center" rowspan="${rowspan}">${escapeHtml(group.phone)}</td>`
              : "";
          const percentText = fmtPercent(line.percent);
          const percentCell =
            percentText !== ""
              ? `<td class="number ${trendClass(line.percent)}"><span class="trend-arrow">${trendArrow(line.percent)}</span> ${escapeHtml(percentText)}%</td>`
              : `<td class="number ${trendClass(line.percent)}"></td>`;

          return `<tr class="data-row ${rowClass}">
            ${prefix}
            <td class="label">${escapeHtml(line.grade)}</td>
            <td class="number">${fmtNumber(line.ton1)}</td>
            <td class="number">${fmtNumber(line.ton2)}</td>
            ${percentCell}
          </tr>`;
        })
        .join("\n    ");
    })
    .join("\n    ");

  const grandPercentText = fmtPercent(grandPercent);
  const grandPercentCell =
    grandPercentText !== ""
      ? `<td class="number ${trendClass(grandPercent)}"><span class="trend-arrow">${trendArrow(grandPercent)}</span> ${escapeHtml(grandPercentText)}%</td>`
      : `<td class="number ${trendClass(grandPercent)}"></td>`;

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 30px;">No</th>
      <th style="width: 22%;">Nama Supplier</th>
      <th style="width: 110px;">No.Tlp/HP</th>
      <th style="width: 20%;">Nama Grade</th>
      <th style="width: 80px;">Ton1</th>
      <th style="width: 80px;">Ton2</th>
      <th style="width: 110px;">Persen (%)</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(7)}
    ${groups.length > 0
      ? `<tr class="totals-row">
      <td colspan="4" class="center">Total</td>
      <td class="number">${fmtNumber(grandTon1)}</td>
      <td class="number">${fmtNumber(grandTon2)}</td>
      ${grandPercentCell}
    </tr>`
      : ""}
  </tbody>
</table>`;
};

export const perbandinganKbMasukKgReport: ReportDefinition<
  DualPeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "perbandingan-kb-masuk-periode-1-dan-2-kg",
  title: "Laporan Perbanding KB Masuk Periode 1 dan 2 - Timbang KG",
  paramsSchema: dualPeriodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate1", sql.Date, params.periode1Awal)
      .input("EndDate1", sql.Date, params.periode1Akhir)
      .input("StartDate2", sql.Date, params.periode2Awal)
      .input("EndDate2", sql.Date, params.periode2Akhir)
      .execute("sp_LapPerbandinganKBMasukPeriode1dan2KG");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta): RenderResult {
    const { periode1Awal, periode1Akhir, periode2Awal, periode2Akhir } = meta.params;
    const { groups, grandTon1, grandTon2 } = buildGroups(
      rows as KgComparisonRow[],
    );

    const subtitleHtml = `<p class="report-subtitle" style="margin: 0 0 2px 0;">Periode 1: ${escapeHtml(formatTanggalId(periode1Awal))} s/d ${escapeHtml(formatTanggalId(periode1Akhir))}</p>
<p class="report-subtitle" style="margin: 0 0 20px 0;">Periode 2: ${escapeHtml(formatTanggalId(periode2Awal))} s/d ${escapeHtml(formatTanggalId(periode2Akhir))}</p>`;

    return renderWpsReportPage({
      title: "Laporan Perbanding KB Masuk Periode 1 dan 2 - Timbang KG",
      subtitle: "",
      bodyHtml: `${subtitleHtml}
${buildBodyHtml(groups, grandTon1, grandTon2)}`,
      style: "perbandingan_kb_masuk_periode_kg",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
