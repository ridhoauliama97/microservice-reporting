import sql from "mssql";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * SP_LapPenerimaanKBPerSupplier — "Laporan Penerimaan Kayu Bulat Per-Supplier
 * - Timbang KG", ported 1:1 from the legacy open-api-report service + blade
 * (PenerimaanKayuBulatPerSupplierKgReportService + penerimaan-per-supplier-kg
 * -pdf.blade.php).
 *
 * The SP returns one row per (supplier, grade): No / NmSupplier / NamaGrade /
 * JmlhTruk / NoTlp / KG. This report pivots it into a supplier × grade table
 * (Kg + % per grade, Total Kg + Rasio per supplier) followed by the legacy
 * "Keterangan" notes (truck total, grade ratios, 25-day projection, racip
 * consumption assumptions and calculations).
 *
 * SP column KG is a tonase in tonnes; the legacy renders Kg as value*1000.
 */

interface PerSupplierRow extends Record<string, unknown> {
  NmSupplier: string | null;
  NamaGrade: string | null;
  JmlhTruk: number | null;
  KG: number | null;
}

interface SupplierPivot {
  supplier: string;
  trucks: number;
  /** grade name (uppercased) -> { ton (tonnes), ratio (% of supplier total) } */
  groups: Record<string, { ton: number; ratio: number }>;
  totalTon: number;
  ratio: number;
}

interface PerSupplierData {
  groupNames: string[];
  suppliers: SupplierPivot[];
  summary: {
    totalTrucks: number;
    totalTon: number;
    workingDays: number;
    dailyTon: number;
    estimated25DaysTon: number;
    groupTotals: Record<string, number>;
    groupRatios: Record<string, number>;
    assumptions: {
      racipPerMejaPerDay: number;
      rendemenKbToSt: number;
      consumptionPerMejaPerDay: number;
      availableMeja: number;
      consumptionPerDay: number;
    };
    calculations: { neededDays: number; neededMejaPerDay: number };
  };
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const normalizeGroupName = (group: string): string => {
  const normalized = group.trim().replace(/\s+/g, " ").toUpperCase();
  return normalized !== "" ? normalized : "GROUP";
};

const groupSortRank = (group: string): number => {
  const n = normalizeGroupName(group);
  if (n.includes("AFKIR")) return 10;
  if (n.includes("MC")) return 20;
  if (n.includes("SAMSAM")) return 30;
  if (n.includes("STD")) return 40;
  if (n.includes("SUPER")) return 50;
  return 999;
};

const sortGroupNames = (names: string[]): string[] =>
  [...names].sort((left, right) => {
    const lr = groupSortRank(left);
    const rr = groupSortRank(right);
    return lr === rr ? left.localeCompare(right) : lr - rr;
  });

const countWorkingDays = (start: string, end: string): number => {
  const startTs = Date.parse(`${start}T00:00:00Z`);
  const endTs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) return 1;
  const [lo, hi] = startTs <= endTs ? [startTs, endTs] : [endTs, startTs];
  return Math.max(1, Math.floor((hi - lo) / 86400000) + 1);
};

/** Kg as whole number with separators — legacy $fmtKg = number_format(ton*1000, 0). */
const fmtKg = (ton: number): string => formatNumber(ton * 1000, 0, { blankWhenZero: false });
/** Whole-number percent — legacy $fmtRatio. */
const fmtRatio = (ratio: number): string => `${formatNumber(ratio, 0, { blankWhenZero: false })}%`;
/** 2-decimal percent — legacy $fmtRatio2. */
const fmtRatio2 = (ratio: number): string => `${formatNumber(ratio, 2, { blankWhenZero: false })}%`;


function buildData(rows: PerSupplierRow[], params: PeriodParams): PerSupplierData {
  const supplierMap = new Map<string, { trucks: number; groups: Map<string, number>; totalTon: number }>();
  const groupTotalsRaw = new Map<string, number>();

  for (const row of rows) {
    const supplier = String(row.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const groupName = normalizeGroupName(String(row.NamaGrade ?? ""));
    const truck = toFloat(row.JmlhTruk);
    const ton = toFloat(row.KG);

    let entry = supplierMap.get(supplier);
    if (!entry) {
      entry = { trucks: 0, groups: new Map<string, number>(), totalTon: 0 };
      supplierMap.set(supplier, entry);
    }
    // Trucks are per supplier (repeated across grade rows) — take the max.
    entry.trucks = Math.max(entry.trucks, truck);
    entry.groups.set(groupName, (entry.groups.get(groupName) ?? 0) + ton);
    entry.totalTon += ton;
    groupTotalsRaw.set(groupName, (groupTotalsRaw.get(groupName) ?? 0) + ton);
  }

  const groupNames = sortGroupNames([...groupTotalsRaw.keys()]);
  const grandTotalTon = [...supplierMap.values()].reduce((sum, s) => sum + s.totalTon, 0);
  const grandTotalTrucks = [...supplierMap.values()].reduce((sum, s) => sum + s.trucks, 0);

  // Suppliers sorted naturally (case-insensitive) — legacy natcasesort on first-appearance order.
  const suppliers: SupplierPivot[] = [...supplierMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map(([supplier, entry]) => {
      const groups: Record<string, { ton: number; ratio: number }> = {};
      for (const groupName of groupNames) {
        const groupTon = entry.groups.get(groupName) ?? 0;
        groups[groupName] = {
          ton: groupTon,
          ratio: entry.totalTon > 0 ? (groupTon / entry.totalTon) * 100 : 0,
        };
      }
      return {
        supplier,
        trucks: Math.round(entry.trucks),
        groups,
        totalTon: entry.totalTon,
        ratio: grandTotalTon > 0 ? (entry.totalTon / grandTotalTon) * 100 : 0,
      };
    });

  const workingDays = countWorkingDays(params.tglAwal, params.tglAkhir);
  const dailyTon = workingDays > 0 ? grandTotalTon / workingDays : 0;
  const estimated25Days = dailyTon * 25;
  const consumptionPerMejaPerDay = 9.5;
  const availableMeja = 10;
  const consumptionPerDay = consumptionPerMejaPerDay * availableMeja;
  const neededDays = consumptionPerDay > 0 ? estimated25Days / consumptionPerDay : 0;
  const neededMejaPerDay = consumptionPerMejaPerDay > 0 ? estimated25Days / 25 / consumptionPerMejaPerDay : 0;

  const groupTotals: Record<string, number> = {};
  const groupRatios: Record<string, number> = {};
  for (const groupName of groupNames) {
    const total = groupTotalsRaw.get(groupName) ?? 0;
    groupTotals[groupName] = total;
    groupRatios[groupName] = grandTotalTon > 0 ? (total / grandTotalTon) * 100 : 0;
  }

  return {
    groupNames,
    suppliers,
    summary: {
      totalTrucks: Math.round(grandTotalTrucks),
      totalTon: grandTotalTon,
      workingDays,
      dailyTon,
      estimated25DaysTon: estimated25Days,
      groupTotals,
      groupRatios,
      assumptions: {
        racipPerMejaPerDay: 2.0,
        rendemenKbToSt: 21.0,
        consumptionPerMejaPerDay,
        availableMeja,
        consumptionPerDay,
      },
      calculations: { neededDays, neededMejaPerDay },
    },
  };
}

function buildBodyHtml(data: PerSupplierData, params: PeriodParams): string {
  const { groupNames, suppliers, summary } = data;
  const start = formatTanggalId(params.tglAwal);
  const end = formatTanggalId(params.tglAkhir);

  if (suppliers.length === 0) {
    return `<table class="report-table">
    <thead>
      <tr class="headers-row">
        <th>No</th>
        <th>Nama Supplier</th>
        <th>Jmlh Truk</th>
        <th>Total (Kg)</th>
        <th>Rasio</th>
      </tr>
    </thead>
    <tbody>${buildEmptyTableRow(5)}</tbody>
  </table>`;
  }

  // Header row 1: rowspan dims + one colspan=2 per grade + Total Kg + Rasio.
  const gradeHeaders = groupNames
    .map((name) => `<th colspan="2">${escapeHtml(name)}</th>`)
    .join("");
  // Header row 2: Kg / % under each grade.
  const gradeSubHeaders = groupNames
    .map(() => `<th style="width: 72px;">Kg</th><th style="width: 48px;">%</th>`)
    .join("");

  const bodyRows = suppliers
    .map((supplier, index) => {
      const zebra = index % 2 === 0 ? "row-odd" : "row-even";
      const groupCells = groupNames
        .map((name) => {
          const group = supplier.groups[name] ?? { ton: 0, ratio: 0 };
          return `<td class="number">${fmtKg(group.ton)}</td><td class="number">${fmtRatio(group.ratio)}</td>`;
        })
        .join("");
      return `<tr class="data-row ${zebra}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(supplier.supplier)}</td>
        <td class="center">${supplier.trucks}</td>
        ${groupCells}
        <td class="number" style="font-weight: bold;">${fmtKg(supplier.totalTon)}</td>
        <td class="number" style="font-weight: bold;">${fmtRatio(supplier.ratio)}</td>
      </tr>`;
    })
    .join("\n      ");

  const totalGroupCells = groupNames
    .map((name) => `<td class="number">${fmtKg(summary.groupTotals[name] ?? 0)}</td><td class="number"></td>`)
    .join("");

  const tableHtml = `<table class="report-table">
    <thead>
      <tr class="headers-row">
        <th rowspan="2" style="width: 34px;">No</th>
        <th rowspan="2" style="width: 190px;">Nama Supplier</th>
        <th rowspan="2" style="width: 46px;">Jmlh Truk</th>
        ${gradeHeaders}
        <th rowspan="2" style="width: 74px;">Total (Kg)</th>
        <th rowspan="2" style="width: 62px;">Rasio</th>
      </tr>
      <tr class="headers-row">
        ${gradeSubHeaders}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="totals-row">
        <td colspan="3" class="blank" style="text-align: center;">Total</td>
        ${totalGroupCells}
        <td class="number">${fmtKg(summary.totalTon)}</td>
        <td class="number">100%</td>
      </tr>
    </tbody>
  </table>`;

  const ratioLines = groupNames
    .map(
      (name) =>
        `<li>Rasio ${escapeHtml(name)}: ${fmtRatio2(summary.groupRatios[name] ?? 0)}</li>`,
    )
    .join("\n      ");

  const notesHtml = `<section class="summary-page">
    <h2 class="summary-title">Keterangan:</h2>
    <ul class="summary-list">
      <li>Jumlah Truk: ${summary.totalTrucks}</li>
      ${ratioLines}
    </ul>

    <div class="notes">
      <p class="notes-line">${start} s/d ${end} = ${summary.workingDays} hari, jumlah KB masuk per hari = ${fmtKg(summary.dailyTon)} kg, dalam 25 hari estimasi masuk = ${fmtKg(summary.estimated25DaysTon)} kg.</p>

      <p class="notes-line"><strong>Asumsi:</strong></p>
      <ul class="notes-list">
        <li>Kapasitas racip 1 meja per hari = ${fmtKg(summary.assumptions.racipPerMejaPerDay)} kg ST per hari. Rendemen KB ke ST = ${formatNumber(summary.assumptions.rendemenKbToSt, 0)}%.</li>
        <li>Konsumsi KB per meja per hari = ${fmtKg(summary.assumptions.consumptionPerMejaPerDay)} kg KB per hari. Meja yang tersedia = ${summary.assumptions.availableMeja} meja.</li>
        <li>Konsumsi KB per hari = ${fmtKg(summary.assumptions.consumptionPerDay)} kg KB per hari.</li>
      </ul>

      <p class="notes-line"><strong>Kalkulasi:</strong></p>
      <ul class="notes-list">
        <li>Untuk mengkonsumsi ${fmtKg(summary.estimated25DaysTon)} kg KB diperlukan ${formatNumber(summary.calculations.neededDays, 2)} hari.</li>
        <li>Dalam horizon 25 hari dibutuhkan ${formatNumber(summary.calculations.neededMejaPerDay, 2)} meja sawmill per hari.</li>
      </ul>
    </div>
  </section>`;

  return `${tableHtml}
${notesHtml}`;
}

export const penerimaanKayuBulatPerSupplierKgReport: ReportDefinition<
  PeriodParams,
  PerSupplierData
> = {
  type: "penerimaan-kayu-bulat-per-supplier-kg",
  title: "Penerimaan Kayu Bulat Per-Supplier - Timbang KG",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapPenerimaanKBPerSupplier");
    const rows = (result.recordset ?? []) as PerSupplierRow[];
    return buildData(rows, params);
  },

  render(data, meta): RenderResult {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    return renderWpsReportPage({
      title: "Penerimaan Kayu Bulat Per-Supplier - Timbang KG",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml: buildBodyHtml(data, meta.params),
      style: "penerimaan_kayu_bulat_per_supplier_kg",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
