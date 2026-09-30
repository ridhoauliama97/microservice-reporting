import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_KapasitasRacipKayuBulatHidup, ...JmlhHK, ...JmlhMeja and ...HidupKG —
 * "Laporan Kapasitas Racip Kayu Bulat Hidup (Ton)". Ported from
 * open-api-report's KapasitasRacipKayuBulatHidupReportService and
 * kapasitas-racip-kayu-bulat-hidup-pdf.blade.php.
 *
 * This is a capacity plan, not a stock listing. The report answers "how many
 * working days does it take to clear the log yard", so the arithmetic runs:
 *
 *   tonPerHari      = TOTAL_TON_CAPACITY / JmlhHK
 *   mejaPerHari     = JmlhHK > 0 ? JmlhMeja / JmlhHK : 0
 *   tonPerHariMeja  = mejaPerHari > 0 ? tonPerHari / mejaPerHari : 0
 *
 *   non-Rambung:  rendemen 85%  ->  totalTon x 0.85,  then / tonPerHari
 *   Rambung:     rendemen 20%  ->  totalBerat x 0.20, then / tonPerHari
 *
 * Two things are constants, not data, and both come from the reference:
 *
 *   TOTAL_TON_CAPACITY = 323.7837 - the sawmill's rated daily tonnage. It is
 *   not in any procedure; the JmlhHK and JmlhMeja procedures only return a
 *   working-day count and a table count. Change it here if the plant rating
 *   changes.
 *
 *   Rendemen 85% for non-Rambung and 20% for Rambung - the reference applies
 *   these as hard-coded constants to the live balances.
 *
 * The two balances are kept in separate sections because they are different
 * things: the non-Rambung set is measured in ton per inch and the Rambung set
 * is the KG procedure, whose numbers are already in that unit. Neither is
 * converted to the other.
 *
 * The four procedures have different parameter shapes, all verified against
 * sys.parameters: the two balance procedures take none at all, and the two
 * count procedures take @StartDate and @EndDate. So the stock figures are "as
 * of now" while the divisor counts are "over the requested period"; the
 * subtitle says both rather than presenting them as one period.
 */

interface NonRambungRow extends Record<string, unknown> {
  Group: string | null;
  Ton: number | string | null;
}

interface RambungRow extends Record<string, unknown> {
  NamaGrade: string | null;
  Berat: number | string | null;
}

/** The sawmill's rated daily capacity, in ton. Not returned by any procedure. */
const TOTAL_TON_CAPACITY = 323.7837;

/** Share of the balance that becomes saleable racip, per wood family. */
const NON_RAMBUNG_RENDEMEN = 0.85;
const RAMBUNG_RENDEMEN = 0.2;

interface WoodBalance {
  rows: Array<{ label: string; amount: number }>;
  total: number;
  rendemenPercent: number;
  effectiveTon: number;
  requiredDays: number;
}

interface Capacity {
  jmlhHk: number;
  jmlhMeja: number;
  mejaPerHari: number;
  totalTon: number;
  tonPerHari: number;
  tonPerHariMeja: number;
}

interface KapasitasData {
  nonRambung: WoodBalance;
  rambung: WoodBalance;
  capacity: Capacity;
  totalRequiredDays: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().replaceAll(",", ".");
  if (normalized === "" || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const orDash = (value: unknown): string => toText(value) || "-";

const fmt4 = (value: number): string => formatNumber(value, 4);
const fmt2 = (value: number): string => formatNumber(value, 2);
const fmt0 = (value: number): string => formatNumber(Math.round(value), 0);
const fmtDay = (value: number): string => formatNumber(value, 2);

/** Exported for tests: the capacity arithmetic, with the zero guards applied. */
export function buildCapacity(
  jmlhHk: number,
  jmlhMeja: number,
): Capacity {
  const tonPerHari = jmlhHk > 0 ? TOTAL_TON_CAPACITY / jmlhHk : 0;
  const mejaPerHari = jmlhHk > 0 ? jmlhMeja / jmlhHk : 0;
  const tonPerHariMeja = mejaPerHari > 0 ? tonPerHari / mejaPerHari : 0;
  return {
    jmlhHk,
    jmlhMeja,
    mejaPerHari,
    totalTon: TOTAL_TON_CAPACITY,
    tonPerHari,
    tonPerHariMeja,
  };
}

export function buildKapasitasData(
  nonRambungRows: NonRambungRow[],
  rambungRows: RambungRow[],
  jmlhHk: number,
  jmlhMeja: number,
): KapasitasData {
  const capacity = buildCapacity(jmlhHk, jmlhMeja);

  const nonRambungTotal = nonRambungRows.reduce(
    (sum, row) => sum + toFloat(row.Ton),
    0,
  );
  const rambungTotal = rambungRows.reduce(
    (sum, row) => sum + toFloat(row.Berat),
    0,
  );

  const nonRambangEffective = nonRambungTotal * NON_RAMBUNG_RENDEMEN;
  const rambungEffective = rambungTotal * RAMBUNG_RENDEMEN;
  const nonRambungDays =
    capacity.tonPerHari > 0 ? nonRambangEffective / capacity.tonPerHari : 0;
  const rambungDays =
    capacity.tonPerHari > 0 ? rambungEffective / capacity.tonPerHari : 0;

  return {
    nonRambung: {
      rows: nonRambungRows.map((row) => ({
        label: toText(row.Group),
        amount: toFloat(row.Ton),
      })),
      total: nonRambungTotal,
      rendemenPercent: NON_RAMBUNG_RENDEMEN * 100,
      effectiveTon: nonRambangEffective,
      requiredDays: nonRambungDays,
    },
    rambung: {
      rows: rambungRows.map((row) => ({
        label: toText(row.NamaGrade),
        amount: toFloat(row.Berat),
      })),
      total: rambungTotal,
      rendemenPercent: RAMBUNG_RENDEMEN * 100,
      effectiveTon: rambungEffective,
      requiredDays: rambungDays,
    },
    capacity,
    totalRequiredDays: nonRambungDays + rambungDays,
  };
}

/** The reference metric table, reused verbatim for both wood families. */
const buildCapacityTable = (capacity: Capacity): string => {
  const row = (label: string, value: string): string =>
    `<tr><td class="metrics-label">${escapeHtml(label)}</td><td class="metrics-sep">:</td><td>${value}</td></tr>`;
  return `<div class="section-title">Kapasitas Racip Sawmill :</div>
  <table class="metrics-table">
    <tbody>
      ${row("Jmlh HK", `${escapeHtml(fmt0(capacity.jmlhHk))} hari`)}
      ${row("Jmlh Meja Sawmill", `${escapeHtml(fmt0(capacity.jmlhMeja))} meja`)}
      ${row("Jmlh Meja /Hari", `${escapeHtml(fmtDay(capacity.mejaPerHari))} meja/hari`)}
      ${row("Total Ton", escapeHtml(fmt4(capacity.totalTon)))}
      ${row("Ton/Hari", escapeHtml(fmtDay(capacity.tonPerHari)))}
      ${row("Ton/Hari/Meja", escapeHtml(fmt4(capacity.tonPerHariMeja)))}
    </tbody>
  </table>`;
};

const buildBalanceSection = (
  data: KapasitasData,
  section: "nonRambung" | "rambung",
): string => {
  const balance = data[section];
  const isRambung = section === "rambung";
  const labelHeader = isRambung ? "Nama Grade" : "Jenis Kayu";
  const amountHeader = isRambung ? "Berat" : "Ton";
  const amountFormat = isRambung ? fmt2 : fmt4;
  const trailingUnit = isRambung ? " (Kg)" : " (inch)";

  const bodyRows = balance.rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="label">${escapeHtml(orDash(row.label))}</td>
        <td class="number">${escapeHtml(amountFormat(row.amount))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-block">
  <div class="section-title">Saldo Kayu Bulat ${isRambung ? "Rambung" : "Non Rambung"} :</div>
  <table class="report-table" style="width: 42%; margin-bottom: 12px;">
    <thead>
      <tr class="headers-row">
        <th>${escapeHtml(labelHeader)}</th>
        <th style="width: 70px;">${escapeHtml(amountHeader)}</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(2)}
      <tr>
        <td></td>
        <td class="number" style="font-weight: bold;">${escapeHtml(amountFormat(balance.total))}</td>
      </tr>
    </tbody>
  </table>
  ${buildCapacityTable(data.capacity)}
  <div class="equation">
    Rendemen Kayu (${isRambung ? "Rambung" : "Non Rambung"}) :
    ${escapeHtml(fmt0(balance.rendemenPercent))}% x
    ${escapeHtml(amountFormat(balance.total))} =
    ${escapeHtml(amountFormat(balance.effectiveTon))} Ton
  </div>
  <div class="conclusion">
    <div class="conclusion-title" style="font-weight: bold;">Kesimpulan :</div>
    <div>
      Diperlukan Waktu : <span style="font-weight: bold;">${escapeHtml(fmtDay(balance.requiredDays))}
      Hari Kerja (Sawmill)</span>
      Untuk Menyelesaikan Kayu Bulat${isRambung ? " (Rambung)" : ""} :
      ${escapeHtml(amountFormat(balance.total))} Ton${trailingUnit}
    </div>
  </div>
</div>`;
};

export const kapasitasRacipKayuBulatHidupReport: ReportDefinition<
  PeriodParams,
  KapasitasData
> = {
  type: "kapasitas-racip-kayu-bulat-hidup",
  title: "Laporan Kapasitas Racip Kayu Bulat Hidup (Ton)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [nonRambungResult, rambungResult, hkResult, mejaResult] =
      await Promise.all([
        conn.request().execute("SP_KapasitasRacipKayuBulatHidup"),
        conn.request().execute("SP_KapasitasRacipKayuBulatHidupKG"),
        conn
          .request()
          .input("StartDate", sql.Date, params.tglAwal)
          .input("EndDate", sql.Date, params.tglAkhir)
          .execute("SP_KapasitasRacipKayuBulatHidupJmlhHK"),
        conn
          .request()
          .input("StartDate", sql.Date, params.tglAwal)
          .input("EndDate", sql.Date, params.tglAkhir)
          .execute("SP_KapasitasRacipKayuBulatHidupJmlhMeja"),
      ]);

    // Both count procedures return a single CountTglSawmill row.
    const readCount = (result: { recordset?: unknown }): number => {
      const row = (result.recordset ?? []) as Array<Record<string, unknown>>
      return Math.round(toFloat(Object.values(row[0] ?? {})[0]))
    };

    return buildKapasitasData(
      (nonRambungResult.recordset ?? []) as NonRambungRow[],
      (rambungResult.recordset ?? []) as RambungRow[],
      readCount(hkResult),
      readCount(mejaResult),
    );
  },

  render(data, meta) {
    const bodyHtml = `${buildBalanceSection(data, "nonRambung")}\n  ${buildBalanceSection(data, "rambung")}
  <div class="section-title" style="margin-top: 4px;">Rangkuman :</div>
  <table class="summary-table">
    <tbody>
      <tr>
        <td>Diperlukan Waktu</td>
        <td class="metrics-sep">:</td>
        <td><span style="font-weight: bold;">${escapeHtml(fmtDay(data.totalRequiredDays))} Hari Kerja (Sawmill)</span>
          Untuk Menyelesaikan Kayu Bulat (Non Rambung) dan (Rambung)</td>
      </tr>
    </tbody>
  </table>`;

    return renderWpsReportPage({
      title: "Laporan Kapasitas Racip Kayu Bulat Hidup (Ton)",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "kapasitas_racip_kayu_bulat_hidup",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
