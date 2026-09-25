import sql from "mssql";
import { z } from "zod";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage } from "./template";
import type { ReportDefinition, RenderResult } from "../types";

const EPSILON = 0.0000001;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export interface RekapPenerimaanStSawmillCostingRambungParams {
  tglAwal: string;
  tglAkhir: string;
  upahRacip: number;
  supplier: string;
}

/**
 * Upah racip (Rp per ton) drives the costing blocks. The legacy form leaves it
 * optional and falls back to its config value (REKAP_PRODUKTIVITAS_SAWMILL_RP
 * _UPAH_PER_TON, default 450000) — same default here so callers that omit it
 * get the legacy behaviour.
 */
const DEFAULT_UPAH_PER_TON = 450000;

const paramsSchema = z
  .object({
    tglAwal: isoDate,
    tglAkhir: isoDate,
    upahRacip: z.coerce.number().min(0).default(DEFAULT_UPAH_PER_TON),
    supplier: z.string().trim().max(200).default(""),
  })
  .refine((value) => value.tglAkhir >= value.tglAwal, {
    message: "tglAkhir tidak boleh lebih awal dari tglAwal",
    path: ["tglAkhir"],
  });

interface MainRow extends Record<string, unknown> {
  InOut: number | null;
  NoPenerimaanST: string | null;
  TglLaporan: Date | string | null;
  NoKayuBulat: string | null;
  NmSupplier: string | null;
  NmSupplier2: string | null;
  NmSupplier3: string | null;
  NoTruk: number | null;
  Jenis: string | null;
  NoMeja: string | null;
  NamaGrade: string | null;
  Harga: number | bigint | string | null;
  JmlhBatang: number | null;
  KBTon: number | null;
  STTon: number | null;
  NamaGrade1: string | null;
  Ket: string | null;
}

interface SubRow extends Record<string, unknown> {
  InOut: number | null;
  NoPenerimaanST: string | null;
  NoKayuBulat: string | null;
  NoMeja: number | null;
  Grup: string | null;
  KBTon: number | null;
  STTon: number | null;
  Ket: string | null;
}

interface FetchedReportData {
  main: MainRow[];
  sub: SubRow[];
}

type Category = "input" | "output";
type GroupName = "bansaw" | "slp";
type ReceiptGroup = GroupName | "mixed" | "unknown";

interface DetailLine {
  grade: string;
  jmlhTruk: string;
  kb: number;
  st: number;
  percent: number;
}

interface TonnageTotals {
  kb: number;
  st: number;
  rendemen: number;
}

interface MoneyTotals {
  st: number;
  kb: number;
  upah: number;
  hasil: number;
}

interface ReceiptMeta {
  noPenSt: string;
  noKayuBulat: string;
  supplier: string;
  noTruk: string;
  jenisKayu: string;
  meja: string;
  tglPenerimaanSt: string;
}

interface ChartItem {
  grade: string;
  value: number;
  percent: number;
  color: string;
}

interface ReceiptData {
  key: string;
  group: ReceiptGroup;
  meta: ReceiptMeta;
  rows: Record<Category, DetailLine[]>;
  totals: TonnageTotals;
  money: MoneyTotals;
  balokRows: DetailLine[];
  chartData: ChartItem[];
  chartSvg: string;
}

interface DateGroup {
  key: string;
  label: string;
  receipts: ReceiptData[];
}

interface GradeAggregate {
  rows: Record<Category, DetailLine[]>;
  totals: TonnageTotals;
  money: MoneyTotals;
}

interface GroupSummaryTotals {
  kb: number;
  st: number;
}

interface SubReceiptData {
  lines: DetailLine[];
  groupTotals: Map<string, GroupSummaryTotals>;
}

interface ReportData {
  dateGroups: DateGroup[];
  grand: GradeAggregate;
  byGroup: Record<GroupName, GradeAggregate>;
  summaryByGroup: Record<GroupName, TonnageTotals>;
}

const EMPTY_TOTALS = (): TonnageTotals => ({ kb: 0, st: 0, rendemen: 0 });
const EMPTY_MONEY = (): MoneyTotals => ({ st: 0, kb: 0, upah: 0, hasil: 0 });

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

const normalizeDateKey = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = toText(value);
  if (raw === "") return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const indonesian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (indonesian) {
    return `${indonesian[3]}-${indonesian[2].padStart(2, "0")}-${indonesian[1].padStart(2, "0")}`;
  }

  return raw;
};

const formatDateLabel = (dateKey: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? formatTanggalId(dateKey)
    : dateKey;

const receiptKeyForMain = (row: MainRow): string => {
  const noPen = toText(row.NoPenerimaanST);
  if (noPen !== "") return noPen;

  const parts = [row.NoKayuBulat, row.NmSupplier, row.NoTruk]
    .map(toText)
    .filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" | ") : "Tanpa Kunci";
};

const receiptKeyForSub = (row: SubRow): string => {
  const noPen = toText(row.NoPenerimaanST);
  if (noPen !== "") return noPen;

  const noKb = toText(row.NoKayuBulat);
  return noKb !== "" ? noKb : "Tanpa Kunci";
};

const normalizeCategory = (value: unknown): Category | null => {
  const raw = toText(value).toLowerCase();
  if (["input", "in", "1", "masuk"].includes(raw)) return "input";
  if (["output", "out", "0", "keluar"].includes(raw)) return "output";
  return null;
};

const outputGradeFallback = (grade: string): Category | null => {
  const normalized = grade.trim().toUpperCase();
  if (["KAYU LAT", "MC 1", "MC 2", "STD"].includes(normalized)) {
    return "output";
  }
  return null;
};

const metaFromRow = (row: MainRow): ReceiptMeta => ({
  noPenSt: toText(row.NoPenerimaanST),
  noKayuBulat: toText(row.NoKayuBulat),
  supplier: toText(row.NmSupplier),
  noTruk: toText(row.NoTruk),
  jenisKayu: toText(row.Jenis),
  meja: toText(row.NoMeja),
  tglPenerimaanSt: toText(row.TglLaporan),
});

const mergeMeta = (target: ReceiptMeta, incoming: ReceiptMeta): void => {
  for (const key of Object.keys(target) as Array<keyof ReceiptMeta>) {
    if (toText(target[key]) === "" && toText(incoming[key]) !== "") {
      target[key] = incoming[key];
    }
  }
};

const buildReceiptDateIndex = (rows: MainRow[]): Map<string, string> => {
  const index = new Map<string, string>();
  for (const row of rows) {
    const noPen = toText(row.NoPenerimaanST);
    const dateKey = normalizeDateKey(row.TglLaporan);
    if (noPen !== "" && dateKey !== "") index.set(noPen, dateKey);
  }
  return index;
};

const buildSubData = (rows: SubRow[]): Map<string, SubReceiptData> => {
  const result = new Map<string, SubReceiptData>();
  const byLabel = new Map<string, Map<string, DetailLine>>();

  for (const row of rows) {
    const receiptKey = receiptKeyForSub(row);
    let receipt = result.get(receiptKey);
    if (!receipt) {
      receipt = { lines: [], groupTotals: new Map() };
      result.set(receiptKey, receipt);
    }

    let receiptLabels = byLabel.get(receiptKey);
    if (!receiptLabels) {
      receiptLabels = new Map();
      byLabel.set(receiptKey, receiptLabels);
    }

    const kb = toNumber(row.KBTon);
    const st = toNumber(row.STTon);
    const inOut = normalizeCategory(row.InOut);
    const noMeja = toText(row.NoMeja);
    const label = noMeja !== "" ? `NoMeja ${noMeja}` : "";

    let line = receiptLabels.get(label);
    if (!line) {
      line = { grade: label, jmlhTruk: "", kb: 0, st: 0, percent: 0 };
      receiptLabels.set(label, line);
    }

    if (Math.abs(kb) > EPSILON && Math.abs(st) > EPSILON) {
      line.kb += kb;
      line.st += st;
    } else if (inOut === "output") {
      line.st += st;
    } else if (inOut === "input") {
      line.kb += kb;
    } else {
      line.kb += kb;
      line.st += st;
    }

    const group = toText(row.Grup);
    if (group !== "") {
      const current = receipt.groupTotals.get(group) ?? { kb: 0, st: 0 };
      current.kb += kb;
      current.st += st;
      receipt.groupTotals.set(group, current);
    }
  }

  for (const [receiptKey, receiptLabels] of byLabel) {
    const receipt = result.get(receiptKey);
    if (!receipt) continue;

    for (const line of receiptLabels.values()) {
      line.percent = line.kb > 0 ? (line.st / line.kb) * 100 : 0;
      receipt.lines.push(line);
    }
    for (const [groupName, totals] of receipt.groupTotals) {
      receipt.lines.push({
        grade: `Total ${groupName}`,
        jmlhTruk: "",
        kb: totals.kb,
        st: totals.st,
        percent: totals.kb > 0 ? (totals.st / totals.kb) * 100 : 0,
      });
    }
  }

  return result;
};

const receiptGroupFor = (subReceipt: SubReceiptData | undefined): ReceiptGroup => {
  if (!subReceipt) return "unknown";
  let hasBansaw = false;
  let hasSlp = false;
  for (const line of subReceipt.lines) {
    const label = line.grade.toUpperCase();
    if (label.includes("TOTAL BANSAW")) hasBansaw = true;
    if (label.includes("TOTAL SLP")) hasSlp = true;
  }
  if (hasBansaw && !hasSlp) return "bansaw";
  if (hasSlp && !hasBansaw) return "slp";
  if (hasBansaw && hasSlp) return "mixed";
  return "unknown";
};

const addMoney = (target: MoneyTotals, source: MoneyTotals): void => {
  target.st += source.st;
  target.kb += source.kb;
  target.upah += source.upah;
  target.hasil += source.hasil;
};

const addLineToMap = (
  rowsByGrade: Map<string, DetailLine>,
  line: DetailLine,
): void => {
  const existing = rowsByGrade.get(line.grade);
  if (existing) {
    existing.kb += line.kb;
    existing.st += line.st;
  } else {
    rowsByGrade.set(line.grade, { ...line });
  }
};

const percentFor = (value: number, total: number): number =>
  total > 0 ? (value / total) * 100 : 0;

const buildChartData = (
  outputRows: DetailLine[],
  stTotal: number,
  colorsByGrade: Map<string, string>,
  fallbackColors: string[],
  state: { next: number },
): ChartItem[] => {
  if (stTotal <= 0) return [];

  const items: ChartItem[] = [];
  for (const line of outputRows) {
    if (line.st <= 0) continue;
    const key = line.grade.trim().toUpperCase();
    let color = colorsByGrade.get(key);
    if (!color) {
      color = fallbackColors[state.next % fallbackColors.length];
      state.next += 1;
      colorsByGrade.set(key, color);
    }
    items.push({
      grade: line.grade,
      value: line.st,
      percent: (line.st / stTotal) * 100,
      color,
    });
  }
  return items;
};

const CATEGORY_COLORS = new Map<string, string>([
  ["STD", "#3d85c6"],
  ["MC 1", "#6aa84f"],
  ["MC 2", "#f1c232"],
  ["KAYU LAT", "#e69138"],
]);

const FALLBACK_COLORS = [
  "#2c3e50",
  "#16a085",
  "#3498db",
  "#f39c12",
  "#9b59b6",
  "#e74c3c",
  "#1abc9c",
  "#f1c40f",
  "#e67e22",
  "#2ecc71",
  "#34495e",
  "#95a5a6",
];

const buildReportData = (
  mainRows: MainRow[],
  subRows: SubRow[],
  upahRacip: number,
): ReportData => {
  const subByReceipt = buildSubData(subRows);
  const receiptDateIndex = buildReceiptDateIndex(mainRows);
  const dateGroups = new Map<string, DateGroup>();
  const lastCategoryByReceipt = new Map<string, Category>();
  const receiptKeys = new Set<string>();
  const colorsByGrade = new Map<string, string>(CATEGORY_COLORS);
  const fallbackState = { next: 0 };
  let lastDateKey = "";

  for (const row of mainRows) {
    const noPen = toText(row.NoPenerimaanST);
    let dateKey = normalizeDateKey(row.TglLaporan);
    if (dateKey === "" && noPen !== "" && receiptDateIndex.has(noPen)) {
      dateKey = receiptDateIndex.get(noPen) ?? "";
    }
    if (dateKey === "" && lastDateKey !== "") dateKey = lastDateKey;
    lastDateKey = dateKey;

    const groupKey = dateKey !== "" ? dateKey : "Tanpa Tanggal";
    let dateGroup = dateGroups.get(groupKey);
    if (!dateGroup) {
      dateGroup = {
        key: groupKey,
        label: formatDateLabel(groupKey),
        receipts: [],
      };
      dateGroups.set(groupKey, dateGroup);
    }

    const receiptKey = receiptKeyForMain(row);
    receiptKeys.add(receiptKey);
    let receipt = dateGroup.receipts.find((item) => item.key === receiptKey);
    if (!receipt) {
      receipt = {
        key: receiptKey,
        group: receiptGroupFor(subByReceipt.get(receiptKey)),
        meta: metaFromRow(row),
        rows: { input: [], output: [] },
        totals: EMPTY_TOTALS(),
        money: EMPTY_MONEY(),
        balokRows: subByReceipt.get(receiptKey)?.lines ?? [],
        chartData: [],
        chartSvg: "",
      };
      dateGroup.receipts.push(receipt);
    } else {
      mergeMeta(receipt.meta, metaFromRow(row));
    }

    const rawGrade = toText(row.NamaGrade) || toText(row.NamaGrade1);
    const grade = rawGrade !== "" ? rawGrade : "Tanpa Grade";
    let category = normalizeCategory(row.InOut);
    if (category === null) category = outputGradeFallback(grade);
    if (category === null) category = lastCategoryByReceipt.get(receiptKey) ?? null;
    if (category === null) category = "input";
    lastCategoryByReceipt.set(receiptKey, category);

    const kb = toNumber(row.KBTon);
    const st = toNumber(row.STTon);
    const harga = toNumber(row.Harga);
    if (harga > 0) {
      if (category === "input" && Math.abs(kb) > EPSILON) {
        receipt.money.kb += kb * 1000 * harga;
      } else if (category === "output" && Math.abs(st) > EPSILON) {
        receipt.money.st += st * 1000 * harga;
      }
    }
    if (
      upahRacip > 0 &&
      category === "output" &&
      Math.abs(st) > EPSILON
    ) {
      receipt.money.upah += st * upahRacip;
    }

    if (rawGrade === "" && Math.abs(kb) < EPSILON && Math.abs(st) < EPSILON) {
      continue;
    }

    const bucket = receipt.rows[category];
    const existing = bucket.find((line) => line.grade === grade);
    if (existing) {
      existing.kb += kb;
      existing.st += st;
    } else {
      bucket.push({
        grade,
        // The legacy resolver has no JmlhTruk column in the fixed SP output.
        jmlhTruk: category === "input" ? "1" : "0",
        kb,
        st,
        percent: 0,
      });
    }
    receipt.totals.kb += kb;
    receipt.totals.st += st;
  }

  const grandRows: Record<Category, Map<string, DetailLine>> = {
    input: new Map(),
    output: new Map(),
  };
  const bansawRows: Record<Category, Map<string, DetailLine>> = {
    input: new Map(),
    output: new Map(),
  };
  const grand = {
    totals: EMPTY_TOTALS(),
    money: EMPTY_MONEY(),
  };
  const bansawAggregate: GradeAggregate = {
    rows: { input: [], output: [] },
    totals: EMPTY_TOTALS(),
    money: EMPTY_MONEY(),
  };

  for (const group of dateGroups.values()) {
    group.receipts.sort((left, right) =>
      left.key.localeCompare(right.key, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    for (const receipt of group.receipts) {
      receipt.totals.rendemen = percentFor(
        receipt.totals.st,
        receipt.totals.kb,
      );
      for (const line of receipt.rows.input) {
        line.percent = percentFor(line.kb, receipt.totals.kb);
      }
      for (const line of receipt.rows.output) {
        line.percent = percentFor(line.st, receipt.totals.st);
      }

      receipt.chartData = buildChartData(
        receipt.rows.output,
        receipt.totals.st,
        colorsByGrade,
        FALLBACK_COLORS,
        fallbackState,
      );
      receipt.chartSvg = renderPieChartSvg(receipt.chartData);

      if (
        Math.abs(receipt.money.hasil) < EPSILON &&
        (Math.abs(receipt.money.st) > EPSILON ||
          Math.abs(receipt.money.kb) > EPSILON ||
          Math.abs(receipt.money.upah) > EPSILON)
      ) {
        receipt.money.hasil =
          receipt.money.st - receipt.money.kb - receipt.money.upah;
      }

      addMoney(grand.money, receipt.money);
      grand.totals.kb += receipt.totals.kb;
      grand.totals.st += receipt.totals.st;
      if (receipt.group === "bansaw") {
        addMoney(bansawAggregate.money, receipt.money);
      }

      for (const category of ["input", "output"] as const) {
        for (const line of receipt.rows[category]) {
          addLineToMap(grandRows[category], line);
          if (receipt.group === "bansaw") {
            addLineToMap(bansawRows[category], line);
            bansawAggregate.totals.kb += line.kb;
            bansawAggregate.totals.st += line.st;
          }
        }
      }
    }
  }

  const orderedDateGroups = [...dateGroups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  grand.totals.rendemen = percentFor(grand.totals.st, grand.totals.kb);
  const grandInputRows = [...grandRows.input.values()];
  const grandOutputRows = [...grandRows.output.values()];
  for (const line of grandInputRows) {
    line.percent = percentFor(line.kb, grand.totals.kb);
  }
  for (const line of grandOutputRows) {
    line.percent = percentFor(line.st, grand.totals.st);
  }

  bansawAggregate.rows = {
    input: [...bansawRows.input.values()],
    output: [...bansawRows.output.values()],
  };
  bansawAggregate.totals.rendemen = percentFor(
    bansawAggregate.totals.st,
    bansawAggregate.totals.kb,
  );
  for (const line of bansawAggregate.rows.input) {
    line.percent = percentFor(line.kb, bansawAggregate.totals.kb);
  }
  for (const line of bansawAggregate.rows.output) {
    line.percent = percentFor(line.st, bansawAggregate.totals.st);
  }

  const slpInputRows: DetailLine[] = [];
  for (const line of grandInputRows) {
    const bansaw = bansawRows.input.get(line.grade);
    const kb = line.kb - (bansaw?.kb ?? 0);
    if (Math.abs(kb) < EPSILON) continue;
    slpInputRows.push({ ...line, kb, st: 0, percent: 0 });
  }
  const slpOutputRows: DetailLine[] = [];
  for (const line of grandOutputRows) {
    const bansaw = bansawRows.output.get(line.grade);
    const st = line.st - (bansaw?.st ?? 0);
    if (Math.abs(st) < EPSILON) continue;
    slpOutputRows.push({ ...line, kb: 0, st, percent: 0 });
  }

  const slpAggregate: GradeAggregate = {
    rows: { input: slpInputRows, output: slpOutputRows },
    totals: {
      kb: Math.max(0, grand.totals.kb - bansawAggregate.totals.kb),
      st: Math.max(0, grand.totals.st - bansawAggregate.totals.st),
      rendemen: 0,
    },
    money: {
      st: grand.money.st - bansawAggregate.money.st,
      kb: grand.money.kb - bansawAggregate.money.kb,
      upah: grand.money.upah - bansawAggregate.money.upah,
      hasil: grand.money.hasil - bansawAggregate.money.hasil,
    },
  };
  slpAggregate.totals.rendemen = percentFor(
    slpAggregate.totals.st,
    slpAggregate.totals.kb,
  );
  for (const line of slpAggregate.rows.input) {
    line.percent = percentFor(line.kb, slpAggregate.totals.kb);
  }
  for (const line of slpAggregate.rows.output) {
    line.percent = percentFor(line.st, slpAggregate.totals.st);
  }

  const grandAggregate: GradeAggregate = {
    rows: { input: grandInputRows, output: grandOutputRows },
    totals: grand.totals,
    money: grand.money,
  };

  const summaryByGroup = aggregateSubGroupTotals(subByReceipt, receiptKeys);
  for (const groupName of ["bansaw", "slp"] as const) {
    const summary = summaryByGroup[groupName];
    const aggregate = groupName === "bansaw" ? bansawAggregate : slpAggregate;
    if (Math.abs(summary.kb) < EPSILON && Math.abs(summary.st) < EPSILON) {
      summary.kb = aggregate.totals.kb;
      summary.st = aggregate.totals.st;
    }
    summary.rendemen = percentFor(summary.st, summary.kb);
  }

  return {
    dateGroups: orderedDateGroups,
    grand: grandAggregate,
    byGroup: { bansaw: bansawAggregate, slp: slpAggregate },
    summaryByGroup,
  };
};

const aggregateSubGroupTotals = (
  subByReceipt: Map<string, SubReceiptData>,
  receiptKeys: Set<string>,
): Record<GroupName, TonnageTotals> => {
  const totals: Record<GroupName, TonnageTotals> = {
    bansaw: EMPTY_TOTALS(),
    slp: EMPTY_TOTALS(),
  };

  for (const [receiptKey, receipt] of subByReceipt) {
    if (!receiptKeys.has(receiptKey)) continue;
    for (const [rawGroupName, groupTotals] of receipt.groupTotals) {
      const groupName = rawGroupName.trim().toLowerCase();
      if (groupName !== "bansaw" && groupName !== "slp") continue;
      totals[groupName].kb += groupTotals.kb;
      totals[groupName].st += groupTotals.st;
    }
  }

  for (const groupName of ["bansaw", "slp"] as const) {
    totals[groupName].rendemen = percentFor(
      totals[groupName].st,
      totals[groupName].kb,
    );
  }
  return totals;
};

const formatDetail = (value: number, decimals = 2): string =>
  formatNumber(value, decimals, { blankWhenZero: true });

const formatTotal = (value: number, decimals = 2): string =>
  formatNumber(value, decimals);

const formatPercentDetail = (value: number, decimals = 1): string => {
  const text = formatNumber(value, decimals, { blankWhenZero: true });
  return text === "" ? "" : `${text}%`;
};

const formatPercentTotal = (value: number, decimals = 1): string =>
  `${formatNumber(value, decimals)}%`;

const formatMoney = (value: number): string => {
  const [integerPart, decimalPart] = value.toFixed(2).split(".");
  const integerText = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${integerText},${decimalPart}`;
};

const formatProfitPercent = (hasil: number, st: number): string =>
  Math.abs(st) < EPSILON
    ? "0.0%"
    : `${formatNumber((hasil / st) * 100, 1)}%`;

const formatTruck = (value: string): string => {
  const raw = value.trim();
  return raw === "" || raw === "0" || raw === "0.0" ? "" : raw;
};

const pieChartPoint = (
  centerX: number,
  centerY: number,
  radius: number,
  degrees: number,
): readonly [number, number] => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [
    centerX + radius * Math.cos(radians),
    centerY + radius * Math.sin(radians),
  ];
};

const renderPieChartSvg = (items: ChartItem[]): string => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return "";

  const width = 340;
  const height = 340;
  const centerX = 170;
  const centerY = 170;
  const radius = 155;
  const parts = [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
  ];
  let startAngle = 0;

  items.forEach((item) => {
    if (item.value <= 0) return;
    const sweep = (item.value / total) * 360;
    const steps = Math.max(4, Math.ceil(sweep / 5));
    const points: string[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const [x, y] = pieChartPoint(
        centerX,
        centerY,
        radius,
        startAngle + sweep * (step / steps),
      );
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    parts.push(
      `<polygon points="${centerX},${centerY} ${points.join(" ")}" fill="${item.color}" stroke="#ffffff" stroke-width="1.5"/>`,
    );

    const percentText = `${formatNumber(item.percent, 1).replaceAll(",", "")}%`;
    const midAngle = startAngle + sweep / 2;
    if (sweep >= 20) {
      const [x, y] = pieChartPoint(centerX, centerY, radius * 0.62, midAngle);
      parts.push(
        `<text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" font-size="13" font-weight="bold" text-anchor="middle" fill="#000000">${escapeHtml(item.grade)}</text>`,
        `<text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" font-size="13" font-weight="bold" text-anchor="middle" fill="#000000">${percentText}</text>`,
      );
    } else if (sweep >= 3) {
      // Narrow slices cannot hold the grade name without the text spilling
      // past the slice edge and reading as clipped. The legend table beside
      // the chart already maps grade to percentage, so label the value only.
      const [x, y] = pieChartPoint(centerX, centerY, radius * 0.84, midAngle);
      parts.push(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" fill="#000000">${percentText}</text>`,
      );
    }

    startAngle += sweep;
  });

  parts.push("</svg>");
  return parts.join("\n");
};

const buildDetailTable = (
  rows: Record<Category, DetailLine[]>,
  totals: TonnageTotals,
  totalLabel = "Total",
): string => {
  let rowIndex = 0;

  const renderBlock = (category: Category): string => {
    const lines = rows[category];
    if (lines.length === 0) return "";

    return lines
      .map((line, lineIndex) => {
        rowIndex += 1;
        const prefix =
          lineIndex === 0
            ? `<td class="data-cell label" rowspan="${lines.length}" style="font-weight: bold;">${category === "input" ? "Input" : "Output"}</td>`
            : "";
        const truck = formatTruck(line.jmlhTruk);
        const tonnage = category === "input" ? line.kb : line.st;
        const isInput = category === "input";
        return `<tr class="data-row ${rowIndex % 2 === 1 ? "row-odd" : "row-even"}">
          ${prefix}
          <td class="data-cell center">${escapeHtml(truck)}</td>
          <td class="data-cell ${isInput ? "left" : "right"}" style="font-weight: bold;">${escapeHtml(line.grade)}</td>
          <td class="data-cell ${isInput ? "number" : "center"}">${isInput ? formatDetail(tonnage, 4) : ""}</td>
          <td class="data-cell ${isInput ? "center" : "number"}">${isInput ? "" : formatDetail(tonnage, 4)}</td>
          <td class="data-cell number" style="font-weight: bold;">${formatPercentDetail(line.percent, 1)}</td>
        </tr>`;
      })
      .join("\n");
  };

  const separator =
    rows.input.length > 0 && rows.output.length > 0
      ? `<tr class="section-separator"><td colspan="6"></td></tr>`
      : "";
  const hasData = rows.input.length > 0 || rows.output.length > 0;

  return `<table class="report-table">
  <thead>
    <tr class="headers-row">
      <th>Kategori</th>
      <th>Jumlah Truk</th>
      <th>Grade</th>
      <th>KB (Ton)</th>
      <th>ST (Ton)</th>
      <th>%</th>
    </tr>
  </thead>
  <tbody>
    ${renderBlock("input")}
    ${separator}
    ${renderBlock("output")}
    ${
      hasData
        ? `<tr class="totals-row">
      <td colspan="3" class="center">${escapeHtml(totalLabel)}</td>
      <td class="number">${formatTotal(totals.kb, 4)}</td>
      <td class="number">${formatTotal(totals.st, 4)}</td>
      <td class="number">${formatPercentTotal(totals.rendemen, 1)}</td>
    </tr>`
        : buildEmptyTableRow(6)
    }
  </tbody>
</table>`;
};

const buildMetaTable = (receipt: ReceiptData, dateLabel: string): string => {
  const receiptDate =
    receipt.meta.tglPenerimaanSt !== ""
      ? formatDateLabel(normalizeDateKey(receipt.meta.tglPenerimaanSt))
      : dateLabel !== ""
        ? dateLabel
        : "-";

  return `<table class="meta-table">
  <tr>
    <td class="meta-line">${receipt.meta.noPenSt !== "" ? `<span class="meta-attachment-label">No Pen ST</span> : ${escapeHtml(receipt.meta.noPenSt)}` : ""}</td>
    <td class="meta-line">${receipt.meta.supplier !== "" ? `<span class="meta-attachment-label">Supplier</span> : ${escapeHtml(receipt.meta.supplier)}` : ""}</td>
    <td class="meta-line right">${receipt.meta.noKayuBulat !== "" ? `<span class="meta-attachment-label">No.KB</span> : ${escapeHtml(receipt.meta.noKayuBulat)}` : ""}</td>
  </tr>
  <tr>
    <td class="meta-line"><span class="meta-attachment-label">Tgl Penerimaan ST</span> : ${escapeHtml(receiptDate)}</td>
    <td class="meta-line">${receipt.meta.jenisKayu !== "" ? `<span class="meta-attachment-label">Jenis Kayu</span> : ${escapeHtml(receipt.meta.jenisKayu)}` : ""}</td>
    <td class="meta-line right">${receipt.meta.meja !== "" ? `<span class="meta-attachment-label">Meja</span> : ${escapeHtml(receipt.meta.meja)}` : ""}</td>
  </tr>
</table>`;
};

const moneyFlag = (hasil: number): "RUGI" | "LABA" =>
  hasil < 0 ? "RUGI" : "LABA";

const buildMoneyTable = (money: MoneyTotals, showProfit: boolean): string => {
  const flag = moneyFlag(money.hasil);
  return `<table class="money-table">
  <tr><td class="money-label">ST</td><td class="money-value">${formatMoney(money.st)}</td></tr>
  <tr><td class="money-label">KB</td><td class="money-value">${formatMoney(money.kb)}</td></tr>
  <tr><td class="money-label">Upah</td><td class="money-value">${formatMoney(money.upah)}</td></tr>
  <tr class="money-divider-row"><td colspan="2"><div class="money-divider-line"></div></td></tr>
  <tr>
    <td class="money-label">Hasil</td>
    <td class="money-value">${formatMoney(money.hasil)}</td>
    <td class="money-flag-attachment">(${flag})${showProfit ? ` | (${formatProfitPercent(money.hasil, money.st)})` : ""}</td>
  </tr>
</table>`;
};

const buildBalokTable = (rows: DetailLine[]): string => {
  const bodyRows = rows
    .filter((line) => {
      const isTotal = line.grade.includes("Total");
      const hasCompleteData =
        Math.abs(line.kb) > EPSILON && Math.abs(line.st) > EPSILON;
      const mejaMatch = /NoMeja\s+(\d+)/i.exec(line.grade);
      const isMeja = mejaMatch !== null;
      return (
        isTotal ||
        (hasCompleteData &&
          (!isMeja || Number(mejaMatch?.[1] ?? Number.MAX_SAFE_INTEGER) <= 10))
      );
    })
    .map(
      (line) => `<tr>
        <td class="${line.grade.includes("Total") ? "label-total" : "label"}">${escapeHtml(line.grade)}</td>
        <td class="num" style="font-weight: bold;">${formatDetail(line.kb, 2)}</td>
        <td class="num" style="font-weight: bold;">${formatDetail(line.st, 2)}</td>
        <td class="num" style="font-weight: bold;">${formatPercentDetail(line.percent, 1)}</td>
      </tr>`,
    )
    .join("\n");

  return `<div class="btul-wrap">
  <table class="btul-layout">
    <tr>
      <td class="btul-text-cell"><div class="btul-title">Balok Timbang <br>Ulang</div></td>
      <td>
        <table class="mini-table">
          <thead>
            <tr><th style="width: 105px;"></th><th style="width: 45px;">KBTon</th><th style="width: 45px;">STTon</th><th style="width: 35px;">%</th></tr>
          </thead>
          <tbody>${bodyRows || buildEmptyTableRow(4)}</tbody>
        </table>
      </td>
    </tr>
  </table>
</div>`;
};

const buildReceiptBottom = (receipt: ReceiptData): string => {
  const hasRows = receipt.rows.input.length > 0 || receipt.rows.output.length > 0;
  const hasMoney =
    Math.abs(receipt.money.st) > EPSILON ||
    Math.abs(receipt.money.kb) > EPSILON ||
    Math.abs(receipt.money.upah) > EPSILON ||
    Math.abs(receipt.money.hasil) > EPSILON;
  if (!hasRows || (!hasMoney && receipt.balokRows.length === 0)) return "";

  return `<div class="bottom-section">
  <table class="bottom-layout">
    <tr>
      <td style="width: 50%;"><div class="money-box">${buildMoneyTable(receipt.money, false)}</div></td>
      <td style="width: 50%;"><div class="btul-box">${buildBalokTable(receipt.balokRows)}</div></td>
    </tr>
  </table>
</div>`;
};

const buildDiagram = (receipt: ReceiptData): string => {
  if (receipt.chartSvg === "") return "";
  const colorsByGrade = new Map<string, string>();
  for (const item of receipt.chartData) {
    colorsByGrade.set(item.grade.trim().toUpperCase(), item.color);
  }

  const sortedOutput = [...receipt.rows.output].sort(
    (left, right) => right.percent - left.percent,
  );
  const outputRows = sortedOutput
    .map((line) => {
      const color = colorsByGrade.get(line.grade.trim().toUpperCase());
      const swatch =
        color !== undefined
          ? `<span class="category-swatch" style="background-color: ${color};">&nbsp;</span>`
          : "";
      return `<tr>
        <td class="left">${swatch}&nbsp;&nbsp; ${escapeHtml(line.grade)}</td>
        <td class="num">${formatDetail(line.st, 4)}</td>
        <td class="num">${formatPercentDetail(line.percent, 1)}</td>
        <td class="num">${formatPercentTotal(receipt.totals.rendemen, 1)}</td>
      </tr>`;
    })
    .join("\n");
  const inputGrades = receipt.rows.input.map((line) => line.grade).join(", ");
  const outputGrades = receipt.rows.output.map((line) => line.grade).join(", ");

  return `<div class="diagram-section">
  <table class="diagram-frame">
    <tr><td class="frame-banner">DIAGRAM RENDEMEN</td></tr>
    <tr>
      <td style="padding: 0;">
        <table class="diagram-layout">
          <tr>
            <td class="diagram-chart-cell" style="padding-bottom: 0;">
              <table class="rendemen-total-table">
                <tr><td class="rendemen-total-label-cell"><h2>RENDEMEN TOTAL</h2></td></tr>
                <tr><td class="rendemen-total-value-cell"><h1>${formatPercentTotal(receipt.totals.rendemen, 1)}</h1></td></tr>
              </table>
            </td>
            <td class="diagram-side-cell"></td>
          </tr>
          <tr>
            <td class="diagram-chart-cell"><div class="diagram-chart-wrap">${receipt.chartSvg}</div></td>
            <td class="diagram-side-cell">
              <table class="diagram-kategori-table">
                <thead><tr><th>KATEGORI</th><th>ST (TON)</th><th>%</th><th>RENDEMEN</th></tr></thead>
                <tbody>
                  ${outputRows || buildEmptyTableRow(4)}
                  <tr>
                    <td class="left total-row">TOTAL</td>
                    <td class="num total-row">${formatTotal(receipt.totals.st, 4)}</td>
                    <td class="num total-row">100.0%</td>
                    <td class="num total-row">${formatPercentTotal(receipt.totals.rendemen, 1)}</td>
                  </tr>
                </tbody>
              </table>
              <br><br><br>
              <table class="ringkasan-table">
                <thead><tr><td class="ringkasan-head">Ringkasan</td></tr></thead>
                <tbody>
                  <tr><td>Total Input (KB) : ${formatTotal(receipt.totals.kb, 4)} Ton</td></tr>
                  <tr><td>Total Output (ST) : ${formatTotal(receipt.totals.st, 4)} Ton</td></tr>
                  <tr><td>Rendemen : <span class="ringkasan-rendemen-highlight">${formatPercentTotal(receipt.totals.rendemen, 1)}</span></td></tr>
                  <tr><td class="ringkasan-formula">Rendemen = (Total Output ST / KB) x 100% = (${formatTotal(receipt.totals.st, 4)} / ${formatTotal(receipt.totals.kb, 4)}) x 100% = ${formatPercentTotal(receipt.totals.rendemen, 1)}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <div class="keterangan-box">
    <h3 class="keterangan-title">Keterangan:</h3>
    <div class="keterangan-line"><span class="keterangan-label">Input</span> : ${escapeHtml(inputGrades !== "" ? inputGrades : "-")}</div>
    <div class="keterangan-line"><span class="keterangan-label">Output</span> : ${escapeHtml(outputGrades !== "" ? outputGrades : "-")}</div>
  </div>
</div>`;
};

const buildReceiptHtml = (receipt: ReceiptData, dateLabel: string): string => {
  const hasRows = receipt.rows.input.length > 0 || receipt.rows.output.length > 0;
  return `<div class="receipt-block">
  ${buildMetaTable(receipt, dateLabel)}
  ${buildDetailTable(receipt.rows, receipt.totals, "Total")}
  ${hasRows ? `<div class="rendemen-attachment"><strong>RENDEMEN : ${formatPercentTotal(receipt.totals.rendemen, 1)}</strong></div>` : ""}
  ${buildReceiptBottom(receipt)}
  ${buildDiagram(receipt)}
</div>`;
};

const buildGroupSummaryTable = (
  summaryByGroup: Record<GroupName, TonnageTotals>,
): string => {
  const totalKb = summaryByGroup.bansaw.kb + summaryByGroup.slp.kb;
  const totalSt = summaryByGroup.bansaw.st + summaryByGroup.slp.st;
  const rows: Array<{
    group: string;
    totals: TonnageTotals;
    total: boolean;
  }> = [
    { group: "BANSAW", totals: summaryByGroup.bansaw, total: false },
    { group: "SLP", totals: summaryByGroup.slp, total: false },
    {
      group: "Total",
      totals: {
        kb: totalKb,
        st: totalSt,
        rendemen: percentFor(totalSt, totalKb),
      },
      total: true,
    },
  ];

  return `<div class="group-summary-wrap">
  <table class="group-summary-table">
    <thead><tr><th style="width: 36%;">Group</th><th style="width: 22%;">KBTon</th><th style="width: 22%;">STTon</th><th style="width: 20%;">%</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (row) => `<tr${row.total ? ' class="group-summary-total"' : ""}>
        <td>${escapeHtml(row.group)}</td>
        <td class="num">${formatDetail(row.totals.kb, 2)}</td>
        <td class="num">${formatDetail(row.totals.st, 2)}</td>
        <td class="num">${formatPercentDetail(row.totals.rendemen, 1)}</td>
      </tr>`,
        )
        .join("\n")}
    </tbody>
  </table>
</div>`;
};

const buildGradeSummary = (
  title: string,
  aggregate: GradeAggregate,
): string => {
  if (aggregate.rows.input.length === 0 && aggregate.rows.output.length === 0) {
    return "";
  }
  return `<table class="summary-section-heading-table"><tr><td>${escapeHtml(title)}</td></tr></table>
  ${buildDetailTable(aggregate.rows, aggregate.totals, "Grand Total")}
  <table class="summary-rendemen-table"><tr><td><strong>RENDEMEN : ${formatPercentTotal(aggregate.totals.rendemen, 1)}</strong></td></tr></table>`;
};

const buildSummarySection = (data: ReportData): string => {
  const bansaw = data.byGroup.bansaw;
  const slp = data.byGroup.slp;
  const grand = data.grand;

  return `<div class="summary-section">
  <table class="summary-frame-table">
    <tr>
      <td class="summary-frame-cell">
        ${buildGradeSummary("Total BANSAW", bansaw)}
        ${bansaw.rows.input.length > 0 || bansaw.rows.output.length > 0 ? `<div class="summary-money-box">${buildMoneyTable(bansaw.money, true)}</div>` : ""}
        <hr>
        ${buildGradeSummary("Total SLP", slp)}
        ${slp.rows.input.length > 0 || slp.rows.output.length > 0 ? `<div class="summary-money-box">${buildMoneyTable(slp.money, true)}</div>` : ""}
        <hr>
        ${buildGradeSummary("Grand Total Seluruh Grade", grand)}
        ${
          grand.rows.input.length > 0 || grand.rows.output.length > 0
            ? `<table class="summary-pair-table">
          <tr>
            <td class="summary-pair-left"><div class="money-box" style="padding-left: 0; width: 100%;">${buildMoneyTable(grand.money, true)}</div></td>
            <td class="summary-pair-right">${buildGroupSummaryTable(data.summaryByGroup)}</td>
          </tr>
        </table>`
            : ""
        }
      </td>
    </tr>
  </table>
</div>`;
};

const buildBodyHtml = (data: ReportData): string => {
  const noData = buildDetailTable(data.grand.rows, data.grand.totals, "Grand Total");

  const groups = data.dateGroups
    .map((group, groupIndex) => {
      const receipts = group.receipts
        .map((receipt, receiptIndex) => {
          const receiptHtml = buildReceiptHtml(receipt, group.label);
          return `${receiptHtml}${receiptIndex < group.receipts.length - 1 ? `<div class="receipt-separator"></div>` : ""}`;
        })
        .join("\n");
      return `${groupIndex > 0 ? `<div class="date-separator"></div>` : ""}${receipts}`;
    })
    .join("\n");

  return `${groups || noData}${
    data.dateGroups.length > 0 ? `\n${buildSummarySection(data)}` : ""
  }`;
};


export const rekapPenerimaanStSawmillCostingRambungReport: ReportDefinition<
  RekapPenerimaanStSawmillCostingRambungParams,
  FetchedReportData
> = {
  type: "rekap-penerimaan-st-sawmill-costing-rambung",
  title: "Laporan Rekap Penerimaan ST Dari Sawmill + Costing (Rambung)",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    // The legacy service binds ONLY the two dates and applies the supplier
    // filter in PHP (case-insensitive substring on the receipt supplier).
    // Passing an empty @Supplier to the SP would return zero rows, so the
    // filter is applied here instead, before the aggregates are built.
    const [mainResult, subResult] = await Promise.all([
      conn
        .request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SPWps_LapRekapPenerimaanSawmilRp"),
      conn
        .request()
        .input("StartDate", sql.Date, params.tglAwal)
        .input("EndDate", sql.Date, params.tglAkhir)
        .execute("SPWps_LapSubRekapPenerimaanSawmilRp"),
    ]);

    const main = (mainResult.recordset ?? []) as MainRow[];
    const supplierFilter = params.supplier.trim().toLowerCase();
    const filteredMain =
      supplierFilter === ""
        ? main
        : main.filter((row) =>
            toText(row.NmSupplier).toLowerCase().includes(supplierFilter),
          );

    return {
      main: filteredMain,
      sub: (subResult.recordset ?? []) as SubRow[],
    };
  },

  render(data, meta): RenderResult {
    const reportData = buildReportData(
      data.main,
      data.sub,
      meta.params.upahRacip,
    );
    const supplier = meta.params.supplier.trim();
    const supplierText = supplier !== "" ? ` | Supplier: ${supplier}` : "";
    const subtitle = `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}${supplierText}`;

    return renderWpsReportPage({
      title: "Laporan Rekap Penerimaan ST Dari Sawmill + Costing (Rambung)",
      subtitle,
      bodyHtml: buildBodyHtml(reportData),
      style: "rekap_penerimaan_st_sawmill_costing_rambung",
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
