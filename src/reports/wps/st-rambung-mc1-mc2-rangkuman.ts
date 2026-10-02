import { z } from "zod";
import { escapeHtml, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { EMPTY_DATA_MESSAGE, renderWpsReportPage, buildEmptyTableRow } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SP_LapSTRambungMC1danMC2Rangkuman — "Laporan ST Rambung MC1 dan MC2
 * (Rangkuman)". Ported from open-api-report's StRambungMc1Mc2RangkumanReportService +
 * st-rambung-mc1-mc2-rangkuman-pdf.blade.php.
 *
 * Live snapshot. Rows are folded per Jenis (JenisKayu) and per Tabel (IsKering),
 * summed for pcs/ton/kubik. Two tables: one per (jenis, tabel) and one per
 * group, closing with a Grand Total.
 */

interface RRow extends Record<string, unknown> {
  JenisKayu: string | null;
  IsKering: string | null;
  Tebal: number | null;
  Lebar: number | null;
  Panjang: number | null;
  Pcs: number | null;
  Ton: number | null;
  Kubik: number | null;
}

const toNum = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v :
  typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(",", ""))) ? Number(v.replace(",", "")) : 0;

const fmtInt = (v: unknown): string => {
  const n = Math.round(toNum(v));
  return n === 0 ? "" : n.toLocaleString("de-DE");
};
const fmt4 = (v: unknown): string => {
  const n = toNum(v);
  if (Math.abs(n) < 0.0000001) return "";
  return n.toFixed(4);
};

export const stRambungMc1Mc2RangkumanReport: ReportDefinition<
  Record<never, never>,
  RRow[]
> = {
  type: "st-rambung-mc1-mc2-rangkuman",
  title: "Laporan ST Rambung MC1 dan MC2 (Rangkuman)",
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SP_LapSTRambungMC1danMC2Rangkuman");
    return (result.recordset ?? []) as RRow[];
  },

  render(rows, meta) {
    const byJenisTable = new Map<string, Map<string, { pcs: number; ton: number; kubik: number }>>();
    for (const r of rows) {
      const jenis = String(r.JenisKayu ?? "").trim() || "-";
      const label = String(r.IsKering ?? "").trim() || jenis;
      let t = byJenisTable.get(jenis);
      if (!t) { t = new Map(); byJenisTable.set(jenis, t); }
      let acc = t.get(label);
      if (!acc) { acc = { pcs: 0, ton: 0, kubik: 0 }; t.set(label, acc); }
      acc.pcs += Math.round(toNum(r.Pcs));
      acc.ton += toNum(r.Ton);
      acc.kubik += toNum(r.Kubik);
    }

    const keys = [...byJenisTable.keys()].sort((a, b) => a.localeCompare(b));
    const tableRows: string[] = [];
    const groupRows: string[] = [];
    let grandPcs = 0, grandTon = 0, grandKubik = 0;

    for (const jenis of keys) {
      const tables = byJenisTable.get(jenis)!;
      const labels = [...tables.keys()].sort((a, b) => a.localeCompare(b));
      let jp = 0, jt = 0, jk = 0;
      for (const label of labels) {
        const acc = tables.get(label)!;
        tableRows.push(`    <tr class="data-row"><td class="center">${tableRows.length + 1}</td><td>${escapeHtml(label)}</td><td class="number" style="font-weight:bold;">${fmtInt(acc.pcs)}</td><td class="number" style="font-weight:bold;">${fmt4(acc.ton)}</td><td class="number" style="font-weight:bold;">${fmt4(acc.kubik)}</td></tr>`);
        jp += acc.pcs; jt += acc.ton; jk += acc.kubik;
      }
      groupRows.push(`    <tr class="data-row"><td class="center">${groupRows.length + 1}</td><td>${escapeHtml(jenis)}</td><td class="number" style="font-weight:bold;">${fmtInt(jp)}</td><td class="number" style="font-weight:bold;">${fmt4(jt)}</td><td class="number" style="font-weight:bold;">${fmt4(jk)}</td></tr>`);
      grandPcs += jp; grandTon += jt; grandKubik += jk;
    }

    const generated = formatTanggalId(meta.generatedAt.toISOString().slice(0, 10)).replace(/\d{4}$/, (y) => y.slice(-2));
    const bodyHtml = `<div class="sub-title">Total Masing-masing Jenis Stock</div>
<table class="report-table">
  <thead><tr><th style="width:4%;">No</th><th style="width:55%;">Jenis Stock</th><th style="width:17%;">Jumlah Batang (Pcs)</th><th style="width:12%;">Ton</th><th style="width:12%;">Kubik (m3)</th></tr></thead>
  <tbody>
${tableRows.join("\n") || `    <tr><td colspan="5" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
  </tbody>
</table>
<div class="sub-title">Grand Total Seluruh Group Stock</div>
<table class="report-table">
  <thead><tr><th style="width:4%;">No</th><th style="width:55%;">Group Stock</th><th style="width:17%;">Jumlah Batang (Pcs)</th><th style="width:12%;">Ton</th><th style="width:12%;">Kubik (m3)</th></tr></thead>
  <tbody>
${groupRows.join("\n") || `    <tr><td colspan="5" class="center">${EMPTY_DATA_MESSAGE}</td></tr>`}
    <tr class="totals-row"><td colspan="2" class="center">Grand Total</td><td class="number">${fmtInt(grandPcs)}</td><td class="number">${fmt4(grandTon)}</td><td class="number">${fmt4(grandKubik)}</td></tr>
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan ST Rambung MC1 dan MC2 (Rangkuman)",
      subtitle: `Per ${generated}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
