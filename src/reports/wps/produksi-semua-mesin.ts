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
 * SPWps_LapProduksiSemuaMesin — "Laporan Semua Mesin". Ported from
 * ProduksiSemuaMesinReportService and produksi-semua-mesin-pdf.blade.php.
 *
 * A wide daily matrix with one column per machine and a single Output value,
 * followed by Total / Avg / Min / Max and a Target row.
 *
 * This is the V1 procedure, not the V2 one behind "Produksi Hulu Hilir": the
 * shape is different (one column per machine rather than three, and it returns
 * Input, Rend and RendPerMesin that this report does not display).
 *
 * Two legacy details kept as they are:
 *
 * - The daily cell is assigned, not accumulated, so when a machine reports more
 *   than one row for the same day the last one wins.
 * - The statistics are built only from non-zero outputs, while the daily rows
 *   show zeros as blanks. A day with a zero therefore raises no average.
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

/** Legacy MACHINE_LABELS is an identity map; machines are labelled by name. */
const STAT_LABELS = ["Total", "Avg", "Min", "Max", "Target"] as const;
const EPSILON = 0.0000001;

interface MesinRow extends Record<string, unknown> {
  Tanggal: unknown;
  NamaMesin: unknown;
  Target: unknown;
  Output: unknown;
}

interface MachineColumn {
  key: string;
  label: string;
}

interface SemuaMesinData {
  columns: MachineColumn[];
  rows: Array<{ label: string; cells: Record<string, number | null> }>;
  statRows: Array<{ label: string; cells: Record<string, number | null> }>;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const nullableFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmt: two decimals, blank at zero. */
const fmt = (value: number | null): string =>
  value === null || Math.abs(value) < EPSILON ? "" : formatNumber(value, 2);

/** Day-of-month as a zero-padded string, from Carbon's format('d'). */
const dayLabel = (value: unknown): string => {
  if (value instanceof Date) return String(value.getDate()).padStart(2, "0");
  const iso = /^(\d{4}-\d{2})-(\d{2})/.exec(toText(value));
  return iso ? iso[2]! : "";
};

export function buildSemuaMesinData(rows: MesinRow[]): SemuaMesinData {
  const machines = new Map<
    string,
    { target: number | null; days: Map<string, number | null>; nonZero: number[] }
  >();
  const dayLabels = new Set<string>();

  for (const row of rows) {
    const name = toText(row.NamaMesin);
    const label = dayLabel(row.Tanggal);
    if (name === "" || label === "") continue;

    let machine = machines.get(name);
    if (!machine) {
      machine = { target: null, days: new Map(), nonZero: [] };
      machines.set(name, machine);
    }
    dayLabels.add(label);

    const target = nullableFloat(row.Target);
    const output = nullableFloat(row.Output);
    if (machine.target === null && target !== null) machine.target = target;

    // Assignment, not accumulation: the last row for a day wins.
    machine.days.set(label, output);
    if (output !== null && Math.abs(output) > EPSILON) machine.nonZero.push(output);
  }

  const orderedNames = [
    ...MACHINE_ORDER.filter((name) => machines.has(name)),
    ...[...machines.keys()].filter((name) => !(MACHINE_ORDER as readonly string[]).includes(name)),
  ];

  const columns: MachineColumn[] = orderedNames.map((key) => ({ key, label: key }));

  const dayRows = [...dayLabels]
    .sort((left, right) => Number(left) - Number(right))
    .map((label) => {
      const cells: Record<string, number | null> = {};
      for (const name of orderedNames) cells[name] = machines.get(name)!.days.get(label) ?? null;
      return { label, cells };
    });

  const statRows = STAT_LABELS.map((statLabel) => {
    const cells: Record<string, number | null> = {};
    for (const name of orderedNames) {
      const machine = machines.get(name)!;
      const values = machine.nonZero;
      if (statLabel === "Target") {
        cells[name] = machine.target;
      } else if (values.length === 0) {
        cells[name] = null;
      } else if (statLabel === "Total") {
        cells[name] = values.reduce((sum, value) => sum + value, 0);
      } else if (statLabel === "Avg") {
        cells[name] = values.reduce((sum, value) => sum + value, 0) / values.length;
      } else if (statLabel === "Min") {
        cells[name] = Math.min(...values);
      } else {
        cells[name] = Math.max(...values);
      }
    }
    return { label: statLabel, cells };
  });

  return { columns, rows: dayRows, statRows };
}

const TANGGAL_WIDTH = 5;
const MACHINE_WIDTH = 7.3;

export const produksiSemuaMesinReport: ReportDefinition<PeriodParams, SemuaMesinData> = {
  type: "produksi-semua-mesin",
  title: "Laporan Semua Mesin",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapProduksiSemuaMesin");
    return buildSemuaMesinData((result.recordset ?? []) as MesinRow[]);
  },

  render(data, meta) {
    const colgroup = `<colgroup>
      <col style="width: ${TANGGAL_WIDTH}%;">
      ${data.columns.map(() => `<col style="width: ${MACHINE_WIDTH}%;">`).join("\n      ")}
    </colgroup>`;

    const dayBody = data.rows
      .map(
        (row, index) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
      <td class="center">${escapeHtml(row.label)}</td>
      ${data.columns
        .map((column) => `<td class="number">${escapeHtml(fmt(row.cells[column.key] ?? null))}</td>`)
        .join("\n        ")}
    </tr>`,
      )
      .join("\n      ");

    const statBody = data.statRows
      .map(
        (row) => `<tr class="total-row">
      <td class="center">${escapeHtml(row.label)}</td>
      ${data.columns
        .map((column) => `<td class="number">${escapeHtml(fmt(row.cells[column.key] ?? null))}</td>`)
        .join("\n        ")}
    </tr>`,
      )
      .join("\n      ");

    const bodyHtml = `<table class="report-table semua-mesin">
    ${colgroup}
    <thead>
      <tr>
        <th rowspan="2">Tanggal</th>
        ${data.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("\n        ")}
      </tr>
      <tr>
        ${data.columns.map(() => "<th>Output</th>").join("\n        ")}
      </tr>
    </thead>
    <tbody>
      ${dayBody || buildEmptyTableRow(1 + data.columns.length)}
      ${statBody}
    </tbody>
  </table>`;

    return renderWpsReportPage({
      title: "Laporan Semua Mesin",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "produksi_semua_mesin",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
