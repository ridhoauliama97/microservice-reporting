import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * Special-case report (legacy pivot layout): supplier x group matrix with
 * Ton + % per group, Jumlah Truk, Total (Ton), Rasio, group ratio notes and
 * the operational capacity notes. Ported from
 * open-api-report's PenerimaanKayuBulatPerSupplierGroupReportService +
 * penerimaan-per-supplier-group-pdf.blade.php. The SP returns one row per
 * supplier x group; we pivot it per supplier.
 */

const workingDaysBetween = (startIso: string, endIso: string): number => {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  const [a, b] = start <= end ? [start, end] : [end, start];
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
};

/** Legacy operational constants (unchanged reference notes). */
const MEJA_CAPACITY_TON_PER_DAY = 3.52;
const CONTAINER_NEED_TON_PER_MONTH = 137.0;
const ST_PER_CONTAINER_TON = 58.0;
const RACIP_CAPACITY_TON_PER_MEJA_PER_DAY = 3.0;
const AVAILABLE_MEJA = 10;

const fmtTon = (value: number | null | undefined): string => formatNumber(value, 4);

const fmtTonBlankZero = (value: number | null | undefined): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const fmtRatio = (value: number | null | undefined): string =>
  `${formatNumber(value, 1)}%`;

const fmtRatioBlankZero = (value: number | null | undefined): string => {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.abs(num) < 0.0000001 ? "" : fmtRatio(num);
};

const fmtSize = (value: number): string => formatNumber(value, 2);

const fmtInt = (value: number): string => formatNumber(value, 0);

const mejaFixed = (value: number): string => formatNumber(value, 4);
const containerFixed = (value: number): string => formatNumber(value, 0);
const racipFixed = (value: number): string => formatNumber(value, 1);

interface PivotData {
  groupNames: string[];
  suppliers: Array<{
    supplier: string;
    trucks: number;
    groups: Record<string, { ton: number; ratio: number }>;
    totalTon: number;
    ratio: number;
  }>;
  groupTotals: Record<string, number>;
  summary: {
    totalSuppliers: number;
    totalTrucks: number;
    totalTon: number;
    workingDays: number;
    dailyTon: number;
    estimated25DaysTon: number;
  };
}

function buildPivot(
  rows: Array<Record<string, unknown>>,
  workingDays: number,
): PivotData {
  // SP rows are one per supplier x group — pivot them per supplier.
  const map = new Map<
    string,
    { supplier: string; trucks: number; groups: Record<string, number>; totalTon: number }
  >();
  for (const raw of rows) {
    const supplier = String(raw.NmSupplier ?? "").trim() || "Tanpa Supplier";
    let item = map.get(supplier);
    if (!item) {
      item = { supplier, trucks: 0, groups: {}, totalTon: 0 };
      map.set(supplier, item);
    }
    // Truck value is supplier-level; take the max to avoid double counting.
    const truckValue = Number(raw.NoTrukMax ?? 0);
    item.trucks = Math.max(item.trucks, Number.isFinite(truckValue) ? truckValue : 0);
    const groupName = String(raw.Group ?? "").trim().toUpperCase() || "GROUP";
    const ton = typeof raw.KBMasuk === "number" && Number.isFinite(raw.KBMasuk) ? raw.KBMasuk : 0;
    item.groups[groupName] = (item.groups[groupName] ?? 0) + ton;
    item.totalTon += ton;
  }

  let grandTotalTon = 0;
  let grandTotalTrucks = 0;
  const groupTotals: Record<string, number> = {};
  const groupNames: string[] = [];

  const rawItems = [...map.values()].sort((a, b) =>
    a.supplier.toLowerCase().localeCompare(b.supplier.toLowerCase()),
  );
  for (const item of rawItems) {
    grandTotalTon += item.totalTon;
    grandTotalTrucks += item.trucks;
    for (const [groupName, ton] of Object.entries(item.groups)) {
      if (!(groupName in groupTotals)) groupNames.push(groupName);
      groupTotals[groupName] = (groupTotals[groupName] ?? 0) + ton;
    }
  }
  groupNames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // Second pass: build the final cells with ratios (supplier + per group).
  const suppliers: PivotData["suppliers"] = rawItems.map((item) => {
    const groups: Record<string, { ton: number; ratio: number }> = {};
    for (const [groupName, ton] of Object.entries(item.groups)) {
      groups[groupName] = {
        ton,
        ratio: item.totalTon > 0 ? (ton / item.totalTon) * 100 : 0,
      };
    }
    return {
      supplier: item.supplier,
      trucks: item.trucks,
      groups,
      totalTon: item.totalTon,
      ratio: grandTotalTon > 0 ? (item.totalTon / grandTotalTon) * 100 : 0,
    };
  });

  const dailyTon = workingDays > 0 ? grandTotalTon / workingDays : 0;

  return {
    groupNames,
    suppliers,
    groupTotals,
    summary: {
      totalSuppliers: suppliers.length,
      totalTrucks: Math.round(grandTotalTrucks),
      totalTon: grandTotalTon,
      workingDays,
      dailyTon,
      estimated25DaysTon: dailyTon * 25,
    },
  };
}


export const penerimaanKayuBulatPerSupplierGroupReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "penerimaan-kayu-bulat-per-supplier-group",
  title: "Laporan Penerimaan Kayu Bulat Per-Supplier Berdasarkan Group Kayu",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapPenerimaanKBPerSupplierGroup");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const workingDays = workingDaysBetween(meta.params.tglAwal, meta.params.tglAkhir);

    const { groupNames, suppliers, groupTotals, summary } = buildPivot(rows, workingDays);

    const groupHeader = groupNames
      .map((name) => `<th colspan="2">${escapeHtml(name)}</th>`)
      .join("");
    const groupSubHeader = groupNames
      .map(() => `<th style="width: 10%;">Ton</th><th style="width: 10%;">%</th>`)
      .join("");

    const bodyRows = suppliers
      .map(
        (supplier, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(supplier.supplier)}</td>
        <td class="center">${supplier.trucks}</td>
        ${groupNames
          .map(
            (name) => `<td class="number">${fmtTonBlankZero(supplier.groups[name]?.ton ?? 0)}</td>
        <td class="number">${fmtRatioBlankZero(supplier.groups[name]?.ratio ?? 0)}</td>`,
          )
          .join("\n        ")}
        <td class="number" style="font-weight: bold;">${fmtTonBlankZero(supplier.totalTon)}</td>
        <td class="number" style="font-weight: bold;">${fmtRatioBlankZero(supplier.ratio)}</td>
      </tr>`,
      )
      .join("\n    ");

    const totalTon = summary.totalTon;
    const groupTotalCells = groupNames
      .map((name) => {
        const groupTotal = groupTotals[name] ?? 0;
        const share = totalTon > 0 ? (groupTotal / totalTon) * 100 : 0;
        return `<td class="number">${fmtTon(groupTotal)}</td><td class="number">${fmtRatio(share)}</td>`;
      })
      .join("");

    const ratioLines = groupNames
      .map((name) => {
        const groupTotal = groupTotals[name] ?? 0;
        const share = totalTon > 0 ? (groupTotal / totalTon) * 100 : 0;
        return `<tr><td style="width: 160px;">Rasio ${escapeHtml(name)}</td><td style="width: 20px;" class="center">=</td><td class="number" style="width: 100px;">${fmtRatio(share)}</td><td></td></tr>`;
      })
      .join("\n");

    const neededMejaPerDay = summary.dailyTon / MEJA_CAPACITY_TON_PER_DAY;
    const neededStPerDay =
      summary.workingDays > 0 ? CONTAINER_NEED_TON_PER_MONTH / summary.workingDays : 0;
    const neededSt2ContainersPerDay =
      summary.workingDays > 0 ? (ST_PER_CONTAINER_TON * 2) / summary.workingDays : 0;
    const racipCapacityPerDay = RACIP_CAPACITY_TON_PER_MEJA_PER_DAY * AVAILABLE_MEJA;
    const neededRacipDays =
      racipCapacityPerDay > 0 ? CONTAINER_NEED_TON_PER_MONTH / racipCapacityPerDay : 0;

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 5%;">No</th>
      <th rowspan="2" style="width: 25%">Nama Supplier</th>
      <th rowspan="2" style="width: 8%;">Jumlah Truk</th>
      ${groupHeader}
      <th rowspan="2" style="width: 10%;">Total (Ton)</th>
      <th rowspan="2" style="width: 10%;">Rasio</th>
    </tr>
    <tr class="headers-row">
      ${groupSubHeader}
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    ${suppliers.length > 0
      ? `<tr class="totals-row">
      <td colspan="2" class="center">Total</td>
      <td class="center">${summary.totalTrucks}</td>
      ${groupTotalCells}
      <td class="number">${fmtTon(totalTon)}</td>
      <td class="number">100.0%</td>
    </tr>`
      : buildEmptyTableRow(5 + groupNames.length * 2)}
  </tbody>
</table>
${suppliers.length > 0
  ? `<table class="ratio-table">
  <tbody>
    ${ratioLines}
  </tbody>
</table>
<p class="notes-title">Keterangan :</p>
<p class="notes-line">${start} s/d ${end} (${summary.workingDays} hari): rata-rata masuk ${fmtTon(summary.dailyTon)} ton/hari, estimasi 25 hari ${fmtTon(summary.estimated25DaysTon)} ton.</p>
<p class="notes-line">Dengan kapasitas 1 meja/hari = ${fmtSize(MEJA_CAPACITY_TON_PER_DAY)} ton, kebutuhan meja/hari sekitar ${mejaFixed(neededMejaPerDay)} meja.</p>
<p class="notes-line">Target container: kebutuhan ${containerFixed(CONTAINER_NEED_TON_PER_MONTH)} ton/bulan setara ${fmtSize(neededStPerDay)} ton ST/hari; kebutuhan 2 container (${fmtSize(ST_PER_CONTAINER_TON * 2)} ton) sekitar ${fmtSize(neededSt2ContainersPerDay)} ton ST/hari.</p>
<p class="notes-line">Kapasitas racip: ${fmtInt(RACIP_CAPACITY_TON_PER_MEJA_PER_DAY)} ton/meja/hari x ${AVAILABLE_MEJA} meja = ${fmtInt(racipCapacityPerDay)} ton/hari, sehingga butuh sekitar ${racipFixed(neededRacipDays)} hari racip untuk memenuhi 2 container.</p>
<p class="notes-line">Rekap periode: ${summary.totalSuppliers} supplier, ${summary.totalTrucks} truk, total ${fmtTon(totalTon)} ton.</p>`
  : ""}`;

    return renderWpsReportPage({
      title: "Laporan Penerimaan Kayu Bulat Per-Supplier Berdasarkan Group Kayu",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      landscape: true,
      style: "penerimaan_kayu_bulat_per_supplier_group",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
