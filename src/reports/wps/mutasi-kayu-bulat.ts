import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatVolume,
  pageFooterHtml,
  renderPage,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

type MutasiKayuBulatParams = PeriodParams;

interface MutasiRow {
  Jenis: string | null;
  SaldoAwal: number | null;
  SaldoMasuk: number | null;
  SaldoKeluar: number | null;
  SaldoJual: number | null;
  SaldoAkhir: number | null;
}

export const mutasiKayuBulatReport: ReportDefinition<
  MutasiKayuBulatParams,
  MutasiRow[]
> = {
  type: "mutasi-kayu-bulat",
  title: "Mutasi Kayu Bulat",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SP_Mutasi_KayuBulat");
    return (result.recordset ?? []) as MutasiRow[];
  },

  render(rows, meta) {
    const bodyRows = rows.length
      ? rows
          .map(
            (row) => `<tr>
      <td>${escapeHtml(row.Jenis)}</td>
      <td class="num">${escapeHtml(formatVolume(row.SaldoAwal))}</td>
      <td class="num">${escapeHtml(formatVolume(row.SaldoMasuk))}</td>
      <td class="num">${escapeHtml(formatVolume(row.SaldoKeluar))}</td>
      <td class="num">${escapeHtml(formatVolume(row.SaldoJual))}</td>
      <td class="num">${escapeHtml(formatVolume(row.SaldoAkhir))}</td>
    </tr>`,
          )
          .join("\n")
      : `<tr><td colspan="6" class="empty">Tidak ada data untuk periode ini</td></tr>`;

    const body = `
<h1>Mutasi Kayu Bulat</h1>
<div class="meta">
  Periode: ${escapeHtml(meta.params.tglAwal)} s/d ${escapeHtml(meta.params.tglAkhir)} &middot;
  Diminta oleh: ${escapeHtml(meta.requestedBy)} &middot;
  Dibuat: ${escapeHtml(meta.generatedAt.toISOString())}
</div>
<table>
  <thead>
    <tr>
      <th class="center">Jenis</th>
      <th class="center">Saldo Awal</th>
      <th class="center">Saldo Masuk</th>
      <th class="center">Saldo Keluar</th>
      <th class="center">Saldo Jual</th>
      <th class="center">Saldo Akhir</th>
    </tr>
  </thead>
  <tbody>
${bodyRows}
  </tbody>
</table>`;

    return {
      html: renderPage({ title: "Mutasi Kayu Bulat", bodyHtml: body }),
      footerHtml: pageFooterHtml({
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      }),
    };
  },
};
