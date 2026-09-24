import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * SPWps_LapUmurKayuBulatRambung — "Laporan Umur Kayu Bulat (Rambung)".
 * Ported from open-api-report's UmurKayuBulatRambangReportService +
 * umur-kayu-bulat-rambung-pdf.blade.php.
 *
 * Rows are grouped per Status (0 = Masih Hidup, 1 = Sudah Mati) and sorted by
 * Lama Tunggu ascending. Duration rules (legacy):
 *   - Lama Awal   = DateCreate -> TanggalRacip
 *   - Lama Tunggu = DateCreate -> (DateUsage | TanggalLamaRacip | TanggalRacip
 *                  | report date for "Masih Hidup"), +2 days when Model is
 *                  TRUCK / TRUK (the "NB" footnote says so)
 *   - Lama Racip  = "Masih Hidup" with both racip dates present ->
 *                   TanggalRacip -> TanggalLamaRacip; otherwise
 *                   max(0, Lama Tunggu - Lama Awal)
 * Each status block is closed by a Total row (distinct truck count + tonnage)
 * and the legacy group-note blocks below it.
 */

interface UmurRambungRow extends Record<string, unknown> {
  Status: number | string | null;
  NoKayuBulat: string | null;
  DateCreate: Date | string | null;
  Jenis: string | null;
  NmSupplier: string | null;
  NoTruk: number | null;
  TonKBKG: number | null;
  TanggalRacip: Date | string | null;
  TanggalLamaRacip: Date | string | null;
  DateUsage: Date | string | null;
  Model: string | null;
}

interface NormalizedRow {
  status: string;
  noKb: string;
  dateCreate: string;
  supplier: string;
  truck: string;
  jenis: string;
  ton: number;
  tanggalRacip: string;
  tanggalLamaRacip: string;
  lamaAwal: number | null;
  lamaTunggu: number | null;
  lamaRacip: number | null;
  /** Reference date of this report (PDF print date), used by "Masih Hidup". */
  referenceDate: string;
}

const STATUS_LABELS: Record<string, string> = {
  "0": "Masih Hidup",
  "1": "Sudah Mati",
};

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

/** ISO date only; empty for blanks. */
const dateKey = (value: unknown): string => {
  const raw = toText(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : "";
};

/** Legacy $diffDays: signed whole days, never negative. */
const diffDays = (from: string, to: string): number | null => {
  if (from === "" || to === "") return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  return Math.max(0, Math.floor((toMs - fromMs) / 86400000));
};

const fmtHari = (days: number | null): string => (days === null ? "" : `${days} hari`);

/** Legacy d-M-y: 2-digit year keeps the racip dates on one line. */
const fmtTanggalPendek = (iso: string): string =>
  iso === "" ? "" : formatTanggalId(iso).replace(/(\d{2})\d{2}$/, "$1");

const fmtTon = (value: number): string => formatNumber(value, 4);

const normalizeRow = (row: UmurRambungRow, referenceDate: string): NormalizedRow => {
  const statusRaw = row.Status;
  const statusText =
    typeof statusRaw === "number" || (typeof statusRaw === "string" && statusRaw.trim() !== "" && Number.isFinite(Number(statusRaw)))
      ? String(Math.trunc(Number(statusRaw)))
      : toText(statusRaw);
  const status = STATUS_LABELS[statusText] ?? (statusText !== "" ? statusText : "Tanpa Status");

  const dateCreate = dateKey(row.DateCreate);
  const tanggalRacip = dateKey(row.TanggalRacip);
  const tanggalLamaRacip = dateKey(row.TanggalLamaRacip);
  const dateUsage = dateKey(row.DateUsage);

  const lamaAwal = diffDays(dateCreate, tanggalRacip);

  // Lama Tunggu
  let lamaTunggu: number | null;
  if (status === "Masih Hidup" && dateCreate !== "") {
    lamaTunggu = diffDays(dateCreate, referenceDate);
  } else if (dateUsage !== "" && dateCreate !== "") {
    lamaTunggu = diffDays(dateCreate, dateUsage);
  } else if (tanggalLamaRacip !== "" && dateCreate !== "") {
    lamaTunggu = diffDays(dateCreate, tanggalLamaRacip);
  } else if (tanggalRacip !== "" && dateCreate !== "") {
    lamaTunggu = diffDays(dateCreate, tanggalRacip);
  } else if (dateCreate !== "") {
    lamaTunggu = diffDays(dateCreate, referenceDate);
  } else {
    lamaTunggu = null;
  }

  const model = toText(row.Model).toUpperCase();
  if (lamaTunggu !== null && (model === "TRUCK" || model === "TRUK")) {
    lamaTunggu += 2;
  }

  // Lama Racip
  let lamaRacip: number | null;
  if (status === "Masih Hidup" && tanggalLamaRacip !== "" && tanggalRacip !== "") {
    lamaRacip = diffDays(tanggalRacip, tanggalLamaRacip);
  } else {
    lamaRacip =
      lamaTunggu !== null && lamaAwal !== null
        ? Math.max(0, lamaTunggu - lamaAwal)
        : null;
  }

  return {
    status,
    noKb: toText(row.NoKayuBulat),
    dateCreate,
    supplier: toText(row.NmSupplier),
    truck: toText(row.NoTruk),
    jenis: toText(row.Jenis),
    ton: toFloat(row.TonKBKG),
    tanggalRacip,
    tanggalLamaRacip,
    lamaAwal,
    lamaTunggu,
    lamaRacip,
    referenceDate,
  };
};

/** Distinct non-empty truck numbers (legacy $countTruck). */
const countTrucks = (rows: NormalizedRow[]): number => {
  const distinct = new Set<string>();
  for (const row of rows) {
    if (row.truck !== "") distinct.add(row.truck);
  }
  return distinct.size;
};

const sumTon = (rows: NormalizedRow[]): number =>
  rows.reduce((sum, row) => sum + row.ton, 0);

const UMUR_RAMBUNG_CSS = `
  .duration-bold { font-weight: bold; }
  .section-break { height: 10px; }
  .section-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }

  /* Compact cells so every column fits on one line (portrait, one page). */
  .report-table thead th { font-size: 10px; padding: 2px 3px; }
  .report-table tbody td { font-size: 9px; padding: 1px 3px; }

  /* The shared CSS drops the bottom border of colspan headers (two-tier
     headers). This report has a single header row, so keep the line. */
  .report-table thead tr.headers-row:first-child th[colspan] {
    border-bottom: 1px solid #000 !important;
  }

  /* Legacy border model: header band with top+bottom lines, data rows show
     vertical separators only, totals row on a white band, and the table frame
     closes with border-left + border-bottom (.report-table). */
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tbody tr.totals-row td {
    background: #fff !important;
    font-size: 10px;
    border-top: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
  }

  .group-note { width: 100%; margin: 4px 0 14px 0; font-size: 11px; }
  .group-note td { border: 0 !important; padding: 0 4px; background: transparent !important; vertical-align: top; white-space: nowrap; }
  .group-note .left { text-align: left; }
  .group-note .center { text-align: center; }
  .group-note .right { text-align: right; }
`;

const HEAD_HTML = `<thead>
    <tr class="headers-row">
      <th style="width: 4%;">No</th>
      <th style="width: 8%;">No KB</th>
      <th style="width: 8%;">Tanggal</th>
      <th style="width: 14%;">Nama Supplier</th>
      <th style="width: 5%;">No Truk</th>
      <th style="width: 11%;">Jenis Kayu</th>
      <th colspan="2" style="width: 16.5%;">Tanggal Racip</th>
      <th colspan="2" style="width: 16.5%;">Lama Racip</th>
      <th style="width: 7.5%;">Lama Tunggu</th>
      <th style="width: 7.5%;">Berat Muatan (Ton)</th>
    </tr>
  </thead>`;

const buildGroupTable = (rows: NormalizedRow[]): string => {
  const bodyRows = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center data-cell">${index + 1}</td>
        <td class="center data-cell">${escapeHtml(row.noKb)}</td>
        <td class="center data-cell">${escapeHtml(fmtTanggalPendek(row.dateCreate))}</td>
        <td class="center data-cell">${escapeHtml(row.supplier)}</td>
        <td class="center data-cell">${escapeHtml(row.truck)}</td>
        <td class="center data-cell">${escapeHtml(row.jenis)}</td>
        <td class="center data-cell">${escapeHtml(fmtTanggalPendek(row.tanggalRacip))}</td>
        <td class="center data-cell duration-bold">${escapeHtml(fmtHari(row.lamaAwal))}</td>
        <td class="center data-cell">${escapeHtml(fmtTanggalPendek(row.tanggalLamaRacip))}</td>
        <td class="center data-cell duration-bold">${escapeHtml(fmtHari(row.lamaRacip))}</td>
        <td class="center data-cell duration-bold">${escapeHtml(fmtHari(row.lamaTunggu))}</td>
        <td class="number data-cell">${fmtTon(row.ton)}</td>
      </tr>`,
    )
    .join("\n    ");

  // Layout: [No][No KB][Tanggal][Supplier][No Truk] | ... | [Berat]
  // "Total" spans up to the truck column, then "N Truk", then the ton total.
  return `<table class="report-table">
  ${HEAD_HTML}
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td class="center data-cell" colspan="4">Total</td>
      <td class="center data-cell">${countTrucks(rows)} Truk</td>
      <td class="center data-cell" colspan="6"></td>
      <td class="number data-cell">${fmtTon(sumTon(rows))}</td>
    </tr>
  </tbody>
</table>`;
};

const buildGroupNotes = (
  groupName: string,
  groupRows: NormalizedRow[],
  overallTon: number,
  overallTrucks: number,
): string => {
  if (groupName === "Masih Hidup") {
    const sudahMasukMeja = groupRows.filter((row) => row.tanggalRacip !== "");
    const belumMasukMeja = groupRows.filter((row) => row.tanggalRacip === "");
    return `<table class="group-note">
    <tr>
      <td class="left"><small> (*) NB: Kendaraan model TRUK (Fuso/Tronton/Trintin)</small></td>
    </tr>
  </table>
  <table class="group-note">
    <tr>
      <td class="left" style="width: 23.33%;">Jmlh Belum Masuk Meja : ${fmtTon(sumTon(belumMasukMeja))} Ton</td>
      <td class="center" style="width: 23.33%;">Jmlh Sudah Masuk Meja : ${fmtTon(sumTon(sudahMasukMeja))} Ton</td>
      <td class="right" style="width: 23.33%;">Jmlh : ${fmtTon(sumTon(groupRows))} Ton (${countTrucks(groupRows)} Truk)</td>
    </tr>
  </table>`;
  }

  if (groupName === "Sudah Mati") {
    // Legacy prints the OVERALL totals here (not the group's own).
    return `<table class="group-note">
    <tr>
      <td class="right">Jmlh : ${fmtTon(overallTon)} Ton (${overallTrucks} Truk)</td>
    </tr>
  </table>`;
  }

  return "";
};

export const umurKayuBulatRambungReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "umur-kayu-bulat-rambung",
  title: "Laporan Umur Kayu Bulat (Rambung)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapUmurKayuBulatRambung");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta): RenderResult {
    // The legacy anchors "Masih Hidup" durations to the PDF generation date.
    const referenceDate = meta.generatedAt.toISOString().slice(0, 10);
    const normalized = (rows as UmurRambungRow[]).map((row) =>
      normalizeRow(row, referenceDate),
    );

    // Group per status label, ordered Masih Hidup -> Sudah Mati -> rest.
    const grouped = new Map<string, NormalizedRow[]>();
    for (const row of normalized) {
      const bucket = grouped.get(row.status);
      if (bucket) bucket.push(row);
      else grouped.set(row.status, [row]);
    }
    const order = ["Masih Hidup", "Sudah Mati"];
    const groupNames = [...grouped.keys()].sort((left, right) => {
      const li = order.indexOf(left);
      const ri = order.indexOf(right);
      if (li !== -1 && ri !== -1) return li - ri;
      if (li !== -1) return -1;
      if (ri !== -1) return 1;
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });

    const overallTon = sumTon(normalized);
    const overallTrucks = countTrucks(normalized);

    const sections = groupNames
      .map((groupName) => {
        const groupRows = [...(grouped.get(groupName) ?? [])];
        // Sort by Lama Tunggu ascending (nulls last).
        groupRows.sort((a, b) => {
          if (a.lamaTunggu === null && b.lamaTunggu === null) return 0;
          if (a.lamaTunggu === null) return 1;
          if (b.lamaTunggu === null) return -1;
          return a.lamaTunggu - b.lamaTunggu;
        });

        return `<div class="section-title">Status : ${escapeHtml(groupName)}</div>
${buildGroupTable(groupRows)}
${buildGroupNotes(groupName, groupRows, overallTon, overallTrucks)}`;
      })
      .join('\n<div class="section-break"></div>\n');

    const bodyHtml =
      sections ||
      `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    const start = fmtTanggalPendek(meta.params.tglAwal);
    const end = fmtTanggalPendek(meta.params.tglAkhir);

    return renderWpsReportPage({
      title: "Laporan Umur Kayu Bulat (Rambung)",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      extraCss: UMUR_RAMBUNG_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
