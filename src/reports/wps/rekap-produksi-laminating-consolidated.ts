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
 * SP_LapRekapProduksiLaminatingConsolidated — "Laporan Rekap Produksi
 * Laminating Consolidated". Ported from
 * RekapProduksiLaminatingConsolidatedReportService +
 * rekap-produksi-laminating-consolidated-pdf.blade.php.
 *
 * Like the Finger Joint consolidated report, the legacy chain splits the work
 * across service, controller and blade, and all three steps are reproduced here
 * in the same order.
 *
 * Three details differ from the Finger Joint version and are followed as-is,
 * because the two reference reports genuinely differ:
 *  - HK is the machine's row count (date x shift), not calendar days in range;
 *  - the totals' M3/Jam and M3/jam/Org are averaged over the rows rather than
 *    summed;
 *  - the input block is BJ / CCAkhir / Moulding / Reproses / Sanding / TOTAL.
 *
 * The SP also returns a "Wip" column that the legacy service never reads, so it
 * is not displayed, matching the legacy output.
 */

interface ConsolidatedRow extends Record<string, unknown> {
  Tanggal: Date | string | null;
  Shift: number | null;
  NamaMesin: string | null;
  JamKerja: number | string | null;
  JmlhAnggota: number | string | null;
  BJ: number | string | null;
  CCAkhir: number | string | null;
  Moulding: number | string | null;
  Reproses: number | string | null;
  Sanding: number | string | null;
  OutputLaminating: number | string | null;
}

/** Input columns, in legacy display order. */
const INPUT_KEYS = ["bj", "ccAkhir", "moulding", "reproses", "sanding"] as const;
type InputKey = (typeof INPUT_KEYS)[number];

interface NormalizedRow {
  tanggal: string;
  shift: number;
  namaMesin: string;
  inputs: Record<InputKey, number>;
  totalInput: number;
  output: number;
  jam: number;
  org: number | null;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
}

interface Totals {
  inputs: Record<InputKey, number>;
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
  /** Row count for this machine (date x shift), used as HK. */
  hk: number;
  /** Distinct dates with activity, kept for parity with the reference report. */
  hkWorking: number;
}

interface ConsolidatedData {
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

/** Service step: per-row ratios plus the stable display sort. */
export function normalizeLaminatingRows(rows: ConsolidatedRow[]): NormalizedRow[] {
  const normalized = rows.map((row) => {
    const inputs: Record<InputKey, number> = {
      bj: toFloat(row.BJ),
      ccAkhir: toFloat(row.CCAkhir),
      moulding: toFloat(row.Moulding),
      reproses: toFloat(row.Reproses),
      sanding: toFloat(row.Sanding),
    };
    const output = toFloatOrNull(row.OutputLaminating);
    const jam = toFloatOrNull(row.JamKerja);
    const orgRaw = Math.trunc(toFloat(row.JmlhAnggota));
    const totalInput = INPUT_KEYS.reduce((sum, key) => sum + inputs[key], 0);

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
      inputs,
      totalInput,
      output: output ?? 0,
      jam: jam ?? 0,
      org: orgRaw > 0 ? orgRaw : null,
      m3Jam,
      m3JamOrg,
      rend,
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

/** Controller step: ratios are averaged over the rows, not summed. */
export function computeLaminatingTotals(rows: NormalizedRow[]): Totals {
  const inputs: Record<InputKey, number> = {
    bj: 0,
    ccAkhir: 0,
    moulding: 0,
    reproses: 0,
    sanding: 0,
  };
  let totalInput = 0;
  let output = 0;
  let jam = 0;
  let org = 0;
  let m3JamSum = 0;
  let m3JamOrgSum = 0;

  for (const row of rows) {
    for (const key of INPUT_KEYS) inputs[key] += row.inputs[key];
    totalInput += row.totalInput;
    output += row.output;
    jam += row.jam;
    org += row.org ?? 0;
    m3JamSum += row.m3Jam ?? 0;
    m3JamOrgSum += row.m3JamOrg ?? 0;
  }

  const rowCount = rows.length;
  return {
    inputs,
    totalInput,
    output,
    jam,
    org,
    m3Jam: rowCount > 0 ? m3JamSum / rowCount : 0,
    m3JamOrg: rowCount > 0 ? m3JamOrgSum / rowCount : 0,
    rend: Math.abs(totalInput) > EPS ? (output / totalInput) * 100 : 0,
  };
}

/** Controller step: group by machine. HK is the machine's row count. */
export function groupLaminatingByMachine(rows: NormalizedRow[]): MachineGroup[] {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = row.namaMesin === "" ? "MESIN" : row.namaMesin;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .map(([namaMesin, machineRows]) => {
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
        totals: computeLaminatingTotals(machineRows),
        hk: machineRows.length,
        hkWorking: workingDates.size,
      };
    })
    .sort((left, right) => compareText(left.namaMesin, right.namaMesin));
}

/** Legacy $fmtBlank: one decimal, no thousands separator, blank at ~zero. */
const fmtBlank = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < EPS) return "";
  return value.toFixed(1);
};

/** Legacy $fmtIntBlank: whole number, blank at <= 0. */
const fmtIntBlank = (value: number | null): string =>
  value === null || value <= 0 ? "" : String(Math.round(value));

const countNonZero = (rows: NormalizedRow[], key: InputKey | "output"): number =>
  rows.reduce(
    (count, row) => {
      const value = key === "output" ? row.output : row.inputs[key];
      return Math.abs(value) > EPS ? count + 1 : count;
    },
    0,
  );

const HEADERS = `<tr class="headers-row">
        <th rowspan="2" style="width: 58px;">Tanggal</th>
        <th rowspan="2" style="width: 40px;">Shift</th>
        <th colspan="6">Input</th>
        <th rowspan="2" style="width: 58px;">Output<br>Laminating</th>
        <th rowspan="2" style="width: 44px;">Jam</th>
        <th rowspan="2" style="width: 44px;">Org</th>
        <th rowspan="2" style="width: 49px;">M3/Jam</th>
        <th rowspan="2" style="width: 49px;">M3/jam/<br>Org</th>
        <th rowspan="2" style="width: 49px;">Rend<br>(%)</th>
      </tr>
      <tr class="headers-row">
        <th style="width: 49px;">BJ</th>
        <th style="width: 49px;">CCAkhir</th>
        <th style="width: 49px;">Moulding</th>
        <th style="width: 49px;">Reproses</th>
        <th style="width: 49px;">Sanding</th>
        <th style="width: 49px;">TOTAL</th>
      </tr>`;

const buildMachineTable = (
  machine: MachineGroup,
  isLast: boolean,
  grand: Totals,
): string => {
  const bodyRows = machine.rows
    .map(
      (row, index) => `<tr class="bounded-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(formatTanggalPendek(row.tanggal))}</td>
        <td class="center">${row.shift}</td>
        ${INPUT_KEYS.map((key) => `<td class="number">${escapeHtml(fmtBlank(row.inputs[key]))}</td>`).join("\n        ")}
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
  const perActive = (value: number, key: InputKey | "output"): number => {
    const count = countNonZero(machine.rows, key);
    return count > 0 ? value / count : 0;
  };

  const totalsRows = `<tr class="bounded-row totals-row">
        <td colspan="2" class="center">${escapeHtml(hkText)}</td>
        ${INPUT_KEYS.map((key) => `<td class="number">${escapeHtml(fmtBlank(totals.inputs[key]))}</td>`).join("\n        ")}
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.totalInput))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.output))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(Math.round(totals.jam)))}</td>
        <td class="number">${escapeHtml(fmtIntBlank(Math.round(totals.org)))}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.m3Jam))}</td>
        <td class="number">${escapeHtml(fmtBlank(totals.m3JamOrg))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtBlank(totals.rend))}</td>
      </tr>
      <tr class="bounded-row totals-row">
        <td colspan="2" class="center">Jmlh/HK</td>
        ${INPUT_KEYS.map((key) => `<td class="number">${escapeHtml(fmtBlank(perActive(totals.inputs[key], key)))}</td>`).join("\n        ")}
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
        ${INPUT_KEYS.map((key) => `<td class="number">${escapeHtml(fmtBlank(grand.inputs[key]))}</td>`).join("\n        ")}
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
      ${bodyRows || buildEmptyTableRow(15)}
      ${totalsRows}
      ${grandTotalRow}
    </tbody>
  </table>`;
};

export const rekapProduksiLaminatingConsolidatedReport: ReportDefinition<
  PeriodParams,
  ConsolidatedData
> = {
  type: "rekap-produksi-laminating-consolidated",
  title: "Laporan Rekap Produksi Laminating Consolidated",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapProduksiLaminatingConsolidated");

    const rows = normalizeLaminatingRows(
      (result.recordset ?? []) as ConsolidatedRow[],
    );
    return {
      machines: groupLaminatingByMachine(rows),
      grandTotals: computeLaminatingTotals(rows),
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
  <tbody>${buildEmptyTableRow(15)}</tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi Laminating Consolidated",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_produksi_laminating_consolidated",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
