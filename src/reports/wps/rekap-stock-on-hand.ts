import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * "Laporan Rekap Stock On Hand" — ten companion stored procedures, one per
 * product family, each taking the report period. Ported from
 * RekapStockOnHandReportService and rekap-stock-on-hand-pdf.blade.php.
 *
 * The ten sections are fixed and always all present, in this order: Kayu Bulat
 * and Sawn Timber (measured in Ton, the rest in m3), then the eight m3 families.
 *
 * Kayu Bulat and Sawn Timber can be compacted: past a thousand rows the
 * document-number column is dropped and the remaining size columns are grouped,
 * summing pieces and volume. That is opt-in per request (`compact: true`) and
 * off by default, so every detail is shown. It matters in practice - Sawn Timber
 * returns 8,477 rows for August 2026 and 16,957 for a quarter, which is 142 and
 * roughly 290 pages of table on its own - so long periods are better requested
 * compacted. The note above the table says when it happened and gives the
 * before/after row counts.
 *
 * Sections may be selected via an optional `sections` array; anything invalid
 * is ignored, and an empty or fully invalid selection falls back to all ten.
 */

interface SectionDefinition {
  key: string;
  label: string;
  spName: string;
  columns: readonly string[];
  /**
   * Present only where the section may be compacted; excludes the id column.
   * Compaction is opt-in per request via the `compact` parameter.
   */
  compactColumns?: readonly string[];
  idColumn: string;
  valueColumn: string;
  pcsColumn: string | null;
  unit: string;
}

const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  {
    key: "kb",
    label: "Kayu Bulat",
    spName: "SPWps_LapRekapStockOnHand_SubKB",
    columns: ["NoKayuBulat", "Jenis", "Grade", "Tebal", "Lebar", "Panjang", "Ton"],
    compactColumns: ["Jenis", "Grade", "Tebal", "Lebar", "Panjang", "Ton"],
    idColumn: "NoKayuBulat",
    valueColumn: "Ton",
    pcsColumn: null,
    unit: "Ton",
  },
  {
    key: "st",
    label: "Sawn Timber",
    spName: "SPWps_LapRekapStockOnHand_SubST",
    columns: ["NoST", "Jenis", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Ton"],
    // Compaction defined but not enabled by default: this section is why the
    // report is large - 8,477 rows for August 2026 - and folding it by size
    // drops the No ST column, which is the column the section exists to show.
    // Callers can opt in per request with `compact: true`.
    compactColumns: ["Jenis", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Ton"],
    idColumn: "NoST",
    valueColumn: "Ton",
    pcsColumn: "JmlhBatang",
    unit: "Ton",
  },
  { key: "s4s", label: "S4S", spName: "SPWps_LapRekapStockOnHand_SubS4S",
    columns: ["NoS4S", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoS4S", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "fj", label: "Finger Joint", spName: "SPWps_LapRekapStockOnHand_SubFJ",
    columns: ["NoFJ", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoFJ", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "moulding", label: "Moulding", spName: "SPWps_LapRekapStockOnHand_SubMoulding",
    columns: ["NoMoulding", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoMoulding", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "lmt", label: "Laminating", spName: "SPWps_LapRekapStockOnHand_SubLMT",
    columns: ["NoLaminating", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoLaminating", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "cca_akhir", label: "CCA Akhir", spName: "SPWps_LapRekapStockOnHand_SubCCAkhir",
    columns: ["NoCCAkhir", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoCCAkhir", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "sanding", label: "Sanding", spName: "SPWps_LapRekapStockOnHand_SubSanding",
    columns: ["NoSanding", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoSanding", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "bj", label: "Barang Jadi", spName: "SPWps_LapRekapStockOnHand_SubBJ",
    columns: ["NoBJ", "Jenis", "NamaBarangJadi", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoBJ", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
  { key: "reproses", label: "Reproses", spName: "SPWps_LapRekapStockOnHand_SubReproses",
    columns: ["NoReproses", "Jenis", "NamaGrade", "Tebal", "Lebar", "Panjang", "JmlhBatang", "Kubik"],
    idColumn: "NoReproses", valueColumn: "Kubik", pcsColumn: "JmlhBatang", unit: "M3" },
];

const SECTION_KEYS = SECTION_DEFINITIONS.map((section) => section.key);
const COMPACT_THRESHOLD = 1000;
/** Column headers shortened for the report, as the legacy blade remaps them. */
const HEADER_LABELS: Record<string, string> = {
  NoKayuBulat: "No KB",
  NoST: "No ST",
  NoS4S: "No S4S",
  NoFJ: "No FJ",
  NoMoulding: "No Moulding",
  NoLaminating: "No Laminating",
  NoCCAkhir: "No CCA",
  NoSanding: "No Sanding",
  NoBJ: "No BJ",
  NoReproses: "No Reproses",
  NamaBarangJadi: "Nama Barang Jadi",
  NamaGrade: "Nama Grade",
  JmlhBatang: "Pcs",
  Kubik: "m3",
  Ton: "Ton",
};

const SIZE_COLUMNS = ["Tebal", "Lebar", "Panjang"];

const paramsSchema = periodParamsSchema.extend({
  /** Optional filter; unknown keys are ignored and an empty pick means all ten. */
  sections: z.array(z.string()).optional(),
  /**
   * Fold the compactable sections (Kayu Bulat, Sawn Timber) by size once they
   * pass a thousand rows, which drops their document-number column. Off by
   * default so every detail is shown; turn it on for long periods, where the
   * full detail runs to hundreds of pages.
   */
  compact: z.boolean().optional(),
});

interface SectionData {
  key: string;
  label: string;
  unit: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  displayedRowCount: number;
  documentCount: number;
  totalPcs: number;
  totalValue: number;
  isCompacted: boolean;
}

interface StockOnHandData {
  sections: SectionData[];
  summary: { documentCount: number; totalPcs: number };
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $fmt4 / $fmt0: null and non-numeric both print empty. */
const fmt4 = (value: unknown): string =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? ""
    : formatNumber(Number(value), 4);
const fmt0 = (value: unknown): string =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? ""
    : formatNumber(Number(value), 0);

/**
 * Drops the document-number column and folds rows that share the same size,
 * summing pieces and volume. Sections without a compact column list never
 * compact, however many rows they return.
 */
function buildDisplayRows(
  definition: SectionDefinition,
  rows: Array<Record<string, unknown>>,
  compactEnabled: boolean,
): { columns: string[]; rows: Array<Record<string, unknown>>; isCompacted: boolean } {
  if (
    !compactEnabled ||
    !definition.compactColumns ||
    rows.length <= COMPACT_THRESHOLD
  ) {
    return { columns: [...definition.columns], rows, isCompacted: false };
  }

  const groupColumns = definition.compactColumns.filter(
    (column) => column !== definition.valueColumn && column !== definition.pcsColumn,
  );

  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = groupColumns
      .map((column) => String(row[column] ?? "").trim())
      .join("|");
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {};
      for (const column of groupColumns) bucket[column] = row[column] ?? null;
      if (definition.pcsColumn) bucket[definition.pcsColumn] = 0;
      bucket[definition.valueColumn] = 0;
      grouped.set(key, bucket);
    }
    if (definition.pcsColumn) {
      bucket[definition.pcsColumn] = toFloat(bucket[definition.pcsColumn]) + toFloat(row[definition.pcsColumn]);
    }
    bucket[definition.valueColumn] =
      toFloat(bucket[definition.valueColumn]) + toFloat(row[definition.valueColumn]);
  }

  return {
    columns: [...definition.compactColumns],
    rows: [...grouped.values()],
    isCompacted: true,
  };
}

export function buildSectionData(
  definition: SectionDefinition,
  rows: Array<Record<string, unknown>>,
  compactEnabled = false,
): SectionData {
  let totalValue = 0;
  let totalPcs = 0;
  const documents = new Set<string>();

  for (const row of rows) {
    totalValue += toFloat(row[definition.valueColumn]);
    if (definition.pcsColumn) totalPcs += toFloat(row[definition.pcsColumn]);
    const documentNo = String(row[definition.idColumn] ?? "").trim();
    if (documentNo !== "") documents.add(documentNo);
  }

  const display = buildDisplayRows(definition, rows, compactEnabled);
  return {
    key: definition.key,
    label: definition.label,
    unit: definition.unit,
    columns: display.columns,
    rows: display.rows,
    rowCount: rows.length,
    displayedRowCount: display.rows.length,
    documentCount: documents.size,
    totalPcs,
    totalValue,
    isCompacted: display.isCompacted,
  };
}

export const rekapStockOnHandReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  StockOnHandData
> = {
  type: "rekap-stock-on-hand",
  title: "Laporan Rekap Stock On Hand",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    // Unknown keys are dropped; an empty or fully invalid pick means all ten.
    const requested = (params.sections ?? [])
      .map((key) => key.trim().toLowerCase())
      .filter((key) => SECTION_KEYS.includes(key));
    const selected =
      requested.length === 0 ? SECTION_KEYS : [...new Set(requested)];

    const definitions = SECTION_DEFINITIONS.filter((d) => selected.includes(d.key));
    const rowSets = await Promise.all(
      definitions.map(async (definition) => {
        const result = await conn
          .request()
          .input("TglAwal", sql.Date, params.tglAwal)
          .input("TglAkhir", sql.Date, params.tglAkhir)
          .execute(definition.spName);
        return (result.recordset ?? []) as Array<Record<string, unknown>>;
      }),
    );

    const sections = definitions.map((definition, index) =>
      buildSectionData(definition, rowSets[index]!, params.compact === true),
    );

    return {
      sections,
      summary: {
        documentCount: sections.reduce((sum, s) => sum + s.documentCount, 0),
        totalPcs: sections.reduce((sum, s) => sum + s.totalPcs, 0),
      },
    };
  },

  render(data, meta) {
    const sectionsHtml = data.sections
      .map((section, sectionIndex) => {
        const bodyRows = section.rows
          .map((row, rowIndex) => {
            const cells = section.columns
              .map((column) => {
                const value = row[column] ?? null;
                if (SIZE_COLUMNS.includes(column)) {
                  return `<td class="center">${escapeHtml(fmt0(value))}</td>`;
                }
                if (column === "JmlhBatang") {
                  return `<td class="number">${escapeHtml(fmt0(value))}</td>`;
                }
                if (column === "Ton" || column === "Kubik") {
                  return `<td class="number">${escapeHtml(fmt4(value))}</td>`;
                }
                return `<td>${escapeHtml(value === null || value === undefined ? "" : String(value))}</td>`;
              })
              .join("\n              ");
            return `<tr class="${(rowIndex + 1) % 2 === 1 ? "row-odd" : "row-even"}">
              <td class="center">${rowIndex + 1}</td>
              ${cells}
            </tr>`;
          })
          .join("\n            ");

        // The total label spans the id and size columns, stopping just before the
        // pieces column, or before the value column where there is no pieces.
        const pcsIndex = section.columns.indexOf("JmlhBatang");
        const valueIndex = Math.max(
          section.columns.indexOf("Ton"),
          section.columns.indexOf("Kubik"),
        );
        const labelColspan =
          pcsIndex !== -1
            ? pcsIndex + 1
            : valueIndex !== -1
              ? valueIndex + 1
              : Math.max(1, section.columns.length);

        const totalCells = section.columns
          .map((column, index) => {
            if (index + 2 <= labelColspan) return "";
            if (column === "JmlhBatang") {
              return `<td class="number">${escapeHtml(fmt0(section.totalPcs))}</td>`;
            }
            if (column === "Ton" || column === "Kubik") {
              return `<td class="number">${escapeHtml(fmt4(section.totalValue))}</td>`;
            }
            return "<td></td>";
          })
          .join("\n            ");

        const note =
          section.isCompacted && section.displayedRowCount !== section.rowCount
            ? `<div class="compact-note">Detail diringkas per ukuran agar PDF lebih ringan. (${escapeHtml(fmt0(section.rowCount))} baris asli menjadi ${escapeHtml(fmt0(section.displayedRowCount))} baris rekap)</div>`
            : section.isCompacted
              ? '<div class="compact-note">Detail diringkas per ukuran agar PDF lebih ringan.</div>'
              : "";

        return `<div class="section-title">${sectionIndex + 1}. ${escapeHtml(section.label)}</div>
    ${note}
    <table class="report-table soh-section">
      <thead>
        <tr class="headers-row">
          <th style="width: 36px;">No</th>
          ${section.columns
            .map((column) => {
              const header = HEADER_LABELS[column] ?? column;
              const small = [...SIZE_COLUMNS, "JmlhBatang", "Ton", "Kubik"].includes(column);
              return `<th${small ? ' style="width: 64px;"' : ""}>${escapeHtml(header)}</th>`;
            })
            .join("\n          ")}
        </tr>
      </thead>
      <tbody>
        ${bodyRows || buildEmptyTableRow(1 + section.columns.length)}
        <tr class="totals-row">
          <td colspan="${labelColspan}" class="center">Total ${escapeHtml(section.label)}</td>
          ${totalCells}
        </tr>
      </tbody>
    </table>`;
      })
      .join("\n  ");

    const summaryRows = data.sections
      .map(
        (section, index) => `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
      <td>${escapeHtml(section.label)}</td>
      <td class="number">${escapeHtml(fmt0(section.documentCount))}</td>
      <td class="number">${escapeHtml(fmt0(section.rowCount))}</td>
      <td class="number">${escapeHtml(fmt0(section.totalPcs))}</td>
      <td class="number">${escapeHtml(fmt4(section.totalValue))}</td>
      <td class="center">${escapeHtml(section.unit)}</td>
    </tr>`,
      )
      .join("\n    ");

    const bodyHtml = `${sectionsHtml}
  <div class="section-title">Rangkuman</div>
  <table class="report-table soh-summary">
    <thead>
      <tr class="headers-row">
        <th>Kategori</th>
        <th style="width: 70px;">Dokumen</th>
        <th style="width: 70px;">Baris</th>
        <th style="width: 80px;">Total Pcs</th>
        <th style="width: 90px;">Total</th>
        <th style="width: 50px;">Unit</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRows || buildEmptyTableRow(6)}
      <tr class="totals-row">
        <td colspan="3" class="center">Grand Total</td>
        <td class="number">${escapeHtml(fmt0(data.summary.totalPcs))}</td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>`;

    return renderWpsReportPage({
      title: "Laporan Rekap Stock On Hand",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "rekap_stock_on_hand",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
