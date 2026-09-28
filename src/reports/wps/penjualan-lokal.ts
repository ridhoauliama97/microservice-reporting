import sql from "mssql";
import { escapeHtml, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderMeta } from "../types";
import {
  buildEmptyTableRow,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";

/**
 * Laporan Penjualan Lokal — the one report in this batch that is NOT backed by a
 * stored procedure. The legacy service carried the T-SQL inline
 * (PenjualanLokalReportService::query), so the query is carried over verbatim
 * and run with `.query()`.
 *
 * The only edit to the SQL is the two `DECLARE` lines, which are dropped: Laravel
 * bound `:start_date` / `:end_date` and then re-declared them, but mssql already
 * declares the request parameters, so the statement now uses @tglAwal /
 * @tglAkhir directly. Nothing from the request is ever concatenated into it.
 *
 * The query is nine UNION branches, one per process (ST, WIP, S4S, FJ, Moulding,
 * Laminating, CCAkhir, Sanding, Reproses), each already restricted to local wood
 * (D.IsLokal = 1) and already rounded to 4 decimals. Only branches that sold
 * anything in the period return rows — for Aug-2026 that is ST alone, which is
 * genuine data rather than a broken branch.
 *
 * Rows land flat and are folded into one section per process: rows sorted by Ton
 * descending, a "Jumlah" line per section, then one Grand Total. Section order
 * follows the query's `ORDER BY No, Jenis, NamaGrade`, i.e. the fixed process
 * order 1..9.
 */

// No DECLARE block: mssql already declares @tglAwal / @tglAkhir as request
// parameters, so redeclaring them here would raise "variable name has already
// been declared". The query body below therefore uses the bound names directly
// where the legacy used @tglAwal / @tglAkhir.
const QUERY = `
Select (1) As No, ('ST') As Proses, A.Jenis, (NULL) As NamaGrade, Sum(Round(A.Ton,4,1)) As TonAndm3
From (
    Select D.Jenis,
    Case When (C.IdUOMTblLebar = 1 And C.IdUOMPanjang = 4) Then
        Floor(E.Tebal*E.Lebar*E.Panjang*E.JmlhBatang*215.2542/100000)/10000
    When (C.IdUOMTblLebar = 3 And C.IdUOMPanjang = 4) Then
        Floor(E.Tebal*E.Lebar*E.Panjang*E.JmlhBatang/7200.8*10000)/10000
    End As Ton
    From Penjualan_h A
    Inner Join PenjualanST B On B.NoJual = A.NoJual
    Inner Join ST_h C On C.NoST = B.NoST
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Left Join ST_d E On E.NoST = C.NoST
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
    Group By D.Jenis, C.IdUOMTblLebar, C.IdUOMPanjang, E.Tebal, E.Lebar, E.Panjang, E.JmlhBatang
) A
Group By A.Jenis

Union

Select (2) As No, ('WIP') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanWIP B On B.NoJual = A.NoJual
    Inner Join WIP_h C On C.NoWIP = B.NoWIP
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join WIP_d F On F.NoWIP = C.NoWIP
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (3) As No, ('S4S') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanS4S B On B.NoJual = A.NoJual
    Inner Join S4S_h C On C.NoS4S = B.NoS4S
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join S4S_d F On F.NoS4S = C.NoS4S
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (4) As No, ('FJ') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanFJ B On B.NoJual = A.NoJual
    Inner Join FJ_h C On C.NoFJ = B.NoFJ
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join FJ_d F On F.NoFJ = C.NoFJ
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (5) As No, ('Moulding') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanMoulding B On B.NoJual = A.NoJual
    Inner Join Moulding_h C On C.NoMoulding = B.NoMoulding
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join Moulding_d F On F.NoMoulding = C.NoMoulding
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (6) As No, ('Laminating') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanLaminating B On B.NoJual = A.NoJual
    Inner Join Laminating_h C On C.NoLaminating = B.NoLaminating
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join Laminating_d F On F.NoLaminating = C.NoLaminating
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (7) As No, ('CCAkhir') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanCCAkhir B On B.NoJual = A.NoJual
    Inner Join CCAkhir_h C On C.NoCCAkhir = B.NoCCAkhir
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join CCAkhir_d F On F.NoCCAkhir = C.NoCCAkhir
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (8) As No, ('Sanding') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanSanding B On B.NoJual = A.NoJual
    Inner Join Sanding_h C On C.NoSanding = B.NoSanding
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join Sanding_d F On F.NoSanding = C.NoSanding
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade

Union

Select (9) As No, ('Reproses') As Proses, A.Jenis, A.NamaGrade, Sum(Round(A.m3,4,1)) As TonAndm3
From (
    Select D.Jenis, E.NamaGrade, (F.Tebal*F.Lebar*F.Panjang*F.JmlhBatang/1000000000*10000)/10000 As m3
    From Penjualan_h A
    Inner Join PenjualanReproses B On B.NoJual = A.NoJual
    Inner Join Reproses_h C On C.NoReproses = B.NoReproses
    Inner Join MstJenisKayu D On D.IdJenisKayu = C.IdJenisKayu
    Inner Join MstGrade E On E.IdGrade = C.IdGrade
    Left Join Reproses_d F On F.NoReproses = C.NoReproses
    Where A.TglJual >= @tglAwal And A.TglJual <= @tglAkhir
    And D.IsLokal = 1
) A
Group By A.Jenis, A.NamaGrade
ORDER BY No, Jenis, NamaGrade
`;

/** The four columns the query returns, all read defensively. */
interface QueryRow {
  Proses?: unknown;
  Jenis?: unknown;
  NamaGrade?: unknown;
  TonAndm3?: unknown;
}

interface LocalRow {
  jenis: string;
  namaGrade: string;
  ton: number;
}

interface LocalSection {
  proses: string;
  rows: LocalRow[];
  subtotal: number;
}

interface PenjualanLokalData {
  sections: LocalSection[];
  grandTotal: number;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const toTon = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Legacy $fmtTon: number_format($v, 4, '.', '') — four decimals, no separator. */
const fmtTon = (value: number): string => value.toFixed(4);

/** The four columns every process section repeats, sized as the legacy blade. */
const COLUMNS: ReportColumn[] = [
  { kind: "no", label: "No", width: "8%" },
  { kind: "label", label: "Jenis", field: "jenis", width: "44%" },
  { kind: "label", label: "Nama Grade", field: "namaGrade", width: "28%", align: "center" },
  { kind: "number", label: "Ton", field: "ton", width: "20%", bold: true },
];

const SECTION_HEADERS = `
        <th style="width: 8%;">No</th>
        <th style="width: 44%;">Jenis</th>
        <th style="width: 28%;">Nama Grade</th>
        <th style="width: 20%;">Ton</th>`;

/**
 * Folds the flat resultset into one section per process. The legacy controller
 * kept sections in first-appearance order (the query already sorts by No) and
 * dropped rows whose ton is zero or negative; rows within a section are then
 * re-sorted by ton descending for display and numbered after that sort.
 */
export function buildPenjualanLokalData(
  rows: QueryRow[],
): PenjualanLokalData {
  const sections: LocalSection[] = [];
  const byProses = new Map<string, LocalSection>();

  for (const row of rows) {
    const ton = Math.round(toTon(row.TonAndm3) * 10000) / 10000;
    if (ton <= 0) continue;

    const proses = toText(row.Proses) || "LAINNYA";
    let section = byProses.get(proses);
    if (!section) {
      section = { proses, rows: [], subtotal: 0 };
      byProses.set(proses, section);
      sections.push(section);
    }
    section.rows.push({
      jenis: toText(row.Jenis),
      namaGrade: toText(row.NamaGrade),
      ton,
    });
    section.subtotal += ton;
  }

  for (const section of sections) {
    section.rows.sort((left, right) => right.ton - left.ton);
    section.subtotal = Math.round(section.subtotal * 10000) / 10000;
  }

  const grandTotal =
    Math.round(sections.reduce((sum, section) => sum + section.subtotal, 0) * 10000) /
    10000;

  return { sections, grandTotal };
}

const renderSection = (section: LocalSection): string => {
  const bodyRows = section.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td class="center">${index + 1}</td>
            <td class="label">${escapeHtml(row.jenis)}</td>
            <td class="center">${escapeHtml(row.namaGrade)}</td>
            <td class="number">${escapeHtml(fmtTon(row.ton))}</td>
          </tr>`,
    )
    .join("\n          ");

  return `<div class="section-title">${escapeHtml(section.proses)}</div>
  <table class="report-table penjualan-lokal-section">
    <thead>
      <tr class="headers-row">${SECTION_HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(COLUMNS.length)}
    </tbody>
  </table>
  <div class="section-total">Jumlah : ${escapeHtml(fmtTon(section.subtotal))}</div>`;
};

export const penjualanLokalReport: ReportDefinition<
  PeriodParams,
  PenjualanLokalData
> = {
  type: "penjualan-lokal",
  title: "Laporan Penjualan Lokal",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("tglAwal", sql.Date, params.tglAwal)
      .input("tglAkhir", sql.Date, params.tglAkhir)
      .query(QUERY);
    return buildPenjualanLokalData(
      (result.recordset ?? []) as QueryRow[],
    );
  },

  render(data: PenjualanLokalData, meta: RenderMeta<PeriodParams>) {
    const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`;

    // No sections at all: the legacy blade showed a bare empty-state line and
    // still printed a zeroed Grand Total. A Grand Total of 0.0000 next to an
    // empty report reads as a real figure, so it is dropped here.
    const bodyHtml =
      data.sections.length > 0
        ? `${data.sections.map(renderSection).join("\n  ")}
  <div class="grand-total">Grand Total : ${escapeHtml(fmtTon(data.grandTotal))}</div>`
        : `<table class="report-table penjualan-lokal-section">
      <tbody>${buildEmptyTableRow(COLUMNS.length)}</tbody>
    </table>`;

    return renderWpsReportPage({
      title: "Laporan Penjualan Lokal",
      subtitle,
      bodyHtml,
      style: "penjualan_lokal",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
