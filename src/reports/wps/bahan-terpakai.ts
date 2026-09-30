import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import type { ReportDefinition } from "../types";
import {
  buildEmptyTableRow,
  renderWpsReportPage,
  singleDateParamsSchema,
  type SingleDateParams,
} from "./template";

/**
 * SPWps_LapBahanTerpakai + SPWps_LapSubBahanTerpakai — "Laporan Rangkuman Bahan
 * Terpakai". Ported from open-api-report's BahanTerpakaiReportService and
 * bahan-terpakai-pdf.blade.php.
 *
 * Two result sets, rendered in this order:
 *
 *   1. the sub procedure, grouped by Group, showing NamaMesin / Jenis / Tebal /
 *      Lebar / Ton / m3, where m3 is NOT returned by the procedure - it is
 *      Ton x 1.416, the legacy $tonToM3Factor;
 *   2. the main procedure, grouped by Group, showing NamaMesin / Jenis / Tebal /
 *      Lebar / Panjang / Jlh Batang / Kubik.
 *
 * Both tables carry their own group total in a tfoot, and the machine name is a
 * table column rather than a sub-heading: the procedure already returns one row
 * per machine, so grouping by machine as well would split rows that the legacy
 * report keeps side by side.
 *
 * Column names are verified against the live database as well as the reference
 * implementation: Group, NamaMesin, Jenis, Tebal, Lebar, Panjang, JmlhBatang,
 * KubikIN for the main set, and Group, NamaMesin, Jenis, Tebal, Lebar, Ton for
 * the sub set.
 *
 * The procedure declares a single @TglAwal (verified against sys.parameters),
 * so the request body is `{ tglAkhir }` bound to @TglAwal and the subtitle
 * reads "Per Tanggal", not a period.
 *
 * The sub procedure is optional at the service level: the reference falls back
 * to a no-argument call when the one-argument form is rejected, and skips the
 * section entirely when it still fails. It is reproduced here, so a deployment
 * whose sub procedure takes no date still gets the m3 report instead of an
 * error.
 */

interface BahanRow extends Record<string, unknown> {
  Group: string | null;
  NamaMesin: string | null;
  Jenis: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Panjang: number | string | null;
  JmlhBatang: number | string | null;
  KubikIN: number | string | null;
}

interface SubBahanRow extends Record<string, unknown> {
  Group: string | null;
  NamaMesin: string | null;
  Jenis: string | null;
  Tebal: number | string | null;
  Lebar: number | string | null;
  Ton: number | string | null;
}

/**
 * Ton to m3, the legacy $tonToM3Factor. Not returned by the procedure: the
 * sub report's m3 column is this multiplication of its Ton column.
 */
const TON_TO_M3_FACTOR = 1.416;

const SUB_COLUMNS = 6;
const MAIN_COLUMNS = 7;

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll(",", ".");
  if (normalized === "" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const num = (value: unknown): number => toFloat(value) ?? 0;

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy $formatNumber: four decimals, empty for a non-numeric value. */
const fmt = (value: unknown): string => {
  const numeric = toFloat(value);
  return numeric === null ? "" : formatNumber(numeric, 4);
};

/** Whole numbers, empty for a non-numeric value. */
const fmtInt = (value: unknown): string => {
  const numeric = toFloat(value);
  return numeric === null ? "" : formatNumber(Math.round(numeric), 0);
};

/** Legacy fallback for a blank label cell. */
const orDash = (value: unknown): string => toText(value) || "-";

const groupName = (row: Record<string, unknown>): string =>
  toText(row.Group) || "Tanpa Group";

/** Rows keyed by Group, in the order the procedure returned them. */
function groupRows<T extends Record<string, unknown>>(rows: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupName(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()];
}

const buildSubTable = (name: string, rows: SubBahanRow[]): string => {
  const totalTon = rows.reduce((sum, row) => sum + num(row.Ton), 0);
  const bodyRows = rows
    .map(
      (row, index) => {
        const ton = toFloat(row.Ton);
        return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="label data-cell">${escapeHtml(toText(row.NamaMesin))}</td>
        <td class="label data-cell">${escapeHtml(toText(row.Jenis))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.Tebal))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.Lebar))}</td>
        <td class="number data-cell" style="font-weight: bold;">${escapeHtml(fmt(ton))}</td>
        <td class="number data-cell" style="font-weight: bold;">${escapeHtml(
          ton === null ? "" : fmt(ton * TON_TO_M3_FACTOR),
        )}</td>
      </tr>`;
      },
    )
    .join("\n      ");

  return `<p class="group-title">${escapeHtml(name)}</p>
  <table class="report-table">
    <thead>
      <tr class="headers-row">
        <th>NamaMesin</th>
        <th>Jenis</th>
        <th style="width: 62px;">Tebal</th>
        <th style="width: 62px;">Lebar</th>
        <th style="width: 90px;">Ton</th>
        <th style="width: 90px;">m3</th>
      </tr>
    </thead>
    <tfoot>
      ${
        rows.length > 0
          ? `<tr class="totals-row">
        <td colspan="4" class="number" style="text-align: center; font-weight: bold;">Total</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmt(totalTon))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(
          fmt(totalTon * TON_TO_M3_FACTOR),
        )}</td>
      </tr>`
          : ""
      }
    </tfoot>
    <tbody>
      ${bodyRows || `<tr class="data-row row-odd"><td class="data-cell" colspan="${SUB_COLUMNS}" style="text-align: center;">${EMPTY}</td></tr>`}
    </tbody>
  </table>`;
};

const buildMainTable = (name: string, rows: BahanRow[]): string => {
  const totalBatang = rows.reduce((sum, row) => sum + num(row.JmlhBatang), 0);
  const totalKubik = rows.reduce((sum, row) => sum + num(row.KubikIN), 0);
  const bodyRows = rows
    .map(
      (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="label data-cell">${escapeHtml(toText(row.NamaMesin))}</td>
        <td class="label data-cell">${escapeHtml(toText(row.Jenis))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.Tebal))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.Lebar))}</td>
        <td class="number data-cell">${escapeHtml(fmtInt(row.Panjang))}</td>
        <td class="number data-cell" style="font-weight: bold;">${escapeHtml(fmtInt(row.JmlhBatang))}</td>
        <td class="number data-cell" style="font-weight: bold;">${escapeHtml(fmt(row.KubikIN))}</td>
      </tr>`,
    )
    .join("\n      ");

  return `<p class="group-title">${escapeHtml(name)}</p>
  <table class="report-table">
    <thead>
      <tr class="headers-row">
        <th>NamaMesin</th>
        <th>Jenis</th>
        <th style="width: 62px;">Tebal</th>
        <th style="width: 62px;">Lebar</th>
        <th style="width: 76px;">Panjang</th>
        <th style="width: 80px;">Jlh Batang</th>
        <th style="width: 90px;">Kubik</th>
      </tr>
    </thead>
    <tfoot>
      ${
        rows.length > 0
          ? `<tr class="total-row totals-row">
        <td colspan="5" class="number" style="text-align: center; font-weight: bold;">Total</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmtInt(totalBatang))}</td>
        <td class="number" style="font-weight: bold;">${escapeHtml(fmt(totalKubik))}</td>
      </tr>`
          : ""
      }
    </tfoot>
    <tbody>
      ${bodyRows || `<tr class="data-row row-odd"><td class="data-cell" colspan="${MAIN_COLUMNS}" style="text-align: center;">${EMPTY}</td></tr>`}
    </tbody>
  </table>`;
};

const EMPTY = "Tidak ada data";

/**
 * The sub procedure is called with the date, and retried without it when the
 * server rejects the argument count. A failure on both is not fatal: the m3
 * report stands on its own and the sub section is simply absent.
 */
async function fetchSubRows(
  conn: sql.ConnectionPool,
  tglAwal: string,
): Promise<SubBahanRow[] | null> {
  try {
    const withDate = await conn
      .request()
      .input("TglAwal", sql.Date, tglAwal)
      .execute("SPWps_LapSubBahanTerpakai");
    return (withDate.recordset ?? []) as SubBahanRow[];
  } catch (error) {
    if (!isTooManyArguments(error)) return null;
  }
  try {
    const withoutDate = await conn.request().execute("SPWps_LapSubBahanTerpakai");
    return (withoutDate.recordset ?? []) as SubBahanRow[];
  } catch {
    return null;
  }
}

function isTooManyArguments(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("too many arguments specified")
  );
}

export const bahanTerpakaiReport: ReportDefinition<
  SingleDateParams,
  { rows: BahanRow[]; subRows: SubBahanRow[] }
> = {
  type: "bahan-terpakai",
  title: "Laporan Rangkuman Bahan Terpakai",
  paramsSchema: singleDateParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAkhir)
        .execute("SPWps_LapBahanTerpakai"),
      fetchSubRows(conn, params.tglAkhir),
    ]);
    return {
      rows: (mainResult.recordset ?? []) as BahanRow[],
      subRows: subResult ?? [],
    };
  },

  render(data, meta) {
    const parts: string[] = [];
    // The sub report leads the page, as in the reference blade.
    for (const [name, rows] of groupRows(data.subRows)) {
      parts.push(buildSubTable(name, rows));
    }
    for (const [name, rows] of groupRows(data.rows)) {
      parts.push(buildMainTable(name, rows));
    }
    if (parts.length === 0) {
      parts.push(`<table class="report-table"><tbody>${buildEmptyTableRow(MAIN_COLUMNS)}</tbody></table>`);
    }

    return renderWpsReportPage({
      title: "Laporan Rangkuman Bahan Terpakai",
      subtitle: `Per Tanggal : ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml: parts.join("\n"),
      style: "bahan_terpakai",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
