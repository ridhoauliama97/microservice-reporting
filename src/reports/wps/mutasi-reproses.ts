import sql from "mssql";
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
 * SP_Mutasi_Reproses + SP_SubMutasi_Reproses — "Laporan Mutasi Reproses".
 * The main SP is rendered with the same formula/column grouping as the
 * legacy Blade. The sub-SP is optional at the service level and has no
 * parameters; when present, its raw Sanding rows are shown in a second table
 * using the same generic sub-report approach as the other mutasi reports.
 */

interface ReprosesMutasiRow extends Record<string, unknown> {
  Jenis: string | null;
  REPROAwal: number | string | null;
  AdjOutput: number | string | null;
  MLDOutput: number | string | null;
  PACKOutput: number | string | null;
  REPROKeluar: number | string | null;
  AdjInput: number | string | null;
  BSInput: number | string | null;
  CCAInput: number | string | null;
  LMTInput: number | string | null;
  MLDInput: number | string | null;
  S4SInput: number | string | null;
  SANDInput: number | string | null;
  REPROJual: number | string | null;
  ReprosesAkhir: number | string | null;
}

type SubReprosesRow = Record<string, unknown>;

type MainKey =
  | "awal"
  | "adjOut"
  | "mldOut"
  | "packOut"
  | "reproKeluar"
  | "totalMasuk"
  | "adjIn"
  | "bsIn"
  | "ccaIn"
  | "lmtIn"
  | "mldIn"
  | "s4sIn"
  | "sandIn"
  | "reproJual"
  | "totalKeluar"
  | "akhir";

const toFloat = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  let normalized = value.trim().replaceAll(" ", "");
  if (normalized === "") return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replaceAll(".", "").replaceAll(",", ".")
      : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(normalized)
      ? normalized.replaceAll(",", "")
      : normalized.replaceAll(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number): string =>
  formatNumber(value, 4, { blankWhenZero: true });

const mainValues = (row: ReprosesMutasiRow): Record<MainKey, number> => {
  const awal = toFloat(row.REPROAwal);
  const adjOut = toFloat(row.AdjOutput);
  const mldOut = toFloat(row.MLDOutput);
  const packOut = toFloat(row.PACKOutput);
  const reproKeluar = toFloat(row.REPROKeluar);
  const adjIn = toFloat(row.AdjInput);
  const bsIn = toFloat(row.BSInput);
  const ccaIn = toFloat(row.CCAInput);
  const lmtIn = toFloat(row.LMTInput);
  const mldIn = toFloat(row.MLDInput);
  const s4sIn = toFloat(row.S4SInput);
  const sandIn = toFloat(row.SANDInput);
  const reproJual = toFloat(row.REPROJual);
  return {
    awal,
    adjOut,
    mldOut,
    packOut,
    reproKeluar,
    totalMasuk: adjOut + mldOut + packOut + reproKeluar,
    adjIn,
    bsIn,
    ccaIn,
    lmtIn,
    mldIn,
    s4sIn,
    sandIn,
    reproJual,
    totalKeluar:
      adjIn + bsIn + ccaIn + lmtIn + mldIn + s4sIn + sandIn + reproJual,
    akhir: toFloat(row.ReprosesAkhir),
  };
};

const MAIN_KEYS: MainKey[] = [
  "awal", "adjOut", "mldOut", "packOut", "reproKeluar", "totalMasuk",
  "adjIn", "bsIn", "ccaIn", "lmtIn", "mldIn", "s4sIn", "sandIn", "reproJual",
  "totalKeluar", "akhir",
];

const buildMainTable = (rows: ReprosesMutasiRow[]): string => {
  const totals: Record<MainKey, number> = {
    awal: 0, adjOut: 0, mldOut: 0, packOut: 0, reproKeluar: 0, totalMasuk: 0,
    adjIn: 0, bsIn: 0, ccaIn: 0, lmtIn: 0, mldIn: 0, s4sIn: 0, sandIn: 0,
    reproJual: 0, totalKeluar: 0, akhir: 0,
  };
  const bodyRows = rows.map((row, index) => {
    const values = mainValues(row);
    for (const key of MAIN_KEYS) totals[key] += values[key];
    return `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center data-cell">${index + 1}</td>
      <td class="label data-cell">${escapeHtml(String(row.Jenis ?? ""))}</td>
      <td class="number data-cell">${fmt(values.awal)}</td>
      <td class="number data-cell">${fmt(values.adjOut)}</td>
      <td class="number data-cell">${fmt(values.mldOut)}</td>
      <td class="number data-cell">${fmt(values.packOut)}</td>
      <td class="number data-cell">${fmt(values.reproKeluar)}</td>
      <td class="number data-cell strong">${fmt(values.totalMasuk)}</td>
      <td class="number data-cell">${fmt(values.adjIn)}</td>
      <td class="number data-cell">${fmt(values.bsIn)}</td>
      <td class="number data-cell">${fmt(values.ccaIn)}</td>
      <td class="number data-cell">${fmt(values.lmtIn)}</td>
      <td class="number data-cell">${fmt(values.mldIn)}</td>
      <td class="number data-cell">${fmt(values.s4sIn)}</td>
      <td class="number data-cell">${fmt(values.sandIn)}</td>
      <td class="number data-cell">${fmt(values.reproJual)}</td>
      <td class="number data-cell strong">${fmt(values.totalKeluar)}</td>
      <td class="number data-cell strong">${fmt(values.akhir)}</td>
    </tr>`;
  }).join("\n    ");
  const totalCells = MAIN_KEYS.map((key) => `<td class="number">${fmt(totals[key])}</td>`).join("\n      ");

  return `<table class="report-table main-mutasi-table">
  <thead>
    <tr class="headers-row">
      <th rowspan="2">No</th>
      <th rowspan="2">Jenis</th>
      <th rowspan="2">Awal</th>
      <th colspan="4">Masuk</th>
      <th rowspan="2">Total<br>Masuk</th>
      <th colspan="8">Keluar</th>
      <th rowspan="2">Total<br>Keluar</th>
      <th rowspan="2">Akhir</th>
    </tr>
    <tr class="headers-row">
      <th>Adj Out<br>REPRO</th>
      <th>MLD Out<br>REPRO</th>
      <th>PACK Out<br>REPRO</th>
      <th>REPRO<br>Keluar</th>
      <th>Adj In<br>REPRO</th>
      <th>BS In<br>REPRO</th>
      <th>CCA In<br>REPRO</th>
      <th>LMT In<br>REPRO</th>
      <th>MLD In<br>REPRO</th>
      <th>S4S In<br>REPRO</th>
      <th>SAND In<br>REPRO</th>
      <th>REPRO<br>Jual</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || buildEmptyTableRow(18)}
    ${rows.length > 0
      ? `<tr class="totals-row"><td colspan="2" class="blank">Total</td>${totalCells}</tr>`
      : ""}
  </tbody>
</table>`;
};

const SUB_COLUMNS: Array<{ key: string; label: string; kind: "label" | "date" | "int" | "time" }> = [
  { key: "NoSanding", label: "NoSanding", kind: "label" },
  { key: "DateCreate", label: "DateCreate", kind: "date" },
  { key: "DateUsage", label: "DateUsage", kind: "date" },
  { key: "NoSPK", label: "NoSPK", kind: "label" },
  { key: "IdJenisKayu", label: "IdJenisKayu", kind: "int" },
  { key: "IdGrade", label: "IdGrade", kind: "int" },
  { key: "IdOrgTelly", label: "IdOrgTelly", kind: "int" },
  { key: "IdUOMTblLebar", label: "IdUOMTblLebar", kind: "int" },
  { key: "IdUOMPanjang", label: "IdUOMPanjang", kind: "int" },
  { key: "Jam", label: "Jam", kind: "time" },
  { key: "IsReject", label: "IsReject", kind: "label" },
  { key: "IdLokasi", label: "IdLokasi", kind: "label" },
  { key: "Remark", label: "Remark", kind: "label" },
];

const formatSubValue = (value: unknown, kind: (typeof SUB_COLUMNS)[number]["kind"]): string => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "1" : "";
  if (kind === "date") {
    if (value instanceof Date) return formatTanggalId(value.toISOString().slice(0, 10)).replace(/\d{4}$/, (year) => year.slice(-2));
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
    return match ? formatTanggalId(match[1]).replace(/\d{4}$/, (year) => year.slice(-2)) : String(value);
  }
  if (kind === "time") {
    if (value instanceof Date) return value.toISOString().slice(11, 16);
    return String(value).slice(0, 5);
  }
  if (kind === "int") return String(Math.round(toFloat(value)));
  return String(value);
};

const buildSubTable = (rows: SubReprosesRow[]): string => {
  const bodyRows = rows.map((row, index) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
    <td class="center data-cell">${index + 1}</td>
    ${SUB_COLUMNS.map((column) => `<td class="${column.kind === "label" ? "label" : column.kind === "int" ? "number" : "center"} data-cell">${escapeHtml(formatSubValue(row[column.key], column.kind))}</td>`).join("\n    ")}
  </tr>`).join("\n    ");
  return `<div class="section-title">Sub Report Mutasi Reproses</div>
  <table class="report-table sub-mutasi-table">
    <thead><tr class="headers-row">
      <th>No</th>
      ${SUB_COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("\n      ")}
    </tr></thead>
    <tbody>${bodyRows || buildEmptyTableRow(SUB_COLUMNS.length + 1)}</tbody>
  </table>`;
};

const dateKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match?.[1] ?? "";
};

const formatTanggalPendek = (iso: string): string =>
  formatTanggalId(iso).replace(/\d{4}$/, (year) => year.slice(-2));

export const mutasiReprosesReport: ReportDefinition<
  PeriodParams,
  { rows: ReprosesMutasiRow[]; subRows: SubReprosesRow[] }
> = {
  type: "mutasi-reproses",
  title: "Laporan Mutasi Reproses",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const [mainResult, subResult] = await Promise.all([
      conn.request()
        .input("TglAwal", sql.Date, params.tglAwal)
        .input("TglAkhir", sql.Date, params.tglAkhir)
        .execute("SP_Mutasi_Reproses"),
      // The legacy sub-SP is optional. Keep the main report usable when it
      // is unavailable, while still rendering it when the procedure succeeds.
      conn.request().execute("SP_SubMutasi_Reproses").catch(() => null),
    ]);
    const rawSubRows = (subResult?.recordset ?? []) as SubReprosesRow[];

    // The legacy sub-SP has no date parameters and returns the full Sanding
    // history. Keep the same period semantics as the main report so the
    // generated PDF does not contain unrelated historical rows.
    const subRows = rawSubRows
      .filter((row) => {
        const date = dateKey(row.DateCreate);
        return date >= params.tglAwal && date <= params.tglAkhir;
      })
      .sort((left, right) => {
        const byDate = dateKey(left.DateCreate).localeCompare(dateKey(right.DateCreate));
        if (byDate !== 0) return byDate;
        return String(left.NoSanding ?? "").localeCompare(String(right.NoSanding ?? ""));
      });

    return {
      rows: (mainResult.recordset ?? []) as ReprosesMutasiRow[],
      subRows,
    };
  },

  render(data, meta) {
    const bodyHtml = `${buildMainTable(data.rows)}\n  ${buildSubTable(data.subRows)}`;
    return renderWpsReportPage({
      title: "Laporan Mutasi Reproses",
      subtitle: `Dari ${formatTanggalPendek(meta.params.tglAwal)} s/d ${formatTanggalPendek(meta.params.tglAkhir)}`,
      bodyHtml,
      style: "mutasi_reproses",
      landscape: true,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
