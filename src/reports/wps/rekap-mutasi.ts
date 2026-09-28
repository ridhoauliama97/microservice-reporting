import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition } from "../types";
import { buildEmptyTable, buildEmptyTableRow, renderWpsReportPage } from "./template";

/**
 * "Laporan Rekap Mutasi". Ported from RekapMutasiReportService and
 * rekap-mutasi-pdf.blade.php.
 *
 * Ten numbered sections, one per product, in a fixed order: Kayu Bulat (ton),
 * Kayu Bulat Rambung (kg), Sawntimber (ton), then the seven m3 production
 * families (S4S, Finger Joint, Moulding, Laminating, CC Akhir, Sanding, Barang
 * Jadi).
 *
 * The first three read a mutasi stored procedure directly. The other seven
 * aggregate a mutasi procedure by wood family (JABON, PULAI, RAMBUNG - any
 * other family is dropped) and pair it with a companion "SP_SubMutasi_..."
 * procedure that breaks the period's production input down by source, plus a
 * small Input / Output / Rendemen summary.
 *
 * Two legacy details worth naming:
 *
 * - The wood-family aggregation keeps only JABON, PULAI and RAMBUNG. A fourth
 *   family in the data would be summed into a group and then discarded.
 * - Only the S4S section labels its second column "Jenis Kayu"; the other six
 *   say just "Jenis", because the check is a substring test on the title.
 *
 * The SP column names contain upstream typos - BSOutptutMLD, LMTProdOuput,
 * S4SinptMLD, MldProdinpt, CCAInputCCA - which are reproduced verbatim
 * because that is how the procedures actually name their columns.
 *
 * Note on the report's own configured procedure: config/reports.php points
 * rekap_mutasi at SP_LapRekapMutasi, but the legacy service only ever calls it
 * from its health check. The report data comes from the mutasi procedures
 * above, so this port does the same and never queries SP_LapRekapMutasi.
 */

type Metric = number | null;

interface RekapRow {
  No: number;
  Jenis: string;
  /** A metric is null when the procedure did not return that column for the row. */
  [metric: string]: number | string | null;
}

interface SubTable {
  title: string;
  columns: Array<[string, string]>;
  rows: RekapRow[];
  totals: Record<string, number>;
}

interface Performance {
  leftLabel: string;
  rightLabel: string;
  input: number;
  output: number;
  rendemen: number | null;
}

interface RekapSection {
  key: string;
  title: string;
  valueFormat: "decimal4" | "integer0";
  columns: Array<[string, string]>;
  rows: RekapRow[];
  totals: Record<string, number>;
  inputTable?: SubTable;
  performance?: Performance;
}

interface RekapMutasiData {
  sections: RekapSection[];
}

const EPSILON = 0.0000001;
const WOOD_FAMILY_ORDER = ["JABON", "PULAI", "RAMBUNG"] as const;

const ST_WOOD_ORDER = [
  "JABON",
  "JABON TG",
  "KAYU LAT JABON",
  "KAYU LAT RAMBUNG",
  "PULAI",
  "RAMBUNG - MC 1",
  "RAMBUNG - MC 2",
  "RAMBUNG - STD",
  "SEMBARANG",
];

const SIMPLE_COLUMNS: Array<[string, string]> = [
  ["No", "No"],
  ["Jenis", "Jenis"],
  ["Awal", "Awal"],
  ["Masuk", "Masuk"],
  ["Keluar", "Keluar"],
  ["Jual", "Jual"],
  ["Akhir", "Akhir"],
];

const ST_COLUMNS: Array<[string, string]> = [
  ["No", "No."],
  ["Jenis", "Jenis Kayu"],
  ["Awal", "Awal"],
  ["Masuk", "Masuk"],
  ["Beli", "Beli"],
  ["AdjustmentPlus", "Adjust (+)"],
  ["AdjustmentMinus", "Adjust (-)"],
  ["BongkarSusunPlus", "B.Susun (+)"],
  ["BongkarSusunMinus", "B.Susun (-)"],
  ["Jual", "Jual"],
  ["Keluar", "Keluar"],
  ["Akhir", "Akhir"],
];

const BARANG_JADI_COLUMNS: Array<[string, string]> = [
  ["No", "No"],
  ["Jenis", "Jenis Kayu"],
  ["Awal", "Awal"],
  ["Masuk", "Masuk"],
  ["Plus", "Plus"],
  ["Minus", "Minus (-)"],
  ["Jual", "Jual"],
  ["Akhir", "Akhir"],
];

const SIMPLE_METRICS = ["Awal", "Masuk", "Keluar", "Jual", "Akhir"];
const ST_METRICS = [
  "Awal", "Masuk", "Beli", "AdjustmentPlus", "AdjustmentMinus",
  "BongkarSusunPlus", "BongkarSusunMinus", "Jual", "Keluar", "Akhir",
];
const PRODUCTION_METRICS = ["Awal", "Masuk", "Jual", "Keluar", "Akhir"];

/** Per-product main and companion procedures, and how each maps onto metrics. */
interface ProductionSpec {
  key: string;
  title: string;
  mainSp: string;
  subSp: string;
  inputTitle: string;
  inputColumns: string[];
  inputGrouped: boolean;
  mapper: (row: Record<string, unknown>) => Record<string, Metric>;
  leftLabel: string;
  rightLabel: string;
  outputColumn: string;
}

const PRODUCTION_SPECS: ProductionSpec[] = [
  {
    key: "s4s",
    title: "4. S4S (m3)",
    mainSp: "SP_Mutasi_S4S",
    subSp: "SP_SubMutasi_S4S",
    inputTitle: "Input S4S Produksi (m3)",
    inputColumns: ["FJ", "MLD", "S4S", "ST"],
    // S4S is the only section that lists its input rows individually.
    inputGrouped: false,
    mapper: (row) => ({
      Awal: toFloat(row.S4SAwal),
      Masuk: sumValues(row, ["S4SMasuk", "AdjOutputS4S", "BSOutputS4S", "ProdOutputS4S", "CCAProdOutputS4S"]),
      Jual: toFloat(row.JualS4S),
      Keluar: sumValues(row, ["AdjInputS4S", "BsInputS4S", "FJinputS4S", "MldInputS4S", "S4SInputS4S"]),
      Akhir: toFloat(row.AkhirS4S),
    }),
    leftLabel: "Input",
    rightLabel: "Output",
    outputColumn: "Keluar",
  },
  {
    key: "finger_joint",
    title: "5. Finger Joint (m3)",
    mainSp: "SP_Mutasi_FingerJoint",
    subSp: "SP_SubMutasi_FingerJoint",
    inputTitle: "Input FJ Produksi (m3)",
    inputColumns: ["CCAkhir", "S4S"],
    inputGrouped: true,
    mapper: (row) => ({
      Awal: toFloat(row.FJAwal),
      Masuk: sumValues(row, ["FJMasuk", "AdjOutputFJ", "BSOutputFJ", "FJProdOutput"]),
      Jual: toFloat(row.FJJual),
      Keluar: sumValues(row, ["AdjInptFJ", "BSInptFJ", "MldInptFJ", "CCAInptFJ", "S4SInptFJ", "SandInptFJ"]),
      Akhir: toFloat(row.FJAkhir),
    }),
    leftLabel: "Input",
    rightLabel: "Output",
    outputColumn: "Keluar",
  },
  {
    key: "moulding",
    title: "6. Moulding (m3)",
    mainSp: "SP_Mutasi_Moulding",
    subSp: "SP_SubMutasi_Moulding",
    inputTitle: "Input Moulding Produksi (m3)",
    inputColumns: ["BJ", "CCAkhir", "FJ", "Laminating", "Moulding", "S4S", "Sanding"],
    inputGrouped: true,
    mapper: (row) => ({
      Awal: toFloat(row.MLDAwal),
      Masuk: sumValues(row, ["MLDMasuk", "AdjOutputMLD", "BSOutptutMLD", "MLDProdOutput"]),
      Jual: toFloat(row.MLDJual),
      Keluar: sumValues(row, [
        "AdjInptMLD", "BSInptMLD", "MLDInptMLD", "CCAInptMLD",
        "LMTInptMLD", "PACKInptMLD", "SANDInptMLD", "S4SinptMLD",
      ]),
      Akhir: toFloat(row.MLDAkhir),
    }),
    leftLabel: "Input",
    rightLabel: "Output",
    outputColumn: "Keluar",
  },
  {
    key: "laminating",
    title: "7. Laminating (m3)",
    mainSp: "SP_Mutasi_Laminating",
    subSp: "SP_SubMutasi_Laminating",
    inputTitle: "Input Laminating Produksi (m3)",
    inputColumns: ["Moulding", "Reproses", "Sanding", "WIP"],
    inputGrouped: true,
    mapper: (row) => ({
      Awal: toFloat(row.LMTAwal),
      Masuk: sumValues(row, ["LMTMasuk", "AdjOutputLMT", "BSOutputLMT", "LMTProdOuput"]),
      Jual: toFloat(row.LMTJual),
      Keluar: sumValues(row, ["AdjInptLMT", "BSInptLMT", "CCAProdInptLMT", "MldProdInptLMT", "S4SProdInptLMT"]),
      Akhir: toFloat(row.LMTAkhir),
    }),
    leftLabel: "Input",
    rightLabel: "Output",
    outputColumn: "Keluar",
  },
  {
    key: "cca_akhir",
    title: "8. CC Akhir (m3)",
    mainSp: "SP_Mutasi_CCAkhir",
    subSp: "SP_SubMutasi_CCAkhir",
    inputTitle: "Input Cross Cut Akhir Produksi (m3)",
    inputColumns: ["BJ", "CCAkhir", "FJ", "Sanding", "Laminating"],
    inputGrouped: true,
    mapper: (row) => ({
      Awal: toFloat(row.CCAkhirAwal),
      Masuk: sumValues(row, ["CCAMasuk", "AdjOutputCCA", "BSOutputCCA", "CCAProdOutput"]),
      Jual: toFloat(row.CCAJual),
      Keluar: sumValues(row, [
        "AdjInptCCA", "BSInputCCA", "FJProdInpt", "MldProdinpt", "S4SProdInpt",
        "SandProdInpt", "LMTProdInpt", "PACKProdInpt", "CCAInputCCA",
      ]),
      Akhir: toFloat(row.CCAAkhir),
    }),
    // CC Akhir is the one section whose summary reads Output then Input.
    leftLabel: "Output",
    rightLabel: "Input",
    outputColumn: "Keluar",
  },
  {
    key: "sanding",
    title: "9. Sanding (m3)",
    mainSp: "SP_Mutasi_Sanding",
    subSp: "SP_SubMutasi_Sanding",
    inputTitle: "Input Sanding Produksi (m3)",
    inputColumns: ["BJ", "CCAkhir", "FJ", "Moulding", "Sanding"],
    inputGrouped: true,
    mapper: (row) => ({
      Awal: toFloat(row.SANDAwal),
      Masuk: sumValues(row, ["SANDMasuk", "AdjOutputSAND", "BSOutputSAND", "SANDProdOutput"]),
      Jual: toFloat(row.SANDJual),
      Keluar: sumValues(row, [
        "AdjInptSAND", "BSInptSAND", "LMTProdInptSAND", "PACKProdInptSAND",
        "CCAProdInptSand", "SANDProdInptSand", "MLDProdInptSand",
      ]),
      Akhir: toFloat(row.SANDAkhir),
    }),
    leftLabel: "Input",
    rightLabel: "Output",
    outputColumn: "Keluar",
  },
];

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Legacy toFloat: null for null, empty string and anything non-numeric. */
const toFloat = (value: unknown): Metric => {
  if (value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Sums the named columns, or null when the row has none of them. */
const sumValues = (row: Record<string, unknown>, keys: string[]): Metric => {
  let total = 0;
  let found = false;
  for (const key of keys) {
    const value = toFloat(row[key]);
    if (value !== null) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
};

const sumColumns = (rows: RekapRow[], columns: string[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const column of columns) totals[column] = 0;
  for (const row of rows) {
    for (const column of columns) {
      const value = toFloat(row[column]);
      if (value !== null) totals[column]! += value;
    }
  }
  return totals;
};

const hasNonZeroMetric = (row: Record<string, unknown>, columns: string[]): boolean =>
  columns.some((column) => Math.abs((toFloat(row[column]) ?? 0)) > EPSILON);

const stripPrefix = (label: string, prefix: string): string =>
  label.startsWith(prefix) ? label.slice(prefix.length) : label;

const woodFamilyFromJenis = (label: string): string => {
  const normalized = label.toUpperCase();
  if (normalized.includes("JABON")) return "JABON";
  if (normalized.includes("PULAI")) return "PULAI";
  if (normalized.includes("RAMBUNG")) return "RAMBUNG";
  const trimmed = normalized.trim();
  return trimmed === "" ? "-" : trimmed;
};

const formatKayuBulatJenis = (label: string): string =>
  stripPrefix(label, "KB ").split(" - ").join(" ").split("MC MATA").join("MC-MATA");

const cleanInputJenis = (label: string): string => {
  let result = label;
  for (const prefix of ["ST ", "S4S ", "FJ ", "MLD ", "LMT ", "CCA ", "SND ", "BJ "]) {
    result = stripPrefix(result, prefix);
  }
  return result.trim();
};

const renumber = (rows: RekapRow[]): RekapRow[] => rows.map((row, index) => ({ ...row, No: index + 1 }));

/** Legacy compareByOrder: known labels first in the given order, then alphabetical. */
const compareByOrder = (left: string, right: string, order: string[]): number => {
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  const a = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const b = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
  if (a !== b) return a - b;
  return left < right ? -1 : left > right ? 1 : 0;
};

/** Groups rows by wood family, keeping only JABON, PULAI and RAMBUNG. */
function aggregateByWoodGroup(
  sourceRows: Array<Record<string, unknown>>,
  mapper: (row: Record<string, unknown>) => Record<string, Metric>,
): RekapRow[] {
  const groups = new Map<string, RekapRow>();

  for (const row of sourceRows) {
    const family = woodFamilyFromJenis(toText(row.Jenis));
    let group = groups.get(family);
    if (!group) {
      group = { No: 0, Jenis: family, Awal: 0, Masuk: 0, Jual: 0, Keluar: 0, Akhir: 0 };
      groups.set(family, group);
    }
    for (const [key, value] of Object.entries(mapper(row))) {
      if (value !== null) group[key] = (group[key] as number) + value;
    }
  }

  return renumber(
    WOOD_FAMILY_ORDER.filter((family) => groups.has(family)).map(
      (family) => groups.get(family)!,
    ),
  );
}

/** Input rows grouped by wood family, dropping families with no activity. */
function buildInputRowsGroupedByFamily(
  sourceRows: Array<Record<string, unknown>>,
  columns: string[],
): RekapRow[] {
  const groups = new Map<string, RekapRow>();

  for (const row of sourceRows) {
    const family = woodFamilyFromJenis(toText(row.Jenis));
    let group = groups.get(family);
    if (!group) {
      group = { No: 0, Jenis: family };
      for (const column of columns) group[column] = 0;
      groups.set(family, group);
    }
    for (const column of columns) {
      const value = toFloat(row[column]);
      if (value !== null) group[column] = (group[column] as number) + value;
    }
  }

  return renumber(
    WOOD_FAMILY_ORDER.filter((family) => {
      const group = groups.get(family);
      return group !== undefined && hasNonZeroMetric(group, columns);
    }).map((family) => groups.get(family)!),
  );
}

/** Input rows listed individually, used by the S4S section. */
function buildInputRowsDetailed(
  sourceRows: Array<Record<string, unknown>>,
  columns: string[],
): RekapRow[] {
  const rows: RekapRow[] = [];
  for (const row of sourceRows) {
    const entry: RekapRow = { No: 0, Jenis: cleanInputJenis(toText(row.Jenis)) };
    for (const column of columns) entry[column] = toFloat(row[column]);
    if (hasNonZeroMetric(entry, columns)) rows.push(entry);
  }
  return renumber(rows);
}

function buildInputTable(title: string, rows: RekapRow[], columns: string[]): SubTable {
  return {
    title,
    columns: [["No", "No"], ["Jenis", "Jenis"], ...columns.map((c): [string, string] => [c, c])],
    rows,
    totals: sumColumns(rows, columns),
  };
}

function buildPerformanceBlock(
  sectionTotals: Record<string, number>,
  inputTable: SubTable,
  leftLabel: string,
  rightLabel: string,
  outputColumn: string,
): Performance {
  const input = inputTable.columns
    .map(([key]) => key)
    .filter((key) => key !== "No" && key !== "Jenis")
    .reduce((sum, key) => sum + (inputTable.totals[key] ?? 0), 0);
  const output = sectionTotals[outputColumn] ?? 0;
  return {
    leftLabel,
    rightLabel,
    input,
    output,
    rendemen: input > 0 ? (output / input) * 100 : null,
  };
}

function buildProductionSection(spec: ProductionSpec): RekapSection {
  return {
    key: spec.key,
    title: spec.title,
    valueFormat: "decimal4",
    // Only the S4S title contains "S4S", so only that section says "Jenis Kayu".
    columns: [
      ["No", "No"],
      ["Jenis", spec.title.includes("S4S") ? "Jenis Kayu" : "Jenis"],
      ["Awal", "Awal"],
      ["Masuk", "Masuk"],
      ["Jual", "Jual"],
      ["Keluar", "Keluar"],
      ["Akhir", "Akhir"],
    ],
    rows: [],
    totals: {},
    inputTable: buildInputTable(spec.inputTitle, [], spec.inputColumns),
    performance: { leftLabel: spec.leftLabel, rightLabel: spec.rightLabel, input: 0, output: 0, rendemen: null },
  };
}

/** Exported for tests: turns raw procedure rows into the report's sections. */
export function buildRekapMutasiSections(sources: {
  kayuBulat: Array<Record<string, unknown>>;
  kayuBulatKg: Array<Record<string, unknown>>;
  sawnTimber: Array<Record<string, unknown>>;
  barangJadi: Array<Record<string, unknown>>;
  barangJadiSub: Array<Record<string, unknown>>;
  /**
   * Main and companion rows per production spec key. A key that is absent, or
   * present but empty, still yields its section - just an empty one. The report
   * always renders all ten sections.
   */
  production: Record<
    string,
    { main: Array<Record<string, unknown>>; sub: Array<Record<string, unknown>> }
  >;
}): RekapSection[] {
  const sections: RekapSection[] = [];

  const kayuBulatRows: RekapRow[] = sources.kayuBulat.map((row, index) => ({
    No: index + 1,
    Jenis: formatKayuBulatJenis(toText(row.Jenis)),
    Awal: toFloat(row.SaldoAwal),
    Masuk: toFloat(row.SaldoMasuk),
    Keluar: toFloat(row.SaldoKeluar),
    Jual: toFloat(row.SaldoJual),
    Akhir: toFloat(row.SaldoAkhir),
  }));
  sections.push({
    key: "kayu_bulat",
    title: "1. Kayu Bulat (Ton)",
    valueFormat: "decimal4",
    columns: SIMPLE_COLUMNS,
    rows: kayuBulatRows,
    totals: sumColumns(kayuBulatRows, SIMPLE_METRICS),
  });

  const kgRows: RekapRow[] = sources.kayuBulatKg.map((row, index) => ({
    No: index + 1,
    Jenis: stripPrefix(toText(row.Jenis), "KB "),
    Awal: toFloat(row.SaldoAwal),
    Masuk: toFloat(row.SaldoMasuk),
    Keluar: toFloat(row.SaldoKeluar),
    Jual: toFloat(row.SaldoJual),
    Akhir: toFloat(row.SaldoAkhir),
  }));
  sections.push({
    key: "kayu_bulat_rambung_kg",
    title: "2. Kayu Bulat - Rambung (Kg)",
    // Kilograms print as whole numbers.
    valueFormat: "integer0",
    columns: SIMPLE_COLUMNS.map(([key, label]) => [key, key === "Jenis" ? "Jenis Grade Kayu" : label]),
    rows: kgRows,
    totals: sumColumns(kgRows, SIMPLE_METRICS),
  });

  const stRows: RekapRow[] = sources.sawnTimber.map((row) => ({
    No: 0,
    Jenis: stripPrefix(toText(row.Jenis), "ST "),
    Awal: toFloat(row.Awal),
    Masuk: toFloat(row.Masuk),
    Beli: toFloat(row.Beli),
    AdjustmentPlus: toFloat(row.AdjustmentPlus),
    AdjustmentMinus: toFloat(row.AdjustmentMinus),
    BongkarSusunPlus: toFloat(row.BongkarSusunPlus),
    BongkarSusunMinus: toFloat(row.BongkarSusunMinus),
    Jual: toFloat(row.Jual),
    Keluar: toFloat(row.Keluar),
    Akhir: toFloat(row.Akhir),
  }));
  stRows.sort((left, right) => compareByOrder(left.Jenis, right.Jenis, ST_WOOD_ORDER));
  sections.push({
    key: "sawntimber",
    title: "3. Sawntimber (Ton)",
    valueFormat: "decimal4",
    columns: ST_COLUMNS,
    rows: renumber(stRows),
    totals: sumColumns(renumber(stRows), ST_METRICS),
  });

  for (const spec of PRODUCTION_SPECS) {
    const { main = [], sub = [] } = sources.production[spec.key] ?? {};
    const mainRows = aggregateByWoodGroup(main, spec.mapper);
    const inputRows = spec.inputGrouped
      ? buildInputRowsGroupedByFamily(sub, spec.inputColumns)
      : buildInputRowsDetailed(sub, spec.inputColumns);
    const section = buildProductionSection(spec);
    section.rows = mainRows;
    section.totals = sumColumns(mainRows, PRODUCTION_METRICS);
    const inputTable = buildInputTable(spec.inputTitle, inputRows, spec.inputColumns);
    section.inputTable = inputTable;
    section.performance = buildPerformanceBlock(
      section.totals,
      inputTable,
      spec.leftLabel,
      spec.rightLabel,
      spec.outputColumn,
    );
    sections.push(section);
  }

  const barangJadiRows: RekapRow[] = sources.barangJadi.map((row, index) => ({
    No: index + 1,
    Jenis: stripPrefix(toText(row.Jenis), "BJ "),
    Awal: toFloat(row.Awal),
    Masuk: toFloat(row.Masuk),
    Plus: sumValues(row, ["AdjOutput", "BSOutput"]),
    Minus: sumValues(row, ["AdjInput", "BSInput", "Keluar"]),
    Jual: toFloat(row.Jual),
    Akhir: toFloat(row.Akhir),
  }));
  const barangJadiSection: RekapSection = {
    key: "barang_jadi",
    title: "10. Barang Jadi (m3)",
    valueFormat: "decimal4",
    columns: BARANG_JADI_COLUMNS,
    rows: barangJadiRows,
    totals: sumColumns(barangJadiRows, ["Awal", "Masuk", "Plus", "Minus", "Jual", "Akhir"]),
  };
  const barangJadiInput = buildInputTable(
    "Input Barang Jadi Produksi (m3)",
    buildInputRowsGroupedByFamily(sources.barangJadiSub, [
      "Moulding", "Sanding", "CCAkhir", "WIPLama", "BarangJadi",
    ]),
    ["Moulding", "Sanding", "CCAkhir", "WIPLama", "BarangJadi"],
  );
  barangJadiSection.inputTable = barangJadiInput;
  barangJadiSection.performance = buildPerformanceBlock(
    barangJadiSection.totals,
    barangJadiInput,
    "Input",
    "Output",
    "Jual",
  );
  sections.push(barangJadiSection);

  return sections;
}

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

/** Legacy $formatValue: blank at zero, otherwise four decimals or whole numbers. */
const formatValue = (value: Metric, format: "decimal4" | "integer0"): string => {
  if (value === null || Math.abs(value) < EPSILON) return "";
  return formatNumber(value, format === "integer0" ? 0 : 4);
};

/** Legacy $formatPlain: two decimals, and zero is not blanked. */
const formatPlain = (value: number | null): string =>
  value === null ? "" : formatNumber(value, 2);

/** Header labels that carry a forced line break in the legacy blade. */
const HEADER_BREAKS: Record<string, string> = {
  AdjustmentPlus: "Adjust<br>(+)",
  AdjustmentMinus: "Adjust<br>(-)",
  BongkarSusunPlus: "B. Susun<br>(+)",
  BongkarSusunMinus: "B. Susun<br>(-)",
};

const renderHeaderLabel = (key: string, label: string): string => {
  const forced = HEADER_BREAKS[key];
  if (forced) return forced;
  return escapeHtml(label).split("<br>").join("<br>");
};

const renderHeader = (columns: Array<[string, string]>): string =>
  columns
    .map(([key, label]) => {
      const width = key === "No" ? "42px" : key === "Jenis" ? "180px" : "";
      const style = width ? ` style="width: ${width};"` : "";
      return `<th${style}>${renderHeaderLabel(key, label)}</th>`;
    })
    .join("\n            ");

/**
 * Both tables end with the same totals row: the first two columns collapse into
 * a single "Total :" cell and the numeric columns follow.
 */
const renderTotalsRow = (
  columns: Array<[string, string]>,
  totals: Record<string, number>,
  format: "decimal4" | "integer0",
): string => {
  const numeric = columns.slice(2);
  return `<tr class="totals-row">
            <td class="center" colspan="2">Total :</td>
            ${numeric
              .map(([key]) => `<td class="number">${escapeHtml(formatValue(totals[key] ?? 0, format))}</td>`)
              .join("\n            ")}
          </tr>`;
};

const renderMainTable = (section: RekapSection): string => {
  const bodyRows = section.rows
    .map((row, index) => {
      const cells = section.columns
        .map(([key]) => {
          if (key === "No" || key === "Jenis") {
            const cellClass = key === "No" ? "center" : "label";
            return `<td class="${cellClass}">${escapeHtml(row[key])}</td>`;
          }
          return `<td class="number">${escapeHtml(formatValue(toFloat(row[key]), section.valueFormat))}</td>`;
        })
        .join("\n              ");
      return `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
              ${cells}
            </tr>`;
    })
    .join("\n            ");

  return `<table class="report-table rekap-main">
    <thead>
      <tr>
            ${renderHeader(section.columns)}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(section.columns.length)}
      ${renderTotalsRow(section.columns, section.totals, section.valueFormat)}
    </tbody>
  </table>`;
};

const renderInputTable = (table: SubTable): string => {
  const bodyRows = table.rows
    .map((row, index) => {
      const cells = table.columns
        .map(([key]) => {
          if (key === "No" || key === "Jenis") {
            const cellClass = key === "No" ? "center" : "label";
            return `<td class="${cellClass}">${escapeHtml(row[key])}</td>`;
          }
          return `<td class="number">${escapeHtml(formatValue(toFloat(row[key]), "decimal4"))}</td>`;
        })
        .join("\n              ");
      return `<tr class="${(index + 1) % 2 === 1 ? "row-odd" : "row-even"}">
              ${cells}
            </tr>`;
    })
    .join("\n            ");

  return `<div class="section-subtitle">${escapeHtml(table.title)}</div>
  <table class="report-table rekap-input">
    <thead>
      <tr>
            ${renderHeader(table.columns)}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || buildEmptyTableRow(table.columns.length)}
      ${renderTotalsRow(table.columns, table.totals, "decimal4")}
    </tbody>
  </table>`;
};

const renderPerformance = (performance: Performance): string => `<table class="performance-table">
    <tbody>
      <tr>
        <td class="center">${escapeHtml(performance.leftLabel)}</td>
        <td class="center">${escapeHtml(performance.rightLabel)}</td>
        <td class="center">Rendemen</td>
      </tr>
      <tr>
        <td class="number">${escapeHtml(formatPlain(performance.input))}</td>
        <td class="number">${escapeHtml(formatPlain(performance.output))}</td>
        <td class="number">${escapeHtml(performance.rendemen === null ? "" : `${formatPlain(performance.rendemen)}%`)}</td>
      </tr>
    </tbody>
  </table>`;

export const rekapMutasiReport: ReportDefinition<PeriodParams, RekapMutasiData> = {
  type: "rekap-mutasi",
  title: "Laporan Rekap Mutasi",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const run = async (sp: string): Promise<Array<Record<string, unknown>>> => {
      const result = await conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute(sp);
      return (result.recordset ?? []) as Array<Record<string, unknown>>;
    };

    // Seventeen procedures: ten mutasi, seven companion input breakdowns.
    const [
      kayuBulat, kayuBulatKg, sawnTimber, barangJadi, barangJadiSub,
      ...productionSets
    ] = await Promise.all([
      run("SP_Mutasi_KayuBulat"),
      run("SP_Mutasi_KayuBulatKG"),
      run("SP_Mutasi_ST"),
      run("SP_Mutasi_BarangJadi"),
      run("SP_SubMutasi_BarangJadi"),
      ...PRODUCTION_SPECS.flatMap((spec) => [run(spec.mainSp), run(spec.subSp)]),
    ]);

    const production: Record<string, { main: Array<Record<string, unknown>>; sub: Array<Record<string, unknown>> }> = {};
    PRODUCTION_SPECS.forEach((spec, index) => {
      production[spec.key] = { main: productionSets[index * 2]!, sub: productionSets[index * 2 + 1]! };
    });

    return {
      sections: buildRekapMutasiSections({
        kayuBulat,
        kayuBulatKg,
        sawnTimber,
        barangJadi,
        barangJadiSub,
        production,
      }),
    };
  },

  render(data, meta) {
    const bodyHtml = data.sections
      .map((section) => {
        const parts = [
          `<div class="section-title">${escapeHtml(section.title)}</div>`,
          renderMainTable(section),
        ];
        if (section.inputTable) parts.push(renderInputTable(section.inputTable));
        if (section.performance) parts.push(renderPerformance(section.performance));
        return parts.join("\n  ");
      })
      .join("\n  ");

    return renderWpsReportPage({
      title: "Laporan Rekap Mutasi",
      subtitle: `Periode ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml: bodyHtml || buildEmptyTable(1),
      style: "rekap_mutasi",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
