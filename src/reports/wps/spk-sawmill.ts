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

/**
 * SP_LapHasilSPKSawmill_h + SP_LapHasilSPKSawmill_d — "Laporan SPK Sawmill".
 * Ported from open-api-report's SpkSawmillReportService + spk-sawmill-pdf.blade.php.
 *
 * Two procedures behind one report: the header (one row per target size) and
 * the detail (tons produced per sawmill day with a running balance). They are
 * joined on the caller's params, not in SQL.
 */

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const paramsSchema = z.object({
  noSpk: z.string().trim().min(1),
  idProduk: z.coerce.number().int().min(0),
});

interface HeaderRow extends Record<string, unknown> {
  NoSPK: string;
  Tanggal: string;
  NamaProduk: string;
  NamaGroup: string;
  Tebal: number;
  Lebar: number;
  Ton: number;
}

interface DetailRow extends Record<string, unknown> {
  TglSawmill: string;
  Ton: number;
  SaldoTerakhir: number;
}

export const spkSawmillReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  { header: HeaderRow[]; details: DetailRow[] }
> = {
  type: "spk-sawmill",
  title: "Laporan SPK Sawmill",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const headerReq = conn.request();
    headerReq.input("NoSPK", sql.VarChar(20), params.noSpk);
    headerReq.input("IdProduk", sql.Int, params.idProduk);
    const headerResult = await headerReq.execute("SP_LapHasilSPKSawmill_h");
    const detailReq = conn.request();
    detailReq.input("NoSPK", sql.VarChar(20), params.noSpk);
    detailReq.input("IdProduk", sql.Int, params.idProduk);
    const detailResult = await detailReq.execute("SP_LapHasilSPKSawmill_d");

    const header = ((headerResult.recordset ?? []) as Array<Record<string, unknown>>)
      .map(
        (row): HeaderRow => ({
          NoSPK: String(row.NoSPK ?? ""),
          Tanggal:
            row.Tanggal instanceof Date
              ? row.Tanggal.toISOString().slice(0, 10)
              : String(row.Tanggal ?? ""),
          NamaProduk: String(row.NamaProduk ?? ""),
          NamaGroup: String(row.NamaGroup ?? ""),
          Tebal: toFloat(row.Tebal),
          Lebar: toFloat(row.Lebar),
          Ton: toFloat(row.Ton),
        }),
      )
      .sort((a, b) => a.Tebal - b.Tebal || a.Lebar - b.Lebar);

    const detailsRaw = (detailResult.recordset ?? []) as Array<Record<string, unknown>>;
    const details = detailsRaw
      .map(
        (row): DetailRow => ({
          TglSawmill:
            row.TglSawmill instanceof Date
              ? row.TglSawmill.toISOString().slice(0, 10)
              : String(row.TglSawmill ?? ""),
          Ton: toFloat(row.Ton),
          SaldoTerakhir: toFloat(row.SaldoTerakhir),
        }),
      )
      .sort((a, b) => a.TglSawmill.localeCompare(b.TglSawmill));

    return { header, details };
  },

  render(data, meta) {
    const { header, details } = data;
    const first = header[0];
    const permintaanRacip = first ? first.Ton : 0;

    const metaTable = `<table class="meta-table">
  <tbody>
    <tr>
      <td style="width:47%;" class="meta-inner-cell">
        <table style="border-collapse:collapse;width:100%;">
          <tr><td class="meta-label" style="width:52px;">Jenis Kayu</td><td class="meta-sep">:</td><td>${escapeHtml(first?.NamaGroup ?? "")}</td></tr>
          <tr><td class="meta-label" style="width:52px;">Tanggal</td><td class="meta-sep">:</td><td>${escapeHtml(first?.Tanggal ? formatTanggalId(first.Tanggal) : "")}</td></tr>
        </table>
      </td>
      <td style="width:53%;">
        <table style="border-collapse:collapse;width:100%;">
          <tr><td class="meta-label" style="width:44px;">No SPK</td><td class="meta-sep">:</td><td>${escapeHtml(String(meta.params.noSpk))}</td></tr>
          <tr><td class="meta-label" style="width:44px;">Produk</td><td class="meta-sep">:</td><td>${escapeHtml(first?.NamaProduk ?? "")}</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>`;

    const dimensionRows = header
      .map(
        (row, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="number">${formatNumber(row.Tebal, 0)}</td>
      <td class="number">${formatNumber(row.Lebar, 0)}</td>
    </tr>`,
      )
      .join("\n");

    const detailRowFor = (rows: Array<DetailRow>): string =>
      rows
        .map(
          (row, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td>${escapeHtml(row.TglSawmill ? formatTanggalId(row.TglSawmill) : "")}</td>
      <td class="number">${formatNumber(row.Ton, 4)}</td>
      <td class="number">${formatNumber(row.SaldoTerakhir, 4)}</td>
    </tr>`,
        )
        .join("\n");

    const MAX = 52;
    const split = details.length > MAX;
    const leftRows = split ? details.slice(0, MAX) : details;
    const rightRows = split ? details.slice(MAX, MAX * 2) : [];

    const racipTable = (rows: Array<DetailRow>): string => `<table class="report-table racip-table">
  <thead><tr class="headers-row"><th style="width:42%;">Tanggal</th><th style="width:29%;">Racip</th><th style="width:29%;">Saldo</th></tr></thead>
  <tbody>
${detailRowFor(rows) || `    <tr class="data-row row-odd row-last"><td colspan="3" class="center">Tidak ada data</td></tr>`}
  </tbody>
</table>`;

    const bodyHtml = `${metaTable}
<table class="report-table" style="width:100%;">
  <thead><tr class="headers-row"><th style="width:50%;">Tebal</th><th style="width:50%;">Lebar</th></tr></thead>
  <tbody>
${dimensionRows}
  </tbody>
</table>
<p style="margin:8px 0;">Permintaan Racip : <strong>${formatNumber(permintaanRacip, 4)}</strong></p>
${
  split
    ? `<table style="width:100%; border-collapse:collapse;"><tr>
      <td style="width:45%; vertical-align:top;">${racipTable(leftRows)}</td>
      <td style="width:10%;"></td>
      <td style="width:45%; vertical-align:top;">${racipTable(rightRows)}</td>
    </tr></table>`
    : racipTable(leftRows)
}`;

    return renderWpsReportPage({
      title: "Laporan SPK Sawmill",
      subtitle: "",
      bodyHtml,
      style: "produksi_per_spk",
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
