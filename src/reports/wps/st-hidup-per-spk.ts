import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SPWps_LapSTHidupPerProdukV2 — "Laporan ST Hidup Per SPK, Per Jenis, Per
 * Tebal, Per Group Jenis Kayu". Ported from open-api-report's
 * StHidupPerSpkReportService + st-hidup-per-spk-pdf.blade.php.
 *
 * Live snapshot (no parameters). Rows are grouped per Group (jenis kayu), then
 * per Produk, then per NoSPK. Each Jenis block opens with a per-Produk summary
 * (Basah / KD / Kering / Total) and follows with the row detail, which lists
 * Tebal / Lebar / UOM and the four tonnages.
 */

interface ProdukRow extends Record<string, unknown> {
  Group: string | null;
  Produk: string | null;
  NoSPK: string | null;
  Tebal: number | null;
  Lebar: number | null;
  UOM: string | null;
  BasahTon: number | null;
  KDTon: number | null;
  KeringTon: number | null;
  TotalTon: number | null;
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

interface ProdukGroup {
  name: string;
  spkTokens: Map<string, ProdukRow[]>;
  basah: number;
  kd: number;
  kering: number;
  total: number;
}

interface GroupBlock {
  name: string;
  produks: ProdukGroup[];
  basah: number;
  kd: number;
  kering: number;
  total: number;
}

function groupRows(rows: ProdukRow[]): GroupBlock[] {
  const byGroup = new Map<string, Map<string, Map<string, ProdukRow[]>>>();
  for (const row of rows) {
    const group = String(row.Group ?? "").trim() || "Tanpa Jenis";
    const produk = String(row.Produk ?? "").trim() || "Tanpa Produk";
    const spk = String(row.NoSPK ?? "").trim() || "-";
    let prodMap = byGroup.get(group);
    if (!prodMap) {
      prodMap = new Map();
      byGroup.set(group, prodMap);
    }
    let spkMap = prodMap.get(produk);
    if (!spkMap) {
      spkMap = new Map();
      prodMap.set(produk, spkMap);
    }
    const list = spkMap.get(spk) ?? [];
    list.push(row);
    spkMap.set(spk, list);
  }

  return [...byGroup.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([group, prodMap]) => {
      const produks = [...prodMap.entries()]
        .sort(([a], [b]) => natural(a, b))
        .map(([name, spkMap]) => {
          const spkTokens = new Map<string, ProdukRow[]>();
          let basah = 0,
            kd = 0,
            kering = 0,
            total = 0;
          for (const [spk, rows] of [...spkMap.entries()].sort(([a], [b]) => natural(a, b))) {
            const sorted = [...rows].sort(
              (a, b) => toFloat(a.Tebal) - toFloat(b.Tebal) || toFloat(a.Lebar) - toFloat(b.Lebar),
            );
            spkTokens.set(spk, sorted);
            basah += sorted.reduce((s, r) => s + toFloat(r.BasahTon), 0);
            kd += sorted.reduce((s, r) => s + toFloat(r.KDTon), 0);
            kering += sorted.reduce((s, r) => s + toFloat(r.KeringTon), 0);
            total += sorted.reduce((s, r) => s + toFloat(r.TotalTon), 0);
          }
          return { name, spkTokens, basah, kd, kering, total };
        });
      return {
        name: group,
        produks,
        basah: produks.reduce((s, p) => s + p.basah, 0),
        kd: produks.reduce((s, p) => s + p.kd, 0),
        kering: produks.reduce((s, p) => s + p.kering, 0),
        total: produks.reduce((s, p) => s + p.total, 0),
      };
    });
}

const fmtTon = (value: unknown): string =>
  formatNumber(toFloat(value), 4, { blankWhenZero: true });

const detailTable = (rows: ProdukRow[], spk: string, lastInProduct: boolean, productName: string, psum: { basah: number; kd: number; kering: number; total: number }): string => {
  const sumB = rows.reduce((a, r) => a + toFloat(r.BasahTon), 0);
  const sumK = rows.reduce((a, r) => a + toFloat(r.KDTon), 0);
  const sumKr = rows.reduce((a, r) => a + toFloat(r.KeringTon), 0);
  const sumT = rows.reduce((a, r) => a + toFloat(r.TotalTon), 0);
  // The blade writes width:100% together with margin:0 20px. Chromium resolves
  // the two independently, so the table would hang 20px past the right margin
  // and clip the Total column; the -40px keeps the blade's 20px indent without
  // losing any digits.
  return `<div style="margin: 0 0 4px 20px; font-weight: bold;">NoSPK : ${escapeHtml(spk)}</div>
<table class="report-table" style="width: calc(100% - 40px); margin: 0 20px 4px 20px;">
  <thead>
    <tr class="headers-row">
      <th style="width:26px;">No</th>
      <th style="width:14.28%;">Tebal</th>
      <th style="width:14.28%;">Lebar</th>
      <th style="width:14.28%;">UOM</th>
      <th style="width:14.28%;">Basah (Ton)</th>
      <th style="width:14.28%;">KD (Ton)</th>
      <th style="width:14.28%;">Kering (Ton)</th>
      <th style="width:14.28%;">Total (Ton)</th>
    </tr>
  </thead>
  <tbody>
${rows
  .map(
    (r, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td class="number">${formatNumber(toFloat(r.Tebal), 0)}</td>
      <td class="number">${formatNumber(toFloat(r.Lebar), 0)}</td>
      <td class="center">${escapeHtml(String(r.UOM ?? ""))}</td>
      <td class="number">${fmtTon(r.BasahTon)}</td>
      <td class="number">${fmtTon(r.KDTon)}</td>
      <td class="number">${fmtTon(r.KeringTon)}</td>
      <td class="number">${fmtTon(r.TotalTon)}</td>
    </tr>`,
  )
  .join("")}
    <tr class="totals-row">
      <td class="center" colspan="4">Sub Total ${escapeHtml(spk)}</td>
      <td class="number">${fmtTon(sumB)}</td>
      <td class="number">${fmtTon(sumK)}</td>
      <td class="number">${fmtTon(sumKr)}</td>
      <td class="number">${fmtTon(sumT)}</td>
    </tr>
${
  lastInProduct
    ? `    <tr class="totals-row">
      <td class="center" colspan="4">Total Grade ${escapeHtml(productName)}</td>
      <td class="number">${fmtTon(psum.basah)}</td>
      <td class="number">${fmtTon(psum.kd)}</td>
      <td class="number">${fmtTon(psum.kering)}</td>
      <td class="number">${fmtTon(psum.total)}</td>
    </tr>`
    : ""
}
  </tbody>
</table>`;
};

const buildGroupTables = (group: GroupBlock): string => {
  const parts: string[] = [];
  parts.push(`<div class="section-title">${escapeHtml(group.name)}</div>`);
  group.produks.forEach((produk) => {
    parts.push(`<div style="margin: 4px 0 2px 12px; font-weight: bold;">Grade : ${escapeHtml(produk.name)}</div>`);
    const spkList = [...produk.spkTokens.entries()];
    spkList.forEach(([spk, rows], idx) => {
      parts.push(detailTable(rows, spk, idx === spkList.length - 1, produk.name, produk));
    });
  });
  return parts.join("");
};

const buildRangkuman = (blocks: GroupBlock[]): string => {
  if (blocks.length === 0) return "";
  const parts: string[] = [];
  parts.push(`<div class="page-break"></div>
  <div class="section-rangkuman-title" style="text-align: center; margin: 20px 0 0 0;">Rangkuman Grand Total</div>`);
  blocks.forEach((group) => {
    parts.push(`<div class="section-title" style="margin-top: 10px;">${escapeHtml(group.name)}</div>`);
    parts.push(`<table class="report-table" style="width: 100%;">
  <thead>
    <tr class="headers-row">
      <th style="width:20%;">Grade</th>
      <th style="width:20%;">Basah (Ton)</th>
      <th style="width:20%;">KD (Ton)</th>
      <th style="width:20%;">Kering (Ton)</th>
      <th style="width:20%;">Total (Ton)</th>
    </tr>
  </thead>
  <tbody>
${group.produks
  .map(
    (p, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}${i === group.produks.length - 1 ? " row-last" : ""}">
      <td class="data-cell">${escapeHtml(p.name)}</td>
      <td class="number data-cell">${fmtTon(p.basah)}</td>
      <td class="number data-cell">${fmtTon(p.kd)}</td>
      <td class="number data-cell">${fmtTon(p.kering)}</td>
      <td class="number data-cell">${fmtTon(p.total)}</td>
    </tr>`,
  )
  .join("")}
    <tr class="totals-row">
      <td class="center">Grand Total</td>
      <td class="number">${fmtTon(group.basah)}</td>
      <td class="number">${fmtTon(group.kd)}</td>
      <td class="number">${fmtTon(group.kering)}</td>
      <td class="number">${fmtTon(group.total)}</td>
    </tr>
  </tbody>
</table>`);
  });
  return parts.join("");
};

export const stHidupPerSpkReport: ReportDefinition<
  Record<never, never>,
  ProdukRow[]
> = {
  type: "st-hidup-per-spk",
  title: "Laporan ST Hidup Per SPK, Per Jenis, Per Tebal, Per Group Jenis Kayu",
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .execute("SPWps_LapSTHidupPerProdukV2");
    return (result.recordset ?? []) as ProdukRow[];
  },

  render(rows, meta) {
    const blocks = groupRows(rows);
    const bodyHtml = blocks.length
      ? blocks.map(buildGroupTables).join("") + buildRangkuman(blocks)
      : `<div class="center">${EMPTY_DATA_MESSAGE}</div>`;
    return renderWpsReportPage({
      title: "Laporan ST Hidup Per SPK, Per Jenis, Per Tebal, Per Group Jenis Kayu",
      // The blade keeps an (empty) subtitle line under the title.
      subtitle: "\u00A0",
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["st-hidup-per-spk"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
