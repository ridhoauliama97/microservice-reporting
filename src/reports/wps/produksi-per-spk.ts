import { z } from 'zod'
import sql from 'mssql'
import type { ReportDefinition, RenderMeta, RenderResult } from '../types'
import { escapeHtml, formatPrintedAt, formatTanggalId } from '../../templates/html'
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from './template'

/**
 * "Laporan Produksi Per SPK" is the only WPS report that mixes a stored
 * procedure with three hand-written queries against the master tables, so it
 * has more going on than the usual one-SP-one-table shape.
 *
 *   SP_LapProduksiPerSPK   the yield of each of the seven processes
 *   MstSPK_h + MstBuyer    who the order is for and whether it is active
 *   MstSPK_d + MstJenisKayu the dimensions the order was written in
 *   seven UNION ALLs       which labels are still alive, and which were
 *                          expected but never arrived
 *
 * Only the procedure's result is trusted for the numbers; the three queries
 * supply context and the label detail.
 */

/** @NoSPK varchar(15) — the order number, and the only parameter. */
export const produksiPerSpkParamsSchema = z.object({
  noSpk: z.string().trim().min(1).max(15),
})
export type ProduksiPerSpkParams = z.infer<typeof produksiPerSpkParamsSchema>

/**
 * Process order used for both the yield table and the label sections. The
 * procedure returns its seven rows alphabetically, so without this the report
 * would read CCA, FJ, LMT, MLD, PACK, S4S, SAND instead of following the line.
 */
export const PROSES_ORDER: readonly string[] = [
  'S4S',
  'FJ',
  'MLD',
  'LMT',
  'CCA',
  'SAND',
  'PACK',
];

export interface SpkHeader {
  noSpk: string;
  tanggal: string;
  tujuan: string;
  buyer: string;
  noContract: string;
  status: string;
}

export interface SpkDimension {
  jenis: string;
  tebal: number | null;
  lebar: number | null;
}

export interface SpkRendemenRow {
  group: string;
  input: number | null;
  output: number | null;
  rend: number | null;
  rendGlobal: number | null;
}

export interface SpkLabelRow {
  kategori: string;
  jenis: string;
  noLabel: string;
  lokasi: string;
  tebal: number | null;
  lebar: number | null;
  panjang: number | null;
  total: number;
}

export interface SpkLabelGroup {
  name: string;
  rows: SpkLabelRow[];
  total: number;
}

export interface ProduksiPerSpkData {
  header: SpkHeader;
  dimensions: SpkDimension[];
  rendemen: SpkRendemenRow[];
  /** The first RendGlobal the procedure reported, as the legacy service did. */
  rendemenGlobal: number | null;
  aliveLabels: SpkLabelGroup[];
  missLabels: SpkLabelGroup[];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s/g, '');
  if (cleaned === '') return null;
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const toText = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === '' ? fallback : text;
};

/** SpkRendemenData, with every one of the seven processes present. */
export function buildRendemenRows(rows: Array<Record<string, unknown>>): SpkRendemenRow[] {
  const byGroup = new Map<string, SpkRendemenRow>();
  for (const row of rows) {
    const group = String(row.Group ?? '')
      .trim()
      .toUpperCase();
    if (group === '') continue;
    byGroup.set(group, {
      group,
      input: toNumber(row.Input),
      output: toNumber(row.Output),
      rend: toNumber(row.Rend),
      rendGlobal: toNumber(row.RendGlobal),
    });
  }
  // The procedure omits a process entirely when it had no activity, so the
  // missing ones are filled in rather than leaving a hole in the table.
  return PROSES_ORDER.map(
    (group) =>
      byGroup.get(group) ?? { group, input: null, output: null, rend: null, rendGlobal: null },
  );
}

/** Groups label rows by category, known categories first in flow order. */
export function groupLabelRows(rows: Array<Record<string, unknown>>): SpkLabelGroup[] {
  const byCategory = new Map<string, SpkLabelRow[]>();
  for (const row of rows) {
    const kategori = toText(row.Kategori, 'LAINNYA');
    const bucket = byCategory.get(kategori);
    const label: SpkLabelRow = {
      kategori,
      jenis: toText(row.Jenis, '-'),
      noLabel: toText(row.NoLabel, '-'),
      lokasi: toText(row.Lokasi, '-'),
      tebal: toNumber(row.Tebal),
      lebar: toNumber(row.Lebar),
      panjang: toNumber(row.Panjang),
      total: toNumber(row.Total) ?? 0,
    };
    if (bucket) bucket.push(label);
    else byCategory.set(kategori, [label]);
  }

  const toGroup = (name: string, bucket: SpkLabelRow[]): SpkLabelGroup => ({
    name,
    rows: bucket,
    total: bucket.reduce((sum, r) => sum + r.total, 0),
  });

  const ordered: SpkLabelGroup[] = [];
  for (const name of PROSES_ORDER) {
    const bucket = byCategory.get(name);
    if (bucket) {
      ordered.push(toGroup(name, bucket));
      byCategory.delete(name);
    }
  }
  for (const [name, bucket] of byCategory) ordered.push(toGroup(name, bucket));
  return ordered;
}

const fmtVolume = (value: number | null): string =>
  value === null
    ? ''
    : value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Dimensions are whole millimetres, so no decimals. */
const fmtDim = (value: number | null): string =>
  value === null ? '' : value.toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtPercent = (value: number | null): string =>
  value === null
    ? ''
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function renderMeta(header: SpkHeader): string {
  const rows = (items: Array<[string, string]>): string =>
    items
      .map(
        ([label, value]) =>
          `<tr><td class="meta-label">${escapeHtml(label)}</td><td class="meta-sep">:</td><td>${escapeHtml(value)}</td></tr>`,
      )
      .join('');
  return `<table class="meta-grid">
    <tr>
      <td class="meta-pane-left">
        <table class="meta-table">
          ${rows([
            ['No SPK', header.noSpk],
            ['Tanggal', header.tanggal],
            ['Tujuan', header.tujuan],
          ])}
        </table>
      </td>
      <td></td>
      <td class="meta-pane-right">
        <table class="meta-table">
          ${rows([
            ['Buyer', header.buyer],
            ['No Contract', header.noContract],
            ['Status', header.status],
          ])}
        </table>
      </td>
    </tr>
  </table>`;
}

function renderDimensions(dimensions: SpkDimension[]): string {
  const body =
    dimensions.length === 0
      ? `<tr><td colspan="3" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`
      : dimensions
          .map((d, index) => {
            const shade = (index + 1) % 2 === 1 ? 'row-odd' : 'row-even';
            return (
              `<tr class="data-row ${shade}"><td>${escapeHtml(d.jenis)}</td>` +
              `<td class="center">${escapeHtml(fmtDim(d.tebal))}</td>` +
              `<td class="center">${escapeHtml(fmtDim(d.lebar))}</td></tr>`
            );
          })
          .join('\n        ');
  return `<table class="report-table spk-dimension-table">
      <thead>
        <tr class="headers-row">
          <th>Jenis</th><th style="width: 74px;">Tebal</th><th style="width: 74px;">Lebar</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>`;
}

function renderRendemen(rows: SpkRendemenRow[], rendemenGlobal: number | null): string {
  const body =
    rows.length === 0
      ? `<tr><td colspan="4" class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr>`
      : rows
          .map((row, index) => {
            const shade = (index + 1) % 2 === 1 ? 'row-odd' : 'row-even';
            return (
              `<tr class="data-row ${shade}"><td>${escapeHtml(row.group)}</td>` +
              `<td class="rend-value">${escapeHtml(fmtVolume(row.input))}</td>` +
              `<td class="rend-value">${escapeHtml(fmtVolume(row.output))}</td>` +
              `<td class="rend-value">${escapeHtml(fmtPercent(row.rend))}</td></tr>`
            );
          })
          .join('\n        ');

  const globalLine =
    rendemenGlobal === null
      ? '<div class="rendemen-global">Rendemen Global</div>'
      : `<div class="rendemen-global">Rendemen Global : ${escapeHtml(fmtPercent(rendemenGlobal))}%</div>`;

  return `<table class="report-table spk-rendemen-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 38%;">Group</th>
          <th style="width: 20%;">Input</th>
          <th style="width: 20%;">Output</th>
          <th style="width: 22%;">Rend</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
    ${globalLine}`;
}

function renderLabelGroup(group: SpkLabelGroup): string {
  const body = group.rows
    .map((row, index) => {
      const shade = (index + 1) % 2 === 1 ? 'row-odd' : 'row-even';
      return (
        `<tr class="data-row ${shade}"><td>${escapeHtml(row.jenis)}</td>` +
        `<td>${escapeHtml(row.noLabel)}</td>` +
        `<td class="center">${escapeHtml(row.lokasi)}</td>` +
        `<td class="center">${escapeHtml(fmtDim(row.tebal))}</td>` +
        `<td class="center">${escapeHtml(fmtDim(row.lebar))}</td>` +
        `<td class="center">${escapeHtml(fmtDim(row.panjang))}</td>` +
        `<td class="number">${escapeHtml(fmtVolume(row.total))}</td></tr>`
      );
    })
    .join('\n          ');

  // Wrapped so a category heading never sits alone at the foot of a page with
  // its table overleaf.
  return `<div class="label-group">
    <div class="section-subtitle">Kategori : ${escapeHtml(group.name)}</div>
    <table class="report-table spk-label-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 19%;">Jenis</th>
          <th style="width: 18%;">No Label</th>
          <th style="width: 10%;">Lokasi</th>
          <th style="width: 10%;">Tebal</th>
          <th style="width: 10%;">Lebar</th>
          <th style="width: 12%;">Panjang</th>
          <th style="width: 13%;">Total</th>
        </tr>
      </thead>
      <tbody>
          ${body}
        <tr class="label-total">
          <td colspan="6" class="center">Total</td>
          <td class="number">${escapeHtml(fmtVolume(group.total))}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function renderLabelSections(
  title: string,
  groups: SpkLabelGroup[],
): string {
  const inner =
    groups.length === 0
      ? `<table class="report-table spk-label-table"><tbody><tr><td class="empty-cell">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`
      : groups.map(renderLabelGroup).join('\n    ');
  return `<div class="section-title">${escapeHtml(title)}</div>
    ${inner}`;
}

/** One leg of the label UNION: a process header/detail pair. */
interface LabelLeg {
  kategori: string;
  headerTable: string;
  noColumn: string;
  detailTable: string;
  /**
   * PACK stores its volume in the same unit as the others, so the legacy query
   * skips the two unit conversions for it.
   */
  convertUnits: boolean;
}

const LABEL_LEGS: readonly LabelLeg[] = [
  { kategori: 'S4S', headerTable: 'S4S_h', noColumn: 'NoS4S', detailTable: 'S4S_d', convertUnits: true },
  { kategori: 'FJ', headerTable: 'FJ_h', noColumn: 'NoFJ', detailTable: 'FJ_d', convertUnits: true },
  { kategori: 'MLD', headerTable: 'Moulding_h', noColumn: 'NoMoulding', detailTable: 'Moulding_d', convertUnits: true },
  { kategori: 'LMT', headerTable: 'Laminating_h', noColumn: 'NoLaminating', detailTable: 'Laminating_d', convertUnits: true },
  { kategori: 'CCA', headerTable: 'CCAkhir_h', noColumn: 'NoCCAkhir', detailTable: 'CCAkhir_d', convertUnits: true },
  { kategori: 'SAND', headerTable: 'Sanding_h', noColumn: 'NoSanding', detailTable: 'Sanding_d', convertUnits: true },
  { kategori: 'PACK', headerTable: 'BarangJadi_h', noColumn: 'NoBJ', detailTable: 'BarangJadi_d', convertUnits: false },
];

/**
 * Builds the UNION ALL that lists a process's labels. The only difference
 * between the two calls is the WHERE clause: the live labels belong to this
 * order, the "miss" ones are rows that point at it as their destination but
 * were never given an order of their own.
 *
 * The table and column names come from LABEL_LEGS, never from user input, and
 * the order number is bound as a parameter in every leg.
 */
function buildLabelUnionSql(miss: boolean): string {
  const condition = miss
    ? 'h.NoSPKTujuan = @NoSPK AND ISNULL(h.NoSPK, \'\') <> @NoSPK AND h.DateUsage IS NULL'
    : 'h.NoSPK = @NoSPK AND h.DateUsage IS NULL';

  const legs = LABEL_LEGS.map((leg) => {
    const volume = leg.convertUnits
      ? 'ROUND(d.Tebal * d.Lebar * d.Panjang * d.JmlhBatang / 1000000000 ' +
        '* CASE WHEN h.IdUOMTblLebar = 3 THEN 645.16 ELSE 1 END ' +
        '* CASE WHEN h.IdUOMPanjang = 4 THEN 304.8 ELSE 1 END, 4, 1)'
      : 'ROUND(d.Tebal * d.Lebar * d.Panjang * d.JmlhBatang / 1000000000, 4, 1)';
    return `SELECT '${leg.kategori}' AS Kategori,
       COALESCE(NULLIF(LTRIM(RTRIM(j.Jenis)), ''), '-') AS Jenis,
       CAST(h.${leg.noColumn} AS varchar(50)) AS NoLabel,
       COALESCE(NULLIF(LTRIM(RTRIM(CAST(h.IdLokasi AS varchar(50)))), ''), '-') AS Lokasi,
       CAST(d.Tebal AS float) AS Tebal,
       CAST(d.Lebar AS float) AS Lebar,
       CAST(d.Panjang AS float) AS Panjang,
       ${volume} AS Total
  FROM dbo.${leg.headerTable} h
  INNER JOIN dbo.${leg.detailTable} d ON d.${leg.noColumn} = h.${leg.noColumn}
  LEFT JOIN dbo.MstJenisKayu j ON j.IdJenisKayu = h.IdJenisKayu
 WHERE ${condition}`;
  });

  return `${legs.join('\nUNION ALL\n')}\nORDER BY Kategori, Jenis, NoLabel, Tebal, Lebar, Panjang`;
}

export const produksiPerSpkReport: ReportDefinition<ProduksiPerSpkParams, ProduksiPerSpkData> = {
  type: 'produksi-per-spk',
  title: 'Laporan Produksi Per SPK',
  paramsSchema: produksiPerSpkParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const noSpk = params.noSpk;

    const procedure = await conn
      .request()
      .input('NoSPK', sql.VarChar(15), noSpk)
      .execute('SP_LapProduksiPerSPK');
    const rendemen = buildRendemenRows((procedure.recordset ?? []) as Array<Record<string, unknown>>);

    const headerResult = await conn
      .request()
      .input('NoSPK', sql.VarChar(15), noSpk)
      .query(
        `SELECT h.NoSPK, h.Tanggal, h.NoContract, h.Tujuan, h.Enable, b.Buyer
           FROM dbo.MstSPK_h h
           LEFT JOIN dbo.MstBuyer b ON b.IdBuyer = h.IdBuyer
          WHERE h.NoSPK = @NoSPK`,
      );
    const headerRow = (headerResult.recordset ?? [])[0] as Record<string, unknown> | undefined;
    const header: SpkHeader = headerRow
      ? {
          noSpk: toText(headerRow.NoSPK, noSpk),
          tanggal:
            headerRow.Tanggal instanceof Date
              ? formatTanggalId(headerRow.Tanggal.toISOString().slice(0, 10))
              : toText(headerRow.Tanggal),
          tujuan: toText(headerRow.Tujuan),
          buyer: toText(headerRow.Buyer),
          noContract: toText(headerRow.NoContract),
          status: Number(headerRow.Enable ?? 0) === 1 ? 'Aktif' : 'Nonaktif',
        }
      : { noSpk, tanggal: '', tujuan: '', buyer: '', noContract: '', status: '' };

    const dimensionResult = await conn
      .request()
      .input('NoSPK', sql.VarChar(15), noSpk)
      .query(
        `SELECT DISTINCT
            COALESCE(NULLIF(LTRIM(RTRIM(j.Jenis)), ''), '-') AS Jenis,
            CAST(d.Tebal AS float) AS Tebal,
            CAST(d.Lebar AS float) AS Lebar
           FROM dbo.MstSPK_d d
           LEFT JOIN dbo.MstJenisKayu j ON j.IdJenisKayu = d.IdJenisKayu
          WHERE d.NoSPK = @NoSPK
          ORDER BY Jenis, Tebal, Lebar`,
      );
    const dimensions: SpkDimension[] = (
      (dimensionResult.recordset ?? []) as Array<Record<string, unknown>>
    ).map((row) => ({
      jenis: toText(row.Jenis, '-'),
      tebal: toNumber(row.Tebal),
      lebar: toNumber(row.Lebar),
    }));

    const aliveResult = await conn
      .request()
      .input('NoSPK', sql.VarChar(15), noSpk)
      .query(buildLabelUnionSql(false));
    const missResult = await conn
      .request()
      .input('NoSPK', sql.VarChar(15), noSpk)
      .query(buildLabelUnionSql(true));

    return {
      header,
      dimensions,
      rendemen,
      rendemenGlobal: rendemen.find((r) => r.rendGlobal !== null)?.rendGlobal ?? null,
      aliveLabels: groupLabelRows((aliveResult.recordset ?? []) as Array<Record<string, unknown>>),
      missLabels: groupLabelRows((missResult.recordset ?? []) as Array<Record<string, unknown>>),
    };
  },

  render(data, meta: RenderMeta<ProduksiPerSpkParams>): RenderResult {
    // The two header tables sit side by side, 49% each with a 2% spacer, the
    // same split the Produksi Per Nomor Produksi reports use. Rendemen Global
    // belongs to the yield table, so it rides along in the right-hand pane
    // instead of spanning the page underneath both.
    const bodyHtml = `${renderMeta(data.header)}
  <div class="spk-top-grid">
    <table class="split-grid">
      <tr>
        <td class="left-pane">${renderDimensions(data.dimensions)}</td>
        <td class="gutter"></td>
        <td class="right-pane">${renderRendemen(data.rendemen, data.rendemenGlobal)}</td>
      </tr>
    </table>
  </div>
  ${renderLabelSections('Label yang masih hidup :', data.aliveLabels)}
  ${renderLabelSections('Label yang miss/salah prediksi', data.missLabels)}`;

    return renderWpsReportPage({
      title: 'Laporan Produksi Per SPK',
      bodyHtml,
      style: 'produksi_per_spk',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
