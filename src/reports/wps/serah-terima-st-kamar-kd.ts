import { z } from "zod";
import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapSerahTerimaSTKDKeluar — "Laporan Serah Terima ST (Kamar KD)". Ported
 * from open-api-report's SerahTerimaStKamarKdReportService +
 * serah-terima-st-kamar-kd-pdf.blade.php.
 *
 * Parameter @NoProcKD. The result-set exposes the kamar-KD header (NoProcKD,
 * NoRuangKD, TglMasuk, TglKeluar) on every row; we surface it once as a meta
 * table, then one data table that groups the lines per No ST (Cek + No ST
 * span their group) and closes with the "Total Dari Ruang KD {ruang}" footer,
 * and finally the signature block.
 *
 * Note: the handover-summary table of the blade (Jmlh Label Dari No.KD / Jmlh
 * Dari Proses KD) is commented out there, so it is not rendered here either.
 */

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const paramsSchema = z.object({ noProcKd: z.string().trim().min(1) });

interface SerahRow extends Record<string, unknown> {
  NoProcKD: string;
  NoRuangKD: number;
  TglMasuk: string;
  TglKeluar: string;
  NoST: string;
  Tebal: number;
  Lebar: number;
  Panjang: number;
  JmlhBatang: number;
  Ton: number;
  Kubik: number;
}

interface NoStGroup {
  noSt: string;
  rows: SerahRow[];
  pcs: number;
  ton: number;
  kubik: number;
}

const fmtDate = (value: unknown): string => {
  if (value instanceof Date) return formatTanggalId(value.toISOString().slice(0, 10));
  if (!value) return "";
  const s = String(value);
  // Try to format as date; fall back to raw.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatTanggalId(d.toISOString().slice(0, 10));
};

function groupByNoSt(rows: SerahRow[]): NoStGroup[] {
  const map = new Map<string, SerahRow[]>();
  for (const row of rows) {
    const key = row.NoST.trim() || "Tanpa No ST";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([noSt, rows]) => ({
    noSt,
    rows,
    pcs: rows.reduce((s, r) => s + r.JmlhBatang, 0),
    ton: rows.reduce((s, r) => s + r.Ton, 0),
    kubik: rows.reduce((s, r) => s + r.Kubik, 0),
  }));
}

export const serahTerimaStKamarKdReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  SerahRow[]
> = {
  type: "serah-terima-st-kamar-kd",
  title: "Laporan Serah Terima ST (Kamar KD)",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("NoProcKD", sql.VarChar(13), params.noProcKd)
      .execute("SP_LapSerahTerimaSTKDKeluar");
    return ((result.recordset ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        NoProcKD: String(row.NoProcKD ?? ""),
        NoRuangKD: Math.round(toFloat(row.NoRuangKD)),
        TglMasuk: fmtDate(row.TglMasuk),
        TglKeluar: fmtDate(row.TglKeluar),
        NoST: String(row.NoST ?? ""),
        Tebal: toFloat(row.Tebal),
        Lebar: toFloat(row.Lebar),
        Panjang: toFloat(row.Panjang),
        JmlhBatang: Math.round(toFloat(row.JmlhBatang)),
        Ton: toFloat(row.Ton),
        Kubik: toFloat(row.Kubik),
      }),
    );
  },

  render(rows, meta) {
    const first = rows[0];
    const header = first ?? { NoProcKD: "", NoRuangKD: 0, TglMasuk: "", TglKeluar: "" };
    const groups = groupByNoSt(rows);
    const totalTon = rows.reduce((s, r) => s + r.Ton, 0);
    const totalKubik = rows.reduce((s, r) => s + r.Kubik, 0);

    const fmtSize = (v: number): string => {
      let out = v.toFixed(3);
      out = out.replace(/0+$/, "").replace(/\.$/, "");
      return out === "" ? "0" : out;
    };

    const metaTable = `<table class="meta-table">
  <tbody>
    <tr>
      <td class="meta-label">No.Proses KD</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(header.NoProcKD)}</td>
      <td class="meta-label">No.Ruang KD</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(String(header.NoRuangKD))}</td>
    </tr>
    <tr>
      <td class="meta-label">Tanggal Masuk</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(header.TglMasuk)}</td>
      <td class="meta-label">Tanggal Keluar</td><td class="meta-separator">:</td><td class="meta-value">${escapeHtml(header.TglKeluar)}</td>
    </tr>
  </tbody>
</table>`;

    let dataRows = "";
    let globalRowNumber = 0;
    for (const g of groups) {
      const rowspan = Math.max(g.rows.length, 1);
      g.rows.forEach((r, i) => {
        globalRowNumber++;
        const odd = globalRowNumber % 2 === 1;
        const span = i === 0
          ? `<td rowspan="${rowspan}" class="center">&#9633;</td><td rowspan="${rowspan}">${escapeHtml(g.noSt)}</td>`
          : "";
        dataRows += `<tr class="${odd ? "row-odd" : "row-even"}${i === 0 ? " no-st-start" : ""}">${span}<td class="center">${i + 1}</td><td></td>` +
          `<td class="number">${fmtSize(r.Tebal)}</td><td class="number">${fmtSize(r.Lebar)}</td><td class="number">${fmtSize(r.Panjang)}</td>` +
          `<td class="number">${formatNumber(r.JmlhBatang, 0)}</td><td class="number" style="font-weight:bold;">${formatNumber(r.Ton, 4)}</td><td class="number" style="font-weight:bold;">${formatNumber(r.Kubik, 4)}</td></tr>
`;
      });
    }

    const bodyHtml = metaTable + `<table class="data-table">
  <thead>
    <tr>
      <th style="width:5%;">Cek</th>
      <th style="width:18%;">No ST</th>
      <th style="width:5%;">No</th>
      <th style="width:11%;">Lokasi</th>
      <th style="width:9%;">Tebal</th>
      <th style="width:9%;">Lebar</th>
      <th style="width:9%;">Panjang</th>
      <th style="width:10%;">Pcs</th>
      <th style="width:12%;">Ton</th>
      <th style="width:12%;">Kubik</th>
    </tr>
  </thead>
  <tbody>
${dataRows || `    <tr><td colspan="10" class="center">Tidak ada data</td></tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="8" class="center">Total Dari Ruang KD ${escapeHtml(String(header.NoRuangKD))}</td>
      <td class="number">${formatNumber(totalTon, 4)}</td>
      <td class="number">${formatNumber(totalKubik, 4)}</td>
    </tr>
  </tfoot>
</table>`;

    // The blade's signature block: two signatories side by side plus the
    // "Diketahui Oleh (Ka.Div Stock)" line in the middle column.
    const signatureTable = `<table class="signature-table">
  <tbody>
    <tr>
      <td style="width:40%;">Yang Menyerahkan</td>
      <td style="width:20%;"></td>
      <td style="width:40%;">Yang Menerima</td>
    </tr>
    <tr>
      <td class="signature-space"></td>
      <td></td>
      <td class="signature-space"></td>
    </tr>
    <tr>
      <td>( ................................ )</td>
      <td></td>
      <td>( ................................ )</td>
    </tr>
    <tr>
      <td></td>
      <td style="padding-top: 14px;">Diketahui Oleh</td>
      <td></td>
    </tr>
    <tr>
      <td></td>
      <td class="signature-space"></td>
      <td></td>
    </tr>
    <tr>
      <td></td>
      <td>(Ka.Div Stock)</td>
      <td></td>
    </tr>
  </tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Serah Terima ST (Kamar KD)",
      subtitle: "",
      bodyHtml: bodyHtml + signatureTable,
      extraCss: WPS_REFERENCE_CSS["serah-terima-st-kamar-kd"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
