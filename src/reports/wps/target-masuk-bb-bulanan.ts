import sql from "mssql";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
  MONTHS_SHORT_ID,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";

/**
 * Special-case report: monthly target vs hasil per group (Target/Hasil row
 * pair per group, under-target highlighting), Avg/Min/Max/%-Capai summary
 * and a monthly line chart SVG. Ported from open-api-report's
 * TargetMasukBBBulananReportService + target-masuk-bb-bulanan-pdf.blade.php.
 */

const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

const seriesColor = (seriesName: string): string => {
  const key = seriesName.toUpperCase();
  if (key.includes("JABON")) return "#0d6efd";
  if (key.includes("PULAI")) return "#198754";
  if (key.includes("RAMBUNG")) return "#dc3545";
  return "#4b5563";
};

const monthKeyOf = (raw: Record<string, unknown>): string | null => {
  const tahun = String(raw.Tahun ?? "").trim();
  const bulan = String(raw.Bulan ?? "").trim();
  if (tahun !== "" && bulan !== "" && /^\d+$/.test(tahun) && /^\d+$/.test(bulan)) {
    return `${tahun.padStart(4, "0")}-${String(Number(bulan)).padStart(2, "0")}`;
  }
  // Fallback: BulanTahun like "Sep-26".
  const m = /^([A-Za-z]{3})-(\d{2,4})$/.exec(String(raw.BulanTahun ?? "").trim());
  if (m) {
    const monthIndex = MONTHS_SHORT_ID.findIndex(
      (name) => name.toUpperCase() === m[1].toUpperCase(),
    );
    if (monthIndex >= 0) {
      const year = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    }
  }
  return null;
};

function resolvePeriodMonths(startIso: string, endIso: string): Array<{ key: string; label: string }> {
  const start = new Date(`${startIso.slice(0, 7)}-01`);
  const end = new Date(`${endIso.slice(0, 7)}-01`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const months: Array<{ key: string; label: string }> = [];
  const current = new Date(start);
  while (current <= end) {
    months.push({
      key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS_SHORT_ID[current.getMonth()].toUpperCase()}-${String(current.getFullYear()).slice(2)}`,
    });
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}


const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

function buildPivot(
  rows: Array<Record<string, unknown>>,
  monthColumns: Array<{ key: string; label: string }>,
): {
  tableRows: Array<{ jenis: string; targets: number[]; values: number[]; total: number }>;
  summaryRows: Array<Record<string, unknown>>;
  chartSeries: Record<string, number[]>;
} {
  const indexByKey = new Map(monthColumns.map((m, index) => [m.key, index]));

  const groups = new Map<
    string,
    {
      targets: number[];
      values: number[];
      rawTotal: number;
      bulanCapai: number;
      totalBulanTarget: number;
      persenCapaiGroup: number;
    }
  >();

  for (const raw of rows) {
    const jenis = String(raw.NamaGroup ?? "").trim() || "Tanpa Group";
    const monthKey = monthKeyOf(raw);
    const index = monthKey !== null ? indexByKey.get(monthKey) : undefined;
    if (index === undefined) continue;

    let group = groups.get(jenis);
    if (!group) {
      group = {
        targets: monthColumns.map(() => 0),
        values: monthColumns.map(() => 0),
        rawTotal: 0,
        bulanCapai: 0,
        totalBulanTarget: 0,
        persenCapaiGroup: 0,
      };
      groups.set(jenis, group);
    }

    group.targets[index] = toFloat(raw.TgtPerHari);
    group.values[index] = roundHalfUp(toFloat(raw.hasil));
    group.rawTotal += toFloat(raw.hasil);
    group.bulanCapai = Number(raw.BulanCapaiGroup ?? group.bulanCapai);
    group.totalBulanTarget = Number(raw.TotalBulanGroup ?? group.totalBulanTarget);
    group.persenCapaiGroup = toFloat(raw.PersenCapaiGroup ?? group.persenCapaiGroup);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  const tableRows = sortedGroups.map(([jenis, group]) => ({
    jenis,
    targets: group.targets,
    values: group.values,
    total: roundHalfUp(group.rawTotal),
    bulanCapai: group.bulanCapai,
    totalBulanTarget: group.totalBulanTarget,
    persenCapaiGroup: group.persenCapaiGroup,
  }));

  const summaryRows = tableRows.map((row) => ({
    jenis: row.jenis,
    avg: roundHalfUp(row.total / Math.max(monthColumns.length, 1)),
    min: row.values.length > 0 ? Math.min(...row.values) : 0,
    max: row.values.length > 0 ? Math.max(...row.values) : 0,
    bulan_capai: row.bulanCapai,
    total_bulan_target: row.totalBulanTarget,
    persen_capai_group: row.persenCapaiGroup,
  }));

  const chartSeries: Record<string, number[]> = {};
  for (const row of tableRows) {
    chartSeries[row.jenis] = row.values;
  }

  return { tableRows, summaryRows, chartSeries };
}


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
    yStep: number;
  },
): string {
  const { svgWidth, svgHeight, padLeft, padRight, padTop, padBottom, yStep } = options;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  let maxChartValue = 0;
  for (const seriesValues of Object.values(chartSeries)) {
    for (const value of seriesValues) {
      maxChartValue = Math.max(maxChartValue, Math.round(toFloat(value)));
    }
  }
  maxChartValue = Math.max(yStep, Math.ceil(maxChartValue / yStep) * yStep);
  const yScale = maxChartValue > 0 ? plotHeight / maxChartValue : 1;
  const labelCount = labels.length;
  const xStep = labelCount > 1 ? plotWidth / (labelCount - 1) : 0;

  const parts: string[] = [];
  for (let y = 0; y <= maxChartValue; y += yStep) {
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
  let legendX = padLeft;
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

/**
 * A line chart needs at least two x categories. When the period covers a
 * single month the line collapses into a vertical stroke at the left edge and
 * carries no information, so fall back to horizontal bars: one bar per jenis
 * for that month, which is the comparison the reader actually wants.
 */
function buildSingleLabelBarChartSvg(
  label: string,
  chartSeries: Record<string, number[]>,
  options: { svgWidth: number; barHeight: number; gap: number; padLeft: number; padRight: number; padTop: number },
): string {
  const { svgWidth, barHeight, gap, padLeft, padRight, padTop } = options;
  const entries = Object.entries(chartSeries);
  const svgHeight = padTop * 2 + entries.length * (barHeight + gap) - gap;
  const plotWidth = svgWidth - padLeft - padRight;

  const maxValue = Math.max(
    1,
    ...entries.map(([, values]) => Math.round(toFloat(values[0]))),
  );
  const labelWidth = 4.2 * Math.max(...entries.map(([name]) => name.length), 4);

  const parts: string[] = [
    `<text x="${padLeft - labelWidth - 6}" y="${padTop - 3}" font-size="8" text-anchor="end" fill="#111827">${escapeHtml(label)}</text>`,
  ];

  entries.forEach(([seriesName, values], index) => {
    const value = Math.round(toFloat(values[0]));
    const y = padTop + index * (barHeight + gap);
    const width = maxValue > 0 ? (value / maxValue) * plotWidth : 0;
    const color = seriesColor(seriesName);
    parts.push(
      `<text x="${padLeft - 6}" y="${y + barHeight / 2 + 3}" font-size="8" text-anchor="end" fill="#111827">${escapeHtml(seriesName)}</text>`,
      `<rect x="${padLeft}" y="${y}" width="${Math.max(width, value > 0 ? 1 : 0)}" height="${barHeight}" fill="${color}" />`,
      `<text x="${padLeft + width + 5}" y="${y + barHeight / 2 + 3}" font-size="8" fill="#111827">${formatNumber(value, 0)}</text>`,
    );
  });

  return `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  ${parts.join("\n  ")}
</svg>`;
}

export const targetMasukBBBulananReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "target-masuk-bb-bulanan",
  title: "Laporan Target Masuk Bahan Baku Bulanan",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapTargetMasukBBBulanan");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const monthColumns = resolvePeriodMonths(meta.params.tglAwal, meta.params.tglAkhir);
    const { tableRows, summaryRows, chartSeries } = buildPivot(rows, monthColumns);
    const chartLabels = monthColumns.map((m) => m.label);

    // Main table: one Target/Hasil row pair per group (jenis rowspan 2);
    // zebra applies to the whole pair.
    const mainRows = tableRows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="row-label label" rowspan="2">${escapeHtml(row.jenis)}</td>
      <td class="metric-label">Target</td>
      ${monthColumns
        .map((_, i) => {
          const target = row.targets[i] ?? 0;
          return `<td class="number">${target === 0 ? "" : formatNumber(target, 0)}</td>`;
        })
        .join("")}
      <td class="number"></td>
    </tr>
    <tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="metric-label">Hasil</td>
      ${monthColumns
        .map((_, i) => {
          const target = row.targets[i] ?? 0;
          const value = row.values[i] ?? 0;
          return `<td class="number ${underTargetClass(target, value)}">${formatNumber(value, 0)}</td>`;
        })
        .join("")}
      <td class="number" style="font-weight: bold;">${formatNumber(row.total, 0)}</td>
    </tr>`,
      )
      .join("\n");

    const summaryHtml = summaryRows
      .map(
        (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="row-label label">${escapeHtml(String(row.jenis))}</td>
      <td class="number">${formatNumber(Number(row.avg), 0)}</td>
      <td class="number">${formatNumber(Number(row.min), 0)}</td>
      <td class="number">${formatNumber(Number(row.max), 0)}</td>
      <td class="number">${Number(row.bulan_capai)}/${Number(row.total_bulan_target)}</td>
      <td class="number" style="font-weight: bold;">${formatNumber(Number(row.persen_capai_group), 2)}%</td>
    </tr>`,
      )
      .join("\n");

    const mainTable = `<table class="report-table" style="margin-bottom: 20px">
  <thead>
    <tr class="headers-row">
      <th rowspan="2" style="width: 90px;">Jenis</th>
      <th>Target</th>
      ${monthColumns.map((m) => `<th>${escapeHtml(m.label)}</th>`).join("")}
      <th style="font-weight: bold">Total</th>
    </tr>
  </thead>
  <tbody>
    ${mainRows || buildEmptyTableRow(monthColumns.length + 3)}
  </tbody>
</table>`;
    const summaryTable = `<table class="report-table summary-table" style="margin-bottom: 20px">
  <thead>
    <tr class="headers-row">
      <th>Jenis</th>
      <th>Avg</th>
      <th>Min</th>
      <th>Max</th>
      <th>Bulan Capai</th>
      <th style="font-weight: bold">% Capai</th>
    </tr>
  </thead>
  <tbody>
    ${summaryHtml || buildEmptyTableRow(6)}
  </tbody>
</table>`;
    const chartHtml = tableRows.length > 0
      ? `<div class="chart-wrap">
  <p class="chart-title">Grafik Target Masuk Bahan Baku Bulanan</p>
  ${chartLabels.length < 2
    ? buildSingleLabelBarChartSvg(chartLabels[0] ?? "", chartSeries, {
        svgWidth: 1000,
        barHeight: 18,
        gap: 8,
        padLeft: 120,
        padRight: 40,
        padTop: 18,
      })
    : buildLineChartSvg(
        chartLabels,
        chartSeries,
        { svgWidth: 1000, svgHeight: 250, padLeft: 34, padRight: 10, padTop: 8, padBottom: 34, yStep: 100 },
      )}
</div>`
      : "";
    const bodyHtml = `${mainTable}${summaryRows.length > 0 ? summaryTable : ""}${chartHtml}`;

    return renderWpsReportPage({
      title: "Laporan Target Masuk Bahan Baku Bulanan",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      style: "target_masuk_bb_bulanan",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};

const underTargetClass = (target: number, value: number): string =>
  target > 0 && value < target ? "under-target" : "";
