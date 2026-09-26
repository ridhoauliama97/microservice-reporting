import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * SP_LapRekapProduksiFingerJointConsolidated — "Laporan Rekap Produksi Finger
 * Joint Consolidated". Ported from
 * RekapProduksiFingerJointConsolidatedReportService +
 * rekap-produksi-finger-joint-consolidated-pdf.blade.php.
 *
 * The legacy chain is service -> controller -> blade, and the interesting work
 * is split across them, so it is reproduced here in the same order:
 *   1. service: derive per-row ratios (M3/Jam, M3/jam/Org, Rend) and sort by
 *      NamaMesin, Tanggal, Shift;
 *   2. controller: group by machine, derive HK from the date range and the
 *      working-day count per machine, and compute totals;
 *   3. blade: render one table per machine plus a grand total on the last.
 *
 * The grand total's M3/Jam and M3/jam/Org are the SUM of the per-row ratios,
 * not ratios recomputed from the summed inputs; the reference report does the
 * same, and a recomputed value would not match what users are used to.
 */

interface ConsolidatedRow extends Record<string, unknown> {
  Tanggal: Date | string | null;
  Shift: number | null;
  NamaMesin: string | null;
  JamKerja: number | string | null;
  JmlhAnggota: number | string | null;
  CCAkhir: number | string | null;
  S4S: number | string | null;
  OutPutFJ: number | string | null;
}

interface NormalizedRow {
  tanggal: string;
  shift: number;
  namaMesin: string;
  cca: number;
  s4s: number;
  totalInput: number;
  output: number;
  jam: number;
  org: number | null;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
  personHours: number | null;
}

interface Totals {
  cca: number;
  s4s: number;
  totalInput: number;
  output: number;
  jam: number;
  org: number;
  m3Jam: number;
  m3JamOrg: number;
  rend: number;
}

interface MachineGroup {
  namaMesin: string;
  rows: NormalizedRow[];
  totals: Totals;
  /** Calendar days in the requested range. */
  hk: number;
  /** Distinct dates with actual activity, used by Jmlh/HK. */
  hkWorking: number;
}

interface ConsolidatedData {
  hk: number;
  machines: MachineGroup[];
  grandTotals: Totals;
}

const EPS = 0.0000001;

/** Legacy toFloat: null for anything that is not numeric. */
const toFloatOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replaceAll(".", "").replaceAll(",", ".")
      : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toFloat = (value: unknown): number => toFloatOrNull(value) ?? 0;

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

const resolveTanggal = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear().toString().padStart(4, "0"),
      (value.getMonth() + 1).toString().padStart(2, "0"),
      value.getDate().toString().padStart(2, "0"),
    ].join("-");
  }
  return String(value ?? "").trim();
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Legacy hkFromRange: calendar days in the range, inclusive. */
export const hkFromRange = (startIso: string, endIso: string): number => {
  const start = Date.parse(`${startIso}T00:00:00.000Z`);
  const end = Date.parse(`${endIso}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
};

/** Service step: per-row ratios plus the stable display sort. */
export function normalizeConsolidatedRows(rows: ConsolidatedRow[]): NormalizedRow[] {
  const normalized = rows.map((row) => {
    const cca = toFloat(row.CCAkhir);
    const s4s = toFloat(row.S4S);
    // The legacy tries several output keys in order; the SP ships OutPutFJ.
    const output = toFloatOrNull(row.OutPutFJ);
    const jam = toFloatOrNull(row.JamKerja);
    const orgRaw = Math.trunc(toFloat(row.JmlhAnggota));
    const totalInput = cca + s4s;

    const m3Jam = jam !== null && Math.abs(jam) > EPS && output !== null
      ? output / jam
      : null;
    const personHours = jam !== null && Math.abs(jam) > EPS && orgRaw > 0
      ? jam * orgRaw
      : null;
    const m3JamOrg = personHours !== null && Math.abs(personHours) > EPS && output !== null
      ? output / personHours
      : null;
    const rend = Math.abs(totalInput) > EPS && output !== null
      ? (output / totalInput) * 100
      : null;

    return {
      tanggal: resolveTanggal(row.Tanggal),
      shift: Math.trunc(toFloat(row.Shift)),
      namaMesin: String(row.NamaMesin ?? "").trim(),
      cca,
      s4s,
      totalInput,
      output: output ?? 0,
      jam: jam ?? 0,
      org: orgRaw > 0 ? orgRaw : null,
      m3Jam,
      m3JamOrg,
      rend,
      personHours,
    };
  });

  normalized.sort((left, right) => {
    const machine = compareText(left.namaMesin, right.namaMesin);
    if (machine !== 0) return machine;
    const tanggal = compareText(left.tanggal, right.tanggal);
    if (tanggal !== 0) return tanggal;
    return left.shift - right.shift;
  });
  return normalized;
}

/** Controller step: sum a row set into totals, ratios summed not recomputed. */
export function computeConsolidatedTotals(rows: NormalizedRow[]): Totals {
  const totals: Totals = {
    cca: 0,
    s4s: 0,
    totalInput: 0,
    output: 0,
    jam: 0,
    org: 0,
    m3Jam: 0,
    m3JamOrg: 0,
    rend: 0,
  };
  for (const row of rows) {
    totals.cca += row.cca;
    totals.s4s += row.s4s;
    totals.totalInput += row.totalInput;
    totals.output += row.output;
    totals.jam += row.jam;
    totals.org += row.org ?? 0;
    totals.m3Jam += row.m3Jam ?? 0;
    totals.m3JamOrg += row.m3JamOrg ?? 0;
  }
  totals.rend = Math.abs(totals.totalInput) > EPS
    ? (totals.output / totals.totalInput) * 100
    : 0;
  return totals;
}

/** Controller step: group by machine, attaching HK and totals. */
export function groupConsolidatedByMachine(
  rows: NormalizedRow[],
  hk: number,
): MachineGroup[] {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = row.namaMesin === "" ? "MESIN" : row.namaMesin;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .map(([namaMesin, machineRows]) => {
      // Working days: distinct dates with actual activity.
      const workingDates = new Set<string>();
      for (const row of machineRows) {
        if (row.tanggal === "") continue;
        if (
          Math.abs(row.jam) > EPS ||
          Math.abs(row.totalInput) > EPS ||
          Math.abs(row.output) > EPS
        ) {
          workingDates.add(row.tanggal);
        }
      }
      return {
        namaMesin,
        rows: machineRows,
        totals: computeConsolidatedTotals(machineRows),
        hk,
        hkWorking: workingDates.size,
      };
    })
    .sort((left, right) => compareText(left.namaMesin, right.namaMesin));
}

/**
 * Legacy $fmtBlank: one decimal, no thousands separator, blank at ~zero.
 * This mirrors PHP number_format($v, 1, '.', ''), which the shared
 * formatNumber helper cannot express because it always groups thousands.
 */
const fmtBlank = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < EPS) return "";
  return value.toFixed(1);
};

/** Legacy $fmtIntBlank: whole number, blank at <= 0. */
const fmtIntBlank = (value: number | null): string =>
  value === null || value <= 0 ? "" : String(Math.round(value));

const countNonZero = (rows: NormalizedRow[], key: "cca" | "s4s" | "output"): number =>
  rows.reduce(
    (count, row) => (Math.abs(row[key]) > EPS ? count + 1 : count),
    0,
  );

const HEADERS = `<tr class="headers-row">
        <th rowspan="2" style="width: 58px;">Tanggal</th>
        <th rowspan="2" style="width: 40px;">Shift</th>
        <th colspan="3">Input</th>
        <th rowspan="2" style="width: 49px;">Output<br>FJ</th>
        <th rowspan="2" style="width: 44px;">Jam</th>
        <th rowspan="2" style="width: 44px;">Org</th>
        <th rowspan="2" style="width: 49px;">M3/Jam</th>
        <th rowspan="2" style="width: 49px;">M3/jam/<br>Org</th>
        <th rowspan="2" style="width: 49px;">Rend<br>(%)</th>
      </tr>
      <tr class="headers-row">
        <th style="width: 49px;">CCAkhir</th>
        <th style="width: 49px;">S4S</th>
        <th style="width: 49px;">TOTAL</th>
      </tr>`;

const buildMachineTable = (machine: MachineGroup, isLast: boolean, grand: Totals): string => {
  const bodyRows = machine.rows
    .map(
      (row, index) => `<tr class="bounded-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(formatTanggalPendek(row.tanggal))}</td>
        <td class="center">${row.shift}</td>
        <td class="number">${escapeHtml(fmtBlank(row.cca))}</td>
        <td class="number">${escapeHtml(fmtBlank(row.s4s))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(row.totalInput))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(row.output))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(row.jam))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(row.org))}</td>
        <td class="number">${escapeHtml(fmtBlank(row.m3Jam))}</td>
        <td class="number">${escapeHtml(fmtBlank(row.m3JamOrg))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(row.rend))}</td>
      </tr>`,
    )
    .join("\n      ");

  const totals = machine.totals;
  const hkText = machine.hk > 0 ? `HK : ${machine.hk}` : "HK : -";
  const perHk = (value: number): number => (machine.hk > 0 ? value / machine.hk : 0);
  const perActive = (value: number, key: "cca" | "s4s" | "output"): number => {
    const count = countNonZero(machine.rows, key);
    return count > 0 ? value / count : 0;
  };

  const totalsRows = `<tr class="bounded-row totals-row">
        <td colspan="2" class="center">${escapeHtml(hkText)}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.cca))}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.s4s))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.totalInput))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.output))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(totals.jam))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(Math.round(totals.org)))}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.m3Jam))}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.m3JamOrg))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.rend))}</td>
      </tr>
      <tr class="bounded-row totals-row">
        <td colspan="2" class="center">Jmlh/HK</td>
        <td class="number">${escapeHtml(fmtBlank(perActive(totals.cca, "cca")))}</td>
        <td class="number">${escapeHtml(fmtBlank(perActive(totals.s4s, "s4s")))}</td>
        <td class="number">${escapeHtml(fmtBlank(perHk(totals.totalInput)))}</td>
        <td class="number">${escapeHtml(fmtBlank(perActive(totals.output, "output")))}</td>
        <td class="number"></td>
        <td class="number"></td>
        <td class="number"></td>
        <td class="number"></td>
        <td class="number"></td>
      </tr>`;

  const grandTotalRow = isLast
    ? `<tr class="grand-total-row">
        <td colspan="2" class="center">Grand Total</td>
        <td class="number">${escapeHtml(fmtBlank(grand.cca))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.s4s))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.totalInput))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.output))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(Math.round(grand.jam)))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(Math.round(grand.org)))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.m3Jam))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.m3JamOrg))}</td>
        <td class="number">${escapeHtml(fmtBlank(grand.rend))}</td>
      </tr>`
    : "";

  return `<div class="section-title">Nama Mesin : ${escapeHtml(machine.namaMesin)}</div>
  <table class="report-table production-table">
    <thead>
      ${HEADERS}
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(11)}
      ${totalsRows}
      ${grandTotalRow}
    </tbody>
  </table>`;
};

export const rekapProduksiFingerJointConsolidatedReport: ReportDefinition<
  PeriodParams,
  ConsolidatedData
> = {
  type: "rekap-produksi-finger-joint-consolidated",
  title: "Laporan Rekap Produksi Finger Joint Consolidated",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiFingerJointConsolidated");

    const rows = normalizeConsolidatedRows(
      (result.recordset ?? []) as ConsolidatedRow[],
    );
    const hk = hkFromRange(params.tglAwal, params.tglAkhir);
    return {
      hk,
      machines: groupConsolidatedByMachine(rows, hk),
      grandTotals: computeConsolidatedTotals(rows),
    };
  },

  render(data, meta) {
    const bodyHtml = data.machines.length > 0
      ? data.machines
          .map((machine, index) =>
            buildMachineTable(machine, index === data.machines.length - 1, data.grandTotals),
          )
          .join("\n  ")
      : `<table class="report-table production-table">
  <thead>
    ${HEADERS}
  </thead>
  <tbody>${buildEmptyTableRow(11)}</tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi Finger Joint Consolidated",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_produksi_finger_joint_consolidated",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
