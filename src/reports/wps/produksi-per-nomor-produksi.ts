import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import type { ReportDefinition, RenderMeta } from "../types";
import {
  buildEmptyTableRow,
  formatInt,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";

/**
 * The seven "Produksi Per Nomor Produksi" reports — one per product.
 *
 * All seven legacy blades are byte-identical except for the report title, and
 * all seven legacy services are the same code except for four settings: the
 * stored procedure, the machine name to fall back on, and the default Input and
 * Output section labels. So this is one factory instantiated seven times rather
 * than seven near-copies.
 *
 * The stored procedures all return the same fifteen columns and all take a
 * single @NoProduksi. Two of them are enough to see the shape:
 *
 *   Type    'Input' or 'Output'   which side of the machine this line belongs to
 *   Group   the process the material came from or went to, e.g. 'CCAkhir'
 *
 * `Type` is what splits the resultset into the two side-by-side tables. Note
 * that `Group` is spelled inconsistently upstream — the same process appears as
 * both `CCAkhir` and `CCAKHIR`, and both `Laminating` and `LAMINATING` — so it
 * is only ever used as a label, never compared.
 *
 * The legacy blade also chunked the rows by hand to fit a page and repeated the
 * title and header block on each chunk, a workaround for a renderer that did
 * not repeat table headers. Chromium does repeat them, so the tables here simply
 * flow and the header band appears on every page the table spans.
 */

const paramsSchema = z.object({
  noProduksi: z.string().trim().min(1).max(50),
});

export type ProduksiParams = z.infer<typeof paramsSchema>;

interface SpRow {
  NoProduksi?: unknown;
  NamaOperator?: unknown;
  NamaMesin?: unknown;
  Tanggal?: unknown;
  Shift?: unknown;
  JamKerja?: unknown;
  JmlhAnggota?: unknown;
  Group?: unknown;
  Type?: unknown;
  NoLabel?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Panjang?: unknown;
  JmlhBatang?: unknown;
  Kubik?: unknown;
}

/** One size line inside the Input or Output table. */
interface DetailRow {
  noLabel: string | null;
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  jmlhBatang: number;
  kubik: number;
}

interface Direction {
  /** The process name shown after "Input :" / "Output :". */
  label: string;
  rows: DetailRow[];
  totals: { count: number; jmlhBatang: number; kubik: number };
}

interface ProduksiData {
  meta: {
    noProduksi: string;
    tanggal: string;
    namaMesin: string;
    operator: string;
    shift: string;
    jamKerja: number | null;
    anggota: number | null;
  };
  input: Direction;
  output: Direction;
  /** Output volume over input volume, in percent; null when there is no input. */
  rendemen: number | null;
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

const toFloat = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * number_format($v, 4, '.', '') — four decimals with NO thousands separator,
 * which is how the legacy report printed volumes. The shared formatNumber4 adds
 * separators, so the two differ on any figure over 999.
 */
const fmtVolume = (value: number | null): string =>
  value === null ? "" : value.toFixed(4);

/** number_format($v, 2, '.', '') . '%', and '-' for a missing figure. */
const fmtPercent = (value: number | null): string =>
  value === null ? "-" : `${value.toFixed(2)}%`;

/** A date as dd-Mmm-yyyy, matching the legacy d-M-y with a full year. */
const fmtDate = (value: unknown): string => {
  if (value instanceof Date) return formatTanggalId(value.toISOString().slice(0, 10));
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (match) return formatTanggalId(`${match[1]}-${match[2]}-${match[3]}`);
  }
  return "";
};

// Sized for the 49% pane each table gets, not for the full page width: at 49%
// of a 559pt text column a table is 274pt, so "No Label" needs the largest
// share to carry "U.010933" and the three dimension columns are the narrowest.
// The headings "Tebal (mm)" and "Lebar (mm)" cannot fit one per line at any
// split that also fits the data, so they wrap to two lines as they did before.
const DETAIL_COLUMNS: ReportColumn[] = [
  { kind: "label", label: "No Label", field: "noLabel", width: "20%" },
  { kind: "number", label: "Tebal (mm)", field: "tebal", width: "12%", format: (v) => formatInt(v), align: "center" },
  { kind: "number", label: "Lebar (mm)", field: "lebar", width: "12%", format: (v) => formatInt(v), align: "center" },
  { kind: "number", label: "Panjang (ft)", field: "panjang", width: "18%", format: (v) => formatInt(v) },
  { kind: "number", label: "Jmlh Batang", field: "jmlhBatang", width: "19%", format: (v) => formatInt(v) },
  { kind: "number", label: "Kubik", field: "kubik", width: "19%", format: (v) => fmtVolume(v ?? null) },
];

const hasContent = (row: DetailRow): boolean =>
  row.noLabel !== null ||
  row.tebal !== null ||
  row.lebar !== null ||
  row.panjang !== null ||
  row.jmlhBatang !== 0 ||
  row.kubik !== 0;

const mapDetail = (row: SpRow): DetailRow => {
  const label = toText(row.NoLabel);
  return {
    noLabel: label === "" ? null : label,
    tebal: toFloat(row.Tebal),
    lebar: toFloat(row.Lebar),
    panjang: toFloat(row.Panjang),
    jmlhBatang: Math.round(toFloat(row.JmlhBatang) ?? 0),
    kubik: toFloat(row.Kubik) ?? 0,
  };
};

/**
 * Which side a row belongs to. `Type` carries 'Input' or 'Output' on every real
 * line; the legacy service also had a fallback that matched the process name
 * against 'cca' and 'finger', but that only ever worked for the Finger Joint
 * report and the other six were copies of it. Here the fallback compares
 * `Group` against the report's own configured labels, so it is right for all
 * seven.
 */
const detectDirection = (row: SpRow, spec: ProduksiSpec): "input" | "output" | null => {
  const type = toText(row.Type).toLowerCase();
  if (type !== "") {
    if (type.includes("input") || type.includes("masuk")) return "input";
    if (type.includes("output") || type.includes("keluar") || type.includes("hasil")) {
      return "output";
    }
  }
  const group = toText(row.Group).toLowerCase();
  if (group !== "") {
    if (group === spec.inputLabel.toLowerCase()) return "input";
    if (group === spec.outputLabel.toLowerCase()) return "output";
  }
  return null;
};

/** strcmp, not a natural compare — the legacy service sorted labels as plain text. */
const byLabel = (left: DetailRow, right: DetailRow): number =>
  (left.noLabel ?? "").localeCompare(right.noLabel ?? "", "en", { numeric: false });

const calculateTotals = (rows: DetailRow[]): Direction["totals"] => {
  const labels = new Set<string>();
  let jmlhBatang = 0;
  let kubik = 0;
  for (const row of rows) {
    jmlhBatang += row.jmlhBatang;
    kubik += row.kubik;
    const label = (row.noLabel ?? "").trim();
    if (label !== "") labels.add(label);
  }
  return { count: labels.size, jmlhBatang, kubik };
};

export function buildProduksiData(
  rows: SpRow[],
  spec: ProduksiSpec,
  noProduksi: string,
): ProduksiData {
  const first = rows[0] ?? {};
  const inputRows: DetailRow[] = [];
  const outputRows: DetailRow[] = [];
  let inputLabel: string | null = null;
  let outputLabel: string | null = null;

  for (const row of rows) {
    const detail = mapDetail(row);
    if (!hasContent(detail)) continue;

    const direction = detectDirection(row, spec);
    if (direction === "input") {
      inputRows.push(detail);
      inputLabel ??= toText(row.Group) || null;
    } else if (direction === "output") {
      outputRows.push(detail);
      outputLabel ??= toText(row.Group) || null;
    }
    // A line with no recognised direction is dropped, as in the legacy service.
  }

  inputRows.sort(byLabel);
  outputRows.sort(byLabel);

  const inputTotals = calculateTotals(inputRows);
  const outputTotals = calculateTotals(outputRows);

  return {
    meta: {
      noProduksi,
      tanggal: fmtDate(first.Tanggal),
      namaMesin: toText(first.NamaMesin) || spec.machineFallback,
      operator: toText(first.NamaOperator),
      shift: toText(first.Shift),
      jamKerja: toFloat(first.JamKerja),
      anggota: toFloat(first.JmlhAnggota),
    },
    input: { label: inputLabel ?? spec.inputLabel, rows: inputRows, totals: inputTotals },
    output: { label: outputLabel ?? spec.outputLabel, rows: outputRows, totals: outputTotals },
    rendemen:
      inputTotals.kubik > 0 ? (outputTotals.kubik / inputTotals.kubik) * 100 : null,
  };
}

const renderDetailTable = (direction: Direction, side: "input" | "output"): string => {
  const body = direction.rows.length
    ? direction.rows
        .map(
          (row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
            <td>${escapeHtml(row.noLabel ?? "")}</td>
            <td class="center">${escapeHtml(formatInt(row.tebal))}</td>
            <td class="center">${escapeHtml(formatInt(row.lebar))}</td>
            <td class="number">${escapeHtml(formatInt(row.panjang))}</td>
            <td class="number">${escapeHtml(formatInt(row.jmlhBatang))}</td>
            <td class="number">${escapeHtml(fmtVolume(row.kubik))}</td>
          </tr>`,
        )
        .join("\n            ")
    : buildEmptyTableRow(DETAIL_COLUMNS.length);

  const header = DETAIL_COLUMNS.map(
    (column) => `<th style="width: ${column.width};">${escapeHtml(column.label)}</th>`,
  ).join("");

  return `<p class="section-heading">${side === "input" ? "Input" : "Output"} : ${escapeHtml(direction.label)}</p>
    <table class="detail-table">
      <thead>
        <tr class="headers-row">${header}
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td class="center">${escapeHtml(fmtCount(direction.totals.count))}</td>
          <td class="total-label" colspan="3">Total :</td>
          <td class="number">${escapeHtml(fmtCount(direction.totals.jmlhBatang))}</td>
          <td class="number">${escapeHtml(fmtVolume(direction.totals.kubik))}</td>
        </tr>
      </tfoot>
    </table>`;
};

/**
 * Total row counts. `formatInt` renders a zero as an empty cell, which is right
 * for a data cell ("no value recorded") but wrong for a total: a blank next to
 * "Total :" reads as a rendering fault rather than as zero. A real total also
 * never needs the blank, so these always print a figure.
 */
function fmtCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The four settings that are the only difference between the seven reports. */
export interface ProduksiSpec {
  /** Registry key. */
  type: string;
  /** Report title, also the page heading. */
  title: string;
  /** Stored procedure, bound to @NoProduksi. */
  spName: string;
  /** Machine name shown when the row carries none. */
  machineFallback: string;
  /** Section label after "Input :" when no row supplies one. */
  inputLabel: string;
  /** Section label after "Output :" when no row supplies one. */
  outputLabel: string;
}

export function createProduksiPerNomorProduksiReport(
  spec: ProduksiSpec,
): ReportDefinition<ProduksiParams, ProduksiData> {
  return {
    type: spec.type,
    title: spec.title,
    paramsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const result = await conn
        .request()
        .input("NoProduksi", sql.VarChar(50), params.noProduksi)
        .execute(spec.spName);
      return buildProduksiData(
        (result.recordset ?? []) as SpRow[],
        spec,
        params.noProduksi,
      );
    },

    render(data: ProduksiData, meta: RenderMeta<ProduksiParams>) {
      const bodyHtml = `<table class="meta-grid">
    <tr>
      <td class="meta-pane-left">
        <table class="meta-table">
          <tr>
            <td class="meta-label">No Produksi</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.meta.noProduksi)}</td>
          </tr>
          <tr>
            <td class="meta-label">Tanggal</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.meta.tanggal)}</td>
          </tr>
          <tr>
            <td class="meta-label">Mesin</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.meta.namaMesin)}</td>
          </tr>
          <tr>
            <td class="meta-label">Operator</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.meta.operator)}</td>
          </tr>
        </table>
      </td>
      <td></td>
      <td class="meta-pane-right">
        <table class="meta-table">
          <tr>
            <td class="meta-label">Shift</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(data.meta.shift)}</td>
          </tr>
          <tr>
            <td class="meta-label">Jam Kerja</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(formatInt(data.meta.jamKerja))}</td>
          </tr>
          <tr>
            <td class="meta-label">Anggota</td>
            <td class="meta-sep">:</td>
            <td>${escapeHtml(formatInt(data.meta.anggota))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div class="report-block">
    <table class="split-grid">
      <tr>
        <td class="left-pane">${renderDetailTable(data.input, "input")}</td>
        <td class="gutter"></td>
        <td class="right-pane">${renderDetailTable(data.output, "output")}</td>
      </tr>
    </table>
    <p class="rendemen-line">Rendemen : ${escapeHtml(fmtVolume(data.output.totals.kubik))} / ${escapeHtml(fmtVolume(data.input.totals.kubik))} = ${escapeHtml(fmtPercent(data.rendemen))}</p>
  </div>`;

      return renderWpsReportPage({
        title: spec.title,
        bodyHtml,
        style: "produksi_per_nomor_produksi",
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const produksiFjPerNomorProduksiReport = createProduksiPerNomorProduksiReport({
  type: "produksi-fj-per-nomor-produksi",
  title: "Laporan Produksi Per Nomor Produksi Finger Joint",
  spName: "SPWps_LapProduksiFJ",
  machineFallback: "FINGER JOINT",
  inputLabel: "CCAKHIR",
  outputLabel: "FJ",
});

export const produksiLaminatingPerNomorProduksiReport =
  createProduksiPerNomorProduksiReport({
    type: "produksi-laminating-per-nomor-produksi",
    title: "Laporan Produksi Per Nomor Produksi Laminating",
    spName: "SPWps_LapProduksiLaminating",
    machineFallback: "LAMINATING",
    inputLabel: "FJ",
    outputLabel: "LAMINATING",
  });

export const produksiMouldingPerNomorProduksiReport =
  createProduksiPerNomorProduksiReport({
    type: "produksi-moulding-per-nomor-produksi",
    title: "Laporan Produksi Per Nomor Produksi Moulding",
    spName: "SPWps_LapProduksiMoulding",
    machineFallback: "MOULDING",
    inputLabel: "LAMINATING",
    outputLabel: "MOULDING",
  });

export const produksiPackingPerNomorProduksiReport =
  createProduksiPerNomorProduksiReport({
    type: "produksi-packing-per-nomor-produksi",
    title: "Laporan Produksi Per Nomor Produksi Packing",
    spName: "SPWps_LapProduksiPacking",
    machineFallback: "PACKING",
    inputLabel: "MOULDING",
    outputLabel: "PACKING",
  });

export const produksiS4SPerNomorProduksiReport = createProduksiPerNomorProduksiReport({
  type: "produksi-s4s-per-nomor-produksi",
  title: "Laporan Produksi Per Nomor Produksi S4S",
  spName: "SPWps_LapProduksiS4S",
  machineFallback: "S4S",
  inputLabel: "SAWN TIMBER",
  outputLabel: "S4S",
});

export const produksiSandingPerNomorProduksiReport =
  createProduksiPerNomorProduksiReport({
    type: "produksi-sanding-per-nomor-produksi",
    title: "Laporan Produksi Per Nomor Produksi Sanding",
    spName: "SPWps_LapProduksiSanding",
    machineFallback: "SANDING",
    inputLabel: "MOULDING",
    outputLabel: "SANDING",
  });

export const ProduksiCcAkhirPerNomorProduksiReport =
  createProduksiPerNomorProduksiReport({
    type: "produksi-cc-akhir-per-nomor-produksi",
    title: "Laporan Produksi Per Nomor Produksi CC Akhir",
    spName: "SPWps_LapProduksiCCAkhir",
    machineFallback: "CROSSCUT AKHIR",
    inputLabel: "LAMINATING",
    outputLabel: "CCAKHIR",
  });
