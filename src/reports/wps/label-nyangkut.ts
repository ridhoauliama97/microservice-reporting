import sql from "mssql";
import { z } from "zod";
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
 * SPWps_LapLabelNyangkut — "Laporan Label Nyangkut". Ported from
 * open-api-report's LabelNyangkutReportService and
 * label-nyangkut-pdf.blade.php.
 *
 * The report is grouped by the Ket column, one table per product family, each
 * closing with "Total {kelompok}". Two details that are easy to miss:
 *
 *   1. The Total column's unit is decided per GROUP, not per row: a group whose
 *      name matches /st/i is measured in Ton, everything else in m3. So the same
 *      Total column prints "0.0031 Ton" under the ST group and "0.0031 m3" under
 *      any other, and the group totals follow suit.
 *   2. The reference swaps JmlhBatang with the Description/Lokasi column, so
 *      the printed order is No, NoNyangkut, NoLabel, Jenis, Tebal, Lebar,
 *      Panjang, Description, Jmlh Batang, Ket, Total - Description lands where
 *      the stick count used to be. The per-group footer then sums from
 *      JmlhBatang onwards, which is why the swap has to happen before the
 *      column list is used, not after.
 *
 * A "Rendemen" column is dropped if the procedure ever returns one; it is not
 * part of this report's totals.
 *
 * Rows are sorted by group name, case-insensitively, so the tables come out in
 * a stable order between runs.
 *
 * The procedure declares no parameters, so the request body carries no params
 * and the page has no date subtitle. The reference prints the generation date
 * instead, which is what the subtitle here is.
 *
 * Column names are verified against the live database: NoNyangkut, NoLabel,
 * Jenis, Tebal, Lebar, Panjang, JmlhBatang, Description, Ket, Total.
 */

interface NyangkutRow extends Record<string, unknown> {
  NoNyangkut: string | null;
  NoLabel: string | null;
  Jenis: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Panjang: number | string | null;
  JmlhBatang: number | string | null;
  Description: string | null;
  Ket: string | null;
  Total: number | string | null;
}

interface NyangkutGroup {
  name: string;
  unit: "Ton" | "m3";
  rows: NyangkutRow[];
  totalBatang: number;
  totalVolume: number;
}

interface NyangkutData {
  groups: NyangkutGroup[];
}

/** The reference $findGroupColumn priorities, first match wins. */
const GROUP_COLUMN_CANDIDATES = [
  "ket",
  "keterangan",
  "namagroup",
  "group",
  "namaproses",
];

const COLUMNS = 11;

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "" || normalized === "-") return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replaceAll(".", "").replaceAll(",", ".")
        : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const num = (value: unknown): number => toFloat(value) ?? 0;

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const fmt = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 4);

const fmtInt = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 0);

/** The reference $resolveTotalUnit: a group named ...ST... is measured in Ton. */
export function resolveTotalUnit(groupName: string): "Ton" | "m3" {
  return /\bst\b/i.test(groupName) ? "Ton" : "m3";
}

function findGroupColumn(keys: string[]): string | undefined {
  const normalized = keys.map((key) => ({
    key,
    name: key.toLowerCase().replaceAll(" ", "").replaceAll("_", ""),
  }));
  for (const candidate of GROUP_COLUMN_CANDIDATES) {
    const hit = normalized.find((column) => column.name === candidate);
    if (hit) return hit.key;
  }
  return normalized.find((column) =>
    GROUP_COLUMN_CANDIDATES.includes(column.name),
  )?.key;
}

export function buildNyangkutGroups(rows: NyangkutRow[]): NyangkutData {
  const groupColumn = rows.length > 0 ? findGroupColumn(Object.keys(rows[0]!)) : undefined;

  const groups = new Map<string, NyangkutRow[]>();
  for (const row of rows) {
    const raw = groupColumn === undefined ? "" : toText(row[groupColumn]);
    const name = raw !== "" ? raw : "Tanpa Group";
    const bucket = groups.get(name);
    if (bucket) bucket.push(row)
    else groups.set(name, [row]);
  }

  return {
    groups: [...groups.entries()]
      // sortBy(strtolower(group)) in the reference, so the order is stable
      // between runs and independent of the procedure's row order.
      .sort(([left], [right]) => {
        const a = left.toLowerCase();
        const b = right.toLowerCase();
        return a < b ? -1 : a > b ? 1 : 0;
      })
      .map(([name, groupRows]) => ({
        name,
        unit: resolveTotalUnit(name),
        rows: groupRows,
        totalBatang: groupRows.reduce((sum, row) => sum + num(row.JmlhBatang), 0),
        totalVolume: groupRows.reduce((sum, row) => sum + num(row.Total), 0),
      })),
  };
}

const HEADERS = `
        <th style="width: 34px; text-align: center;">No</th>
        <th>No Nyangkut</th>
        <th>No Label</th>
        <th>Jenis</th>
        <th style="width: 54px;">Tebal</th>
        <th style="width: 54px;">Lebar</th>
        <th style="width: 64px;">Panjang</th>
        <th style="width: 80px;">Description</th>
        <th style="width: 80px;">Jmlh Batang</th>
        <th>Ket</th>
        <th style="width: 90px;">Total</th>`;

const buildGroupTable = (group: NyangkutGroup): string => {
  const bodyRows = group.rows
    .map((row, index) => {
      const total = toFloat(row.Total);
      return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${index + 1}</td>
        <td class="label">${escapeHtml(toText(row.NoNyangkut))}</td>
        <td class="label">${escapeHtml(toText(row.NoLabel))}</td>
        <td class="label">${escapeHtml(toText(row.Jenis))}</td>
        <td class="number">${escapeHtml(fmtInt(toFloat(row.Tebal)))}</td>
        <td class="number">${escapeHtml(fmtInt(toFloat(row.Lebar)))}</td>
        <td class="number">${escapeHtml(fmtInt(toFloat(row.Panjang)))}</td>
        <td class="label">${escapeHtml(toText(row.Description))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtInt(toFloat(row.JmlhBatang)))}</td>
        <td class="label">${escapeHtml(toText(row.Ket))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(
          total === null ? "" : `${fmt(total)} ${group.unit}`,
        )}</td>
      </tr>`;
    })
    .join("\n      ");

  return `<div class="section-title">${escapeHtml(group.name)}</div>
  <table class="report-table">
    <thead>
      <tr class="headers-row">${HEADERS}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(COLUMNS)}
      <tr class="totals-row">
        <td colspan="7" class="blank" style="text-align: center;">Total ${escapeHtml(group.name)}</td>
        <td class="number">${escapeHtml(fmtInt(group.totalBatang))}</td>
        <td></td>
        <td class="number">${escapeHtml(`${fmt(group.totalVolume)} ${group.unit}`)}</td>
      </tr>
    </tbody>
  </table>`;
};

export const labelNyangkutReport: ReportDefinition<
  Record<never, never>,
  NyangkutData
> = {
  type: "label-nyangkut",
  title: "Laporan Label Nyangkut",
  // The procedure takes no parameters, so sending any must fail loudly.
  paramsSchema: z.strictObject({}),

  async fetchData(_params, { pool }) {
    const conn = await pool;
    const result = await conn.request().execute("SPWps_LapLabelNyangkut");
    return buildNyangkutGroups((result.recordset ?? []) as NyangkutRow[]);
  },

  render(data, meta) {
    const bodyHtml =
      data.groups.length > 0
        ? data.groups.map(buildGroupTable).join("\n  ")
        : `<table class="report-table"><tbody>${buildEmptyTableRow(COLUMNS)}</tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan Label Nyangkut",
      // The reference prints the generation date, not a report period: the
      // procedure takes no date at all.
      subtitle: `Per Tanggal : ${formatTanggalId(
        meta.generatedAt.toISOString().slice(0, 10),
      )}`,
      bodyHtml,
      style: "label_nyangkut",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
