import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { z } from "zod";
import {
  buildEmptyTableRow,
  renderWpsReportPage,
  type NoKayuBulatLookupParams,
} from "./template";
import type { ReportDefinition } from "../types";

/**
 * Special-case form reports ("Penerimaan Kayu Bulat" Int/Ext Ton), ported
 * from the legacy open-api-report blades + services: a meta header block
 * (Nomor / Jenis Kayu / Tanggal / No.Plat / Supplier / No.Suket), the detail
 * rows split into two side-by-side column halves, a per-Keterangan summary
 * and the standard signature block. Styling is selected through the shared
 * form-layout preset.
 */

const HEADER_SQL = `
SELECT TOP 1
    kb.NoKayuBulat,
    kb.NoPlat,
    kb.NoTruk,
    kb.DateCreate,
    kb.Suket,
    supplier.NmSupplier AS SupplierUtama,
    supplier_asal.NmSupplier AS SupplierAsalKayu,
    jenis.Jenis AS JenisKayu,
    jenis.Singkatan AS SingkatanJenisKayu,
    pengukuran.Kategori AS KategoriPengukuran
FROM KayuBulat_h kb
LEFT JOIN MstSupplier supplier ON supplier.IdSupplier = kb.IdSupplier
LEFT JOIN MstSupplier supplier_asal ON supplier_asal.IdSupplier = kb.IdSupplierAsalKayu
LEFT JOIN MstJenisKayu jenis ON jenis.IdJenisKayu = kb.IdJenisKayu
LEFT JOIN MstGolPengukuran pengukuran ON pengukuran.IdPengukuran = kb.IdPengukuran
WHERE kb.NoKayuBulat = @NoKayuBulat
`;

interface TonHeader {
  noKayuBulat: string;
  tanggal: string;
  supplier: string;
  jenisKayu: string;
  noPlat: string;
  noSuket: string;
}

interface TonRow {
  NoLog: number;
  Tebal: number;
  Lebar: number;
  Panjang: number;
  Ton: number;
  Ket: string;
}

export interface TonReportData {
  header: TonHeader;
  rows: TonRow[];
  summary: {
    totalLogs: number;
    totalTon: number;
    totalsByKeterangan: Record<string, number>;
  };
}

const fmtSize = (value: number): string => formatNumber(value, 2);

const fmtTon = (value: number): string => formatNumber(value, 4);

const buildHeaderData = (
  headerRow: Record<string, unknown>,
  noKayuBulat: string,
): TonHeader => {
  const supplierAsal = String(headerRow.SupplierAsalKayu ?? "").trim();
  const supplierUtama = String(headerRow.SupplierUtama ?? "").trim();
  const supplierUtamaCompact = supplierUtama.replace(/\s+/g, "");
  const singkatanJenis = String(headerRow.SingkatanJenisKayu ?? "").trim();
  const kategoriPengukuran = String(headerRow.KategoriPengukuran ?? "").trim();
  const noTruk = String(headerRow.NoTruk ?? "").trim();

  const parts = [
    supplierAsal !== "" ? supplierAsal : supplierUtama,
    supplierAsal !== "" && supplierUtamaCompact !== "" ? `(${supplierUtamaCompact})` : "",
    [singkatanJenis, kategoriPengukuran !== "" ? `-${kategoriPengukuran}` : ""].join(""),
    noTruk,
  ].filter((part) => part !== "");

  return {
    noKayuBulat: String(headerRow.NoKayuBulat ?? noKayuBulat).trim(),
    tanggal:
      headerRow.DateCreate instanceof Date
        ? headerRow.DateCreate.toISOString().slice(0, 10)
        : String(headerRow.DateCreate ?? "").trim(),
    supplier: parts.join(" "),
    jenisKayu: String(headerRow.JenisKayu ?? "").trim(),
    noPlat: String(headerRow.NoPlat ?? "").trim(),
    noSuket: String(headerRow.Suket ?? "").trim(),
  };
};

const buildSummary = (rows: TonRow[]): TonReportData["summary"] => {
  let totalTon = 0;
  const totalsByKeterangan: Record<string, number> = {};

  for (const row of rows) {
    const keterangan = row.Ket !== "" ? row.Ket : "-";
    totalTon += row.Ton;
    totalsByKeterangan[keterangan] = (totalsByKeterangan[keterangan] ?? 0) + row.Ton;
  }

  const sorted: Record<string, number> = {};
  for (const key of Object.keys(totalsByKeterangan).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  )) {
    sorted[key] = totalsByKeterangan[key];
  }

  return { totalLogs: rows.length, totalTon, totalsByKeterangan: sorted };
};

/** Form-specific CSS (meta header, split table, summary, signatures).
 *  The meta/summary/signature blocks are border-free — the standard WPS
 *  table borders only apply to the detail table. */

const buildSplitTableHtml = (rows: TonRow[]): string => {
  const leftCount = Math.ceil(rows.length / 2);
  const bodyRows: string[] = [];

  for (let index = 0; index < leftCount; index++) {
    const left = rows[index];
    const right = rows[leftCount + index];
    const zebra = index % 2 === 0 ? "row-odd" : "row-even";
    const last = index === leftCount - 1 ? " last-data-row" : "";

    const cell = (row: TonRow | undefined, number: number): string => {
      if (!row) return `<td colspan="6"></td>`;
      return `<td class="center">${number}</td>
      <td class="number">${fmtSize(row.Tebal)}</td>
      <td class="number">${fmtSize(row.Lebar)}</td>
      <td class="number">${fmtSize(row.Panjang)}</td>
      <td class="number">${fmtTon(row.Ton)}</td>
      <td class="center">${escapeHtml(row.Ket)}</td>`;
    };

    bodyRows.push(`<tr class="data-row ${zebra}${last}">
      ${cell(left, index + 1)}
      <td class="separator-cell"></td>
      ${cell(right, leftCount + index + 1)}
    </tr>`);
  }

  return `<table class="report-table">
  <thead>
    <tr>
      <th style="width: 5%;">No</th>
      <th style="width: 7.5%;">Tebal</th>
      <th style="width: 7.5%;">Lebar</th>
      <th style="width: 7.5%;">Panjang</th>
      <th style="width: 9.5%;">Ton</th>
      <th style="width: 11%;">Keterangan</th>
      <th class="separator-cell"></th>
      <th style="width: 5%;">No</th>
      <th style="width: 7.5%;">Tebal</th>
      <th style="width: 7.5%;">Lebar</th>
      <th style="width: 7.5%;">Panjang</th>
      <th style="width: 9.5%;">Ton</th>
      <th style="width: 11%;">Keterangan</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows.length > 0 ? bodyRows.join("\n    ") : buildEmptyTableRow(13)}
  </tbody>
</table>`;
};

const buildSummaryHtml = (
  header: TonHeader,
  summary: TonReportData["summary"],
): string => {
  const lines = Object.entries(summary.totalsByKeterangan).map(
    ([keterangan, ton]) =>
      `<tr><td class="summary-label">KB ${escapeHtml(header.jenisKayu)} ${escapeHtml(keterangan)} :</td><td class="summary-value">${fmtTon(ton)}</td></tr>`,
  );
  lines.push(
    `<tr><td class="summary-label">Total :</td><td class="summary-value">${fmtTon(summary.totalTon)}</td></tr>`,
  );
  return `<div class="summary-block">
  <table class="summary-table">
    ${lines.join("\n    ")}
  </table>
</div>`;
};

const SIGNATURE_LABELS = [
  "Ukur 1 ;",
  "Ukur 2 ;",
  "Tally Tulis ;",
  "Diperiksa Oleh ;",
  "QC Oleh ;",
  "Diinput Oleh ;",
  "Supir ;",
];

const buildSignatureHtml = (): string => {
  const labelCells = SIGNATURE_LABELS.map(
    (label) => `<td><div class="signature-label">${escapeHtml(label)}</div></td>`,
  ).join("");
  const placeholderCells = SIGNATURE_LABELS.map(
    () =>
      `<td><table class="signature-placeholder-table"><tr><td class="signature-bracket">(</td><td class="signature-space"></td><td class="signature-bracket">)</td></tr></table></td>`,
  ).join("");
  return `<table class="signature-table">
  <tr class="signature-label-row">${labelCells}</tr>
  <tr class="signature-placeholder-row">${placeholderCells}</tr>
</table>`;
}

const buildBodyHtml = (data: TonReportData): string => {
  const { header, rows, summary } = data;
  const metaCell = (label: string, value: string): string =>
    `<td class="meta-label">${escapeHtml(label)}</td><td class="meta-colon">:</td><td>${escapeHtml(value)}</td>`;

  const metaHtml = `<table class="meta-table">
  <tr>${metaCell("Nomor", header.noKayuBulat)}<td class="spacer-cell"></td>${metaCell("Jenis Kayu", header.jenisKayu)}</tr>
  <tr>${metaCell("Tanggal", formatTanggalId(header.tanggal) || header.tanggal)}<td class="spacer-cell"></td>${metaCell("No.Plat", header.noPlat)}</tr>
  <tr>${metaCell("Supplier", header.supplier)}<td class="spacer-cell"></td>${metaCell("No.Suket", header.noSuket)}</tr>
</table>`;

  return `${metaHtml}
${buildSplitTableHtml(rows)}
${buildSummaryHtml(header, summary)}
${buildSignatureHtml()}`;
};

export interface PenerimaanTonReportSpec {
  type: string;
  title: string;
  spName: string;
}

/**
 * Factory for the Int/Ext Ton penerimaan form reports. Body params:
 * `{ noKayuBulat }`. fetchData returns header + rows (via the SP) + a
 * per-Keterangan summary; render reproduces the legacy form layout.
 */
export function createPenerimaanTonReport(
  spec: PenerimaanTonReportSpec,
): ReportDefinition<NoKayuBulatLookupParams, TonReportData> {
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
        .input("NoKayuBulat", sql.VarChar(50), params.noKayuBulat)
        .query(HEADER_SQL);
      const headerRow = (headerResult.recordset[0] ?? {}) as Record<string, unknown>;

      const spResult = await conn
        .request()
        .input("NoKayuBulat", sql.VarChar(50), params.noKayuBulat)
        .execute(spec.spName);
      const rows: TonRow[] = (spResult.recordset ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          NoLog: Number(row.NoLog ?? 0),
          Tebal: Number(row.Tebal ?? 0),
          Lebar: Number(row.Lebar ?? 0),
          Panjang: Number(row.Panjang ?? 0),
          Ton: Number(row.Ton ?? 0),
          Ket: String(row.Ket ?? "").trim(),
        };
      });

      return {
        header: buildHeaderData(headerRow, params.noKayuBulat),
        rows,
        summary: buildSummary(rows),
      };
    },

    render(data, meta) {
      return renderWpsReportPage({
        title: spec.title,
        subtitle: "",
        bodyHtml: buildBodyHtml(data),
        style: "penerimaan_kayu_bulat_ton",
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}
