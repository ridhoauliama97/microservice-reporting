import { z } from "zod";
import sql from "mssql";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { renderWpsReportPage, buildEmptyTableRow } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapSTHidupKering — "Laporan ST Hidup Kering". Ported from open-api-report's
 * StHidupKeringReportService + st-hidup-kering-pdf.blade.php.
 *
 * The SP takes @Hari (days) and @Mode ("INCLUDE"/"EXCLUDE"). The legacy sheet
 * runs one query per selected mode and merges the rows, deduplicating by a
 * stable row identity. Rows are then grouped into blocks per Jenis.
 */

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const paramsSchema = z
  .object({
    hari: z.coerce.number().int().min(0),
    include: z.boolean().optional().default(false),
    exclude: z.boolean().optional().default(false),
  })
  .refine((v) => v.include || v.exclude, {
    message: "Minimal pilih satu: include atau exclude",
  });

interface KeringRow extends Record<string, unknown> {
  NoST: string;
  Tebal: number;
  Lebar: number;
  JmlhBatang: number;
  IdLokasi: string;
  UsiaHari: number;
  Jenis: string;
  BB: string;
}

interface JenisGroup {
  name: string;
  rows: KeringRow[];
  totalBatang: number;
}

function normalizeJenis(value: unknown): string {
  const j = String(value ?? "").trim();
  return j !== "" ? j : "Tanpa Jenis";
}

function rowIdentity(row: Record<string, unknown>): string {
  return [
    String(row.NoST ?? ""),
    String(row.Tebal ?? ""),
    String(row.Lebar ?? ""),
    String(row.IdLokasi ?? ""),
    String(row.Jenis ?? ""),
    String(row.BB ?? ""),
  ].join("|");
}

export const stHidupKeringReport: ReportDefinition<
  z.infer<typeof paramsSchema>,
  KeringRow[]
> = {
  type: "st-hidup-kering",
  title: "Laporan ST Hidup Kering",
  paramsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const modes: Array<"INCLUDE" | "EXCLUDE"> = [];
    if (params.include) modes.push("INCLUDE");
    if (params.exclude) modes.push("EXCLUDE");

    const seen = new Set<string>();
    const out: KeringRow[] = [];
    for (const mode of modes) {
      const request = conn.request();
      request.input("Hari", sql.Int, params.hari);
      request.input("Mode", sql.VarChar(10), mode);
      const result = await request.execute("SP_LapSTHidupKering");
      for (const row of result.recordset ?? []) {
        const key = rowIdentity(row as Record<string, unknown>);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          NoST: String(row.NoST ?? ""),
          Tebal: toFloat(row.Tebal),
          Lebar: toFloat(row.Lebar),
          JmlhBatang: Math.round(toFloat(row.JmlhBatang)),
          IdLokasi: String(row.IdLokasi ?? ""),
          UsiaHari: Math.round(toFloat(row.UsiaHari)),
          Jenis: String(row.Jenis ?? ""),
          BB: String(row.BB ?? ""),
        });
      }
    }
    return out;
  },

  render(rows, meta) {
    // Group by Jenis, then sort rows for display like the reference.
    const byJenis = new Map<string, KeringRow[]>();
    for (const row of rows) {
      const jenis = normalizeJenis(row.Jenis);
      const list = byJenis.get(jenis) ?? [];
      list.push(row);
      byJenis.set(jenis, list);
    }
    const groups: JenisGroup[] = [...byJenis.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      )
      .map(([name, list]) => {
        const sorted = [...list].sort(
          (a, b) =>
            normalizeJenis(a.Jenis).localeCompare(normalizeJenis(b.Jenis)) ||
            a.NoST.localeCompare(b.NoST) ||
            a.IdLokasi.localeCompare(b.IdLokasi) ||
            a.Tebal - b.Tebal ||
            a.Lebar - b.Lebar,
        );
        return {
          name,
          rows: sorted,
          totalBatang: sorted.reduce((s, r) => s + r.JmlhBatang, 0),
        };
      });

    const generated = formatTanggalId(
      meta.generatedAt.toISOString().slice(0, 10),
    ).replace(/\d{4}$/, (year) => year.slice(-2));

    const tableFor = (group: JenisGroup): string => `<div class="jenis-title">Jenis : ${escapeHtml(group.name)}</div>
<table class="data-table">
  <thead>
    <tr class="headers-row">
      <th style="width: 5%">No</th>
      <th style="width: 15%">No ST</th>
      <th style="width: 15%">Tebal (mm)</th>
      <th style="width: 15%">Lebar (mm)</th>
      <th style="width: 20%">Jumlah Batang (Pcs)</th>
      <th style="width: 20%">Lokasi</th>
      <th style="width: 15%">Usia (Hari)</th>
    </tr>
  </thead>
  <tbody>
${group.rows
  .map(
    (r, i) => `    <tr class="data-row ${i % 2 === 0 ? "row-odd" : "row-even"}">
      <td class="center">${i + 1}</td>
      <td class="center">${escapeHtml(r.NoST)}</td>
      <td class="center">${formatNumber(r.Tebal, 0)}</td>
      <td class="center">${formatNumber(r.Lebar, 0)}</td>
      <td class="center">${formatNumber(r.JmlhBatang, 0)}</td>
      <td class="center">${escapeHtml(r.IdLokasi)}</td>
      <td class="center">${formatNumber(r.UsiaHari, 0)}</td>
    </tr>`,
  )
  .join("\n")}
  </tbody>
</table>`;

    const bodyHtml = groups.length
      ? groups.map((g) => tableFor(g)).join("\n")
      : `<table class="data-table"><tbody>${buildEmptyTableRow(7)}</tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan ST Hidup Kering",
      subtitle: `Per ${generated}`,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["st-hidup-kering"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
