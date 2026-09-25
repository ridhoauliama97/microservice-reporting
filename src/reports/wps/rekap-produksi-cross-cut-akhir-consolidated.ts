import sql from "mssql";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { renderWpsReportPage } from "./template";

/**
 * SP_LapRekapProduksiCrossCutAkhirConsolidated — "Laporan Rekap Produksi
 * CCAkhir Consolidated". Ported from the legacy service and Blade.
 *
 * The input total includes six sources: BJ, FJ, Laminating, Moulding,
 * Reproses, and Wip. Wip is part of the total but is not displayed as its own
 * column, matching the legacy header. The legacy output also calculates
 * per-row M3/Jam, M3/Jam/Org, and Rend; machine totals recompute those ratios
 * from their aggregate input/output/hours, and Grand Total recomputes Rend
 * from the grand totals.
 */

const EPSILON = 0.0000001;
const STORED_PROCEDURE = "SP_LapRekapProduksiCrossCutAkhirConsolidated";

interface ConsolidatedRow extends Record<string, unknown> {
  Tanggal: Date | string | null;
  Shift: number | string | null;
  NamaMesin: string | null;
  JamKerja: number | string | null;
  JmlhAnggota: number | string | null;
  BJ: number | string | null;
  FJ: number | string | null;
  Laminating: number | string | null;
  Moulding: number | string | null;
  Reproses: number | string | null;
  Wip: number | string | null;
  OutputCCAkhir: number | string | null;
}

interface ProductionRow {
  tanggal: string;
  shift: number;
  bj: number | null;
  fj: number | null;
  laminating: number | null;
  moulding: number | null;
  reproses: number | null;
  wip: number | null;
  totalInput: number;
  output: number | null;
  jam: number | null;
  org: number | null;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
}

interface ProductionTotals {
  bj: number;
  fj: number;
  laminating: number;
  moulding: number;
  reproses: number;
  wip: number;
  totalInput: number;
  output: number;
  jam: number;
  org: number;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
}

interface ProductionAverages {
  bj: number;
  fj: number;
  laminating: number;
  moulding: number;
  reproses: number;
  totalInput: number;
  output: number;
}

interface MachineSection {
  name: string;
  hk: number;
  rows: ProductionRow[];
  totals: ProductionTotals;
  averages: ProductionAverages;
}

interface ReportData {
  machines: MachineSection[];
  grandTotals: ProductionTotals;
}

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replaceAll(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(",", ".");
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInt = (value: unknown): number => Math.trunc(toFloat(value) ?? 0);

const normalizeDate = (value: Date | string | null): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? "";
};

const formatDate = (value: string): string =>
  formatTanggalId(value).replace(/(\d{2})\d{2}$/, "$1");

/** Legacy number format: one decimal, no thousands separator, blank at zero. */
const fmtOne = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < EPSILON) return "";
  return value.toFixed(1);
};

const fmtTwo = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < EPSILON) return "";
  return value.toFixed(2);
};

/** Legacy integer format: only positive values are shown, without separators. */
const fmtInt = (value: number | null): string => {
  if (value === null || value <= 0) return "";
  return String(Math.round(value));
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isPresent = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && Math.abs(value) > EPSILON;

const normalizeRow = (raw: ConsolidatedRow): ProductionRow => {
  const bj = toFloat(raw.BJ);
  const fj = toFloat(raw.FJ);
  const laminating = toFloat(raw.Laminating);
  const moulding = toFloat(raw.Moulding);
  const reproses = toFloat(raw.Reproses);
  const wip = toFloat(raw.Wip);
  const output = toFloat(raw.OutputCCAkhir);
  const jam = toFloat(raw.JamKerja);
  const org = toInt(raw.JmlhAnggota);
  const totalInput = (bj ?? 0) + (fj ?? 0) + (laminating ?? 0) +
    (moulding ?? 0) + (reproses ?? 0) + (wip ?? 0);
  const personHours = jam !== null && Math.abs(jam) > EPSILON && org > 0
    ? jam * org
    : null;

  return {
    tanggal: normalizeDate(raw.Tanggal),
    shift: toInt(raw.Shift),
    bj,
    fj,
    laminating,
    moulding,
    reproses,
    wip,
    totalInput,
    output,
    jam,
    org: org > 0 ? org : null,
    m3Jam: isPresent(jam) && isPresent(output) ? output / jam : null,
    m3JamOrg: personHours !== null && isPresent(output)
      ? output / personHours
      : null,
    rend: isPresent(totalInput) && isPresent(output)
      ? (output / totalInput) * 100
      : null,
  };
};

const emptyTotals = (): ProductionTotals => ({
  bj: 0,
  fj: 0,
  laminating: 0,
  moulding: 0,
  reproses: 0,
  wip: 0,
  totalInput: 0,
  output: 0,
  jam: 0,
  org: 0,
  m3Jam: null,
  m3JamOrg: null,
  rend: null,
});

const addRowToTotals = (totals: ProductionTotals, row: ProductionRow): void => {
  totals.bj += row.bj ?? 0;
  totals.fj += row.fj ?? 0;
  totals.laminating += row.laminating ?? 0;
  totals.moulding += row.moulding ?? 0;
  totals.reproses += row.reproses ?? 0;
  totals.wip += row.wip ?? 0;
  totals.totalInput += row.totalInput;
  totals.output += row.output ?? 0;
  totals.jam += row.jam ?? 0;
  totals.org += row.org ?? 0;
};

const calculateTotals = (rows: ProductionRow[]): ProductionTotals => {
  const totals = emptyTotals();
  let m3JamSum = 0;
  let m3JamOrgSum = 0;
  for (const row of rows) {
    addRowToTotals(totals, row);
    m3JamSum += row.m3Jam ?? 0;
    m3JamOrgSum += row.m3JamOrg ?? 0;
  }
  // The legacy controller averages the per-row M3 metrics, rather than
  // recalculating them from aggregate output and hours.
  totals.m3Jam = rows.length > 0 ? m3JamSum / rows.length : 0;
  totals.m3JamOrg = rows.length > 0 ? m3JamOrgSum / rows.length : 0;
  totals.rend = Math.abs(totals.totalInput) > EPSILON
    ? (totals.output / totals.totalInput) * 100
    : 0;
  return totals;
};

const countNonZero = (rows: ProductionRow[], value: (row: ProductionRow) => number | null): number =>
  rows.reduce((count, row) => count + (isPresent(value(row)) ? 1 : 0), 0);

const averageOverNonZero = (
  rows: ProductionRow[],
  value: (row: ProductionRow) => number | null,
  total: number,
): number => {
  const count = countNonZero(rows, value);
  return count > 0 && isPresent(total) ? total / count : 0;
};

const calculateAverages = (rows: ProductionRow[], totals: ProductionTotals, hk: number): ProductionAverages => ({
  bj: averageOverNonZero(rows, (row) => row.bj, totals.bj),
  fj: averageOverNonZero(rows, (row) => row.fj, totals.fj),
  laminating: averageOverNonZero(rows, (row) => row.laminating, totals.laminating),
  moulding: averageOverNonZero(rows, (row) => row.moulding, totals.moulding),
  reproses: averageOverNonZero(rows, (row) => row.reproses, totals.reproses),
  totalInput: hk > 0 ? totals.totalInput / hk : 0,
  output: averageOverNonZero(rows, (row) => row.output, totals.output),
});

const buildReportData = (rawRows: ConsolidatedRow[]): ReportData => {
  const rowsByMachine = new Map<string, ProductionRow[]>();
  const sorted = rawRows
    .map((raw) => ({
      row: normalizeRow(raw),
      machine: String(raw.NamaMesin ?? "").trim() || "MESIN",
    }))
    .sort((left, right) => {
      const machine = compareText(left.machine, right.machine);
      if (machine !== 0) return machine;
      const date = compareText(left.row.tanggal, right.row.tanggal);
      if (date !== 0) return date;
      return left.row.shift - right.row.shift;
    });

  for (const { row, machine } of sorted) {
    const bucket = rowsByMachine.get(machine);
    if (bucket) bucket.push(row);
    else rowsByMachine.set(machine, [row]);
  }

  const normalizedRows = sorted.map(({ row }) => row);
  const grandTotals = calculateTotals(normalizedRows);
  const machines: MachineSection[] = [];
  for (const [name, rows] of rowsByMachine) {
    const hk = rows.length;
    const totals = calculateTotals(rows);
    machines.push({ name, hk, rows, totals, averages: calculateAverages(rows, totals, hk) });
  }

  return { machines, grandTotals };
};

const rowCells = (row: ProductionRow): string => `
      <td class="number">${escapeHtml(fmtOne(row.bj))}</td>
      <td class="number">${escapeHtml(fmtOne(row.fj))}</td>
      <td class="number">${escapeHtml(fmtOne(row.laminating))}</td>
      <td class="number">${escapeHtml(fmtOne(row.moulding))}</td>
      <td class="number">${escapeHtml(fmtOne(row.reproses))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(row.totalInput))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(row.output))}</td>
      <td class="number">${escapeHtml(fmtInt(row.jam))}</td>
      <td class="number">${escapeHtml(fmtInt(row.org))}</td>
      <td class="number">${escapeHtml(fmtOne(row.m3Jam))}</td>
      <td class="number">${escapeHtml(fmtOne(row.m3JamOrg))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(row.rend))}</td>`;

const totalsCells = (totals: ProductionTotals, ratioWithTwo = false): string => `
      <td class="number">${escapeHtml(fmtOne(totals.bj))}</td>
      <td class="number">${escapeHtml(fmtOne(totals.fj))}</td>
      <td class="number">${escapeHtml(fmtOne(totals.laminating))}</td>
      <td class="number">${escapeHtml(fmtOne(totals.moulding))}</td>
      <td class="number">${escapeHtml(fmtOne(totals.reproses))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(totals.totalInput))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(totals.output))}</td>
      <td class="number">${escapeHtml(fmtInt(totals.jam))}</td>
      <td class="number">${escapeHtml(fmtInt(totals.org))}</td>
      <td class="number">${escapeHtml(fmtOne(totals.m3Jam))}</td>
      <td class="number">${escapeHtml(ratioWithTwo ? fmtTwo(totals.m3JamOrg) : fmtOne(totals.m3JamOrg))}</td>
      <td class="number" style="font-weight: bold;">${escapeHtml(fmtOne(totals.rend))}</td>`;

const buildMachineTable = (machine: MachineSection, grand: ProductionTotals, last: boolean): string => {
  const detailRows = machine.rows.map((row, index) => `<tr class="data-row bounded-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(formatDate(row.tanggal))}</td>
        <td class="center">${escapeHtml(String(row.shift))}</td>
        ${rowCells(row)}
      </tr>`).join("\n      ");

  const averages = machine.averages;
  const averageRow = `<tr class="data-row totals-row bounded-row">
        <td colspan="2" class="center">Jmlh/HK</td>
        <td class="number">${escapeHtml(fmtOne(averages.bj))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.fj))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.laminating))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.moulding))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.reproses))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.totalInput))}</td>
        <td class="number">${escapeHtml(fmtOne(averages.output))}</td>
        <td class="number"></td><td class="number"></td><td class="number"></td><td class="number"></td><td class="number"></td>
      </tr>`;

  const grandRow = last ? `<tr class="grand-total-row">
        <td colspan="2" class="center">Grand Total</td>
        ${totalsCells(grand, true)}
      </tr>` : "";

  return `<div class="production-section-title">Nama Mesin : ${escapeHtml(machine.name)}</div>
  <table class="production-table">
    <thead>
      <tr class="headers-row">
        <th rowspan="2" style="width: 9%;">Tanggal</th>
        <th rowspan="2" style="width: 4.5%;">Shift</th>
        <th colspan="6">Input</th>
        <th rowspan="2" style="width: 9%;">Output<br>CCAkhir</th>
        <th rowspan="2" style="width: 5%;">Jam</th>
        <th rowspan="2" style="width: 5%;">Org</th>
        <th rowspan="2" style="width: 8%;">M3/Jam</th>
        <th rowspan="2" style="width: 10%;">M3/jam/<br>Org</th>
        <th rowspan="2" style="width: 6.9%;">Rend<br>(%)</th>
      </tr>
      <tr class="headers-row">
        <th style="width: 7.1%;">BJ</th>
        <th style="width: 7.1%;">FJ</th>
        <th style="width: 7.1%;">Laminating</th>
        <th style="width: 7.1%;">Moulding</th>
        <th style="width: 7.1%;">Reproses</th>
        <th style="width: 7.1%;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
      <tr class="totals-row bounded-row">
        <td colspan="2" class="center">HK : ${machine.hk > 0 ? machine.hk : "-"}</td>
        ${totalsCells(machine.totals)}
      </tr>
      ${averageRow}
      ${grandRow}
    </tbody>
  </table>`;
};

const REPORT_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .production-section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  table.production-table { width: 100%; margin-bottom: 0; border-collapse: collapse; table-layout: fixed; page-break-inside: auto; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .production-table th, .production-table td { border: 0; border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
  .production-table th { text-align: center; font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; background: #fff; }
  .production-table tbody td { border-top: 0; border-bottom: 0; }
  .production-table td, .production-table th { white-space: nowrap; }
  .production-table td.number { text-align: right; font-family: Calibri, "DejaVu Sans", sans-serif; }
  .production-table tbody tr.row-odd td { background: #c9d1df; }
  .production-table tbody tr.row-even td { background: #eef2f8; }
  .production-table .totals-row td { font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; background: #fff; }
  .production-table .grand-total-row td { font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-right: 0 !important; border-bottom: 2px solid #000; border-left: 0 !important; background: #fff; }
`;

export const rekapProduksiCrossCutAkhirConsolidatedReport: ReportDefinition<
  PeriodParams,
  ReportData
> = {
  type: "rekap-produksi-cross-cut-akhir-consolidated",
  title: "Laporan Rekap Produksi CCAkhir Consolidated",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute(STORED_PROCEDURE);
    const recordset = Array.isArray(result.recordsets)
      ? result.recordsets[0] ?? result.recordset ?? []
      : result.recordset ?? [];
    return buildReportData(recordset as ConsolidatedRow[]);
  },

  render(data, meta) {
    const subtitle = `Periode ${formatDate(meta.params.tglAwal)} s/d ${formatDate(meta.params.tglAkhir)}`;
    const bodyHtml = data.machines.length > 0
      ? data.machines.map((machine, index) =>
          buildMachineTable(machine, data.grandTotals, index === data.machines.length - 1),
        ).join("\n  ")
      : `<table class="production-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi CCAkhir Consolidated",
      subtitle,
      bodyHtml,
      landscape: true,
      extraCss: REPORT_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
