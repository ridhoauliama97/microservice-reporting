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
 * SPWps_LapLemburPerMesin — "Laporan Hasil Produksi Mesin Lembur Dan Non
 * Lembur". Ported from HasilProduksiMesinLemburDanNonLemburReportService and
 * hasil-produksi-mesin-lembur-dan-non-lembur-pdf.blade.php.
 *
 * Two tables. The first is the detail: one row per production record, grouped
 * by date with the date cell spanning its group, showing normal and overtime
 * man-hours, machine-hours and m3. The second ("Rangkuman") starts on a fresh
 * page and aggregates by machine and shift number.
 *
 * Two legacy details worth naming, both reproduced deliberately:
 *
 * - The summary key is machine + unit number without the date, so shift 1 of a
 *   machine aggregates across every day in the period. That looks surprising
 *   but it is what the report has always shown.
 * - IsTanggalMerah is tested with PHP's empty(), so a 0 counts as empty and the
 *   row falls back to JamKerja; only a 1 swaps in JamNormal.
 *
 * The legacy service also builds a per-machine structure (active days, average
 * production) that the blade never renders. That work is not reproduced.
 */

const MACHINE_ORDER = [
  "S4S LINE 1",
  "MULTI RIPSAW",
  "FINGER JOINT 1",
  "FINGER JOINT 2",
  "FINGER JOINT 3",
  "MOULDING 1",
  "MOULDING 2",
  "ROTARY COMPOSER 1",
  "ROTARY COMPOSER 2",
  "CROSSCUT AKHIR",
  "DOUBLE END CUTTER",
  "SANDING",
  "PACKING",
] as const;

const HARI_LABELS: Record<string, string> = {
  Sunday: "Minggu",
  Monday: "Senin",
  Tuesday: "Selasa",
  Wednesday: "Rabu",
  Thursday: "Kamis",
  Friday: "Jumat",
  Saturday: "Sabtu",
};

const EPSILON = 0.0000001;

interface LemburRow extends Record<string, unknown> {
  NoProduksi: unknown;
  Tanggal: unknown;
  Hari: unknown;
  Shift: unknown;
  NamaMesin: unknown;
  JamKerja: unknown;
  JamNormal: unknown;
  JamLembur: unknown;
  JmlhAnggota: unknown;
  IsTanggalMerah: unknown;
  Output: unknown;
  OutputLembur: unknown;
}

interface DetailRow {
  tanggal: string;
  hari: string;
  machine: string;
  unitNumber: number;
  jmlhAnggota: number | null;
  jamKerja: number | null;
  output: number | null;
  jmlhAnggotaLembur: number | null;
  jamKerjaLembur: number | null;
  outputLembur: number | null;
}

interface SummaryRow {
  no: number;
  machine: string;
  totalTk: number;
  totalHm: number;
  totalTkLembur: number;
  totalHmLembur: number;
  output: number;
  outputLembur: number;
}

interface GrandTotals {
  totalTk: number;
  totalHm: number;
  totalTkLembur: number;
  totalHmLembur: number;
  output: number;
  outputLembur: number;
}

interface LemburData {
  groupedRows: Array<{ tanggal: string; hari: string; rows: DetailRow[] }>;
  summaryRows: SummaryRow[];
  grandTotals: GrandTotals;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy nullableFloat: null for anything that is not numeric. */
const nullableFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** PHP empty(): null, '', 0, '0' and false all count as empty. */
const isPhpEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  value === "" ||
  value === 0 ||
  value === "0";

/** Normalises the SP's date to a YYYY-MM-DD string, which also sorts correctly. */
const isoDate = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return /^(\d{4}-\d{2}-\d{2})/.exec(toText(value))?.[1] ?? "";
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmtNumber: four decimals by default, blank at zero. */
const fmt = (value: number | null, decimals = 4): string =>
  value === null || Math.abs(value) < EPSILON
    ? ""
    : formatNumber(value, decimals);

/** "Senin, 01-Agu-26", from the English day name the SP returns. */
const formatTanggalDisplay = (iso: string, hari: string): string => {
  if (iso === "") return "";
  const label = HARI_LABELS[hari] ?? hari;
  return `${label}, ${formatTanggalPendek(iso)}`;
};

export function buildLemburData(rows: LemburRow[]): LemburData {
  const machines = new Set<string>();
  const flat: Array<DetailRow & { shift: string }> = [];

  for (const row of rows) {
    const machine = toText(row.NamaMesin);
    if (machine === "") continue;

    machines.add(machine);

    // A red-calendar day bills normal hours instead of the recorded shift hours.
    const jamKerja = nullableFloat(
      isPhpEmpty(row.IsTanggalMerah) ? row.JamKerja : row.JamNormal,
    );
    const output = nullableFloat(row.Output);
    const outputLembur = nullableFloat(row.OutputLembur);

    const detail: DetailRow = {
      tanggal: isoDate(row.Tanggal),
      hari: toText(row.Hari),
      machine,
      unitNumber: 0,
      jmlhAnggota: nullableFloat(row.JmlhAnggota),
      jamKerja,
      output,
      // The SP exposes no overtime headcount column, so this is always zero.
      jmlhAnggotaLembur: null,
      jamKerjaLembur: nullableFloat(row.JamLembur),
      outputLembur,
    };

    flat.push({ ...detail, shift: toText(row.Shift) });
  }

  // Fixed machine order first, then anything the data introduces.
  const orderedNames = [
    ...MACHINE_ORDER.filter((name) => machines.has(name)),
    ...[...machines].filter(
      (name) => !(MACHINE_ORDER as readonly string[]).includes(name),
    ),
  ];
  const orderOf = new Map(orderedNames.map((name, index) => [name, index]));

  // Legacy: date, then machine order, then shift.
  flat.sort((left, right) => {
    if (left.tanggal !== right.tanggal)
      return left.tanggal < right.tanggal ? -1 : 1;
    const byMachine =
      (orderOf.get(left.machine) ?? 0) - (orderOf.get(right.machine) ?? 0);
    if (byMachine !== 0) return byMachine;
    if (left.shift !== right.shift) return left.shift < right.shift ? -1 : 1;
    return 0;
  });

  const groupedRows: LemburData["groupedRows"] = [];
  const byDate = new Map<string, { hari: string; rows: DetailRow[] }>();
  const unitCounter = new Map<string, number>();

  for (const entry of flat) {
    const unitKey = `${entry.tanggal}|${entry.machine}`;
    const unitNumber = (unitCounter.get(unitKey) ?? 0) + 1;
    unitCounter.set(unitKey, unitNumber);
    entry.unitNumber = unitNumber;

    let group = byDate.get(entry.tanggal);
    if (!group) {
      group = { hari: entry.hari, rows: [] };
      byDate.set(entry.tanggal, group);
    }
    group.rows.push(entry);
  }
  for (const [tanggal, group] of byDate)
    groupedRows.push({ tanggal, hari: group.hari, rows: group.rows });

  // Summary keyed by machine + unit number, with no date in the key, matching legacy.
  interface SumAcc {
    machine: string;
    totalTk: number;
    totalHm: number;
    totalTkLembur: number;
    totalHmLembur: number;
    output: number;
    outputLembur: number;
  }
  const summaryMap = new Map<string, SumAcc>();

  for (const entry of flat) {
    const logicalKey = `${entry.machine}#${entry.unitNumber}`;
    let acc = summaryMap.get(logicalKey);
    if (!acc) {
      acc = {
        machine: entry.machine,
        totalTk: 0,
        totalHm: 0,
        totalTkLembur: 0,
        totalHmLembur: 0,
        output: 0,
        outputLembur: 0,
      };
      summaryMap.set(logicalKey, acc);
    }
    acc.totalTk += entry.jmlhAnggota ?? 0;
    acc.totalHm += entry.jamKerja ?? 0;
    acc.totalTkLembur += entry.jmlhAnggotaLembur ?? 0;
    acc.totalHmLembur += entry.jamKerjaLembur ?? 0;
    acc.output += entry.output ?? 0;
    acc.outputLembur += entry.outputLembur ?? 0;
  }

  const orderedKeys: string[] = [];
  for (const machine of MACHINE_ORDER) {
    for (let unit = 1; unit <= 20; unit += 1) {
      const key = `${machine}#${unit}`;
      if (summaryMap.has(key)) orderedKeys.push(key);
    }
  }
  for (const key of summaryMap.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  const summaryRows: SummaryRow[] = orderedKeys.map((key) => ({
    ...summaryMap.get(key)!,
    no: 0,
  }));
  summaryRows.forEach((row, index) => {
    row.no = index + 1;
  });

  const grandTotals: GrandTotals = summaryRows.reduce<GrandTotals>(
    (totals, row) => ({
      totalTk: totals.totalTk + row.totalTk,
      totalHm: totals.totalHm + row.totalHm,
      totalTkLembur: totals.totalTkLembur + row.totalTkLembur,
      totalHmLembur: totals.totalHmLembur + row.totalHmLembur,
      output: totals.output + row.output,
      outputLembur: totals.outputLembur + row.outputLembur,
    }),
    {
      totalTk: 0,
      totalHm: 0,
      totalTkLembur: 0,
      totalHmLembur: 0,
      output: 0,
      outputLembur: 0,
    },
  );

  return { groupedRows, summaryRows, grandTotals };
}

/**
 * Column widths as percentages of the table.
 *
 * The legacy blade gave only Tanggal a width and left the shared table layout
 * to split the rest equally, so "DOUBLE END CUTTER" wrapped in a column twice
 * as wide as the man-hour digits it sat next to. These widths give Nama Mesin
 * room for the longest machine name and take the space back from the TK and HM
 * columns, which only ever hold one or two digits.
 */
const LEMBUR_COLUMN_WIDTHS = [
  "18%", // Tanggal / No
  "20%", // Nama Mesin
  "7%", // Normal TK
  "7%", // Normal HM
  "17%", // Normal mtr3
  "7%", // Lembur TK
  "7%", // Lembur HM
  "17%", // Lembur mtr3
];

const LEMBUR_COLGROUP = `<colgroup>
        ${LEMBUR_COLUMN_WIDTHS.map((width) => `<col style="width: ${width};">`).join("\n        ")}
      </colgroup>`;

/**
 * The Rangkuman drops the leading No column, so it needs its own colgroup: the
 * same six measurement columns with Nama Mesin taking the freed space.
 */
const LEMBUR_SUMMARY_COLUMN_WIDTHS = ["24%", "9%", "9%", "20%", "9%", "9%", "20%"];

const LEMBUR_SUMMARY_COLGROUP = `<colgroup>
        ${LEMBUR_SUMMARY_COLUMN_WIDTHS.map((width) => `<col style="width: ${width};">`).join("\n        ")}
      </colgroup>`;

const GROUP_HEADERS = `
        <th colspan="3">Jam Kerja Normal</th>
        <th colspan="3">Jam Kerja Lembur</th>`;
const SUB_HEADERS = `
        <th>TK</th>
        <th>HM</th>
        <th>mtr3</th>
        <th>TK</th>
        <th>HM</th>
        <th>mtr3</th>`;

export const hasilProduksiMesinLemburReport: ReportDefinition<
  PeriodParams,
  LemburData
> = {
  type: "hasil-produksi-mesin-lembur-dan-non-lembur",
  title: "Laporan Hasil Produksi Mesin Lembur Dan Non Lembur",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapLemburPerMesin");
    return buildLemburData((result.recordset ?? []) as LemburRow[]);
  },

  render(data, meta) {
    let rowIndex = 0;
    const detailBody = data.groupedRows
      .map((group) => {
        const rowspan = group.rows.length;
        return group.rows
          .map((row, innerIndex) => {
            rowIndex += 1;
            const dateCell =
              innerIndex === 0
                ? `<td rowspan="${rowspan}" class="center">${escapeHtml(formatTanggalDisplay(group.tanggal, group.hari))}</td>`
                : "";
            return `<tr class="${rowIndex % 2 === 1 ? "row-odd" : "row-even"}${innerIndex === 0 ? " date-group-start" : ""}">
        ${dateCell}
        <td>${escapeHtml(row.machine)}</td>
        <td class="center">${escapeHtml(fmt(row.jmlhAnggota, 0))}</td>
        <td class="center">${escapeHtml(fmt(row.jamKerja, 0))}</td>
        <td class="number">${escapeHtml(fmt(row.output, 4))}</td>
        <td class="center">${escapeHtml(fmt(row.jmlhAnggotaLembur, 0))}</td>
        <td class="center">${escapeHtml(fmt(row.jamKerjaLembur, 0))}</td>
        <td class="number">${escapeHtml(fmt(row.outputLembur, 4))}</td>
      </tr>`;
          })
          .join("\n      ");
      })
      .join("\n      ");

    // No column omitted: the machine name already identifies each row, and the
    // numbers ran 1..n in machine order anyway.
    const summaryBody = data.summaryRows
      .map(
        (
          row,
          index,
        ) => `<tr class="${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td>${escapeHtml(row.machine)}</td>
        <td class="center">${escapeHtml(fmt(row.totalTk, 0))}</td>
        <td class="center">${escapeHtml(fmt(row.totalHm, 0))}</td>
        <td class="number">${escapeHtml(fmt(row.output, 4))}</td>
        <td class="center">${escapeHtml(fmt(row.totalTkLembur, 0))}</td>
        <td class="center">${escapeHtml(fmt(row.totalHmLembur, 0))}</td>
        <td class="number">${escapeHtml(fmt(row.outputLembur, 4))}</td>
      </tr>`,
      )
      .join("\n      ");

    const bodyHtml = `<table class="report-table lembur-detail">
    ${LEMBUR_COLGROUP}
    <thead>
      <tr>
        <th rowspan="2">Tanggal</th>
        <th rowspan="2">Nama Mesin</th>${GROUP_HEADERS}
      </tr>
      <tr>${SUB_HEADERS}
      </tr>
    </thead>
    <tbody>
      ${detailBody || buildEmptyTableRow(8)}
      <tr class="total-row">
        <td colspan="2" class="center">Grand Total</td>
        <td></td>
        <td></td>
        <td class="number">${escapeHtml(fmt(data.grandTotals.output, 4))}</td>
        <td></td>
        <td></td>
        <td class="number">${escapeHtml(fmt(data.grandTotals.outputLembur, 4))}</td>
      </tr>
    </tbody>
  </table>
  <div class="page-break-before">
    <h2 class="rangkuman-title">Rangkuman</h2>
    <table class="report-table lembur-rangkuman">
      ${LEMBUR_SUMMARY_COLGROUP}
      <thead>
        <tr>
          <th rowspan="2">Nama Mesin</th>${GROUP_HEADERS}
        </tr>
        <tr>${SUB_HEADERS}
        </tr>
      </thead>
      <tbody>
        ${summaryBody || buildEmptyTableRow(7)}
        <tr class="total-row">
          <td class="center">Grand Total</td>
          <td class="center">${escapeHtml(fmt(data.grandTotals.totalTk, 0))}</td>
          <td class="center">${escapeHtml(fmt(data.grandTotals.totalHm, 0))}</td>
          <td class="number">${escapeHtml(fmt(data.grandTotals.output, 4))}</td>
          <td class="center">${escapeHtml(fmt(data.grandTotals.totalTkLembur, 0))}</td>
          <td class="center">${escapeHtml(fmt(data.grandTotals.totalHmLembur, 0))}</td>
          <td class="number">${escapeHtml(fmt(data.grandTotals.outputLembur, 4))}</td>
        </tr>
      </tbody>
    </table>
  </div>`;

    return renderWpsReportPage({
      title: "Laporan Hasil Produksi Mesin Lembur Dan Non Lembur",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "hasil_produksi_mesin_lembur",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
