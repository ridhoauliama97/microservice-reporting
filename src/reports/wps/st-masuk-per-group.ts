import sql from "mssql";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";

/**
 * SPWps_LapSTMasukPerGroup — "Laporan ST Masuk Per-Group". Ported from
 * open-api-report's StSawmillMasukPerGroupReportService +
 * st-sawmill-masuk-per-group-pdf.blade.php.
 *
 * Period params bound to the SP's own @TglAwal/@TglAkhir. Rows are folded
 * per Group, and inside each Group aggregated by Tebal (summing STTon), so a
 * group's SP rows that repeat a thickness collapse into one line.
 */

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

interface MasukRow extends Record<string, unknown> {
  Group: string;
  Tebal: number;
  STTon: number;
}

interface GroupBlock {
  name: string;
  items: Array<{ tebal: number; ton: number }>;
  sumTon: number;
}

function groupRows(rows: MasukRow[]): GroupBlock[] {
  const byGroup = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const name = row.Group.trim() || "Tanpa Group";
    let tebals = byGroup.get(name);
    if (!tebals) {
      tebals = new Map<string, number>();
      byGroup.set(name, tebals);
    }
    const key = row.Tebal.toFixed(2);
    tebals.set(key, (tebals.get(key) ?? 0) + row.STTon);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map(([name, tebals]) => {
      const items = [...tebals.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([tebal, ton]) => ({ tebal: Number(tebal), ton }));
      return {
        name,
        items,
        sumTon: items.reduce((sum, it) => sum + it.ton, 0),
      };
    });
}

const buildGroupTable = (block: GroupBlock, index: number): string => {
  const bodyRows = block.items
    .map(
      (item, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="number">${formatNumber(item.tebal, 2)}</td>
        <td class="number">${formatNumber(item.ton, 4)}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<div class="section-title">${index + 1}. ${escapeHtml(block.name)}</div>
<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 36px;">No</th>
      <th style="width: 70px;">Tebal</th>
      <th>ST (Ton)</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows}
    <tr class="totals-row">
      <td colspan="2" class="center">Total Per-Group</td>
      <td class="number">${formatNumber(block.sumTon, 4)}</td>
    </tr>
  </tbody>
</table>`;
};

export const stMasukPerGroupReport: ReportDefinition<
  PeriodParams,
  MasukRow[]
> = {
  type: "st-masuk-per-group",
  title: "Laporan ST Masuk Per-Group",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("TglAwal", sql.Date, params.tglAwal);
    request.input("TglAkhir", sql.Date, params.tglAkhir);
    const result = await request.execute("SPWps_LapSTMasukPerGroup");
    return ((result.recordset ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        Group: String(row.Group ?? ""),
        Tebal: toFloat(row.Tebal),
        STTon: toFloat(row.STTon),
      }),
    );
  },

  render(rows, meta) {
    const blocks = groupRows(rows);
    const bodyHtml = blocks.length
      ? blocks.map(buildGroupTable).join("\n")
      : `<div class="center">${EMPTY_DATA_MESSAGE}</div>`;
    return renderWpsReportPage({
      title: "Laporan ST Masuk Per-Group",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "saldo_barang_jadi_hidup_per_jenis_per_produk",
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
