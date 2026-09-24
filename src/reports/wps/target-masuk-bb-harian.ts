import sql from "mssql";
import { renderWpsReportPage } from "./template";
import { escapeHtml, formatNumber, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: daily target vs hasil pivot per group (one day
 * column per period day, "LB" for libur days from Keterangan), under-target
 * shading, Avg/Min/Max summary and a daily line chart SVG. Ported from
 * open-api-report's TargetMasukBBReportService + target-masuk-bb-pdf.blade.php.
 */

const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

const isLiburValue = (value: unknown): boolean =>
  String(value ?? "").trim().toUpperCase().includes("LIBUR");

interface DayColumn {
  date: string;
  key: string;
  day: number;
  label: string;
  isLibur: boolean;
}

function resolvePeriodDays(startIso: string, endIso: string): DayColumn[] {
  const days: DayColumn[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days;

  const current = new Date(start);
  while (current <= end) {
    const day = current.getDate();
    days.push({
      date: current.toISOString().slice(0, 10),
      key: current.toISOString().slice(0, 10),
      day,
      label: String(day).padStart(2, "0"),
      isLibur: false,
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}

const seriesColor = (seriesName: string): string => {
  const key = seriesName.toUpperCase();
  if (key.includes("JABON")) return "#0d6efd";
  if (key.includes("PULAI")) return "#198754";
  if (key.includes("RAMBUNG")) return "#dc3545";
  return "#4b5563";
};

const dateKeyOf = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString().slice(0, 10) : null;

function buildPivot(
  rows: Array<Record<string, unknown>>,
  dayColumns: DayColumn[],
): {
  tableRows: Array<{
    jenis: string;
    targetHarian: number;
    targetBulanan: number;
    values: number[];
    total: number;
    underTarget: boolean[];
  }>;
  summaryRows: Array<{ jenis: string; avg: number; min: number; max: number }>;
  chartSeries: Record<string, number[]>;
} {
  const indexByKey = new Map(dayColumns.map((d, index) => [d.key, index]));

  const groups = new Map<
    string,
    {
      targetHarian: number;
      targetBulanan: number;
      values: number[];
      rawTotal: number;
    }
  >();

  for (const raw of rows) {
    const jenis = String(raw.NamaGroup ?? "").trim() || "Tanpa Group";
    let group = groups.get(jenis);
    if (!group) {
      group = {
        targetHarian: 0,
        targetBulanan: 0,
        values: dayColumns.map(() => 0),
        rawTotal: 0,
      };
      groups.set(jenis, group);
    }

    const targetHarian = toFloat(raw.TgtPerHari);
    const targetBulanan = toFloat(raw.TargetBulanan);
    if (targetHarian > 0) group.targetHarian = targetHarian;
    if (targetBulanan > 0) group.targetBulanan = targetBulanan;

    const dateKey = dateKeyOf(raw.Date);
    const dayIndex = dateKey !== null ? indexByKey.get(dateKey) : undefined;
    const hasil = toFloat(raw.hasil);
    if (dayIndex !== undefined) {
      group.values[dayIndex] = roundHalfUp(hasil);
      if (isLiburValue(raw.Keterangan)) dayColumns[dayIndex].isLibur = true;
    }
    group.rawTotal += hasil;
  }

  const tableRows = [...groups.entries()]
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([jenis, group]) => ({
      jenis,
      targetHarian: group.targetHarian,
      targetBulanan: group.targetBulanan,
      values: group.values,
      total: roundHalfUp(group.rawTotal),
      underTarget: buildUnderTargetFlags(group.values, dayColumns, group.targetHarian),
    }));

  const summaryRows = tableRows.map((row) => ({
    jenis: row.jenis,
    avg: roundHalfUp(row.total / Math.max(dayColumns.length, 1)),
    min: row.values.length > 0 ? Math.min(...row.values) : 0,
    max: row.values.length > 0 ? Math.max(...row.values) : 0,
  }));

  const chartSeries: Record<string, number[]> = {};
  for (const row of tableRows) {
    chartSeries[row.jenis] = row.values;
  }

  return { tableRows, summaryRows, chartSeries };
}

/** Legacy rule: under target when the cumulative hasil trails the
 * cumulative target (libur days excluded from the working-day count). */
function buildUnderTargetFlags(
  values: number[],
  dayColumns: DayColumn[],
  targetHarian: number,
): boolean[] {
  const flags: boolean[] = [];
  let cumulativeValue = 0;
  let workingDayCount = 0;

  values.forEach((value, index) => {
    cumulativeValue += value;
    const isWorkingDay = !dayColumns[index].isLibur;
    if (isWorkingDay) workingDayCount++;
    const cumulativeTarget = targetHarian * workingDayCount;
    flags[index] =
      targetHarian > 0 && workingDayCount > 0 && cumulativeValue < cumulativeTarget;
  });

  return flags;
}

function buildUnderTargetFlagsAdapter(
  values: number[],
  dayColumns: DayColumn[],
  targetHarian: number,
): boolean[] {
  return buildUnderTargetFlags(values, dayColumns, targetHarian);
}

const HARIAN_CSS = `
  .lb-head { background: #e9d8fd !important; }
  .under-target-cell { color: #b02a37; font-weight: bold; }
  .row-label { font-weight: normal; }
  .chart-wrap { margin-top: 35px; text-align: center; }
`;

function buildLineChartSvg(
  labels: string[],
  chartSeries: Record<string, number[]>,
  options: {
    svgWidth: number;
    svgHeight: number;
    padLeft: number;
    padRight: number;
    padTop: number;
    padBottom: number;
  },
): string {
  const { svgWidth, svgHeight, padLeft, padRight, padTop, padBottom } = options;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  let maxChartValue = 0;
  for (const seriesValues of Object.values(chartSeries)) {
    for (const value of seriesValues) {
      maxChartValue = Math.max(maxChartValue, Math.round(toFloat(value)));
    }
  }
  maxChartValue = Math.max(10, Math.ceil(maxChartValue / 10) * 10);
  const yScale = maxChartValue > 0 ? plotHeight / maxChartValue : 1;
  const labelCount = labels.length;
  const xStep = labelCount > 1 ? plotWidth / (labelCount - 1) : 0;

  const parts: string[] = [];
  for (let y = 0; y <= maxChartValue; y += 10) {
    const yPos = padTop + plotHeight - y * yScale;
    parts.push(
      `<line x1="${padLeft}" y1="${yPos}" x2="${padLeft + plotWidth}" y2="${yPos}" stroke="#d1d5db" stroke-width="1" />`,
      `<text x="${padLeft - 4}" y="${yPos + 3}" font-size="7" text-anchor="end" fill="#111827">${formatNumber(y, 0)}</text>`,
    );
  }
  parts.push(
    `<line x1="${padLeft}" y1="${padTop + plotHeight}" x2="${padLeft + plotWidth}" y2="${padTop + plotHeight}" stroke="#111827" stroke-width="1" />`,
    `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotHeight}" stroke="#111827" stroke-width="1" />`,
  );

  labels.forEach((label, index) => {
    const xPos = padLeft + index * xStep;
    parts.push(
      `<text x="${xPos}" y="${padTop + plotHeight + 12}" font-size="7" text-anchor="middle" fill="#111827">${escapeHtml(label)}</text>`,
    );
  });

  const legendItems: string[] = [];
  let legendX = padLeft + Math.max(0, (plotWidth - legendWidth(chartSeries)) / 2);
  const legendY = svgHeight - 6;

  for (const [seriesName, seriesValues] of Object.entries(chartSeries)) {
    const color = seriesColor(seriesName);
    const points: string[] = [];
    seriesValues.forEach((raw, index) => {
      const value = Math.round(toFloat(raw));
      const x = padLeft + index * xStep;
      const y = padTop + plotHeight - value * yScale;
      points.push(`${x},${y}`);
      if (value > 0) {
        parts.push(`<circle cx="${x}" cy="${y}" r="1.8" fill="${color}" />`);
        parts.push(
          `<text x="${x}" y="${y - 4}" font-size="7" text-anchor="middle" fill="#111827">${value}</text>`,
        );
      }
    });
    if (points.length > 0) {
      parts.push(
        `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="1.2" />`,
      );
    }
    legendItems.push(
      `<rect x="${legendX}" y="${legendY - 8}" width="8" height="8" fill="${color}" /><text x="${legendX + 12}" y="${legendY - 1}" font-size="7" fill="${color}">${escapeHtml(seriesName)}</text>`,
    );
    legendX += 8 + 4 + seriesName.length * 4.5 + 18;
  }

  return `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  ${parts.join("\n  ")}
  ${legendItems.join("\n  ")}
</svg>`;
}

function legendWidth(chartSeries: Record<string, number[]>): number {
  let width = 0;
  const names = Object.keys(chartSeries);
  for (const [index, seriesName] of names.entries()) {
    width += 8 + 4 + seriesName.length * 4.5;
    if (index < names.length - 1) width += 18;
  }
  return width;
}

export const targetMasukBBHarianReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "target-masuk-bb-harian",
  title: "Laporan Target Masuk Bahan Baku Harian",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapTargetMasukBB");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const dayColumns = resolvePeriodDays(meta.params.tglAwal, meta.params.tglAkhir);
    const { tableRows, summaryRows, chartSeries } = buildPivot(rows, dayColumns);
    const chartLabels = dayColumns.map((d) => d.label);

    // Main table: Jenis | Target Hari | Target Bulan | [one day column each] | Total
    const mainRows = tableRows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="row-label label">${escapeHtml(row.jenis)}</td>
      <td class="number">${formatNumber(row.targetHarian, 0)}</td>
      <td class="number">${formatNumber(row.targetBulanan, 0)}</td>
      ${dayColumns
        .map((_, i) => {
          const value = row.values[i] ?? 0;
          const under = row.underTarget[i] ? "under-target-cell" : "";
          return `<td class="number ${under}">${formatNumber(value, 0, { blankWhenZero: false })}</td>`;
        })
        .join("")}
      <td class="number" style="font-weight: bold;">${formatNumber(row.total, 0, { blankWhenZero: false })}</td>
    </tr>`,
      )
      .join("\n");

    const dayHeader = dayColumns
      .map((day) => `<th class="${day.isLibur ? "lb-head" : ""}">${day.isLibur ? "LB" : escapeHtml(day.label)}</th>`)
      .join("");

    const summaryHtml = summaryRows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="row-label label">${escapeHtml(String(row.jenis))}</td>
      <td class="number">${formatNumber(row.avg, 0)}</td>
      <td class="number">${formatNumber(row.min, 0)}</td>
      <td class="number">${formatNumber(row.max, 0)}</td>
    </tr>`,
      )
      .join("\n");

    const monthTitle = formatTanggalId(meta.params.tglAwal).split("-")[1]
      ? bulanIndonesia(new Date(meta.params.tglAwal).getMonth() + 1)
      : "";

    const bodyHtml = `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 90px;">Jenis</th>
      <th rowspan="2">Target <br> Hari</th>
      <th rowspan="2">Target <br> Bulan</th>
      <th colspan="${dayColumns.length}">${escapeHtml(monthTitle.toUpperCase())}</th>
      <th rowspan="2" style="font-weight: bold">Total</th>
    </tr>
    <tr class="headers-row">
      ${dayHeader}
    </tr>
  </thead>
  <tbody>
    ${mainRows || `<tr class="data-row"><td colspan="${dayColumns.length + 4}">Tidak ada data.</td></tr>`}
  </tbody>
</table>
<table class="report-table summary-table">
  <thead>
    <tr class="headers-row">
      <th>Jenis</th>
      <th>Avg</th>
      <th>Min</th>
      <th>Max</th>
    </tr>
  </thead>
  <tbody>
    ${summaryHtml || `<tr class="data-row"><td colspan="4">Tidak ada data.</td></tr>`}
  </tbody>
</table>
<div class="chart-wrap">
  ${buildLineChartSvg(
    dayColumns.map((d) => d.label),
    chartSeries,
    { svgWidth: 980, svgHeight: 330, padLeft: 36, padRight: 10, padTop: 8, padBottom: 40 },
  )}
</div>`;

    return renderWpsReportPage({
      title: "Laporan Target Masuk Bahan Baku Harian",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      landscape: true,
      extraCss: HARIAN_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};

const bulanIndonesia = (monthIndex: number): string => {
  const names = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return names[monthIndex - 1] ?? "";
};
