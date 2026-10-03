import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapSTRambungMC1danMC2Detail — "Laporan ST Hidup Rambung MC1 dan MC2
 * (Detail)". Ported from open-api-report's StRambungMc1Mc2DetailReportService
 * + st-rambung-mc1-mc2-detail-pdf.blade.php.
 *
 * Live snapshot (no parameters). Rows are grouped per JenisKayu, then per
 * IsKering label, each subgroup closed by its own pcs / ton / kubik subtotal,
 * and the report ends with two summary tables: one by Jenis / Tabel and one
 * "Group Stock" roll-up.
 */

interface DetailRow extends Record<string, unknown> {
  JenisKayu: string | null;
  IsKering: string | null;
  NoST: string;
  Tebal: number;
  Lebar: number;
  Panjang: number;
  JmlhBatang: number;
  Ton: number;
  Kubik: number;
}

interface SubGroup {
  label: string;
  rows: DetailRow[];
  pcs: number;
  ton: number;
  kubik: number;
}

interface JenisGroup {
  jenis: string;
  subgroups: SubGroup[];
  pcs: number;
  ton: number;
  kubik: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const natural = (left: string, right: string): number =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

function mapRow(row: Record<string, unknown>): DetailRow {
  return {
    JenisKayu: (row.JenisKayu as string) ?? null,
    IsKering: (row.IsKering as string) ?? null,
    NoST: String(row.NoST ?? ""),
    Tebal: toFloat(row.Tebal),
    Lebar: toFloat(row.Lebar),
    Panjang: toFloat(row.Panjang),
    JmlhBatang: Math.round(toFloat(row.Pcs ?? row.JmlhBatang)),
    Ton: toFloat(row.Ton),
    Kubik: toFloat(row.Kubik),
  };
}

function groupRows(rows: DetailRow[]): JenisGroup[] {
  const byJenis = new Map<string, Map<string, DetailRow[]>>();
  for (const row of rows) {
    const jenis = String(row.JenisKayu ?? "").trim() || "-";
    const label = String(row.IsKering ?? "").trim() || jenis;
    let subs = byJenis.get(jenis);
    if (!subs) {
      subs = new Map();
      byJenis.set(jenis, subs);
    }
    const list = subs.get(label) ?? [];
    list.push(row);
    subs.set(label, list);
  }
  return [...byJenis.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([jenis, subs]) => {
      const subgroups = [...subs.entries()]
        .sort(([a], [b]) => natural(a, b))
        .map(([label, rows]) => {
          const sorted = [...rows].sort(
            (a, b) =>
              a.NoST.localeCompare(b.NoST) ||
              a.Tebal - b.Tebal ||
              a.Lebar - b.Lebar,
          );
          return {
            label,
            rows: sorted,
            pcs: sorted.reduce((s, r) => s + r.JmlhBatang, 0),
            ton: sorted.reduce((s, r) => s + r.Ton, 0),
            kubik: sorted.reduce((s, r) => s + r.Kubik, 0),
          };
        });
      return {
        jenis,
        subgroups,
        pcs: subgroups.reduce((s, g) => s + g.pcs, 0),
        ton: subgroups.reduce((s, g) => s + g.ton, 0),
        kubik: subgroups.reduce((s, g) => s + g.kubik, 0),
      };
    });
}

/**
 * Column geometry for the per-subgroup tables.
 *
 * The blade pairs `table-layout: fixed` with `white-space: nowrap` on the
 * headers and declares no widths at all, so every column lands on an equal
 * 12.5% and "Jumlah Batang (pcs)" - too wide to wrap - runs straight over the
 * next column's rule. Pinning the columns keeps the blade's 10px / nowrap look
 * while giving the long header room and the row number just enough.
 */
const DETAIL_COLGROUP = `<colgroup>
    <col style="width:4%"><col style="width:14%"><col style="width:9%"><col style="width:9%">
    <col style="width:9%"><col style="width:24%"><col style="width:15.5%"><col style="width:15.5%">
  </colgroup>`;

const buildDetailTable = (sub: SubGroup): string => `<div class="sub-title">${escapeHtml(sub.label)}</div>
<div class="sheet-indent" style="padding: 0 8px;">
<table class="data-table" style="width: 100%; margin-left: 0;">
    ${DETAIL_COLGROUP}
  <thead>
    <tr class="headers-row">
      <th>No</th>
      <th>No ST</th>
      <th>Tebal (mm)</th>
      <th>Lebar (mm)</th>
      <th>Panjang (ft)</th>
      <th>Jumlah Batang (pcs)</th>
      <th>Ton</th>
      <th>Kubik</th>
    </tr>
  </thead>
  <tbody>
${sub.rows
  .map(
    (r, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td class="center">${escapeHtml(r.NoST)}</td>
      <td class="center">${formatNumber(r.Tebal, 0)}</td>
      <td class="center">${formatNumber(r.Lebar, 0)}</td>
      <td class="center">${formatNumber(r.Panjang, 0)}</td>
      <td class="number">${formatNumber(r.JmlhBatang, 0)}</td>
      <td class="number">${formatNumber(r.Ton, 4)}</td>
      <td class="number">${formatNumber(r.Kubik, 4)}</td>
    </tr>`,
  )
  .join("\n")}
    <tr class="totals-row">
      <td colspan="5">Total ${escapeHtml(sub.label)}</td>
      <td class="number">${formatNumber(sub.pcs, 0)}</td>
      <td class="number">${formatNumber(sub.ton, 4)}</td>
      <td class="number">${formatNumber(sub.kubik, 4)}</td>
    </tr>
  </tbody>
</table>
</div>`;

const buildRangkuman = (groups: JenisGroup[]): string => {
  if (groups.length === 0) return "";
  const tables: Array<{ label: string; pcs: number; ton: number; kubik: number }> = [];
  const groupRows: Array<{ jenis: string; pcs: number; ton: number; kubik: number }> = [];
  let grandPcs = 0,
    grandTon = 0,
    grandKubik = 0;
  for (const g of groups) {
    for (const sg of g.subgroups) tables.push({ label: sg.label, pcs: sg.pcs, ton: sg.ton, kubik: sg.kubik });
    groupRows.push({ jenis: g.jenis, pcs: g.pcs, ton: g.ton, kubik: g.kubik });
    grandPcs += g.pcs;
    grandTon += g.ton;
    grandKubik += g.kubik;
  }
  if (tables.length === 0 && groupRows.length === 0) return "";
  const parts: string[] = [];
  parts.push(`<div class="section-title">Rangkuman</div>`);
  if (tables.length > 0) {
    parts.push(`<div class="sub-title">Total Masing-masing Jenis Stock</div>
<div class="sheet-indent" style="padding: 0 8px;">
<table class="data-table" style="width: 100%; margin-left: 0;">
  <thead>
    <tr>
      <th style="width:4%;">No</th>
      <th>Jenis Stock</th>
      <th>Jumlah Batang (Pcs)</th>
      <th>Ton</th>
      <th>Kubik</th>
    </tr>
  </thead>
  <tbody>
${tables
  .map(
    (r, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(r.label)}</td>
      <td class="number">${formatNumber(r.pcs, 0)}</td>
      <td class="number">${formatNumber(r.ton, 4)}</td>
      <td class="number">${formatNumber(r.kubik, 4)}</td>
    </tr>`,
  )
  .join("")}
  </tbody>
</table>
</div>`);
  }
  if (groupRows.length > 0) {
    parts.push(`<div class="sub-title">Grand Total Seluruh Group Stock</div>
<div class="sheet-indent" style="padding: 0 8px;">
<table class="data-table" style="width: 100%; margin-left: 0;">
  <thead>
    <tr>
      <th style="width:4%;">No</th>
      <th>Group Stock</th>
      <th>Jumlah Batang (Pcs)</th>
      <th>Ton</th>
      <th>Kubik</th>
    </tr>
  </thead>
  <tbody>
${groupRows
  .map(
    (r, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(r.jenis)}</td>
      <td class="number">${formatNumber(r.pcs, 0)}</td>
      <td class="number">${formatNumber(r.ton, 4)}</td>
      <td class="number">${formatNumber(r.kubik, 4)}</td>
    </tr>`,
  )
  .join("")}
    <tr class="totals-row">
      <td colspan="2" class="center">Grand Total</td>
      <td class="number">${formatNumber(grandPcs, 0)}</td>
      <td class="number">${formatNumber(grandTon, 4)}</td>
      <td class="number">${formatNumber(grandKubik, 4)}</td>
    </tr>
  </tbody>
</table>
</div>`);
  }
  return parts.join("");
};

export const stRambungMc1Mc2DetailReport: ReportDefinition<
  Record<never, never>,
  DetailRow[]
> = {
  type: "st-rambung-mc1-mc2-detail",
  title: "Laporan ST Hidup Rambung MC1 dan MC2 (Detail)",
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .execute("SP_LapSTRambungMC1danMC2Detail");
    return ((result.recordset ?? []) as Array<Record<string, unknown>>).map(
      mapRow,
    );
  },


  render(rows, meta) {
    const groups = groupRows(rows);
    const generated = formatTanggalId(
      meta.generatedAt.toISOString().slice(0, 10),
    ).replace(/\d{4}$/, (year) => year.slice(-2));

    const bodyHtml = groups.length
      ? groups
          .map(
            (g) => `<div class="group-title">${escapeHtml(g.jenis)}</div>
${g.subgroups.map(buildDetailTable).join("")}`,
          )
          .join("") + buildRangkuman(groups)
      : `<table class="data-table"><tbody>${buildEmptyTableRow(8)}</tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan ST Hidup Rambung MC1 dan MC2 (Detail)",
      subtitle: `Per ${generated}`,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["st-rambung-mc1-mc2-detail"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
