import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * SP_LapSaldoHidupKayuBulatKG + ...KGSub — "Laporan Saldo Hidup Kayu Bulat -
 * Timbang KG". Ported from open-api-report's
 * SaldoHidupKayuBulatKgReportService + saldo-hidup-kg-pdf.blade.php.
 *
 * Live snapshot (both SPs take no parameters). Detail rows are sorted by
 * truck number (numeric-aware) and grouped per NoKayuBulat; each group prints a
 * meta block (No.KB / No.Truk / Tanggal / No.Suket / Jenis Kayu) plus a table
 * whose Supplier cell spans consecutive same-supplier rows, closed by a Total
 * row. The SUB SP drives the trailing "Ringkasan Grade" table, where each
 * grade's Rasio is its share of the total detail Berat.
 */

interface SaldoRow extends Record<string, unknown> {
  NoKayuBulat: string | null;
  DateCreate: Date | string | null;
  JenisKayu: string | null;
  NoTruk: number | null;
  Suket: string | null;
  NmSupplier: string | null;
  Bruto: number | null;
  Tara: number | null;
  NamaGrade: string | null;
  Berat: number | null;
}

interface GradeSummaryRow extends Record<string, unknown> {
  NamaGrade: string | null;
  Berat: number | null;
}

interface SaldoData {
  rows: SaldoRow[];
  subRows: GradeSummaryRow[];
  totalBerat: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

const formatDateCell = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatTanggalId(raw.slice(0, 10)) : raw;
};

/** Legacy $fmt: whole number with separators (Bruto / Tara). */
const fmtWhole = (value: number): string => formatNumber(value, 0);
/** Legacy $fmtTon: 4 decimals (Berat). */
const fmtTon = (value: number): string => formatNumber(value, 4);
/** Legacy $fmtRatio: 2 decimals + "%". */
const fmtRatio = (value: number): string => `${formatNumber(value, 2)}%`;

/**
 * Legacy $sortTruckValue: numeric truck numbers first (ascending), anything
 * non-numeric after them, ties broken by the raw value.
 */
const truckSortKey = (truck: unknown): [number, number, string] => {
  const raw = toText(truck);
  const normalized = raw.replace(/[^0-9]/g, "");
  if (normalized !== "" && Number.isFinite(Number(normalized))) {
    return [0, Number(normalized), raw];
  }
  return [1, Number.MAX_SAFE_INTEGER, raw];
};


/** Consecutive same-supplier runs get a rowspan on the Supplier cell. */
function supplierRowspans(rows: SaldoRow[]): number[] {
  const spans = new Array<number>(rows.length).fill(0);
  for (let index = 0; index < rows.length; index++) {
    if (index > 0 && toText(rows[index].NmSupplier) === toText(rows[index - 1].NmSupplier)) {
      continue;
    }
    let span = 1;
    for (let next = index + 1; next < rows.length; next++) {
      if (toText(rows[next].NmSupplier) !== toText(rows[index].NmSupplier)) break;
      span += 1;
    }
    spans[index] = span;
  }
  return spans;
}

const buildKbBlock = (kb: string, rows: SaldoRow[]): string => {
  const first = rows[0];
  const spans = supplierRowspans(rows);
  const totalBerat = rows.reduce((sum, row) => sum + toFloat(row.Berat), 0);

  const metaHtml = `<table class="kb-meta">
      <tr>
        <td class="meta-label">No.Kayu Bulat</td><td class="meta-sep">:</td><td>${escapeHtml(toText(first.NoKayuBulat) || kb)}</td>
        <td class="meta-label">No.Truk</td><td class="meta-sep">:</td><td>${escapeHtml(toText(first.NoTruk))}</td>
      </tr>
      <tr>
        <td class="meta-label">Tanggal</td><td class="meta-sep">:</td><td>${escapeHtml(formatDateCell(first.DateCreate))}</td>
        <td class="meta-label">No.Suket</td><td class="meta-sep">:</td><td>${escapeHtml(toText(first.Suket))}</td>
      </tr>
      <tr>
        <td class="meta-label">Jenis Kayu</td><td class="meta-sep">:</td><td>${escapeHtml(toText(first.JenisKayu))}</td>
        <td></td><td></td><td></td>
      </tr>
    </table>`;

  const bodyRows = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        ${
          spans[index] > 0
            ? `<td class="center" rowspan="${spans[index]}" style="vertical-align: middle;">${escapeHtml(toText(row.NmSupplier))}</td>`
            : ""
        }
        <td class="number">${fmtWhole(toFloat(row.Bruto))}</td>
        <td class="number">${fmtWhole(toFloat(row.Tara))}</td>
        <td class="label">${escapeHtml(toText(row.NamaGrade))}</td>
        <td class="number" style="font-weight: bold;">${fmtTon(toFloat(row.Berat))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="kb-block">
    ${metaHtml}
    <table class="report-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 29%;">Supplier</th>
          <th style="width: 13%;">Bruto</th>
          <th style="width: 13%;">Tara</th>
          <th style="width: 29%;">Grade</th>
          <th style="width: 16%;">Berat (Ton)</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="totals-row">
          <td colspan="4" class="center">Total</td>
          <td class="number">${fmtTon(totalBerat)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
};

const buildSummaryHtml = (data: SaldoData): string => {
  const bodyRows = data.subRows
    .map((row, index) => {
      const berat = toFloat(row.Berat);
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(toText(row.NamaGrade))}</td>
        <td class="number">${fmtTon(berat)}</td>
        <td class="number">${fmtRatio(data.totalBerat > 0 ? (berat / data.totalBerat) * 100 : 0)}</td>
      </tr>`;
    })
    .join("\n      ");

  return `<section class="summary-page">
  <div class="section-title">Ringkasan Grade</div>
  <div class="summary-wrap">
    <table class="report-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 34px;">No</th>
          <th>Nama Grade</th>
          <th style="width: 90px;">Berat</th>
          <th style="width: 70px;">Rasio</th>
        </tr>
      </thead>
      <tbody>
        ${
          bodyRows ||
          buildEmptyTableRow(4)
        }
        ${
          data.subRows.length > 0
            ? `<tr class="totals-row">
          <td colspan="2" class="center">Grand Total</td>
          <td class="number">${fmtTon(data.totalBerat)}</td>
          <td class="number">100.00%</td>
        </tr>`
            : ""
        }
      </tbody>
    </table>
  </div>
</section>`;
};

const buildEmptyKbTable = (): string => `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>Supplier</th>
      <th>Bruto</th>
      <th>Tara</th>
      <th>Grade</th>
      <th>Berat (Ton)</th>
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(5)}</tbody>
</table>`;

const buildBodyHtml = (data: SaldoData): string => {
  if (data.rows.length === 0) {
    return `${buildEmptyKbTable()}
${buildSummaryHtml(data)}`;
  }

  const sorted = [...data.rows].sort((left, right) => {
    const a = truckSortKey(left.NoTruk);
    const b = truckSortKey(right.NoTruk);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2].localeCompare(b[2], undefined, { sensitivity: "base" });
  });

  const groups = new Map<string, SaldoRow[]>();
  for (const row of sorted) {
    const kb = toText(row.NoKayuBulat);
    const key = kb !== "" ? kb : "Tanpa No KB";
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const blocks = [...groups.entries()]
    .map(([kb, rows]) => buildKbBlock(kb, rows))
    .join("\n  ");

  return `${blocks}
  ${buildSummaryHtml(data)}`;
};

export const saldoHidupKayuBulatKgReport: ReportDefinition<
  Record<never, never>,
  SaldoData
> = {
  type: "saldo-hidup-kayu-bulat-kg",
  title: "Laporan Saldo Hidup Kayu Bulat - Timbang KG",
  // Both SPs take no parameters — reject any params loudly.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn.request().execute("SP_LapSaldoHidupKayuBulatKG"),
      conn.request().execute("SP_LapSaldoHidupKayuBulatKGSub"),
    ]);

    const rows = (mainResult.recordset ?? []) as SaldoRow[];
    return {
      rows,
      subRows: (subResult.recordset ?? []) as GradeSummaryRow[],
      // Denominator of the grade ratios = total of the DETAIL Berat.
      totalBerat: rows.reduce((sum, row) => sum + toFloat(row.Berat), 0),
    };
  },

  render(data, meta): RenderResult {
    return renderWpsReportPage({
      title: "Laporan Saldo Hidup Kayu Bulat - Timbang KG",
      subtitle: "",
      bodyHtml: buildBodyHtml(data),
      style: "saldo_hidup_kayu_bulat_kg",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
