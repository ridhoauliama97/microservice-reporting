import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  pageFooterHtml,
  renderPage,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

// --- Raw rows straight from the stored procedures ---

export interface MutasiRow {
  Jenis: string | null;
  Awal: number | null;
  Masuk: number | null;
  AdjOutput: number | null;
  BSOutput: number | null;
  AdjInput: number | null;
  BSInput: number | null;
  Keluar: number | null;
  Jual: number | null;
  MLDInput: number | null;
  LMTInput: number | null;
  CCAInput: number | null;
  SANDInput: number | null;
  Akhir: number | null;
}

export interface SubRow {
  Jenis: string | null;
  BarangJadi: number | null;
  Moulding: number | null;
  Sanding: number | null;
  WIP: number | null;
  WIPLama: number | null;
  CCAkhir: number | null;
}

// --- View model (data layer output; render only formats and prints this) ---
//
// Derived columns requested by management (Total Masuk, Total Keluar, the
// combined WIP, per-row totals, grand totals) are computed HERE, not in the
// template — so the template stays dumb and the math is unit-testable.

export interface MainRowVM {
  jenis: string;
  awal: number;
  adjOutput: number;
  bsOutput: number;
  packingOutput: number;
  totalMasuk: number;
  adjInput: number;
  bsInput: number;
  jual: number;
  ccaInput: number;
  lmtInput: number;
  mldInput: number;
  packingInput: number;
  sandInput: number;
  totalKeluar: number;
  akhir: number;
}

export interface MainTotalsVM {
  awal: number;
  adjOutput: number;
  bsOutput: number;
  packingOutput: number;
  totalMasuk: number;
  adjInput: number;
  bsInput: number;
  jual: number;
  ccaInput: number;
  lmtInput: number;
  mldInput: number;
  packingInput: number;
  sandInput: number;
  totalKeluar: number;
  akhir: number;
}

export interface SubRowVM {
  jenis: string;
  barangJadi: number;
  ccAkhir: number;
  moulding: number;
  sanding: number;
  wip: number;
  total: number;
}

export interface SubTotalsVM {
  barangJadi: number;
  ccAkhir: number;
  moulding: number;
  sanding: number;
  wip: number;
  total: number;
}

export interface MutasiBarangJadiVM {
  main: MainRowVM[];
  mainTotals: MainTotalsVM;
  sub: SubRowVM[];
  subTotals: SubTotalsVM;
}

function num(row: MutasiRow | SubRow, key: string): number {
  const value = (row as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sortByJenis<T extends { Jenis: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    String(a.Jenis ?? "") > String(b.Jenis ?? "")
      ? 1
      : String(a.Jenis ?? "") < String(b.Jenis ?? "")
        ? -1
        : 0,
  );
}

/**
 * Builds the presentation-ready view model from the raw SP rows:
 * sorts by Jenis and computes every derived column.
 */
export function buildViewModel(
  rawMain: MutasiRow[],
  rawSub: SubRow[],
): MutasiBarangJadiVM {
  const main: MainRowVM[] = [];
  const mainTotals: MainTotalsVM = {
    awal: 0,
    adjOutput: 0,
    bsOutput: 0,
    packingOutput: 0,
    totalMasuk: 0,
    adjInput: 0,
    bsInput: 0,
    jual: 0,
    ccaInput: 0,
    lmtInput: 0,
    mldInput: 0,
    packingInput: 0,
    sandInput: 0,
    totalKeluar: 0,
    akhir: 0,
  };

  for (const row of sortByJenis(rawMain)) {
    // SP column mapping (same semantics as the legacy report):
    // "Masuk" is Packing Output, "Keluar" is Packing Production Input.
    const packingOutput = num(row, "Masuk");
    const packingInput = num(row, "Keluar");
    const totalMasuk =
      num(row, "AdjOutput") + num(row, "BSOutput") + packingOutput;
    const totalKeluar =
      num(row, "AdjInput") +
      num(row, "BSInput") +
      num(row, "Jual") +
      num(row, "CCAInput") +
      num(row, "LMTInput") +
      num(row, "MLDInput") +
      packingInput +
      num(row, "SANDInput");

    const vm: MainRowVM = {
      jenis: String(row.Jenis ?? ""),
      awal: num(row, "Awal"),
      adjOutput: num(row, "AdjOutput"),
      bsOutput: num(row, "BSOutput"),
      packingOutput,
      totalMasuk,
      adjInput: num(row, "AdjInput"),
      bsInput: num(row, "BSInput"),
      jual: num(row, "Jual"),
      ccaInput: num(row, "CCAInput"),
      lmtInput: num(row, "LMTInput"),
      mldInput: num(row, "MLDInput"),
      packingInput,
      sandInput: num(row, "SANDInput"),
      totalKeluar,
      akhir: num(row, "Akhir"),
    };
    main.push(vm);

    mainTotals.awal += vm.awal;
    mainTotals.adjOutput += vm.adjOutput;
    mainTotals.bsOutput += vm.bsOutput;
    mainTotals.packingOutput += vm.packingOutput;
    mainTotals.totalMasuk += vm.totalMasuk;
    mainTotals.adjInput += vm.adjInput;
    mainTotals.bsInput += vm.bsInput;
    mainTotals.jual += vm.jual;
    mainTotals.ccaInput += vm.ccaInput;
    mainTotals.lmtInput += vm.lmtInput;
    mainTotals.mldInput += vm.mldInput;
    mainTotals.packingInput += vm.packingInput;
    mainTotals.sandInput += vm.sandInput;
    mainTotals.totalKeluar += vm.totalKeluar;
    mainTotals.akhir += vm.akhir;
  }

  const sub: SubRowVM[] = [];
  const subTotals: SubTotalsVM = {
    barangJadi: 0,
    ccAkhir: 0,
    moulding: 0,
    sanding: 0,
    wip: 0,
    total: 0,
  };

  for (const row of sortByJenis(rawSub)) {
    // WIP combines current and old WIP.
    const wip = num(row, "WIP") + num(row, "WIPLama");
    const total =
      num(row, "BarangJadi") +
      num(row, "CCAkhir") +
      num(row, "Moulding") +
      num(row, "Sanding") +
      wip;

    const vm: SubRowVM = {
      jenis: String(row.Jenis ?? ""),
      barangJadi: num(row, "BarangJadi"),
      ccAkhir: num(row, "CCAkhir"),
      moulding: num(row, "Moulding"),
      sanding: num(row, "Sanding"),
      wip,
      total,
    };
    sub.push(vm);

    subTotals.barangJadi += vm.barangJadi;
    subTotals.ccAkhir += vm.ccAkhir;
    subTotals.moulding += vm.moulding;
    subTotals.sanding += vm.sanding;
    subTotals.wip += vm.wip;
    subTotals.total += vm.total;
  }

  return { main, mainTotals, sub, subTotals };
}

// --- Report definition ---

export const mutasiBarangJadiReport: ReportDefinition<
  PeriodParams,
  MutasiBarangJadiVM
> = {
  type: "mutasi-barang-jadi",
  title: "Mutasi Barang Jadi",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const period = (request: sql.Request): sql.Request =>
      request
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir);

    const [main, sub] = await Promise.all([
      period(conn.request()).execute("SP_Mutasi_BarangJadi"),
      period(conn.request()).execute("SP_SubMutasi_BarangJadi"),
    ]);

    return buildViewModel(
      (main.recordset ?? []) as MutasiRow[],
      (sub.recordset ?? []) as SubRow[],
    );
  },

  render(vm, meta): RenderResult {
    // Mirrors the legacy Blade helpers ($fmt / Carbon date format).
    const MONTHS_ID = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    const formatDateId = (iso: string): string => {
      const [y, m, d] = iso.split("-").map(Number);
      return `${String(d).padStart(2, "0")}-${MONTHS_ID[m - 1]}-${String(y).slice(2)}`;
    };
    const formatDateTimeId = (date: Date): string => {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const hh = String(date.getHours()).padStart(2, "0");
      const mi = String(date.getMinutes()).padStart(2, "0");
      return `${formatDateId(iso)} ${hh}:${mi}`;
    };
    // PHP number_format(value, 4, '.', ',') equivalent.
    const formatNumber4 = (value: number): string => {
      const [intPart, decPart] = value.toFixed(4).split(".");
      return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + decPart;
    };
    const fmt = (value: number | null | undefined): string => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      if (Math.abs(value) < 0.0000001) return "";
      return formatNumber4(value);
    };

    const printedAt = formatDateTimeId(meta.generatedAt);
    const subtitle = `Dari ${formatDateId(meta.params.tglAwal)} s/d ${formatDateId(meta.params.tglAkhir)}`;

    const mainBodyRows = vm.main
      .map(
        (
          row,
          index,
        ) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
                            <td class="center">${index + 1}</td>
                            <td class="label">${escapeHtml(row.jenis)}</td>
                            <td class="number">${fmt(row.awal)}</td>
                            <td class="number">${fmt(row.adjOutput)}</td>
                            <td class="number">${fmt(row.bsOutput)}</td>
                            <td class="number">${fmt(row.packingOutput)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(row.totalMasuk)}</td>
                            <td class="number">${fmt(row.adjInput)}</td>
                            <td class="number">${fmt(row.bsInput)}</td>
                            <td class="number">${fmt(row.jual)}</td>
                            <td class="number">${fmt(row.ccaInput)}</td>
                            <td class="number">${fmt(row.lmtInput)}</td>
                            <td class="number">${fmt(row.mldInput)}</td>
                            <td class="number">${fmt(row.packingInput)}</td>
                            <td class="number">${fmt(row.sandInput)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(row.totalKeluar)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(row.akhir)}</td>
                          </tr>`,
      )
      .join("\n");

    const mainTotalsRow = `<tr class="totals-row">
                            <td colspan="2" class="blank" style="text-align: center">Total</td>
                            <td class="number">${fmt(vm.mainTotals.awal)}</td>
                            <td class="number">${fmt(vm.mainTotals.adjOutput)}</td>
                            <td class="number">${fmt(vm.mainTotals.bsOutput)}</td>
                            <td class="number">${fmt(vm.mainTotals.packingOutput)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(vm.mainTotals.totalMasuk)}</td>
                            <td class="number">${fmt(vm.mainTotals.adjInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.bsInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.jual)}</td>
                            <td class="number">${fmt(vm.mainTotals.ccaInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.lmtInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.mldInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.packingInput)}</td>
                            <td class="number">${fmt(vm.mainTotals.sandInput)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(vm.mainTotals.totalKeluar)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(vm.mainTotals.akhir)}</td>
                          </tr>`;

    const subBodyRows = vm.sub
      .map(
        (
          row,
          index,
        ) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
                            <td class="center">${index + 1}</td>
                            <td class="label">${escapeHtml(row.jenis)}</td>
                            <td class="number">${fmt(row.barangJadi)}</td>
                            <td class="number">${fmt(row.ccAkhir)}</td>
                            <td class="number">${fmt(row.moulding)}</td>
                            <td class="number">${fmt(row.sanding)}</td>
                            <td class="number">${fmt(row.wip)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(row.total)}</td>
                          </tr>`,
      )
      .join("\n");

    const subTotalsRow = `<tr class="totals-row">
                            <td colspan="2" class="blank" style="text-align:center">Total</td>
                            <td class="number">${fmt(vm.subTotals.barangJadi)}</td>
                            <td class="number">${fmt(vm.subTotals.ccAkhir)}</td>
                            <td class="number">${fmt(vm.subTotals.moulding)}</td>
                            <td class="number">${fmt(vm.subTotals.sanding)}</td>
                            <td class="number">${fmt(vm.subTotals.wip)}</td>
                            <td class="number" style="font-weight: bold;">${fmt(vm.subTotals.total)}</td>
                          </tr>`;

    const body = `
<h1 class="report-title">Laporan Mutasi Barang Jadi (m3)</h1>
<p class="report-subtitle">${escapeHtml(subtitle)}</p>

<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 30px;">No</th>
      <th rowspan="2" style="width: 180px;">Jenis Kayu</th>
      <th rowspan="2" style="width: 55px;">Awal</th>
      <th colspan="3">Masuk</th>
      <th rowspan="2" style="width: 62px;">Total<br>Masuk</th>
      <th colspan="8">Keluar</th>
      <th rowspan="2" style="width: 62px;">Total<br>Keluar</th>
      <th rowspan="2" style="width: 55px;">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th>Adj Output</th>
      <th>B.Susun Output</th>
      <th>Packing Outp</th>
      <th>Adj Input</th>
      <th>B.Susun Input</th>
      <th>Jual</th>
      <th>CCAProd Input</th>
      <th>LMT Prod Input</th>
      <th>MLD Prod Input</th>
      <th>Packing Prod Inpt</th>
      <th>SAND Prod Input</th>
    </tr>
  </thead>
  <tbody>
    ${mainBodyRows || '<tr class="data-row row-odd"><td colspan="17" class="center">Tidak ada data untuk periode ini</td></tr>'}
    ${mainTotalsRow}
  </tbody>
</table>

<div class="section-title">Input Barang Jadi</div>
<table class="report-table sub-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 32px;">No</th>
      <th style="width: 230px;">Jenis Kayu</th>
      <th>Barang Jadi</th>
      <th>CCAkhir</th>
      <th>Moulding</th>
      <th>Sanding</th>
      <th>WIP</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${subBodyRows || '<tr class="data-row row-odd"><td colspan="8" class="center">Tidak ada data untuk periode ini</td></tr>'}
    ${subTotalsRow}
  </tbody>
</table>`;

    // CSS ported from the legacy Blade template (without the wkhtmltopdf
    // @page footer directive and without remote Google Fonts — Chromium
    // falls back to the system serif font).
    const css = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Noto Serif', serif; font-size: 10px; line-height: 1.2; color: #000; }
  .report-title { text-align: center; margin: 0; font-size: 16px; font-weight: bold; }
  .report-subtitle { text-align: center; margin: 2px 0 20px 0; font-size: 12px; color: #636466; }
  .section-title { margin: 14px 0 6px 0; font-size: 12px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; table-layout: fixed; }
  .report-table { border-spacing: 0; border-top: 0; border-right: 0; border-bottom: 1px solid #000; border-left: 1px solid #000; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
  th { text-align: center; font-weight: bold; background: #ffffff; color: #000; }
  td.center { text-align: center; }
  td.label { white-space: nowrap; }
  td.number { text-align: right; white-space: nowrap; }
  .row-odd td { background: #c9d1df; }
  .row-even td { background: #eef2f8; }
  .totals-row td { font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .totals-row td.blank { background: transparent; }
  .headers-row th { font-weight: bold; font-size: 11px; border-top: 0; border-right: 1px solid #000; border-bottom: 1px solid #000; border-left: 0; }
  .report-table thead tr.headers-row:first-child th { border-top: 1px solid #000; }
  .report-table thead tr.headers-row:first-child th[rowspan] { border-bottom: 1px solid #000; }
  .report-table thead tr.headers-row:first-child th[colspan] { border-bottom: 0; }
  .report-table thead tr.headers-row:last-child th { border-top: 1px solid #000; }
  table.sub-table { width: 70%; }
`;

    return {
      html: renderPage({
        title: "Mutasi Barang Jadi",
        bodyHtml: body,
        extraCss: css,
      }),
      footerHtml: pageFooterHtml({
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      }),
      landscape: true,
    };
  },
};
