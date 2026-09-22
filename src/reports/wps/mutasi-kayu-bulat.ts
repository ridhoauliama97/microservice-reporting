import sql from "mssql";
import {
  escapeHtml,
  formatNumber4,
  formatPrintedAt,
  formatTanggalId,
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
      <td class="num">${escapeHtml(formatNumber4(row.SaldoAwal))}</td>
      <td class="num">${escapeHtml(formatNumber4(row.SaldoMasuk))}</td>
      <td class="num">${escapeHtml(formatNumber4(row.SaldoKeluar))}</td>
      <td class="num">${escapeHtml(formatNumber4(row.SaldoJual))}</td>
      <td class="num">${escapeHtml(formatNumber4(row.SaldoAkhir))}</td>
    </tr>`,
          )
          .join("\n")
      : `<tr><td colspan="6" class="empty">Tidak ada data untuk periode ini</td></tr>`;

    const body = `
<h1 class="center">Mutasi Kayu Bulat</h1>
<div class="meta center">
  Dari: ${escapeHtml(formatTanggalId(meta.params.tglAwal))} s/d ${escapeHtml(formatTanggalId(meta.params.tglAkhir))}
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
