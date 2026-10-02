import sql from "mssql";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SPWps_LapSTSawmillPerHariPerTebalPerLebar — "Laporan ST Sawmill Per-Hari,
 * Per-Tebal, Per-Lebar". Ported from open-api-report's
 * StSawmillHariTebalLebarReportService +
 * st-sawmill-hari-tebal-lebar-pdf.blade.php.
 *
 * A cross-tab per IsGroup-block of sawmill date x (Group/Tebal/Lebar). Each
 * is_group block opens with `Group : N` and one table; Group and Tebal are
 * rowspanned across their lebar rows, subtotals per tebal ("Sub total") and
 * per group ("Total"), then a grand-total row. A separate Rangkuman table
 * follows: per (Jenis Kayu, Tebal) with Tottal and Persen of the jenis.
 */

const toFloat = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const fmtDim = (v: number): string => Number.isFinite(v) ? String(Math.round(v)) : "";
const fmtTon = (v: number): string => (Number.isFinite(v) && Math.abs(v) >= 0.0000001) ? v.toFixed(4) : "";
const fmtPct = (v: number): string | number => {
  if (!Number.isFinite(v) || Math.abs(v) < 0.0000001) return "";
  return `${Math.round(v)}%`;
};

const dateKeyOf = (raw: unknown): string => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
};

type Nested = Map<number, Map<string, Map<number, Map<number, Map<string, number>>>>>;

function buildByIsGroup(rows: Array<Record<string, unknown>>, dateKeys: string[]): Nested {
  const byIsGroup: Nested = new Map();
  for (const r of rows) {
    const isGroup = Math.trunc(toFloat(r.IsGroup));
    const group = String(r.Group ?? "").trim();
    const tebal = toFloat(r.Tebal);
    const lebar = toFloat(r.Lebar);
    const ton = toFloat(r.STton);
    const dk = dateKeyOf(r.TglSawmill);
    if (!dk || !dateKeys.includes(dk)) continue;
    let g1 = byIsGroup.get(isGroup);
    if (!g1) { g1 = new Map(); byIsGroup.set(isGroup, g1); }
    let g2 = g1.get(group);
    if (!g2) { g2 = new Map(); g1.set(group, g2); }
    let g3 = g2.get(tebal);
    if (!g3) { g3 = new Map(); g2.set(tebal, g3); }
    let g4 = g3.get(lebar);
    if (!g4) { g4 = new Map(); g3.set(lebar, g4); }
    g4.set(dk, (g4.get(dk) ?? 0) + ton);
  }
  return byIsGroup;
}

function sumToDates(byDate: Map<string, number>, dateKeys: string[]): { byDate: Map<string, number>; total: number } {
  const out = new Map<string, number>();
  let total = 0;
  for (const dk of dateKeys) {
    const v = byDate.get(dk) ?? 0;
    out.set(dk, v);
    total += v;
  }
  return { byDate: out, total };
}

export const stSawmillHariTebalLebarReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "st-sawmill-hari-tebal-lebar",
  title: "Laporan ST Sawmill Per-Hari, Per-Tebal, Per-Lebar",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SPWps_LapSTSawmillPerHariPerTebalPerLebar");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const dateKeys = [...new Set(rows.map((r) => dateKeyOf(r.TglSawmill)).filter(Boolean))].sort();
    const byIsGroup = buildByIsGroup(rows, dateKeys);

    // Rangkuman: per (Group, Tebal) Tottal & Persen of that Group.
    const rangkByGroup = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const g = String(r.Group ?? "").trim();
      if (!g) continue;
      const tebal = toFloat(r.Tebal);
      const ton = toFloat(r.STton);
      let t = rangkByGroup.get(g);
      if (!t) { t = new Map(); rangkByGroup.set(g, t); }
      t.set(tebal, (t.get(tebal) ?? 0) + ton);
    }
    const groupKeys = [...rangkByGroup.keys()].sort((a, b) => a.localeCompare(b));
    const grandRangk = groupKeys.reduce((s, g) => {
      const m = rangkByGroup.get(g)!;
      return s + [...m.values()].reduce((x, y) => x + y, 0);
    }, 0);

    const dateLabel = (dk: string): string => formatTanggalId(dk);
    const blocks: string[] = [];
    const isGroupKeys = [...byIsGroup.keys()].sort((a, b) => a - b);

    for (const isGroup of isGroupKeys) {
      const g1 = byIsGroup.get(isGroup)!;
      const groupNames = [...g1.keys()].sort((a, b) => a.localeCompare(b));
      // outer rowspan: sum over groups of (group total row + sum over tebal (lebarRows + 1 tebalSubtotal) )
      let blockRowspan = 0;
      const groupData: Array<{
        name: string;
        tebalBlocks: Array<{ tebal: number; lebarRows: Array<{ lebar: number; byDate: Map<string, number> }>; byDate: Map<string, number> }>;
        byDate: Map<string, number>;
      }> = [];
      for (const gname of groupNames) {
        const g2 = g1.get(gname)!;
        const tebalKeys = [...g2.keys()].sort((a, b) => a - b);
        const tebalBlocks: Array<{ tebal: number; lebarRows: Array<{ lebar: number; byDate: Map<string, number> }>; byDate: Map<string, number> }> = [];
        const groupByDate = new Map<string, number>();
        for (const tebal of tebalKeys) {
          const g3 = g2.get(tebal)!;
          const lebarKeys = [...g3.keys()].sort((a, b) => a - b);
          const lebarRows: Array<{ lebar: number; byDate: Map<string, number> }> = [];
          const tebalByDate = new Map<string, number>();
          for (const lebar of lebarKeys) {
            const g4 = g3.get(lebar)!;
            const vmap = new Map<string, number>();
            for (const dk of dateKeys) vmap.set(dk, g4.get(dk) ?? 0);
            lebarRows.push({ lebar, byDate: vmap });
            for (const dk of dateKeys) tebalByDate.set(dk, (tebalByDate.get(dk) ?? 0) + (g4.get(dk) ?? 0));
          }
          for (const dk of dateKeys) groupByDate.set(dk, (groupByDate.get(dk) ?? 0) + (tebalByDate.get(dk) ?? 0));
          tebalBlocks.push({ tebal, lebarRows, byDate: tebalByDate });
        }
        groupData.push({ name: gname, tebalBlocks, byDate: groupByDate });
        // rows: for each tebalBlock: (lebarRows.length) data rows + 1 tebal-subtotal row; + 1 group total row
        for (const tb of tebalBlocks) blockRowspan += tb.lebarRows.length + 1;
        blockRowspan += 1; // group total
      }
      blockRowspan += 1; // grand total

      let rowIndex = 0;
      const bodyRows: string[] = [];
      let firstGroupCell = false;
      const groupCells: string[] = [];
      for (const g of groupData) {
        // group name rowspan over this group's rows + totals
        let groupRowspan = 1; // group total row
        for (const tb of g.tebalBlocks) groupRowspan += tb.lebarRows.length + 1;
        let firstOfGroup = true;
        const groupNameCell = `<td class="center" rowspan="${groupRowspan}">${escapeHtml(g.name)}</td>`;
        for (const tb of g.tebalBlocks) {
          let tebalRowspan = tb.lebarRows.length + 1; // data rows + subtotal
          let firstOfTebal = true;
          const tebalCell = `<td class="center" rowspan="${tebalRowspan}">${fmtDim(tb.tebal)}</td>`;
          for (const lr of tb.lebarRows) {
            rowIndex++;
            const cells = dateKeys.map((dk) => `<td class="number">${fmtTon(lr.byDate.get(dk) ?? 0)}</td>`).join("");
            const rt = sumToDates(lr.byDate, dateKeys).total;
            bodyRows.push(`<tr class="${rowIndex % 2 === 1 ? "row-odd" : "row-even"}">${firstOfGroup ? groupNameCell : ""}${firstOfTebal ? tebalCell : ""}<td class="center">${fmtDim(lr.lebar)}</td>${cells}<td class="number">${fmtTon(rt)}</td></tr>`);
            firstOfGroup = false; firstOfTebal = false;
          }
          // tebal subtotal row
          rowIndex++;
          const tCells = dateKeys.map((dk) => `<td class="number">${fmtTon(tb.byDate.get(dk) ?? 0)}</td>`).join("");
          const tTotal = sumToDates(tb.byDate, dateKeys).total;
          bodyRows.push(`<tr class="totals-row ${rowIndex % 2 === 1 ? "row-odd" : "row-even"}"><td class="center">Sub total</td>${dateKeys.length > 0 ? "" : ""}${tCells}<td class="number">${fmtTon(tTotal)}</td></tr>`);
        }
        // group total row
        rowIndex++;
        const gCells = dateKeys.map((dk) => `<td class="number">${fmtTon(g.byDate.get(dk) ?? 0)}</td>`).join("");
        const gTotal = sumToDates(g.byDate, dateKeys).total;
        bodyRows.push(`<tr class="totals-row ${rowIndex % 2 === 1 ? "row-odd" : "row-even"}"><td class="center" colspan="2">Total</td>${gCells}<td class="number">${fmtTon(gTotal)}</td></tr>`);
      }
      // grand total for this isGroup block
      rowIndex++;
      const blockByDate = new Map<string, number>();
      for (const g of groupData) for (const dk of dateKeys) blockByDate.set(dk, (blockByDate.get(dk) ?? 0) + (g.byDate.get(dk) ?? 0));
      const blockCells = dateKeys.map((dk) => `<td class="number">${fmtTon(blockByDate.get(dk) ?? 0)}</td>`).join("");
      const blockTotal = sumToDates(blockByDate, dateKeys).total;
      bodyRows.push(`<tr class="totals-row"><td class="center" colspan="3">Grand Total</td>${blockCells}<td class="number">${fmtTon(blockTotal)}</td></tr>`);

      const headerCells = dateKeys.map((dk) => `<th style="width:48px;">${escapeHtml(dateLabel(dk))}</th>`).join("");
      const tableRowStr = bodyRows.map((r) => r.replace(/class="(totals-row)[^"]*"/, 'class="totals-row"'));
      blocks.push(`<div class="group-title">Group : ${isGroup}</div>
<table style="margin-bottom:12px;">
  <thead>
    <tr><th rowspan="2" style="width:15%;">Group</th><th rowspan="2" style="width:40px;">Tebal</th><th rowspan="2" style="width:40px;">Lebar</th><th colspan="${dateKeys.length + 1}">Tanggal</th></tr>
    <tr>${headerCells}<th style="width:56px;">Total</th></tr>
  </thead>
  <tbody>
${tableRowStr.join("\n")}
  </tbody>
</table>`);
    }

    // Grand total across all dates & groups for the isGroupBlocks (computed again from rows):
    // Stitch groupData grandTotal is per isGroup; we also include an all-encompassing "Rangkuman Grand Total".
    const allByDate = new Map<string, number>();
    for (const r of rows) {
      const dk = dateKeyOf(r.TglSawmill);
      if (!dk) continue;
      allByDate.set(dk, (allByDate.get(dk) ?? 0) + toFloat(r.STton));
    }
    const allTotal = [...allByDate.values()].reduce((a, b) => a + b, 0);

    // Produce the second "Rangkuman Grand Total" table.
    const rangRows: string[] = [];
    for (const g of groupKeys) {
      const m = rangkByGroup.get(g)!;
      const jenTotal = [...m.values()].reduce((a, b) => a + b, 0);
      const tebalKeys = [...m.keys()].sort((a, b) => a - b);
      tebalKeys.forEach((tebal, idx) => {
        const total = m.get(tebal) ?? 0;
        const percent = jenTotal > 0.0000001 ? (total / jenTotal) * 100 : 0;
        const jenisCell = idx === 0 ? `<td rowspan="${tebalKeys.length + 1}" class="jenis-cell">${escapeHtml(g)}</td>` : "";
        rangRows.push(`<tr class="${idx === 0 ? "rangkuman-group-start" : ""}">${jenisCell}<td class="center">${fmtDim(tebal)}</td><td class="number">${fmtTon(total)}</td><td class="center">${fmtPct(percent)}</td></tr>`);
      });
      rangRows.push(`<tr class="totals-row"><td class="center">Total</td><td class="number">${fmtTon(jenTotal)}</td><td class="center">100%</td></tr>`);
    }

    const rangkBody = `<div class="section-title">Rangkuman Grand Total</div>
<table class="report-table">
  <thead><tr><th style="width:160px;">Jenis Kayu</th><th style="width:50px;">Tebal</th><th style="width:80px;">Total</th><th style="width:60px;">Persen</th></tr></thead>
  <tbody>
${rangRows.join("\n")}
    <tr class="totals-row"><td colspan="2" class="center">Grand Total</td><td class="number">${fmtTon(grandRangk)}</td><td class="center">100%</td></tr>
  </tbody>
</table>`;

    const bodyHtml = blocks.length
      ? blocks.join("\n") + `<div class="page-break"></div>` + rangkBody
      : `<div class="center">Tidak ada data</div>`;

    return renderWpsReportPage({
      title: "Laporan ST Sawmill Per-Hari, Per-Tebal, Per-Lebar",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
