import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage } from "./template";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * SP_LapRekapPenerimaanSTDariSawmill — "Laporan Rekap Penerimaan ST Dari
 * Sawmill - Timbang KG". Ported from
 * open-api-report's RekapPenerimaanSTDariSawmillKgReportService +
 * rekap-penerimaan-st-dari-sawmill-kg-pdf.blade.php.
 *
 * SP output (StartDate/EndDate) is grouped by report date, then per receipt
 * (NoPenerimaanST, falling back to supplier|truck|NoKB). Each receipt renders
 * a meta block plus one table: INPUT rows (KB per grade) and OUTPUT rows (ST
 * per product grade) with a "Total" row, a right-aligned RENDEMEN line, and a
 * trailing "Grand Total Seluruh Grade" table across all receipts.
 *
 * Percent columns are distributions inside their block: INPUT = KB share of
 * the receipt KB total, OUTPUT = ST share of the receipt ST total. Rendemen
 * = ST total / KB total * 100.
 */

interface SawmillRow extends Record<string, unknown> {
  InOut: number | null;
  NoPenerimaanST: string | null;
  TglLaporan: Date | string | null;
  NoKayuBulat: string | null;
  NmSupplier: string | null;
  NoTruk: number | null;
  Jenis: string | null;
  NoMeja: string | null;
  NamaGrade: string | null;
  JmlhBatang: number | null;
  KBTon: number | null;
  STTon: number | null;
  NamaGrade1: string | null;
}

type Kategori = "input" | "output";

interface DetailLine {
  grade: string;
  jmlhTruk: string;
  kb: number;
  st: number;
  percent: number;
}

interface ReceiptData {
  meta: {
    noPenSt: string;
    noKayuBulat: string;
    meja: string;
    supplier: string;
    jenisKayu: string;
  };
  rows: Record<Kategori, DetailLine[]>;
  totals: { kbTotal: number; stTotal: number; rendemen: number };
}

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  receipts: ReceiptData[];
}

interface SawmillData {
  dateGroups: DateGroup[];
  grand: {
    rows: Record<Kategori, DetailLine[]>;
    totals: { kbTotal: number; stTotal: number; rendemen: number };
  };
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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

/** Legacy fmtDetail / fmtPercentDetail: blank when ~zero. */
const fmtDetail = (value: number, decimals = 4): string =>
  formatNumber(value, decimals, { blankWhenZero: true });
const fmtPercentDetail = (value: number, decimals = 1): string => {
  const text = formatNumber(value, decimals, { blankWhenZero: true });
  return text === "" ? "" : `${text}%`;
};
/** Legacy fmtTotal / fmtPercentTotal: zero stays visible. */
const fmtTotal = (value: number, decimals = 4): string =>
  formatNumber(value, decimals);
const fmtPercentTotal = (value: number, decimals = 1): string =>
  `${formatNumber(value, decimals)}%`;

/** Legacy fmtTruck: blank for empty / zero. */
const fmtTruck = (value: string): string => {
  const raw = value.trim();
  return raw === "" || raw === "0" || raw === "0.0" ? "" : raw;
};

const normalizeDateKey = (value: unknown): string => {
  const raw = toText(value);
  if (raw === "") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : raw;
};

const formatDateLabel = (dateKey: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? formatTanggalId(dateKey) : dateKey;

/** Legacy normalizeDirection: 1 = input, 0 / 2 = output. */
const normalizeDirection = (value: unknown): Kategori | null => {
  if (value === null || value === undefined) return null;
  const raw = toText(value).toLowerCase().replace(/[ _-]/g, "");
  if (raw === "") return null;
  if (["1", "i", "in", "input", "masuk"].includes(raw)) return "input";
  if (["0", "2", "o", "out", "output", "keluar"].includes(raw)) return "output";
  return null;
};

/** Output-only grade labels (legacy forceKategoriByGrade). */
const forceKategoriByGrade = (grade: string): Kategori | null => {
  const normalized = grade.trim().toLowerCase().replace(/[ _-]/g, "");
  return ["kayulat", "mc1", "mc2", "std"].includes(normalized) ? "output" : null;
};

/** JUMLAH / TOTAL / RENDEMEN rows from the SP are recomputed, not rendered. */
const isSummaryGradeLabel = (grade: string): boolean => {
  const normalized = grade.trim().toLowerCase().replace(/[ _\-:]/g, "");
  return ["jumlah", "total", "rendemen", "rendemennya"].includes(normalized);
};

function buildData(rows: SawmillRow[]): SawmillData {
  const byDate = new Map<string, DateGroup>();
  const grandByGrade: Record<Kategori, Map<string, DetailLine>> = {
    input: new Map(),
    output: new Map(),
  };

  let lastDateKey = "";
  const lastKategori = new Map<string, Kategori | null>();

  for (const row of rows) {
    let dateKey = normalizeDateKey(row.TglLaporan);
    if (dateKey === "" && lastDateKey !== "") dateKey = lastDateKey;
    lastDateKey = dateKey;
    const groupKey = dateKey !== "" ? dateKey : "Tanpa Tanggal";

    let group = byDate.get(groupKey);
    if (!group) {
      group = { dateKey: groupKey, dateLabel: formatDateLabel(groupKey), receipts: [] };
      byDate.set(groupKey, group);
    }

    const noPen = toText(row.NoPenerimaanST);
    const noKb = toText(row.NoKayuBulat);
    const supplier = toText(row.NmSupplier);
    const truck = toText(row.NoTruk);
    const receiptKey =
      noPen !== ""
        ? noPen
        : [supplier, truck, noKb].filter((part) => part !== "").join("|") || "receipt";

    let receipt = group.receipts.find((item) => item.meta.noPenSt === receiptKey);
    if (!receipt) {
      receipt = {
        meta: {
          noPenSt: noPen,
          noKayuBulat: noKb,
          meja: toText(row.NoMeja),
          supplier,
          jenisKayu: toText(row.Jenis),
        },
        rows: { input: [], output: [] },
        totals: { kbTotal: 0, stTotal: 0, rendemen: 0 },
      };
      group.receipts.push(receipt);
    }

    const rawGrade = toText(row.NamaGrade) || toText(row.NamaGrade1);
    const grade = rawGrade !== "" ? rawGrade : "Tanpa Grade";

    // Kategori: SP direction, then output-grade override, then carry-forward.
    const lastKey = `${groupKey}||${receiptKey}`;
    let kategori = normalizeDirection(row.InOut);
    if (kategori === null) kategori = forceKategoriByGrade(grade);
    if (kategori === null) kategori = lastKategori.get(lastKey) ?? null;
    if (kategori === null) kategori = "input";
    lastKategori.set(lastKey, kategori);

    if (isSummaryGradeLabel(grade)) continue;

    const kb = toFloat(row.KBTon);
    const st = toFloat(row.STTon);
    const jmlhTruk = toText(row.JmlhBatang);

    // Separator rows from merged cells carry no data.
    if (rawGrade === "" && kb === 0 && st === 0) continue;

    const bucket = receipt.rows[kategori];
    const existing = bucket.find((line) => line.grade === grade);
    if (existing) {
      existing.kb += kb;
      existing.st += st;
      if (existing.jmlhTruk.trim() === "" && jmlhTruk !== "") existing.jmlhTruk = jmlhTruk;
    } else {
      bucket.push({ grade, jmlhTruk, kb, st, percent: 0 });
    }
    receipt.totals.kbTotal += kb;
    receipt.totals.stTotal += st;

    const grandBucket = grandByGrade[kategori];
    let grandLine = grandBucket.get(grade);
    if (!grandLine) {
      grandLine = {
        grade,
        jmlhTruk: kategori === "input" ? "1" : "0",
        kb: 0,
        st: 0,
        percent: 0,
      };
      grandBucket.set(grade, grandLine);
    }
    grandLine.kb += kb;
    grandLine.st += st;
  }

  // Per-receipt percentages (distribution inside the block) + sort.
  for (const group of byDate.values()) {
    for (const receipt of group.receipts) {
      const { kbTotal, stTotal } = receipt.totals;
      receipt.totals.rendemen = kbTotal > 0 ? (stTotal / kbTotal) * 100 : 0;
      for (const line of receipt.rows.input) {
        line.percent = kbTotal > 0 ? (line.kb / kbTotal) * 100 : 0;
      }
      for (const line of receipt.rows.output) {
        line.percent = stTotal > 0 ? (line.st / stTotal) * 100 : 0;
      }
    }
    group.receipts.sort((left, right) =>
      left.meta.noPenSt.localeCompare(right.meta.noPenSt, undefined, {
        sensitivity: "base",
      }),
    );
  }

  const dateGroups = [...byDate.values()].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  );

  const grandRows: Record<Kategori, DetailLine[]> = {
    input: [...grandByGrade.input.values()],
    output: [...grandByGrade.output.values()],
  };
  const grandKbTotal = grandRows.input.reduce((sum, line) => sum + line.kb, 0);
  const grandStTotal = grandRows.output.reduce((sum, line) => sum + line.st, 0);
  for (const line of grandRows.input) {
    line.percent = grandKbTotal > 0 ? (line.kb / grandKbTotal) * 100 : 0;
  }
  for (const line of grandRows.output) {
    line.percent = grandStTotal > 0 ? (line.st / grandStTotal) * 100 : 0;
  }

  return {
    dateGroups,
    grand: {
      rows: grandRows,
      totals: {
        kbTotal: grandKbTotal,
        stTotal: grandStTotal,
        rendemen: grandKbTotal > 0 ? (grandStTotal / grandKbTotal) * 100 : 0,
      },
    },
  };
}

const REKAP_SAWMILL_CSS = `
  .date-separator { height: 14px; }
  .receipt-separator { height: 6px; }
  .section-separator td { padding: 0; height: 0; line-height: 0; border: 0 !important; background: #fff !important; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .meta-line { margin: 2px 0; font-size: 10px; }
  .rendemen-line { margin: 0 0 10px 0; text-align: right; font-size: 11px; font-weight: bold; }
  .group-title { margin: 10px 0; text-align: center; font-size: 12px; font-weight: bold; }
`;

const buildDetailTable = (
  rows: Record<Kategori, DetailLine[]>,
  totals: { kbTotal: number; stTotal: number; rendemen: number },
  totalsLabel: string,
  showRendemenLine: boolean,
): string => {
  const { input, output } = rows;
  let rowIndex = 0;

  const renderBlock = (kategori: Kategori): string => {
    const lines = rows[kategori];
    if (lines.length === 0) return "";
    const rowspan = lines.length;
    return lines
      .map((line) => {
        rowIndex += 1;
        const isInput = kategori === "input";
        const prefix =
          line === lines[0]
            ? `<td class="label" rowspan="${rowspan}" style="font-weight: bold;">${isInput ? "Input" : "Output"}</td>`
            : "";
        const truck = fmtTruck(isInput ? line.jmlhTruk : line.jmlhTruk || "0");
        return `<tr class="data-row ${rowIndex % 2 === 1 ? "row-odd" : "row-even"}">
            ${prefix}
            <td class="center">${escapeHtml(truck)}</td>
            <td class="label" style="font-weight: bold;">${escapeHtml(line.grade)}</td>
            <td class="number">${isInput ? fmtDetail(line.kb, 4) : ""}</td>
            <td class="number">${isInput ? "" : fmtDetail(line.st, 4)}</td>
            <td class="number" style="font-weight: bold;">${fmtPercentDetail(line.percent, 1)}</td>
          </tr>`;
      })
      .join("\n    ");
  };

  const separator =
    input.length > 0 && output.length > 0
      ? `<tr class="section-separator"><td colspan="6"></td></tr>`
      : "";

  const hasData = input.length > 0 || output.length > 0;

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
      <td colspan="3" class="center">${escapeHtml(totalsLabel)}</td>
      <td class="number">${fmtTotal(totals.kbTotal, 4)}</td>
      <td class="number">${fmtTotal(totals.stTotal, 4)}</td>
      <td class="number">${fmtPercentTotal(totals.rendemen, 1)}</td>
    </tr>`
        : `<tr class="data-row row-odd"><td class="center" colspan="6">Tidak ada data.</td></tr>`
    }
  </tbody>
</table>
${
  showRendemenLine && hasData
    ? `<div class="rendemen-line">RENDEMEN : ${fmtPercentTotal(totals.rendemen, 1)}</div>`
    : ""
}`;
};

const buildBodyHtml = (data: SawmillData): string => {
  if (data.dateGroups.length === 0) {
    return `<table class="report-table">
  <thead><tr class="headers-row"><th>Tidak ada data.</th></tr></thead>
  <tbody><tr class="data-row row-odd"><td>Tidak ada data.</td></tr></tbody>
</table>`;
  }

  const blocks = data.dateGroups
    .map((group, groupIndex) => {
      const receipts = group.receipts
        .map((receipt) => {
          const metaLines = [
            receipt.meta.noPenSt !== "" || receipt.meta.noKayuBulat !== ""
              ? `<div class="meta-line"><strong>No Penerimaan ST</strong> : ${escapeHtml(receipt.meta.noPenSt !== "" ? receipt.meta.noPenSt : "-")}</div>`
              : "",
            receipt.meta.noKayuBulat !== ""
              ? `<div class="meta-line"><strong>No Kayu Bulat</strong> : ${escapeHtml(receipt.meta.noKayuBulat)}</div>`
              : "",
            receipt.meta.meja !== ""
              ? `<div class="meta-line"><strong>Meja</strong> : ${escapeHtml(receipt.meta.meja)}</div>`
              : "",
            `<div class="meta-line"><strong>Supplier</strong> : ${escapeHtml(receipt.meta.supplier !== "" ? receipt.meta.supplier : "-")}</div>`,
            `<div class="meta-line" style="margin-bottom: 6px;"><strong>Jenis Kayu</strong> : ${escapeHtml(receipt.meta.jenisKayu !== "" ? receipt.meta.jenisKayu : "-")}</div>`,
          ].join("\n    ");

          return `${metaLines}
    ${buildDetailTable(receipt.rows, receipt.totals, "Total", true)}`;
        })
        .join(`\n    <div class="receipt-separator"></div>\n    `);

      const prefix = groupIndex > 0 ? `<div class="date-separator"></div>\n  ` : "";
      return `${prefix}${receipts}`;
    })
    .join("\n  ");

  const grandHasData =
    data.grand.rows.input.length > 0 || data.grand.rows.output.length > 0;

  const grandBlock = grandHasData
    ? `<div class="date-separator"></div>
<div class="group-title">Grand Total Seluruh Grade</div>
${buildDetailTable(data.grand.rows, data.grand.totals, "Grand Total", true)}`
    : "";

  return `${blocks}
  ${grandBlock}`;
};

export const rekapPenerimaanStDariSawmillKgReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "rekap-penerimaan-st-dari-sawmill-kg",
  title: "Laporan Rekap Penerimaan ST Dari Sawmill - Timbang KG",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("StartDate", sql.Date, params.tglAwal)
      .input("EndDate", sql.Date, params.tglAkhir)
      .execute("SP_LapRekapPenerimaanSTDariSawmill");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta): RenderResult {
    const data = buildData(rows as SawmillRow[]);
    return renderWpsReportPage({
      title: "Laporan Rekap Penerimaan ST Dari Sawmill - Timbang KG",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml: buildBodyHtml(data),
      extraCss: REKAP_SAWMILL_CSS,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
