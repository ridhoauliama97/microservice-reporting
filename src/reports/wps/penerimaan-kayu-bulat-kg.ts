import sql from "mssql";
import { z } from "zod";
import { escapeHtml, formatPrintedAt, formatTanggalId } from "../../templates/html";
import { buildEmptyTableRow, renderWpsReportPage, type NoKayuBulatLookupParams } from "./template";
import type { ReportDefinition, RenderResult } from "../types";

/**
 * "Penerimaan Kayu Bulat - (KG)" form reports (KG weighing), ported 1:1 from
 * the legacy open-api-report blades + services:
 *   - SP_PenKBInTon_KG  -> penerimaan-kayu-bulat-kg   (supplier: Asal (Utama))
 *   - SP_PenKBOutTon_KG -> penerimaan-kayu-bulat-ext-kg (supplier: Utama only)
 *
 * Layout (special-case form, styling via a named shared preset): a meta
 * header block (Nomor / Jenis Kayu / Tanggal / No.Plat / Supplier / No.Suket),
 * a Bruto + Tara summary line, then one small per-grade table (No / Pcs /
 * Berat) with a "Jumlah" sub total, a grand total, and the signature block.
 *
 * The only difference between In and Ext is the SP and how the supplier label
 * is composed in the header, so both share this factory.
 */

const HEADER_SQL = `
SELECT TOP 1
    kb.NoKayuBulat,
    kb.NoPlat,
    kb.NoTruk,
    kb.DateCreate,
    kb.Suket,
    kg.Bruto,
    kg.Tara,
    kb.IdPengukuran,
    supplier.NmSupplier AS SupplierUtama,
    supplier_asal.NmSupplier AS SupplierAsalKayu,
    jenis.Jenis AS JenisKayu,
    jenis.Singkatan AS SingkatanJenisKayu,
    pengukuran.Kategori AS KategoriPengukuran
FROM KayuBulat_h kb
LEFT JOIN KayuBulatKG_h kg ON kg.NoKayuBulat = kb.NoKayuBulat
LEFT JOIN MstSupplier supplier ON supplier.IdSupplier = kb.IdSupplier
LEFT JOIN MstSupplier supplier_asal ON supplier_asal.IdSupplier = kb.IdSupplierAsalKayu
LEFT JOIN MstJenisKayu jenis ON jenis.IdJenisKayu = kb.IdJenisKayu
LEFT JOIN MstGolPengukuran pengukuran ON pengukuran.IdPengukuran = kb.IdPengukuran
WHERE kb.NoKayuBulat = @NoKayuBulat
`;

interface KgGradeRow {
  no: number;
  pcs: number;
  berat: number;
}

interface KgGradeGroup {
  gradeName: string;
  rows: KgGradeRow[];
  totals: { pcs: number; berat: number };
}

interface KgFormData {
  header: {
    noKayuBulat: string;
    tanggal: string;
    supplier: string;
    jenisKayu: string;
    noPlat: string;
    noSuket: string;
    bruto: number;
    tara: number;
  };
  groups: KgGradeGroup[];
  summary: { totalPcs: number; totalBerat: number };
}

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/** Integer with separators; zero renders as "0" (legacy $formatInt/$formatWeight). */
const fmtInt = (value: unknown): string => {
  const n = Math.round(toFloat(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const buildHeader = (
  headerRow: Record<string, unknown>,
  firstRow: Record<string, unknown> | undefined,
  noKayuBulat: string,
  variant: "in" | "ext",
): KgFormData["header"] => {
  const supplierAsal = String(headerRow.SupplierAsalKayu ?? "").trim();
  const supplierUtama = String(headerRow.SupplierUtama ?? "").trim();
  const supplierUtamaCompact = supplierUtama.replace(/\s+/g, "");
  const singkatanJenis = String(headerRow.SingkatanJenisKayu ?? "").trim();
  const kategori = String(headerRow.KategoriPengukuran ?? "").trim();
  const noTruk = String(headerRow.NoTruk ?? "").trim();

  // The In variant prefixes the origin supplier and appends the main supplier
  // in parentheses; the Ext variant lists only the main supplier.
  const supplierParts =
    variant === "in"
      ? [
          supplierAsal,
          supplierAsal !== "" && supplierUtamaCompact !== ""
            ? `(${supplierUtamaCompact})`
            : "",
          [singkatanJenis, kategori !== "" ? `-${kategori}` : ""].join(""),
          noTruk,
        ]
      : [
          supplierUtama,
          [singkatanJenis, kategori !== "" ? `-${kategori}` : ""].join(""),
          noTruk,
        ];
  const supplier = supplierParts.filter((part) => part !== "").join(" ");

  return {
    noKayuBulat: String(headerRow.NoKayuBulat ?? noKayuBulat).trim(),
    tanggal:
      headerRow.DateCreate instanceof Date
        ? headerRow.DateCreate.toISOString().slice(0, 10)
        : String(headerRow.DateCreate ?? "").trim(),
    supplier,
    jenisKayu: String(headerRow.JenisKayu ?? "").trim(),
    noPlat: String(headerRow.NoPlat ?? "").trim(),
    noSuket: String(headerRow.Suket ?? "").trim(),
    bruto: toFloat(headerRow.Bruto ?? firstRow?.Bruto ?? 0),
    tara: toFloat(headerRow.Tara ?? firstRow?.Tara ?? 0),
  };
};

const buildGroups = (rows: Array<Record<string, unknown>>): {
  groups: KgGradeGroup[];
  summary: KgFormData["summary"];
} => {
  const groups: KgGradeGroup[] = [];
  let totalPcs = 0;
  let totalBerat = 0;

  for (const row of rows) {
    const pcs = Math.round(toFloat(row.JmlhBatang));
    const berat = toFloat(row.Berat);
    groups.push({
      gradeName: String(row.NamaGrade ?? "").trim(),
      rows: [{ no: Math.round(toFloat(row.NoUrut)), pcs, berat }],
      totals: { pcs, berat },
    });
    totalPcs += pcs;
    totalBerat += berat;
  }

  return { groups, summary: { totalPcs, totalBerat } };
};

const buildEmptyGradeTable = (): string => `<table class="report-table">
  <thead>
    <tr>
      <th style="width: 28px;">No</th>
      <th style="width: 70px;">Pcs</th>
      <th style="width: 72px;">Berat</th>
    </tr>
  </thead>
  <tbody>${buildEmptyTableRow(3)}</tbody>
</table>`;

/** Form-specific CSS (meta header, grade tables, summary, signatures). */

const buildBodyHtml = (data: KgFormData): string => {
  const { header, groups, summary } = data;
  const metaCell = (label: string, value: string): string =>
    `<td class="meta-label">${escapeHtml(label)}</td><td class="meta-colon">:</td><td>${escapeHtml(value)}</td>`;

  const metaHtml = `<table class="meta-table">
  <tr>${metaCell("Nomor", header.noKayuBulat)}<td class="spacer-cell"></td>${metaCell("Jenis Kayu", header.jenisKayu)}</tr>
  <tr>${metaCell("Tanggal", header.tanggal ? formatTanggalId(header.tanggal) : "")}<td class="spacer-cell"></td>${metaCell("No.Plat", header.noPlat)}</tr>
  <tr>${metaCell("Supplier", header.supplier)}<td class="spacer-cell"></td>${metaCell("No.Suket", header.noSuket)}</tr>
</table>`;

  const summaryRow = `<div class="summary-row">
  <span>Bruto : ${fmtInt(header.bruto)}</span>
  <span>Tara : ${fmtInt(header.tara)}</span>
</div>`;

  const groupTables = groups.length > 0
    ? groups
        .map(
          (group, index) => `<div class="grade-title">Nama Grade : ${escapeHtml(group.gradeName)}</div>
  <table class="report-table">
    <thead>
      <tr>
        <th style="width: 28px;">No</th>
        <th style="width: 70px;">Pcs</th>
        <th style="width: 72px;">Berat</th>
      </tr>
    </thead>
    <tbody>
      ${group.rows
        .map(
          (row) => `<tr class="data-row ${index % 2 === 0 ? "row-odd" : "row-even"}">
        <td class="center">${row.no}</td>
        <td class="number">${fmtInt(row.pcs)}</td>
        <td class="number">${fmtInt(row.berat)}</td>
      </tr>`,
        )
        .join("\n      ")}
      <tr class="totals-row">
        <td class="center"><strong>Jumlah</strong></td>
        <td class="number"><strong>${fmtInt(group.totals.pcs)}</strong></td>
        <td class="number"><strong>${fmtInt(group.totals.berat)}</strong></td>
      </tr>
    </tbody>
  </table>`,
        )
        .join("\n  ")
    : buildEmptyGradeTable();

  const grandTotal = `<div class="grand-total-line"></div>
<table class="grand-total-table">
  <tr>
    <td class="grand-total-label">Total :</td>
    <td class="grand-total-value" style="width: 70px;">${fmtInt(summary.totalPcs)}</td>
    <td class="grand-total-value" style="width: 72px;">${fmtInt(summary.totalBerat)}</td>
  </tr>
</table>`;

  const SIGNATURE_LABELS = [
    "Ukur 1 ;",
    "Ukur 2 ;",
    "Tally Tulis ;",
    "Diperiksa Oleh ;",
    "QC Oleh ;",
    "Diinput Oleh ;",
    "Supir ;",
  ];
  const labelCells = SIGNATURE_LABELS.map(
    (label) => `<td><div class="signature-label">${escapeHtml(label)}</div></td>`,
  ).join("");
  const placeholderCells = SIGNATURE_LABELS.map(
    () =>
      `<td><table class="signature-placeholder-table"><tr><td class="signature-bracket">(</td><td class="signature-space"></td><td class="signature-bracket">)</td></tr></table></td>`,
  ).join("");
  const signatureHtml = `<table class="signature-table">
  <tr class="signature-label-row">${labelCells}</tr>
  <tr class="signature-placeholder-row">${placeholderCells}</tr>
</table>`;

  return `${metaHtml}
${summaryRow}
  ${groupTables}
${grandTotal}
${signatureHtml}`;
};

export interface PenerimaanKgReportSpec {
  type: string;
  title: string;
  spName: string;
  variant: "in" | "ext";
}

export function createPenerimaanKgReport(
  spec: PenerimaanKgReportSpec,
): ReportDefinition<NoKayuBulatLookupParams, KgFormData> {
  return {
    type: spec.type,
    title: spec.title,
    paramsSchema: z.object({
      noKayuBulat: z.string().trim().min(1).max(50),
    }),

    async fetchData(params, { pool }) {
      const conn = await pool;
      const headerResult = await conn
        .request()
        .input("NoKayuBulat", sql.VarChar(20), params.noKayuBulat)
        .query(HEADER_SQL);
      const headerRow = (headerResult.recordset[0] ?? {}) as Record<string, unknown>;

      const spResult = await conn
        .request()
        .input("NoKayuBulat", sql.VarChar(20), params.noKayuBulat)
        .execute(spec.spName);
      const rows = (spResult.recordset ?? []) as Array<Record<string, unknown>>;

      const header = buildHeader(
        headerRow,
        rows[0] as Record<string, unknown> | undefined,
        params.noKayuBulat,
        spec.variant,
      );
      const { groups, summary } = buildGroups(rows);
      return { header, groups, summary };
    },

    render(data, meta): RenderResult {
      return renderWpsReportPage({
        title: spec.title,
        subtitle: "",
        bodyHtml: buildBodyHtml(data),
        style: "penerimaan_kayu_bulat_kg",
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

export const penerimaanKayuBulatKgReport = createPenerimaanKgReport({
  type: "penerimaan-kayu-bulat-kg",
  title: "Penerimaan Kayu Bulat - (KG)",
  spName: "SP_PenKBInTon_KG",
  variant: "in",
});

export const penerimaanKayuBulatExtKgReport = createPenerimaanKgReport({
  type: "penerimaan-kayu-bulat-ext-kg",
  title: "Penerimaan Kayu Bulat - (KG)",
  spName: "SP_PenKBOutTon_KG",
  variant: "ext",
});
