import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  MONTHS_SHORT_ID,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { renderWpsReportPage } from "./template";

const EPSILON = 0.0000001;
const STORED_PROCEDURE = "SP_LapRekapProduksiBarangJadiConsolidated";

interface RekapProduksiBarangJadiRow {
  NoProduksi: string | null;
  Tanggal: Date | string | null;
  Shift: number | null;
  NamaMesin: string | null;
  JamKerja: number | null;
  JmlhAnggota: number | null;
  BJ: number | null;
  Moulding: number | null;
  Sanding: number | null;
  WIP: number | null;
  OutputPacking: number | null;
  OutputReproses: number | null;
}

interface ProductionRow {
  tanggal: string;
  shift: number;
  bj: number | null;
  moulding: number | null;
  sanding: number | null;
  totalInput: number;
  outputPacking: number | null;
  outputReproses: number | null;
  totalOutput: number;
  jam: number | null;
  org: number | null;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
}

interface ProductionTotals {
  bj: number;
  moulding: number;
  sanding: number;
  totalInput: number;
  outputPacking: number;
  outputReproses: number;
  totalOutput: number;
  jam: number;
  org: number;
  m3Jam: number | null;
  m3JamOrg: number | null;
  rend: number | null;
}

interface ProductionAverages {
  bj: number;
  moulding: number;
  sanding: number;
  totalInput: number;
  outputPacking: number;
  outputReproses: number;
  totalOutput: number;
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

const MONTH_ALIASES: Readonly<Record<string, number>> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  may: 4,
  jun: 5,
  jul: 6,
  agu: 7,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  des: 11,
  dec: 11,
};

const isPresent = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && Math.abs(value) > EPSILON;

const toLegacyFloat = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
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

const toLegacyInt = (value: unknown): number => {
  const parsed = toLegacyFloat(value);
  return parsed === null ? 0 : Math.trunc(parsed);
};

const roundHalfAwayFromZero = (value: number): number =>
  value < 0 ? -Math.round(-value) : Math.round(value);

const normalizeDate = (value: Date | string | null): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  const isoMatch = /^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/.exec(trimmed);
  if (isoMatch?.[1]) return isoMatch[1];

  const spDateMatch = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(trimmed);
  const month = spDateMatch?.[2].toLowerCase();
  if (spDateMatch && month !== undefined && MONTH_ALIASES[month] !== undefined) {
    const day = spDateMatch[1].padStart(2, "0");
    const monthNumber = String(MONTH_ALIASES[month] + 1).padStart(2, "0");
    return `${spDateMatch[3]}-${monthNumber}-${day}`;
  }

  return "";
};

const formatLegacyDate = (value: Date | string | null): string => {
  const normalized = normalizeDate(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return "";

  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS_SHORT_ID[monthIndex];
  if (month === undefined) return "";

  return `${Number(match[3])}-${month}-${match[1].slice(-2)}`;
};

const compareText = (left: string, right: string): number => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const normalizeProductionRow = (
  raw: RekapProduksiBarangJadiRow,
): ProductionRow => {
  const bj = toLegacyFloat(raw.BJ);
  const moulding = toLegacyFloat(raw.Moulding);
  const sanding = toLegacyFloat(raw.Sanding);
  const wip = toLegacyFloat(raw.WIP);
  const outputPacking = toLegacyFloat(raw.OutputPacking);
  const outputReproses = toLegacyFloat(raw.OutputReproses);
  const rawJam = toLegacyFloat(raw.JamKerja);
  const org = toLegacyInt(raw.JmlhAnggota);

  const totalInput =
    (bj ?? 0) + (moulding ?? 0) + (sanding ?? 0) + (wip ?? 0);
  const totalOutput = (outputPacking ?? 0) + (outputReproses ?? 0);
  const personHours =
    rawJam !== null && Math.abs(rawJam) > EPSILON && org > 0
      ? rawJam * org
      : null;

  return {
    tanggal: normalizeDate(raw.Tanggal),
    shift: toLegacyInt(raw.Shift),
    bj,
    moulding,
    sanding,
    totalInput,
    outputPacking,
    outputReproses,
    totalOutput,
    jam: rawJam === null ? null : roundHalfAwayFromZero(rawJam),
    org: org > 0 ? org : null,
    m3Jam:
      rawJam !== null &&
      Math.abs(rawJam) > EPSILON &&
      isPresent(totalOutput)
        ? totalOutput / rawJam
        : null,
    m3JamOrg:
      personHours !== null &&
      Math.abs(personHours) > EPSILON &&
      isPresent(totalOutput)
        ? totalOutput / personHours
        : null,
    rend:
      isPresent(totalInput) && isPresent(totalOutput)
        ? (totalOutput / totalInput) * 100
        : null,
  };
};

const emptyTotals = (): ProductionTotals => ({
  bj: 0,
  moulding: 0,
  sanding: 0,
  totalInput: 0,
  outputPacking: 0,
  outputReproses: 0,
  totalOutput: 0,
  jam: 0,
  org: 0,
  m3Jam: null,
  m3JamOrg: null,
  rend: null,
});

const addRowToTotals = (totals: ProductionTotals, row: ProductionRow): void => {
  totals.bj += row.bj ?? 0;
  totals.moulding += row.moulding ?? 0;
  totals.sanding += row.sanding ?? 0;
  totals.totalInput += row.totalInput;
  totals.outputPacking += row.outputPacking ?? 0;
  totals.outputReproses += row.outputReproses ?? 0;
  totals.totalOutput += row.totalOutput;
  totals.jam += row.jam ?? 0;
  totals.org += row.org ?? 0;
  totals.m3Jam = (totals.m3Jam ?? 0) + (row.m3Jam ?? 0);
  totals.m3JamOrg = (totals.m3JamOrg ?? 0) + (row.m3JamOrg ?? 0);
};

const calculateMachineTotals = (rows: ProductionRow[]): ProductionTotals => {
  const totals = emptyTotals();
  for (const row of rows) addRowToTotals(totals, row);

  totals.m3Jam =
    Math.abs(totals.jam) > EPSILON && Math.abs(totals.totalOutput) > EPSILON
      ? totals.totalOutput / totals.jam
      : null;
  totals.m3JamOrg =
    Math.abs(totals.jam * totals.org) > EPSILON &&
    Math.abs(totals.totalOutput) > EPSILON
      ? totals.totalOutput / (totals.jam * totals.org)
      : null;
  totals.rend =
    Math.abs(totals.totalInput) > EPSILON &&
    Math.abs(totals.totalOutput) > EPSILON
      ? (totals.totalOutput / totals.totalInput) * 100
      : null;

  return totals;
};

const addMachineToGrandTotals = (
  grand: ProductionTotals,
  machine: ProductionTotals,
): void => {
  grand.bj += machine.bj;
  grand.moulding += machine.moulding;
  grand.sanding += machine.sanding;
  grand.totalInput += machine.totalInput;
  grand.outputPacking += machine.outputPacking;
  grand.outputReproses += machine.outputReproses;
  grand.totalOutput += machine.totalOutput;
  grand.jam += machine.jam;
  grand.org += machine.org;
  grand.m3Jam = (grand.m3Jam ?? 0) + (machine.m3Jam ?? 0);
  grand.m3JamOrg = (grand.m3JamOrg ?? 0) + (machine.m3JamOrg ?? 0);
};

const countNonZero = (
  rows: ProductionRow[],
  value: (row: ProductionRow) => number | null,
): number =>
  rows.reduce((count, row) => count + (isPresent(value(row)) ? 1 : 0), 0);

const averageOverNonZero = (
  rows: ProductionRow[],
  value: (row: ProductionRow) => number | null,
  total: number,
): number => {
  const count = countNonZero(rows, value);
  return count > 0 && isPresent(total) ? total / count : 0;
};

const calculateAverages = (
  rows: ProductionRow[],
  totals: ProductionTotals,
  hk: number,
): ProductionAverages => ({
  bj: averageOverNonZero(rows, (row) => row.bj, totals.bj),
  moulding: averageOverNonZero(rows, (row) => row.moulding, totals.moulding),
  sanding: averageOverNonZero(rows, (row) => row.sanding, totals.sanding),
  totalInput: hk > 0 ? totals.totalInput / hk : 0,
  outputPacking: averageOverNonZero(
    rows,
    (row) => row.outputPacking,
    totals.outputPacking,
  ),
  outputReproses: averageOverNonZero(
    rows,
    (row) => row.outputReproses,
    totals.outputReproses,
  ),
  totalOutput: hk > 0 ? totals.totalOutput / hk : 0,
});

const buildReportData = (rawRows: RekapProduksiBarangJadiRow[]): ReportData => {
  const rowsByMachine = new Map<string, ProductionRow[]>();
  const normalizedRows = rawRows
    .map((row) => ({ row: normalizeProductionRow(row), machine: String(row.NamaMesin ?? "").trim() }))
    .sort((left, right) => {
      const machineComparison = compareText(left.machine, right.machine);
      if (machineComparison !== 0) return machineComparison;
      const dateComparison = compareText(left.row.tanggal, right.row.tanggal);
      if (dateComparison !== 0) return dateComparison;
      return left.row.shift - right.row.shift;
    });

  for (const { row, machine } of normalizedRows) {
    const rows = rowsByMachine.get(machine);
    if (rows) rows.push(row);
    else rowsByMachine.set(machine, [row]);
  }

  const machines: MachineSection[] = [];
  const grandTotals = emptyTotals();

  for (const [name, rows] of rowsByMachine) {
    const distinctDates = new Set(
      rows.map((row) => row.tanggal).filter((date) => date !== ""),
    );
    const hk = distinctDates.size;
    const totals = calculateMachineTotals(rows);
    machines.push({
      name,
      hk,
      rows,
      totals,
      averages: calculateAverages(rows, totals, hk),
    });
    addMachineToGrandTotals(grandTotals, totals);
  }

  // The legacy Blade sums each machine M3 metric directly, but recomputes Rend
  // from the grand total input and output rather than summing percentages.
  grandTotals.rend =
    Math.abs(grandTotals.totalInput) > EPSILON
      ? (grandTotals.totalOutput / grandTotals.totalInput) * 100
      : 0;

  return { machines, grandTotals };
};

const formatDecimal = (value: number | null): string =>
  escapeHtml(formatNumber(value, 1, { blankWhenZero: true }));

const formatPositiveInteger = (value: number | null): string => {
  if (value === null || value <= 0) return "";
  return escapeHtml(String(Math.round(value)));
};

const buildMachineTable = (
  machine: MachineSection,
  grandTotals: ProductionTotals,
  includeGrandTotals: boolean,
): string => {
  const detailRows = machine.rows
    .map(
      (row, index) => `<tr class="data-row bounded-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${escapeHtml(formatLegacyDate(row.tanggal))}</td>
        <td class="center">${escapeHtml(String(row.shift))}</td>
        <td class="number">${formatDecimal(row.bj)}</td>
        <td class="number">${formatDecimal(row.moulding)}</td>
        <td class="number">${formatDecimal(row.sanding)}</td>
        <td class="number" style="font-weight: bold;">${formatDecimal(row.totalInput)}</td>
        <td class="number">${formatDecimal(row.outputPacking)}</td>
        <td class="number">${formatDecimal(row.outputReproses)}</td>
        <td class="number" style="font-weight: bold;">${formatDecimal(row.totalOutput)}</td>
        <td class="number">${formatPositiveInteger(row.jam)}</td>
        <td class="number">${formatPositiveInteger(row.org)}</td>
        <td class="number">${formatDecimal(row.m3Jam)}</td>
        <td class="number">${formatDecimal(row.m3JamOrg)}</td>
        <td class="number" style="font-weight: bold;">${formatDecimal(row.rend)}</td>
      </tr>`,
    )
    .join("\n");

  const totals = machine.totals;
  const totalsRow = `<tr class="bounded-row totals-row">
    <td colspan="2" class="center">${escapeHtml(machine.hk > 0 ? `HK : ${machine.hk}` : "HK : -")}</td>
    <td class="number">${formatDecimal(totals.bj)}</td>
    <td class="number">${formatDecimal(totals.moulding)}</td>
    <td class="number">${formatDecimal(totals.sanding)}</td>
    <td class="number" style="font-weight: bold;">${formatDecimal(totals.totalInput)}</td>
    <td class="number">${formatDecimal(totals.outputPacking)}</td>
    <td class="number">${formatDecimal(totals.outputReproses)}</td>
    <td class="number" style="font-weight: bold;">${formatDecimal(totals.totalOutput)}</td>
    <td class="number">${formatPositiveInteger(totals.jam)}</td>
    <td class="number">${formatPositiveInteger(totals.org)}</td>
    <td class="number">${formatDecimal(totals.m3Jam)}</td>
    <td class="number">${formatDecimal(totals.m3JamOrg)}</td>
    <td class="number" style="font-weight: bold;">${formatDecimal(totals.rend)}</td>
  </tr>`;

  const averages = machine.averages;
  const averageRow = `<tr class="bounded-row totals-row">
    <td colspan="2" class="center">Jmlh/HK</td>
    <td class="number">${formatDecimal(averages.bj)}</td>
    <td class="number">${formatDecimal(averages.moulding)}</td>
    <td class="number">${formatDecimal(averages.sanding)}</td>
    <td class="number">${formatDecimal(averages.totalInput)}</td>
    <td class="number">${formatDecimal(averages.outputPacking)}</td>
    <td class="number">${formatDecimal(averages.outputReproses)}</td>
    <td class="number">${formatDecimal(averages.totalOutput)}</td>
    <td class="number"></td>
    <td class="number"></td>
    <td class="number"></td>
    <td class="number"></td>
    <td class="number"></td>
  </tr>`;

  const grandTotalRow = includeGrandTotals
    ? `<tr class="grand-total-row">
        <td colspan="2" class="center">Grand Total</td>
        <td class="number">${formatDecimal(grandTotals.bj)}</td>
        <td class="number">${formatDecimal(grandTotals.moulding)}</td>
        <td class="number">${formatDecimal(grandTotals.sanding)}</td>
        <td class="number">${formatDecimal(grandTotals.totalInput)}</td>
        <td class="number">${formatDecimal(grandTotals.outputPacking)}</td>
        <td class="number">${formatDecimal(grandTotals.outputReproses)}</td>
        <td class="number">${formatDecimal(grandTotals.totalOutput)}</td>
        <td class="number">${formatPositiveInteger(grandTotals.jam)}</td>
        <td class="number">${formatPositiveInteger(grandTotals.org)}</td>
        <td class="number">${formatDecimal(grandTotals.m3Jam)}</td>
        <td class="number">${formatDecimal(grandTotals.m3JamOrg)}</td>
        <td class="number">${formatDecimal(grandTotals.rend)}</td>
      </tr>`
    : "";

  return `<div class="production-section-title">Nama Mesin : ${escapeHtml(machine.name)}</div>
  <table class="production-table">
    <thead>
      <tr class="headers-row">
        <th rowspan="2" style="width: 62px;">Tanggal</th>
        <th rowspan="2" style="width: 40px;">Shift</th>
        <th colspan="4">Input</th>
        <th colspan="3">Output</th>
        <th rowspan="2" style="width: 40px;">Jam</th>
        <th rowspan="2" style="width: 38px;">Org</th>
        <th rowspan="2" style="width: 55px;">M3/Jam</th>
        <th rowspan="2" style="width: 60px;">M3/jam/<br>Org</th>
        <th rowspan="2" style="width: 55px;">Rend<br>(%)</th>
      </tr>
      <tr class="headers-row">
        <th style="width: 55px;">BJ</th>
        <th style="width: 55px;">Moulding</th>
        <th style="width: 55px;">Sanding</th>
        <th style="width: 58px;">TOTAL</th>
        <th style="width: 55px;">Packing</th>
        <th style="width: 55px;">Reproses</th>
        <th style="width: 58px;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
      ${totalsRow}
      ${averageRow}
      ${grandTotalRow}
    </tbody>
  </table>`;
};

const REPORT_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .production-section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  table.production-table {
    width: 100%;
    margin-bottom: 0;
    border-collapse: collapse;
    table-layout: fixed;
    page-break-inside: auto;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
  }
  .production-table th,
  .production-table td {
    border: 0;
    border-left: 1px solid #000;
    border-right: 1px solid #000;
    padding: 2px 3px;
    vertical-align: middle;
  }
  .production-table th {
    text-align: center;
    font-weight: bold;
    font-size: 11px;
    border-bottom: 1px solid #000;
    background: #ffffff;
    color: #000;
  }
  .production-table tbody td {
    border-top: 0;
    border-bottom: 0;
  }
  /* Keep dates ("1-Sep-26") and figures on a single line in the narrow columns. */
  .production-table td,
  .production-table th { white-space: nowrap; }
  .production-table td.number {
    text-align: right;
    white-space: nowrap;
    font-family: Calibri, "DejaVu Sans", sans-serif;
  }
  .production-table .row-odd td { background: #c9d1df; }
  .production-table .row-even td { background: #eef2f8; }
  .production-table .totals-row td {
    font-weight: bold;
    font-size: 11px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    background: #ffffff;
  }
  .production-table .grand-total-row td {
    font-weight: bold;
    font-size: 12px;
    border-top: 1px solid #000;
    border-right: 0;
    border-bottom: 2px solid #000;
    border-left: 0;
    background: #ffffff;
  }
`;

export const rekapProduksiBarangJadiConsolidatedReport: ReportDefinition<
  PeriodParams,
  ReportData
> = {
  type: "rekap-produksi-barang-jadi-consolidated",
  title: "Laporan Rekap Produksi Packing Consolidated",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const connection = await pool;
    const result = await connection
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute(STORED_PROCEDURE);

    const rows = (result.recordset ?? []) as RekapProduksiBarangJadiRow[];
    return buildReportData(rows);
  },

  render(data, meta) {
    const subtitle = `Periode ${formatLegacyDate(meta.params.tglAwal)} s/d ${formatLegacyDate(meta.params.tglAkhir)}`;
    const bodyHtml = data.machines
      .map((machine, index) =>
        buildMachineTable(
          machine,
          data.grandTotals,
          index === data.machines.length - 1,
        ),
      )
      .join("\n");

    return renderWpsReportPage({
      title: "Laporan Rekap Produksi Packing Consolidated",
      subtitle,
      bodyHtml,
      landscape: true,
      extraCss: REPORT_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
