import sql from "mssql";
import { renderWpsReportPage } from "./template";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: umur kayu bulat (non rambung) — grouped per Status
 * ("Masih Hidup" / "Sudah Mati"), with derived Lama Awal / Lama Racip /
 * Lama Tunggu durations per legacy rules. Ported from open-api-report's
 * UmurKayuBulatNonRambungReportService + umur-kayu-bulat-non-rambung-pdf.
 */

interface UmurRow extends Record<string, unknown> {
  Status: number | null;
  NoKayuBulat: string | null;
  DateCreate: Date | null;
  Jenis: string | null;
  NmSupplier: string | null;
  NoTruk: number | null;
  TonKBKG: number | null;
  TanggalRacip: Date | null;
  TanggalLamaRacip: Date | null;
  DateUsage: Date | null;
}

interface NormalizedRow extends Record<string, unknown> {
  status: string;
  noKb: string | null;
  tanggal: string | null;
  supplier: string | null;
  jenisKayu: string | null;
  truk: number | null;
  ton: number | null;
  tanggalRacip: string | null;
  tanggalLamaRacip: string | null;
  lamaAwal: number | null;
  lamaRacip: number | null;
  lamaTunggu: number | null;
}

const isoOf = (value: Date | null): string | null =>
  value instanceof Date ? value.toISOString().slice(0, 10) : null;

const diffDays = (from: string | null, to: string | null): number | null => {
  if (from === null || to === null) return null;
  const diff = Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
  return Number.isFinite(diff) ? diff : null;
};

const fmtDuration = (days: number | null): string => (days === null ? "" : `${days} hari`);

function buildUmurRows(rows: UmurRow[], periodeEndIso: string): NormalizedRow[] {
  return rows.map((raw) => {
    const status = raw.Status === null ? "" : String(Math.round(Number(raw.Status)));
    const dateCreate = raw.DateCreate instanceof Date ? raw.DateCreate.toISOString().slice(0, 10) : null;
    const tanggalRacip =
      raw.TanggalRacip instanceof Date ? raw.TanggalRacip.toISOString().slice(0, 10) : null;
    const tanggalLamaRacip =
      raw.TanggalLamaRacip instanceof Date
        ? raw.TanggalLamaRacip.toISOString().slice(0, 10)
        : null;
    const dateUsage =
      raw.DateUsage instanceof Date ? raw.DateUsage.toISOString().slice(0, 10) : null;

    // Lama Racip: duration from racip start to racip end.
    let lamaRacip: number | null = null;
    if (tanggalRacip && tanggalLamaRacip) {
      const diff = Math.floor((Date.parse(tanggalLamaRacip) - Date.parse(tanggalRacip)) / 86400000);
      lamaRacip = diff >= 0 ? diff : null;
    }

    // Lama tunggu per period context: status 1 (sudah mati) anchors to
    // DateUsage; status 0 (masih hidup) anchors to the period end date.
    const anchorDate = status === "1" ? dateUsage : periodeEndIso;
    let lamaTunggu: number | null = null;
    if (dateCreate && anchorDate) {
      const diff = Math.floor((Date.parse(anchorDate) - Date.parse(dateCreate)) / 86400000);
      lamaTunggu = diff >= 0 ? diff : null;
    }

    // Legacy rendering rule: lama racip = max(0, lama tunggu - lama awal).
    const lamaAwal = diffDaysLocal(dateCreate, tanggalRacip);
    const lamaRacipDerived =
      lamaTunggu !== null && lamaAwal !== null ? Math.max(0, lamaTunggu - lamaAwal) : null;

    return {
      status,
      noKb: String(raw.NoKayuBulat ?? ""),
      tanggal: dateCreate,
      supplier: raw.NmSupplier ?? null,
      jenisKayu: raw.Jenis ?? null,
      truk: raw.NoTruk ?? null,
      ton: typeof raw.TonKBKG === "number" && Number.isFinite(raw.TonKBKG) ? raw.TonKBKG : null,
      tanggalRacip,
      tanggalLamaRacip,
      lamaAwal,
      lamaRacip: lamaRacipDerived ?? lamaRacip,
      lamaTunggu,
    };
  });
}

const diffDaysLocal = (from: string | null, to: string | null): number | null => {
  if (from === null || to === null) return null;
  const diff = Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
  return Number.isFinite(diff) ? diff : null;
};

const toFloat = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const STATUS_LABELS: Record<string, string> = {
  "0": "Masih Hidup",
  "1": "Sudah Mati",
};

export const umurKayuBulatReport: ReportDefinition<
  PeriodParams,
  UmurRow[]
> = {
  type: "umur-kayu-bulat-non-rambung",
  title: "Laporan Umur Kayu Bulat (NON RAMBUNG)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapUmurKayuBulat");
    return (result.recordset ?? []) as UmurRow[];
  },

  render(rows, meta) {
    const periodeEndIso = meta.params.tglAkhir;
    const normalized = buildUmurRows(rows, periodeEndIso);

    // Group per status label, ordered: Masih Hidup -> Sudah Mati.
    const grouped = new Map<string, NormalizedRow[]>();
    for (const row of normalized) {
      const groupName = STATUS_LABELS[row.status] ?? (row.status !== "" ? row.status : "Tanpa Status");
      const list = grouped.get(groupName) ?? [];
      list.push(row);
      grouped.set(groupName, list);
    }
    const order = ["Masih Hidup", "Sudah Mati"];
    const groupNames = [...grouped.keys()].sort((a, b) => {
      const left = order.indexOf(a);
      const right = order.indexOf(b);
      if (left !== -1 && right !== -1) return left - right;
      if (left !== -1) return -1;
      if (right !== -1) return 1;
      return a.localeCompare(b);
    });

    const sections = groupNames
      .map((groupName) => {
        const groupRows = grouped.get(groupName)!;

        const headRow = `<thead>
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

        const body = groupRows
          .map(
            (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center data-cell">${index + 1}</td>
        <td class="center data-cell">${escapeHtml(row.noKb ?? "")}</td>
        <td class="center data-cell">${escapeHtml(row.tanggal ? fmtTanggalKompak(row.tanggal) : "")}</td>
        <td class="center data-cell">${escapeHtml(row.supplier ?? "")}</td>
        <td class="center data-cell">${escapeHtml(row.truk === null ? "" : String(row.truk))}</td>
        <td class="center data-cell">${escapeHtml(row.jenisKayu ?? "")}</td>
        <td class="center data-cell">${escapeHtml(row.tanggalRacip ? fmtTanggalKompak(row.tanggalRacip) : "")}</td>
        <td class="center data-cell duration-bold" style="font-weight: bold;">${fmtHari(row.lamaAwal)}</td>
        <td class="center data-cell">${escapeHtml(row.tanggalLamaRacip ? fmtTanggalKompak(row.tanggalLamaRacip) : "")}</td>
        <td class="center data-cell duration-bold" style="font-weight: bold;">${fmtHari(row.lamaRacip)}</td>
        <td class="center data-cell duration-bold" style="font-weight: bold;">${fmtHari(row.lamaTunggu)}</td>
        <td class="number data-cell">${fmtTon(row.ton)}</td>
      </tr>`,
          )
          .join("\n    ");

        const countTruk = new Set(
          groupRows
            .map((r) => String(r.truk ?? ""))
            .filter((value) => value !== ""),
        ).size;
        const sumTon = groupRows.reduce((sum, r) => sum + toFloat(r.ton), 0);

        return `<div class="section-title">Status : ${escapeHtml(groupName)}</div>
  <table class="report-table">
  ${headRow}
  <tbody>
    ${body}
    <tr class="totals-row">
      <td class="center data-cell" colspan="4">Total :</td>
      <td class="center data-cell">${countTruk} Truk</td>
      <td class="center data-cell" colspan="6"></td>
      <td class="number data-cell">${formatNumber(sumTon, 4)}</td>
    </tr>
  </tbody>
</table>`;
      })
      .join('\n<div class="section-break"></div>\n');

    const bodyHtml =
      sections || `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Umur Kayu Bulat (NON RAMBUNG)",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: UMUR_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};

const fmtHari = (days: number | null): string => (days === null ? "" : `${days} hari`);
const fmtTon = (value: number | null | undefined): string =>
  formatNumber(value, 4, { blankWhenZero: false });
// Legacy umur renders dates as dd-Mon-yy (2-digit year) so every date fits
// its column on a single line. formatTanggalId gives dd-Mon-yyyy.
const fmtTanggalKompak = (iso: string): string => formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const UMUR_CSS = `
  .duration-bold { font-weight: bold; }
  .section-break { height: 10px; }
  .section-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }

  /* Compact cell sizing so every column fits on one line inside one page. */
  .report-table thead th { font-size: 10px; padding: 2px 3px; }
  .report-table tbody td { font-size: 9px; padding: 1px 3px; }

  /* The shared CSS drops the bottom border of colspan headers (meant for
     two-tier headers). Umur uses a single header row, so the "Tanggal Racip"
     and "Lama Racip" groups would otherwise have no closing line. */
  .report-table thead tr.headers-row:first-child th[colspan] {
    border-bottom: 1px solid #000 !important;
  }

  /* Legacy umur border model: header band with top+bottom lines, data rows
     show vertical separators only, totals row on a white band, and the table
     frame closes with border-left + border-bottom (.report-table). */
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tbody tr.totals-row td {
    background: #fff !important;
    border-top: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
  }
`;
