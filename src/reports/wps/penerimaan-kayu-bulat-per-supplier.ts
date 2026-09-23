import sql from "mssql";
import {
  buildReportTable,
  renderWpsReportPage,
  type ReportColumn,
} from "./template";
import { formatPrintedAt, formatTanggalId } from "../../templates/html";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * Special-case report (the legacy app builds this with a custom query, not
 * the SP): a detail list grouped per supplier with sub totals, followed by a
 * daily recap per group/grade — ported 1:1 from
 * open-api-report's PenerimaanKayuBulatBulananPerSupplierReportService +
 * penerimaan-bulanan-per-supplier-pdf.blade.php.
 *
 * Penerimaan detail comes from KayuBulat_h joined with the KB grade (KG)
 * detail; "Ton" per balok = SUM(FLOOR(Tebal*Lebar*Panjang/7200.8*10000))/10000
 * (TonKB), while TonKG comes from KayuBulatKG_d.Berat/1000.
 */

const DETAIL_SQL = `
SELECT
    A.NoKayuBulat AS [NoKayuBulat],
    A.NoTruk AS [NoTruk],
    CAST(A.DateCreate AS DATE) AS [Tanggal],
    D.Jenis AS [JenisKayu],
    MKB.NamaGrade AS [NamaGrade],
    ISNULL(KG.JmlhBatang, ISNULL(KBPCS.JmlhPcs, 0)) AS [JmlhPcs],
    CAST(ISNULL(KB.TonKB, 0) AS DECIMAL(18,4)) AS [TonKB],
    CAST(ISNULL(KG.Berat, 0) / 1000.0 AS DECIMAL(18,4)) AS [TonKG],
    CASE
        WHEN A.IdSupplierAsalKayu IS NULL OR A.IdSupplierAsalKayu LIKE '% %'
            THEN C.NmSupplier
        ELSE F.NmSupplier + ' (' + C.NmSupplier + ')'
    END AS [NmSupplier]
FROM KayuBulat_h A
LEFT JOIN MstSupplier C ON C.IdSupplier = A.IdSupplier
LEFT JOIN MstSupplier F ON F.IdSupplier = A.IdSupplierAsalKayu
LEFT JOIN MstJenisKayu D ON D.IdJenisKayu = A.IdJenisKayu
LEFT JOIN KayuBulatKG_d KG ON KG.NoKayuBulat = A.NoKayuBulat
LEFT JOIN MstGradeKB MKB ON MKB.IdGradeKB = KG.IdGradeKB
LEFT JOIN (
    SELECT
        D2.NoKayuBulat,
        COUNT(1) AS JmlhPcs
    FROM KayuBulat_d D2
    GROUP BY D2.NoKayuBulat
) KBPCS ON KBPCS.NoKayuBulat = A.NoKayuBulat
LEFT JOIN (
    SELECT
        D1.NoKayuBulat,
        SUM(FLOOR(D1.Tebal * D1.Lebar * D1.Panjang / 7200.8 * 10000) / 10000.0) AS TonKB
    FROM KayuBulat_d D1
    GROUP BY D1.NoKayuBulat
) KB ON KB.NoKayuBulat = A.NoKayuBulat
WHERE CAST(A.DateCreate AS DATE) BETWEEN @TglAwal AND @TglAkhir
ORDER BY
    CASE
        WHEN A.IdSupplierAsalKayu IS NULL OR A.IdSupplierAsalKayu LIKE '% %'
            THEN C.NmSupplier
        ELSE F.NmSupplier + ' (' + C.NmSupplier + ')'
    END,
    A.NoKayuBulat,
    CASE
        WHEN MKB.NamaGrade LIKE '%AFKIR%' THEN 1
        WHEN MKB.NamaGrade LIKE '%MC%' THEN 2
        WHEN MKB.NamaGrade LIKE '%STD%' THEN 3
        WHEN MKB.NamaGrade LIKE '%SAMSAM%' THEN 4
        ELSE 99
    END,
    KG.NoUrut
`;

interface PenerimaanRow extends Record<string, unknown> {
  NoKayuBulat: string | null;
  NoTruk: number | null;
  Tanggal: string | Date | null;
  JenisKayu: string | null;
  NamaGrade: string | null;
  JmlhPcs: number | null;
  TonKB: number | null;
  TonKG: number | null;
  NmSupplier: string | null;
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const withSeparators = (integerText: string): string =>
  integerText.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Always shows the number (0 renders as "0") — legacy $fmtInt. */
const fmtInt = (value: unknown): string =>
  withSeparators(String(Math.round(toFloat(value))));

/** Integer with separators; blank when ~0 — legacy $fmtIntBlankZero. */
const fmtIntBlankZero = (value: unknown): string => {
  const num = toFloat(value);
  if (Math.abs(num) < 0.000001) return "";
  return withSeparators(String(Math.round(num)));
};

/** 2 decimals; blank when ~0 — legacy $fmt2BlankZero. */
const fmt2BlankZero = (value: unknown): string => {
  const num = toFloat(value);
  if (Math.abs(num) < 0.000001) return "";
  return withSeparators(num.toFixed(2));
};

/** 2 decimals; zero renders as "0.00" — legacy $fmt2. */
const fmt2 = (value: unknown): string => withSeparators(toFloat(value).toFixed(2));

/** Effective ton per row: TonKG when present, else TonKB — legacy rule. */
const effectiveTon = (row: PenerimaanRow): number => {
  const tonKg = toFloat(row.TonKG);
  if (tonKg > 0) return tonKg;
  return toFloat(row.TonKB);
};

interface RecapRow extends Record<string, unknown> {
  tanggal: string;
  jabon_truk: number;
  jabon_ton: number;
  jabon_tgtd_truk: number;
  jabon_tgtd_ton: number;
  pulai_truk: number;
  pulai_ton: number;
  rambung_truk: number;
  rambung_super_ton: number;
  rambung_mc_ton: number;
  rambung_samsam_ton: number;
  rambung_afkir_ton: number;
}

function buildRecap(rows: PenerimaanRow[]): {
  rows: RecapRow[];
  totals: RecapRow;
} {
  const daily = new Map<
    string,
    {
      jabon: { truks: Set<string>; ton: number };
      jabonTgtd: { truks: Set<string>; ton: number };
      pulai: { truks: Set<string>; ton: number };
      rambungTruk: Set<string>;
      super: number;
      mc: number;
      samsam: number;
      afkir: number;
    }
  >();

  for (const row of rows) {
    // Tanggal arrives as a JS Date (mssql date column) — normalize to ISO so
    // the recap's date column renders it, instead of String() garbage.
    const rawTanggal = row.Tanggal;
    let date = "";
    if (rawTanggal instanceof Date) {
      date = rawTanggal.toISOString().slice(0, 10);
    } else if (rawTanggal !== null && rawTanggal !== undefined) {
      date = String(rawTanggal).trim();
    }
    if (date === "") continue;

    let entry = daily.get(date);
    if (!entry) {
      entry = {
        jabon: { truks: new Set(), ton: 0 },
        jabonTgtd: { truks: new Set(), ton: 0 },
        pulai: { truks: new Set(), ton: 0 },
        rambungTruk: new Set(),
        super: 0,
        mc: 0,
        samsam: 0,
        afkir: 0,
      };
      daily.set(date, entry);
    }

    const jenis = String(row.JenisKayu ?? "").trim().toUpperCase();
    const grade = String(row.NamaGrade ?? "").trim().toUpperCase();
    const truck = String(row.NoTruk ?? "").trim();
    const ton = effectiveTon(row);

    if (jenis === "JABON") {
      if (truck !== "") entry.jabon.truks.add(truck);
      entry.jabon.ton += ton;
    } else if (jenis.includes("JABON")) {
      if (truck !== "") entry.jabonTgtd.truks.add(truck);
      entry.jabonTgtd.ton += ton;
    } else if (jenis.includes("PULAI")) {
      if (truck !== "") entry.pulai.truks.add(truck);
      entry.pulai.ton += ton;
    } else if (jenis.includes("RAMBUNG")) {
      if (truck !== "") entry.rambungTruk.add(truck);
      if (grade.includes("MC")) entry.mc += ton;
      else if (grade.includes("SAMSAM")) entry.samsam += ton;
      else if (grade.includes("AFKIR")) entry.afkir += ton;
      else entry.super += ton;
    }
  }

  const sorted = [...daily.entries()].sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  const out: RecapRow[] = sorted.map(([tanggal, entry]) => ({
    tanggal,
    jabon_truk: entry.jabon.truks.size,
    jabon_ton: entry.jabon.ton,
    jabon_tgtd_truk: entry.jabonTgtd.truks.size,
    jabon_tgtd_ton: entry.jabonTgtd.ton,
    pulai_truk: entry.pulai.truks.size,
    pulai_ton: entry.pulai.ton,
    rambung_truk: entry.rambungTruk.size,
    rambung_super_ton: entry.super,
    rambung_mc_ton: entry.mc,
    rambung_samsam_ton: entry.samsam,
    rambung_afkir_ton: entry.afkir,
  }));

  const totals: RecapRow = {
    tanggal: "",
    jabon_truk: 0,
    jabon_ton: 0,
    jabon_tgtd_truk: 0,
    jabon_tgtd_ton: 0,
    pulai_truk: 0,
    pulai_ton: 0,
    rambung_truk: 0,
    rambung_super_ton: 0,
    rambung_mc_ton: 0,
    rambung_samsam_ton: 0,
    rambung_afkir_ton: 0,
  };
  for (const row of out) {
    for (const key of Object.keys(totals) as Array<keyof RecapRow>) {
      if (key === "tanggal") continue;
      (totals as Record<string, unknown>)[key] =
        toFloat(totals[key]) + toFloat(row[key]);
    }
  }

  return { rows: out, totals };
}

const DETAIL_COLUMNS: ReportColumn[] = [
  { label: "No Kayu Bulat", kind: "label", field: "NoKayuBulat", width: "90px", align: "center" },
  { label: "No Truk", kind: "label", field: "NoTruk", width: "60px", align: "center" },
  { label: "Tanggal", kind: "date", field: "Tanggal", width: "90px" },
  { label: "Jenis Kayu", kind: "label", field: "JenisKayu", width: "100px" },
  { label: "Nama Grade", kind: "label", field: "NamaGrade" },
  { label: "Jmlh Pcs", kind: "int", field: "JmlhPcs", width: "60px", format: fmtInt },
  { label: "Ton KB", kind: "number", field: "TonKB", width: "60px", format: fmt2BlankZero },
  { label: "Ton KG", kind: "number", field: "TonKG", width: "60px", format: fmt2 },
];

const RECAP_COLUMNS: ReportColumn[] = [
  { label: "Tanggal", kind: "date", field: "tanggal", width: "70px" },
  { label: "Truk", kind: "int", field: "jabon_truk", group: "JABON", format: fmtIntBlankZero },
  { label: "Ton", kind: "number", field: "jabon_ton", group: "JABON", format: fmt2BlankZero },
  { label: "Truk", kind: "int", field: "jabon_tgtd_truk", group: "JABON TG/TD", format: fmtIntBlankZero },
  { label: "Ton", kind: "number", field: "jabon_tgtd_ton", group: "JABON TG/TD", format: fmt2BlankZero },
  { label: "Truk", kind: "int", field: "pulai_truk", group: "PULAI", format: fmtIntBlankZero },
  { label: "Ton", kind: "number", field: "pulai_ton", group: "PULAI", format: fmt2BlankZero },
  { label: "Truk", kind: "int", field: "rambung_truk", group: "RAMBUNG (Ton)", format: fmtIntBlankZero },
  { label: "Super", kind: "number", field: "rambung_super_ton", group: "RAMBUNG (Ton)", format: fmt2BlankZero },
  { label: "Mc", kind: "number", field: "rambung_mc_ton", group: "RAMBUNG (Ton)", format: fmt2BlankZero },
  { label: "SamSam", kind: "number", field: "rambung_samsam_ton", group: "RAMBUNG (Ton)", format: fmt2BlankZero },
  { label: "Afkir", kind: "number", field: "rambung_afkir_ton", group: "RAMBUNG (Ton)", format: fmt2BlankZero },
];

function buildBodyHtml(
  rows: PenerimaanRow[],
  subtitleRecap: string,
): string {
  if (rows.length === 0) {
    return `<table class="report-table"><tbody><tr><td class="center">Tidak ada data.</td></tr></tbody></table>`;
  }

  // Group by supplier in first-appearance order (the SQL orders by supplier).
  const groups: Array<{ supplier: string; rows: PenerimaanRow[] }> = [];
  for (const row of rows) {
    const supplier = String(row.NmSupplier ?? "").trim() || "Tanpa Supplier";
    const last = groups[groups.length - 1];
    if (last && last.supplier === supplier) last.rows.push(row);
    else groups.push({ supplier, rows: [row] });
  }

  let body = "";
  for (const group of groups) {
    const pcs = group.rows.reduce((sum, row) => sum + toFloat(row.JmlhPcs), 0);
    const tonKb = group.rows.reduce((sum, row) => sum + toFloat(row.TonKB), 0);
    const tonKg = group.rows.reduce((sum, row) => sum + toFloat(row.TonKG), 0);

    body += `<div class="section-title">Nama Supplier : ${escapeSupplier(group.supplier)}</div>`;
    body += buildReportTable({
      columns: DETAIL_COLUMNS,
      rows: group.rows,
      totals: {
        label: "Sub Total",
        colspan: 5,
        values: { JmlhPcs: pcs, TonKB: tonKb, TonKG: tonKg },
      },
      emptyMessage: "Tidak ada data.",
    });
  }

  body += `<div class="section-title" style="margin-top: 14px;">${escapeSupplier(subtitleRecap)}</div>`;
  const recap = buildRecap(rows);
  body += buildReportTable({
    columns: RECAP_COLUMNS,
    rows: recap.rows,
    totals: {
      label: "Total",
      values: recap.totals as unknown as Record<string, number | null | undefined>,
    },
    emptyMessage: "Tidak ada data rangkuman.",
  });

  return body;
}

const escapeSupplier = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const penerimaanKayuBulatPerSupplierReport: ReportDefinition<
  PeriodParams,
  Array<PenerimaanRow>
> = {
  type: "penerimaan-kayu-bulat-per-supplier",
  title: "Laporan Penerimaan Kayu Bulat Per Supplier / Hari",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const result = await conn
      .request()
      .input("TglAwal", sql.Date, params.tglAwal)
      .input("TglAkhir", sql.Date, params.tglAkhir)
      .query(DETAIL_SQL);
    return (result.recordset ?? []) as PenerimaanRow[];
  },

  render(rows, meta) {
    const start = formatTanggalId(meta.params.tglAwal);
    const end = formatTanggalId(meta.params.tglAkhir);
    const bodyHtml = buildBodyHtml(rows, `Rangkuman / Periode : ${start} s/d ${end}`);

    return renderWpsReportPage({
      title: "Laporan Penerimaan Kayu Bulat Per Supplier / Hari",
      subtitle: `Dari ${start} s/d ${end}`,
      bodyHtml,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
