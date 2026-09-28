import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { z } from "zod";
import type { ReportDefinition, RenderMeta } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * Laporan Surat Jalan — SP_CetakSuratJalan, keyed by one No Jual.
 *
 * This one is a delivery note rather than a table: a "SURAT JALAN" heading, the
 * consignee and vehicle on the left, the document number and vehicle type on the
 * right, then the loaded logs and a six-column signature block.
 *
 * Two details carried over from the legacy blade:
 *
 * - The date is printed only on the first row of each run of the same date
 *   (`DisplayTanggal` in the legacy service), with a heavier rule above each new
 *   date, so a delivery split over several days reads as separate blocks.
 * - The signature block sits at the foot of the document. The legacy blade put
 *   it in wkhtmltopdf's `<htmlpagefooter>`; in Chromium the equivalent is the
 *   second `footer.html` Gotenberg receives, but that area is only as tall as
 *   the bottom margin (0.8in) and the block overran it badly enough to
 *   overprint the "Dicetak oleh" line sitting in the same space. It is part of
 *   the body here, so it lays out normally and the page footer is left as the
 *   single standard line every other report uses.
 *
 * As with the other document-keyed reports, an unknown No Jual shows the shared
 * empty state rather than failing the job.
 */

const paramsSchema = z.object({
  noJual: z.string().trim().min(1).max(50),
});

export type SuratJalanParams = z.infer<typeof paramsSchema>;

interface SpRow {
  DateCreate?: unknown;
  NoST?: unknown;
  Jenis?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  UOMTblLebar?: unknown;
  Panjang?: unknown;
  UOMPanjang?: unknown;
  JmlhBatang?: unknown;
  M3?: unknown;
  Ton?: unknown;
  TglJual?: unknown;
  NoSJ?: unknown;
  NoPlat?: unknown;
  Buyer?: unknown;
  JenisKendaraan?: unknown;
}

interface LogRow {
  tanggal: string;
  displayTanggal: string;
  noSt: string;
  jenisKayu: string;
  tebal: number | null;
  lebar: number | null;
  uomTblLebar: string;
  panjang: number | null;
  uomPanjang: string;
  pcs: number;
  m3: number;
  ton: number;
  /** True on the first row of a new date, which also carries the rule above. */
  newDate: boolean;
}

interface SuratJalanData {
  rows: LogRow[];
  header: {
    tanggal: string;
    noSuratJalan: string;
    buyer: string;
    noPlat: string;
    jenisKendaraan: string;
  };
  totalM3: number;
  totalTon: number;
  totalPcs: number;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
];

/** A date as dd-Mmm-yyyy, or the raw value when it is not a date. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) {
    return `${String(value.getUTCDate()).padStart(2, "0")}-${MONTHS_SHORT[value.getUTCMonth()]}-${value.getUTCFullYear()}`;
  }
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) {
      return `${match[3]}-${MONTHS_SHORT[Number(match[2]) - 1]}-${match[1]}`;
    }
    return value.trim();
  }
  return "";
};

const round4 = (value: number): number => Math.round(value * 10000) / 10000;

export function buildSuratJalanData(
  rows: SpRow[],
  noJual: string,
): SuratJalanData {
  let previousDate: string | null = null;
  const logs: LogRow[] = rows.map((row) => {
    const tanggal = fmtDate(row.DateCreate);
    // The date is printed on the very first row and on the first row of each
    // later date; `newDate` also drives the heavier rule above that row.
    const isFirst = previousDate === null;
    const newDate = !isFirst && tanggal !== previousDate;
    previousDate = tanggal;
    return {
      tanggal,
      displayTanggal: isFirst || newDate ? tanggal : "",
      noSt: toText(row.NoST),
      jenisKayu: toText(row.Jenis),
      tebal: toFloat(row.Tebal),
      lebar: toFloat(row.Lebar),
      uomTblLebar: toText(row.UOMTblLebar),
      panjang: toFloat(row.Panjang),
      uomPanjang: toText(row.UOMPanjang),
      pcs: Math.round(toFloat(row.JmlhBatang) ?? 0),
      m3: toFloat(row.M3) ?? 0,
      ton: toFloat(row.Ton) ?? 0,
      newDate,
    };
  });

  const first = rows[0] ?? {};
  return {
    rows: logs,
    header: {
      tanggal: fmtDate(first.TglJual) || fmtDate(first.DateCreate),
      noSuratJalan: toText(first.NoSJ) || noJual,
      buyer: toText(first.Buyer) || "-",
      noPlat: toText(first.NoPlat) || "-",
      jenisKendaraan: toText(first.JenisKendaraan) || "-",
    },
    totalM3: round4(logs.reduce((sum, row) => sum + row.m3, 0)),
    totalTon: round4(logs.reduce((sum, row) => sum + row.ton, 0)),
    totalPcs: logs.reduce((sum, row) => sum + row.pcs, 0),
  };
}

/** number_format($v, 2, ',', '.') — two decimals, comma decimal, dot thousands. */
const fmtDimension = (value: number | null): string => {
  if (value === null) return "";
  const [intPart, decPart] = value.toFixed(2).split(".");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

/** Four decimals, no thousands separator, as the legacy $fmtVolume does. */
const fmtVolume = (value: number): string => value.toFixed(4);

const HEADERS = `
        <th style="width: 11%;">Tanggal</th>
        <th style="width: 10%;">No ST</th>
        <th style="width: 23%;">Jenis Kayu</th>
        <th style="width: 6%;">Tebal</th>
        <th style="width: 6%;">Lebar</th>
        <th style="width: 6%;">UOM</th>
        <th style="width: 7%;">Panjang</th>
        <th style="width: 6%;">UOM</th>
        <th style="width: 7%;">Pcs</th>
        <th style="width: 9%;">M3</th>
        <th style="width: 9%;">Ton</th>`;

const renderLogsTable = (data: SuratJalanData): string => {
  const body = data.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}${row.newDate ? " date-separator" : ""}">
            <td class="center nowrap">${escapeHtml(row.displayTanggal)}</td>
            <td class="nowrap">${escapeHtml(row.noSt)}</td>
            <td>${escapeHtml(row.jenisKayu)}</td>
            <td class="number">${escapeHtml(fmtDimension(row.tebal))}</td>
            <td class="number">${escapeHtml(fmtDimension(row.lebar))}</td>
            <td class="center">${escapeHtml(row.uomTblLebar)}</td>
            <td class="number">${escapeHtml(fmtDimension(row.panjang))}</td>
            <td class="center">${escapeHtml(row.uomPanjang)}</td>
            <td class="number">${escapeHtml(formatNumber(row.pcs, 0))}</td>
            <td class="number">${escapeHtml(fmtVolume(row.m3))}</td>
            <td class="number">${escapeHtml(fmtVolume(row.ton))}</td>
          </tr>`,
    )
    .join("\n          ");

  const totalRow =
    data.rows.length > 0
      ? `
        <tr class="totals-row">
          <td class="center" colspan="9">Total :</td>
          <td class="number">${escapeHtml(fmtVolume(data.totalM3))}</td>
          <td class="number">${escapeHtml(fmtVolume(data.totalTon))}</td>
        </tr>`
      : "";

  return `<table class="report-table">
    <thead>
      <tr class="headers-row">${HEADERS}
      </tr>
    </thead>
    <tbody>
      ${body || buildEmptyTableRow(11)}${totalRow}
    </tbody>
  </table>`;
};

/**
 * The six-column signature block. This lives in the report BODY, not in the
 * page footer: Gotenberg's footer area is only as tall as the bottom margin
 * (0.8in), and the block plus the standard "Dicetak oleh" line overran it, so
 * the two collided and overprinted each other. In the body it lays out
 * normally and the delivery note keeps a single, clean page footer.
 */
const SIGNATURE_BLOCK = `
  <div class="signature-top-line"></div>
  <table class="signature-table">
    <tr>
      <td rowspan="2" style="width: 17%;"><div class="signature-label">Hormat Kami,</div></td>
      <td rowspan="2" style="width: 17%;"><div class="signature-label">Bagian Gudang,</div></td>
      <td rowspan="2" style="width: 22%;"><div class="signature-label">Terima Kasih,</div></td>
      <td colspan="2" style="width: 28%; padding-bottom: 0;"><div class="signature-label">Diantar Oleh,</div></td>
      <td rowspan="2" style="width: 16%;"><div class="signature-label">Diterima Oleh,</div></td>
    </tr>
    <tr>
      <td style="width: 14%; padding-top: 0;">Supir,</td>
      <td style="width: 14%; padding-top: 0;">Kernet,</td>
    </tr>
    <tr class="signature-space">
      <td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>
    <tr class="signature-lines">
      <td><span class="signature-line">______________</span></td>
      <td><span class="signature-line">______________</span></td>
      <td><span class="signature-line">______________</span></td>
      <td><span class="signature-line">______________</span></td>
      <td><span class="signature-line">______________</span></td>
      <td><span class="signature-line">______________</span></td>
    </tr>
  </table>`;

export const suratJalanReport: ReportDefinition<
  SuratJalanParams,
  SuratJalanData
> = {
  type: "surat-jalan",
  title: "Laporan Surat Jalan",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("NoJual", sql.VarChar(50), params.noJual)
      .execute("SP_CetakSuratJalan");
    return buildSuratJalanData((result.recordset ?? []) as SpRow[], params.noJual);
  },

  render(data: SuratJalanData, meta: RenderMeta<SuratJalanParams>) {
    const bodyHtml = `<h1 class="document-title">SURAT JALAN</h1>
  <table class="header-table">
    <tr>
      <td style="width: 50%;">
        <div>Kepada Yth.</div>
        <div class="recipient-name">${escapeHtml(data.header.buyer)}</div>
        <div class="vehicle">Nomor Kendaraan : ${escapeHtml(data.header.noPlat)}</div>
      </td>
      <td style="width: 50%; padding-left: 24px;">
        <table class="meta-table">
          <tr>
            <td colspan="3" class="meta-date">Medan, ${escapeHtml(formatTanggalId(meta.generatedAt.toISOString().slice(0, 10)))}</td>
          </tr>
          <tr>
            <td class="meta-label">No.Surat Jalan</td>
            <td class="meta-sep">:</td>
            <td class="meta-value">${escapeHtml(data.header.noSuratJalan)}</td>
          </tr>
          <tr>
            <td class="meta-label">Jenis Kendaraan</td>
            <td class="meta-sep">:</td>
            <td class="meta-value">${escapeHtml(data.header.jenisKendaraan)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div class="top-line"></div>
  ${renderLogsTable(data)}
${SIGNATURE_BLOCK}`;

    // The shared footer already prints "Dicetak oleh ... Halaman n dari m";
    // the signature block used to add a second copy of that line, which
    // overprinted the real one.
    return renderWpsReportPage({
      title: "Laporan Surat Jalan",
      bodyHtml,
      style: "surat_jalan",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
