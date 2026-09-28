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
 * SPWps_LapProduksiSemuaMesinV2 — "Laporan Produksi Hulu Hilir". Ported from
 * ProduksiHuluHilirReportService and produksi-hulu-hilir-pdf.blade.php.
 *
 * A wide matrix: one row per day, one column group per machine, each group
 * holding Tbl (thickness), Output and Rend. The machine list is fixed and
 * ordered; machines absent from the data drop out, unknown ones are appended.
 *
 * Beneath the daily rows come four statistics (Total, Avg, Min, Max) built
 * only from non-zero daily values, then a Target row. Output below target is
 * highlighted in red, which is the report's main visual signal.
 *
 * The legacy service also calls the "Hasil Produksi Mesin Lembur" service and
 * returns its summary_rows / grand_totals, but the blade never renders them —
 * a second stored-procedure execution whose result is thrown away. That call
 * is deliberately not reproduced here: no output changes, one fewer query per
 * job.
 */

const MACHINE_ORDER = [
  "S4S LINE 1",
  "MULTI RIPSAW",
  "FINGER JOINT 1",
  "FINGER JOINT 2",
  "FINGER JOINT 3",
  "MOULDING 1",
  "MOULDING 2",
  "ROTARY COMPOSER 1 Shift 1",
  "ROTARY COMPOSER 1 Shift 2",
  "ROTARY COMPOSER 2 Shift 1",
  "ROTARY COMPOSER 2 Shift 2",
  "CROSSCUT AKHIR",
  "DOUBLE END CUTTER",
  "SANDING",
  "PACKING",
] as const;

/** Only the rotary composers wrap onto two lines. */
const MACHINE_LABELS: Record<string, string> = {
  "ROTARY COMPOSER 1 Shift 1": "ROTARY COMPOSER 1<br>Shift 1",
  "ROTARY COMPOSER 1 Shift 2": "ROTARY COMPOSER 1<br>Shift 2",
  "ROTARY COMPOSER 2 Shift 1": "ROTARY COMPOSER 2<br>Shift 1",
  "ROTARY COMPOSER 2 Shift 2": "ROTARY COMPOSER 2<br>Shift 2",
};

const STAT_LABELS = ["Total", "Avg", "Min", "Max"] as const;
const EPSILON = 0.0000001;

interface HuluRow extends Record<string, unknown> {
  Tanggal: unknown;
  NamaMesin: unknown;
  Target: unknown;
  Output: unknown;
  Rend: unknown;
  RendPerMesin: unknown;
  Tebal: unknown;
}

interface MachineCell {
  tebal: number | null;
  output: number | null;
  rend: number | null;
}

interface StatCell {
  output: number | null;
  rend: number | null;
}

interface MachineColumn {
  key: string;
  label: string;
  target: number | null;
}

interface HuluData {
  columns: MachineColumn[];
  rows: Array<{ label: string; cells: Record<string, MachineCell> }>;
  statRows: Array<{ label: string; cells: Record<string, StatCell> }>;
  targetRow: { label: string; cells: Record<string, number | null> };
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

/** Day-of-month as a zero-padded string, matching Carbon's format('d'). */
const dayLabel = (value: unknown): string => {
  if (value instanceof Date) return String(value.getDate()).padStart(2, "0");
  const text = toText(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[3]!;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getDate()).padStart(2, "0");
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmtNumber: zero prints as a dash, not a blank. */
const fmtNumber = (value: number | null, decimals: number, blankWhenZero = true): string => {
  if (value === null) return "";
  if (blankWhenZero && Math.abs(value) < EPSILON) return "-";
  return formatNumber(value, decimals);
};

/** Legacy $fmtPercent: null and zero both collapse to "-%". */
const fmtPercent = (value: number | null): string => {
  if (value === null || Math.abs(value) < EPSILON) return "-%";
  return `${formatNumber(value, 1)}%`;
};

const statValue = (values: number[], label: string): number | null => {
  if (values.length === 0) return null;
  if (label === "Total") return values.reduce((sum, value) => sum + value, 0);
  if (label === "Avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (label === "Min") return Math.min(...values);
  return Math.max(...values);
};

export function buildHuluHilirData(rows: HuluRow[]): HuluData {
  interface Accum { tebal: number; output: number; rend: number; hasTebal: boolean; hasOutput: boolean; hasRend: boolean }
  const machines = new Map<string, { target: number | null; days: Map<string, Accum>; machineRend: number | null }>();
  const dayLabels = new Set<string>();

  for (const row of rows) {
    const name = toText(row.NamaMesin);
    const label = dayLabel(row.Tanggal);
    if (name === "" || label === "") continue;

    let machine = machines.get(name);
    if (!machine) {
      machine = { target: null, days: new Map(), machineRend: null };
      machines.set(name, machine);
    }

    dayLabels.add(label);

    const target = nullableFloat(row.Target);
    const output = nullableFloat(row.Output);
    const rend = nullableFloat(row.Rend);
    const machineRend = nullableFloat(row.RendPerMesin);
    const tebal = nullableFloat(row.Tebal);

    if (machine.target === null && target !== null) machine.target = target;
    if (machine.machineRend === null && machineRend !== null) machine.machineRend = machineRend;

    let day = machine.days.get(label);
    if (!day) {
      day = { tebal: 0, output: 0, rend: 0, hasTebal: false, hasOutput: false, hasRend: false };
      machine.days.set(label, day);
    }

    if (tebal !== null) {
      day.tebal += tebal;
      day.hasTebal = true;
    }
    if (output !== null) {
      day.output += output;
      day.hasOutput = true;
    }
    if (rend !== null) {
      day.rend += rend;
      day.hasRend = true;
    }
  }

  // Fixed order first, then any machine the data introduces.
  const orderedNames = [
    ...MACHINE_ORDER.filter((name) => machines.has(name)),
    ...[...machines.keys()].filter((name) => !(MACHINE_ORDER as readonly string[]).includes(name)),
  ];

  const columns: MachineColumn[] = orderedNames.map((key) => ({
    key,
    label: MACHINE_LABELS[key] ?? key,
    target: machines.get(key)!.target,
  }));

  const sortedDays = [...dayLabels].sort((left, right) => Number(left) - Number(right));

  const dayRows = sortedDays.map((label) => {
    const cells: Record<string, MachineCell> = {};
    for (const name of orderedNames) {
      const day = machines.get(name)!.days.get(label);
      cells[name] = {
        tebal: day?.hasTebal ? day.tebal : null,
        output: day?.hasOutput ? day.output : null,
        rend: day?.hasRend ? day.rend : null,
      };
    }
    return { label, cells };
  });

  const statRows = STAT_LABELS.map((statLabel) => {
    const cells: Record<string, StatCell> = {};
    for (const name of orderedNames) {
      const days = machines.get(name)!.days;
      const outputs: number[] = [];
      const rends: number[] = [];
      for (const day of days.values()) {
        if (day.hasOutput && Math.abs(day.output) > EPSILON) outputs.push(day.output);
        if (day.hasRend && Math.abs(day.rend) > EPSILON) rends.push(day.rend);
      }
      cells[name] = {
        // "Total" uses the machine-level RendPerMesin rather than a daily sum,
        // because summing daily percentages is meaningless.
        output: statValue(outputs, statLabel),
        rend: statLabel === "Total" ? machines.get(name)!.machineRend : statValue(rends, statLabel),
      };
    }
    return { label: statLabel, cells };
  });

  const targetCells: Record<string, number | null> = {};
  for (const name of orderedNames) targetCells[name] = machines.get(name)!.target;

  return { columns, rows: dayRows, statRows, targetRow: { label: "Target", cells: targetCells } };
}

/** Escapes each line of a machine label, keeping only the <br> separators raw. */
const renderMachineLabel = (label: string): string =>
  label.split("<br>").map(escapeHtml).join("<br>");

const renderWpsReportPageOptions = (
  data: HuluData,
  meta: { params: PeriodParams; requestedBy: string; generatedAt: Date },
) => {
  // Legacy colgroup ratios, in px, scaled to percentages so the browser keeps
  // the same proportions at any paper size (table-layout: fixed).
  //
  // The No column keeps a generous share: it is one column out of forty-five, so
  // widening it costs every other column under a third of a pixel, and it has
  // to hold the statistics labels ("Total", "Target") which are wider than any
  // number in the table.
  //
  // The three sub-columns are then sized from measurement rather than guesswork.
  // On a 200dpi render the table body is 2341px wide, 46 borders take 138px of
  // it, and the label inks are: "Tbl" 23px, "Output" 49px, "Rend" 48px, "Target"
  // 42px. Those need 27.9 / 53.2 / 53.2 / 50.4px of inner width for a few
  // pixels of padding, which the ratios below satisfy with at least 4px to
  // spare. At the previous 54 units "Output" filled its cell edge to edge and
  // touched both borders.
  const NO_WIDTH = 56;
  const TBL_WIDTH = 35;
  const OUTPUT_WIDTH = 66;
  const REND_WIDTH = 63;
  const totalWidth = NO_WIDTH + data.columns.length * (TBL_WIDTH + OUTPUT_WIDTH + REND_WIDTH);
  const pct = (px: number): string => `${((px / totalWidth) * 100).toFixed(4)}%`;

  const colgroup = `<colgroup>
      <col style="width: ${pct(NO_WIDTH)};">
      ${data.columns
        .map(
          () => `<col style="width: ${pct(TBL_WIDTH)};">
        <col style="width: ${pct(OUTPUT_WIDTH)};">
        <col style="width: ${pct(REND_WIDTH)};">`,
        )
        .join("\n      ")}
    </colgroup>`;

  const dayBodyRows = data.rows
    .map(
      (row, index) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
      <td class="center">${escapeHtml(row.label)}</td>
      ${data.columns
        .map((column) => {
          const cell = row.cells[column.key] ?? { tebal: null, output: null, rend: null };
          const target = data.targetRow.cells[column.key] ?? null;
          const belowTarget =
            cell.output !== null && target !== null && cell.output < target;
          return `<td class="center">${escapeHtml(fmtNumber(cell.tebal, 0))}</td>
        <td class="number${belowTarget ? " output-below-target" : ""}">${escapeHtml(fmtNumber(cell.output, 2))}</td>
        <td class="number">${escapeHtml(fmtPercent(cell.rend))}</td>`;
        })
        .join("\n        ")}
    </tr>`,
    )
    .join("\n      ");

  const statBodyRows = data.statRows
    .map(
      (row) => `<tr class="total-row">
      <td class="center">${escapeHtml(row.label)}</td>
      ${data.columns
        .map((column) => {
          const cell = row.cells[column.key] ?? { output: null, rend: null };
          return `<td></td>
        <td class="number">${escapeHtml(fmtNumber(cell.output, 2))}</td>
        <td class="number">${escapeHtml(fmtPercent(cell.rend))}</td>`;
        })
        .join("\n        ")}
    </tr>`,
    )
    .join("\n      ");

  const emptyRow = buildEmptyTableRow(1 + data.columns.length * 3);
  const dayCells = data.rows.length > 0 ? dayBodyRows : emptyRow;

  const bodyHtml = `<table class="report-table hulu-hilur">
    ${colgroup}
    <thead>
      <tr>
        <th rowspan="2">No</th>
        ${data.columns.map((column) => `<th colspan="3">${renderMachineLabel(column.label)}</th>`).join("\n        ")}
      </tr>
      <tr class="sub-header">
        ${data.columns
          .map(() => `<th>Tbl</th>
          <th>Output</th>
          <th>Rend</th>`)
          .join("\n        ")}
      </tr>
    </thead>
    <tbody>
      ${dayCells}
      ${statBodyRows}
      <tr class="target-row">
        <td class="center">${escapeHtml(data.targetRow.label)}</td>
        ${data.columns
          .map(
            (column) =>
              `<td class="center" colspan="3">${escapeHtml(fmtNumber(data.targetRow.cells[column.key] ?? null, 0, false))}</td>`,
          )
          .join("\n        ")}
      </tr>
    </tbody>
  </table>`;

  return renderWpsReportPage({
    title: "Laporan Produksi Hulu Hilir",
    subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
    bodyHtml,
    style: "produksi_hulu_hilur",
    landscape: true,
    printedBy: meta.requestedBy,
    printedAt: formatPrintedAt(meta.generatedAt),
  });
};

export const produksiHuluHilirReport: ReportDefinition<PeriodParams, HuluData> = {
  type: "produksi-hulu-hilir",
  title: "Laporan Produksi Hulu Hilir",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .execute("SPWps_LapProduksiSemuaMesinV2");
    return buildHuluHilirData((result.recordset ?? []) as HuluRow[]);
  },

  render(data, meta) {
    return renderWpsReportPageOptions(data, meta);
  },
};
