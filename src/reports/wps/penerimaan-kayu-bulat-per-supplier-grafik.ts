import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
  MONTHS_SHORT_ID,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * Special-case report (legacy grafik layout): pivot table per supplier x
 * month for every group + an SVG bar chart per group. Ported from
 * open-api-report's PenerimaanKayuBulatPerSupplierBulananGrafikReportService
 * + penerimaan-bulanan-per-supplier-grafik-pdf.blade.php. SVG needs no JS.
 */

interface PivotSupplier {
  supplier: string;
  monthValues: Record<string, number>;
  total: number;
}

interface PivotGroup {
  name: string;
  monthKeys: string[];
  monthLabels: string[];
  suppliers: PivotSupplier[];
  summary: {
    supplierCount: number;
    total: number;
    avg: number;
    min: number;
    max: number;
  };
}

const fmt4BlankZero = (value: number | null | undefined): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const fmt2BlankZero = (value: number | null | undefined): string =>
  formatNumber(value, 2, { blankWhenZero: true });

const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  const monthIndex = Number(month);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) return monthKey;
  return `${MONTHS_SHORT_ID[monthIndex - 1]} ${year}`;
};

function buildPivot(rows: Array<Record<string, unknown>>): PivotGroup[] {
  const grouped = new Map<
    string,
    { months: Set<string>; suppliers: Map<string, Map<string, number>> }
  >();

  for (const raw of rows) {
    const groupName = String(raw.NamaGroup ?? "").trim() || "Tanpa Group";
    const supplier = String(raw.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const rawDate = raw.Date;
    if (!(rawDate instanceof Date)) continue;
    const monthKey = rawDate.toISOString().slice(0, 7); // "YYYY-MM"
    const value = typeof raw.Hasil === "number" && Number.isFinite(raw.Hasil) ? raw.Hasil : 0;

    let entry = grouped.get(groupName);
    if (!entry) {
      entry = { months: new Set<string>(), suppliers: new Map() };
      grouped.set(groupName, entry);
    }
    entry.months.add(monthKey);
    const supplierMonths = entry.suppliers.get(supplier) ?? new Map<string, number>();
    supplierMonths.set(monthKey, (supplierMonths.get(monthKey) ?? 0) + value);
    entry.suppliers.set(supplier, supplierMonths);
  }

  const groupNames = [...grouped.keys()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  return groupNames.map((groupName) => {
    const entry = grouped.get(groupName)!;
    const monthKeys = [...entry.months].sort();

    const suppliers: PivotSupplier[] = [];
    for (const [supplierName, monthMap] of entry.suppliers) {
      const monthValues: Record<string, number> = {};
      let total = 0;
      for (const monthKey of monthKeys) {
        const val = monthMap.get(monthKey) ?? 0;
        monthValues[monthKey] = val;
        total += val;
      }
      if (total <= 0.0000001) continue; // legacy: suppliers without ton are dropped
      suppliers.push({ supplier: supplierName, monthValues, total });
    }
    suppliers.sort((a, b) => b.total - a.total); // descending, legacy order

    const monthTotals: Record<string, number> = {};
    for (const monthKey of monthKeys) {
      monthTotals[monthKey] = suppliers.reduce(
        (sum, s) => sum + (s.monthValues[monthKey] ?? 0),
        0,
      );
    }

    const totals = suppliers.map((s) => s.total);
    const sumTotal = totals.reduce((sum, t) => sum + t, 0);
    const summary = {
      supplierCount: suppliers.length,
      total: sumTotal,
      avg: totals.length > 0 ? sumTotal / totals.length : 0,
      min: totals.length > 0 ? Math.min(...totals) : 0,
      max: totals.length > 0 ? Math.max(...totals) : 0,
    };

    return {
      name: groupName,
      monthKeys,
      monthLabels: monthKeys.map(monthLabel),
      suppliers,
      summary,
    };
  });
}


function buildTableHtml(group: PivotGroup): string {
  const monthKeys = group.monthKeys;
  const monthShare = monthKeys.length > 0 ? 52 / monthKeys.length : 12;
  const headers = monthKeys
    .map(
      (_, index) =>
        `<th style="width: ${monthShare.toFixed(2)}%">${escapeHtml(group.monthLabels[index] ?? "")}</th>`,
    )
    .join("");

  const hasSuppliers = group.suppliers.length > 0;
  const bodyRows = hasSuppliers
    ? group.suppliers
        .map(
          (supplier, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="label">${escapeHtml(supplier.supplier)}</td>
        <td class="number">${fmt4BlankZero(supplier.total)}</td>
        ${monthKeys
          .map(
            (monthKey) => `<td class="number">${fmt4BlankZero(supplier.monthValues[monthKey] ?? 0)}</td>`,
          )
          .join("\n        ")}
      </tr>`,
        )
        .join("\n    ")
    : buildEmptyTableRow(2 + monthKeys.length);

  const monthTotalCells = monthKeys
    .map((monthKey) => `<td class="number">${fmt4BlankZero(supplier0(group, monthKey))}</td>`)
    .join("");

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 20%">Supplier</th>
      <th style="width: 12%">Total</th>
      ${headers}
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    ${hasSuppliers
      ? `<tr class="totals-row">
      <td style="text-align: center;">Total</td>
      <td class="number">${fmt4BlankZero(group.summary.total)}</td>
      ${monthTotalCells}
    </tr>`
      : ""}
  </tbody>
</table>`;
}

const supplier0 = (group: PivotGroup, monthKey: string): number =>
  group.suppliers.reduce((sum, s) => sum + (s.monthValues[monthKey] ?? 0), 0);

function buildSummaryNoteHtml(group: PivotGroup): string {
  return `<p class="summary-note"><span class="label">Keterangan:</span>
  Total = ${fmt4BlankZero(group.summary.total)},
  Avg = ${fmt2BlankZero(group.summary.avg)},
  Min = ${fmt2BlankZero(group.summary.min)},
  Max = ${fmt2BlankZero(group.summary.max)}.</p>`;
}

function buildSvgChartHtml(group: PivotGroup): string {
  const svgWidth = 960;
  const svgHeight = 300;
  const padLeft = 52;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 90;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const count = Math.max(group.suppliers.length, 1);
  const barGap = 6;
  const barWidth = Math.max(8, plotWidth / count - barGap);

  let maxVal = 0;
  for (const supplier of group.suppliers) {
    maxVal = Math.max(maxVal, supplier.total);
  }
  const yStep = group.name.trim().toUpperCase() === "RAMBUNG" ? 100 : 10;
  maxVal = maxVal > 0 ? maxVal : yStep;
  maxVal = Math.ceil(maxVal / yStep) * yStep;
  const yTicks = Math.max(1, Math.round(maxVal / yStep));

  const parts: string[] = [
    `<rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#fff" />`,
    `<line x1="${padLeft}" y1="${padTop + plotHeight}" x2="${padLeft + plotWidth}" y2="${padTop + plotHeight}" stroke="#333" stroke-width="1" />`,
    `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotHeight}" stroke="#333" stroke-width="1" />`,
  ];

  for (let i = 0; i <= yTicks; i++) {
    const tickVal = yStep * i;
    const y = padTop + plotHeight - plotHeight * (i / yTicks);
    parts.push(
      `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotWidth}" y2="${y}" stroke="#ddd" stroke-width="1" />`,
      `<text x="${padLeft - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="#444">${formatNumber(tickVal, 0)}</text>`,
    );
  }

  group.suppliers.forEach((supplier, index) => {
    const x = padLeft + index * (barWidth + barGap);
    const val = supplier.total;
    const barH = maxVal > 0 ? (val / maxVal) * plotHeight : 0;
    const y = padTop + plotHeight - barH;
    const label = supplier.supplier;
    const short = label.length > 24 ? `${label.slice(0, 24)}...` : label;
    parts.push(`<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="#0d6efd" />`);
    if (val > 0) {
      parts.push(
        `<text x="${x + barWidth / 2}" y="${y - 2}" font-size="8" text-anchor="middle" fill="#222">${formatNumber(val, 1)}</text>`,
      );
    }
    parts.push(
      `<text x="${x + barWidth / 2}" y="${padTop + plotHeight + 12}" font-size="8" text-anchor="end" transform="rotate(-45 ${x + barWidth / 2} ${padTop + plotHeight + 12})" fill="#333">${escapeHtml(short)}</text>`,
    );
  });

  return `<div class="chart-wrap">
  <p class="chart-title">Grafik Supplier Bulanan - ${escapeHtml(group.name)}</p>
  <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    ${parts.join("\n    ")}
  </svg>
</div>`;
}

export const penerimaanKayuBulatPerSupplierGrafikReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "penerimaan-kayu-bulat-per-supplier-grafik",
  title: "Laporan Penerimaan Kayu Bulat Per Supplier Bulanan (Grafik)",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LaPenerimaanKayuBulatBulananPerSupplier");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const groups = buildPivot(rows);

    // One page per group: group title -> pivot table -> keterangan -> chart.
    const blocks = groups.map((group, index) => {
      const pageBreak = index > 0 ? `<div class="section-break"></div>` : "";
      return `${pageBreak}
<div class="group-title">${escapeHtml(group.name)}</div>
${buildTableHtml(group)}
${buildSummaryNoteHtml(group)}
${buildSvgChartHtml(group)}`;
    });

    const bodyHtml =
      blocks.length > 0
        ? blocks.join("\n")
        : `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>Supplier</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(2)}</tbody>
</table>`;

    return renderWpsReportPage({
      title: "Laporan Penerimaan Kayu Bulat Per Supplier Bulanan (Grafik)",
      subtitle: `Periode ${start} s/d ${end}`,
      bodyHtml,
      style: "penerimaan_kayu_bulat_per_supplier_grafik",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
