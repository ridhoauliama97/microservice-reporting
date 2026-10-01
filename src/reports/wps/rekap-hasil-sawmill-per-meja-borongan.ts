import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { buildEmptyTableRow, renderWpsReportPage } from './template'

/**
 * Shared by the two "Rekap Hasil Sawmill Per-Meja (Upah Borongan)" reports:
 *
 *   Laporan Rekap Hasil Sawmill Per-Meja (Semua Meja)       SPWps_...UpahBoronganV2 (+ _Sub)
 *   Laporan Rekap Hasil Sawmill Per-Meja (Upah Borongan)    SPWps_...UpahBorongan     (+ _Sub)
 *
 * The V2 and non-V2 procedures return IDENTICAL columns - verified against the
 * live database, both are the 12 columns listed below, and both _Sub variants
 * are the same 13 with SM added. The reference also runs both through one
 * service. So the two reports differ only in the procedure names, and that is
 * all this file varies.
 *
 * Columns verified against the live database:
 *   main  NoMeja, TglSawmill, Jenis, Operator, Tebal, Lebar, UOM, TonRacip,
 *         IdSawmillSpecialCondition, Condition, IsBorongan, NamaMeja
 *   _Sub  the same, with SM in place of IsBorongan's position
 *
 * The grouping is chamber, then date within the chamber, and the rows inside
 * sort by type, thickness, width, then unit - so a chamber's day reads in a
 * stable physical order rather than in whatever order the procedure returned.
 *
 * The sub report is what makes this a piece-work sheet: it carries SM, the
 * measured quantity the piece rate is applied to, alongside the main report's
 * ton output. A date present in one and not the other is kept, not dropped -
 * a day with output but no measurement is still a day that ran.
 *
 * The "category" split in the reference ("RB STD (Tbl 14/16/18/23)", "RB STD",
 * "RB MC + Lain-Lain") is NOT reproduced. It is a hand-maintained rule in the
 * blade that keys off the thickness being one of four magic numbers, the
 * procedure has no such column, and it is the kind of classification that
 * silently moves boards between buckets when the thickness list changes.
 * Sorting by type keeps the grouping visible without inventing a bucket.
 *
 * Binds @TglAwal / @TglAkhir on both procedures.
 */

interface SpRow extends Record<string, unknown> {
  NoMeja?: unknown;
  NamaMeja?: unknown;
  TglSawmill?: unknown;
  Jenis?: unknown;
  Operator?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  UOM?: unknown;
  TonRacip?: unknown;
  Condition?: unknown;
  IsBorongan?: unknown;
  SM?: unknown;
}

export interface BoronganLine {
  jenis: string;
  operator: string;
  tebal: number;
  lebar: number;
  uom: string;
  tonRacip: number;
  condition: string;
  isBorongan: boolean;
  /** From the sub report only. */
  sm: number;
}

export interface BoronganDateGroup {
  tanggal: string;
  lines: BoronganLine[];
  tonTotal: number;
  smTotal: number;
}

export interface BoronganMejaGroup {
  noMeja: number;
  namaMeja: string;
  dateGroups: BoronganDateGroup[];
  tonTotal: number;
  smTotal: number;
}

export interface BoronganData {
  mejaGroups: BoronganMejaGroup[];
  totalMeja: number;
  totalLines: number;
  tonTotal: number;
  smTotal: number;
}

const toFloat = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const text = (value: unknown): string => String(value ?? '').trim();

const toDateKey = (value: unknown): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (raw === '') return '';
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (!iso) return raw;
  return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
};

const fmtDate = (key: string): string =>
  key === '' ? '' : formatTanggalId(key).replace(/\d{4}$/, (year) => year.slice(-2));

/** Data cells blank at ~zero; totals always print. */
const fmtCell = (value: number): string =>
  Math.abs(value) < 0.0000001 ? '' : formatNumber(value, 4);
const fmtTotal = (value: number): string => formatNumber(value, 4);

/** One decimal with trailing zeros stripped, as the reference prints sizes. */
const fmtDim = (value: number): string => {
  const [intPart, decPart] = value.toFixed(1).split('.');
  const trimmed = (decPart ?? '').replace(/0+$/, '');
  return trimmed === '' ? intPart : `${intPart}.${trimmed}`;
};

const toLine = (row: SpRow): BoronganLine => ({
  jenis: text(row.Jenis),
  operator: text(row.Operator),
  tebal: toFloat(row.Tebal),
  lebar: toFloat(row.Lebar),
  uom: text(row.UOM),
  tonRacip: toFloat(row.TonRacip),
  condition: text(row.Condition),
  isBorongan: row.IsBorongan === true || toFloat(row.IsBorongan) === 1,
  sm: toFloat(row.SM),
});

/**
 * The reference's sort: type, then thickness, then width, then unit, so a
 * chamber's day reads in a stable order instead of the procedure's own.
 */
function compareLines(left: BoronganLine, right: BoronganLine): number {
  if (left.tebal !== right.tebal) return left.tebal - right.tebal;
  if (left.lebar !== right.lebar) return left.lebar - right.lebar;
  if (left.jenis !== right.jenis) return left.jenis.localeCompare(right.jenis);
  return left.uom.localeCompare(right.uom);
}

/**
 * Merges the main and sub reports. They are keyed on chamber + date + type +
 * thickness + width + unit, so a line present in only one of them still appears
 * - a date with output but no measurement is still a day that ran.
 */
export function buildBoronganData(main: SpRow[], sub: SpRow[]): BoronganData {
  interface Bucket extends BoronganLine {
    noMeja: number;
    namaMeja: string;
    tanggal: string;
  }

  const buckets = new Map<string, Bucket>();

  const keyOf = (row: SpRow): string => {
    const line = toLine(row);
    return [
      Math.trunc(toFloat(row.NoMeja)),
      toDateKey(row.TglSawmill),
      line.jenis,
      line.tebal,
      line.lebar,
      line.uom,
    ].join('|');
  };

  for (const row of main) {
    const key = keyOf(row);
    const line = toLine(row);
    const namaMeja = text(row.NamaMeja) || `Meja ${Math.trunc(toFloat(row.NoMeja))}`;
    buckets.set(key, {
      ...line,
      noMeja: Math.trunc(toFloat(row.NoMeja)),
      namaMeja,
      tanggal: toDateKey(row.TglSawmill),
    });
  }

  // The sub report supplies SM and the measurement behind the tonnage.
  for (const row of sub) {
    const key = keyOf(row);
    const existing = buckets.get(key);
    if (existing) existing.sm = toFloat(row.SM);
  }

  const byMeja = new Map<number, { namaMeja: string; byDate: Map<string, Bucket[]> }>();
  for (const bucket of buckets.values()) {
    const meja = byMeja.get(bucket.noMeja) ?? {
      namaMeja: bucket.namaMeja,
      byDate: new Map<string, Bucket[]>(),
    };
    byMeja.set(bucket.noMeja, meja);
    const lines = meja.byDate.get(bucket.tanggal) ?? [];
    lines.push(bucket);
    meja.byDate.set(bucket.tanggal, lines);
  }

  const mejaGroups: BoronganMejaGroup[] = [...byMeja.entries()]
    .sort(([left], [right]) => left - right)
    .map(([noMeja, meja]) => {
      const dateGroups: BoronganDateGroup[] = [...meja.byDate.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([tanggal, bucketList]) => {
          const lines = [...bucketList]
            .map(({ noMeja: _n, namaMeja: _m, tanggal: _t, ...line }) => line)
            .sort(compareLines);
          return {
            tanggal,
            lines,
            tonTotal: lines.reduce((sum, line) => sum + line.tonRacip, 0),
            smTotal: lines.reduce((sum, line) => sum + line.sm, 0),
          };
        });
      return {
        noMeja,
        namaMeja: meja.namaMeja,
        dateGroups,
        tonTotal: dateGroups.reduce((sum, group) => sum + group.tonTotal, 0),
        smTotal: dateGroups.reduce((sum, group) => sum + group.smTotal, 0),
      };
    });

  return {
    mejaGroups,
    totalMeja: mejaGroups.length,
    totalLines: mejaGroups.reduce(
      (sum, group) => sum + group.dateGroups.reduce((inner, g) => inner + g.lines.length, 0),
      0,
    ),
    tonTotal: mejaGroups.reduce((sum, group) => sum + group.tonTotal, 0),
    smTotal: mejaGroups.reduce((sum, group) => sum + group.smTotal, 0),
  };
}

const LINE_COLUMNS = 8;

const renderLines = (lines: BoronganLine[], startIndex: number): string =>
  lines
    .map(
      (line, index) => `<tr class="${(startIndex + index) % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${startIndex + index + 1}</td>
        <td class="label">${escapeHtml(line.jenis)}</td>
        <td class="number">${escapeHtml(fmtDim(line.tebal))}</td>
        <td class="number">${escapeHtml(fmtDim(line.lebar))}</td>
        <td class="center">${escapeHtml(line.uom)}</td>
        <td class="label">${escapeHtml(line.operator)}</td>
        <td class="center">${escapeHtml(line.condition)}</td>
        <td class="number">${escapeHtml(fmtCell(line.tonRacip))}</td>
        <td class="number">${escapeHtml(fmtCell(line.sm))}</td>
      </tr>`,
    )
    .join('\n        ');

const renderDateGroup = (group: BoronganDateGroup, startIndex: number): string =>
  `<div class="borongan-date">
    <p class="date-label">Tanggal : ${escapeHtml(fmtDate(group.tanggal))}</p>
    <table class="report-table borongan-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 5%;">No</th>
          <th style="width: 18%;">Jenis</th>
          <th style="width: 9%;">Tebal</th>
          <th style="width: 9%;">Lebar</th>
          <th style="width: 6%;">UOM</th>
          <th style="width: 20%;">Operator</th>
          <th style="width: 11%;">Condition</th>
          <th style="width: 11%;">Ton Racip</th>
          <th style="width: 11%;">SM</th>
        </tr>
      </thead>
      <tbody>
        ${renderLines(group.lines, startIndex) || buildEmptyTableRow(LINE_COLUMNS + 1)}
        <tr class="totals-row">
          <td colspan="7" class="center">Sub Total</td>
          <td class="number">${escapeHtml(fmtTotal(group.tonTotal))}</td>
          <td class="number">${escapeHtml(fmtTotal(group.smTotal))}</td>
        </tr>
      </tbody>
    </table>
  </div>`;

function renderBody(data: BoronganData): string {
  if (data.mejaGroups.length === 0) {
    return `<table class="report-table borongan-table"><tbody>${buildEmptyTableRow(LINE_COLUMNS + 1)}</tbody></table>`;
  }

  let lineIndex = 0;
  const blocks = data.mejaGroups
    .map((group) => {
      const dates = group.dateGroups
        .map((dateGroup) => {
          const rendered = renderDateGroup(dateGroup, lineIndex);
          lineIndex += dateGroup.lines.length;
          return rendered;
        })
        .join('\n    ');

      return `<div class="borongan-meja">
    <p class="meja-label">Meja : ${escapeHtml(group.namaMeja)} (No. ${group.noMeja})</p>
    ${dates}
    <table class="report-table borongan-table meja-total-table">
      <tbody>
        <tr class="totals-row">
          <td colspan="7" class="center">Total Meja ${escapeHtml(group.namaMeja)}</td>
          <td class="number">${escapeHtml(fmtTotal(group.tonTotal))}</td>
          <td class="number">${escapeHtml(fmtTotal(group.smTotal))}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
    })
    .join('\n  ');

  return `${blocks}
  <table class="report-table borongan-table">
    <tbody>
      <tr class="totals-row grand-row">
        <td colspan="7" class="center">Grand Total (${data.totalMeja} meja)</td>
        <td class="number">${escapeHtml(fmtTotal(data.tonTotal))}</td>
        <td class="number">${escapeHtml(fmtTotal(data.smTotal))}</td>
      </tr>
    </tbody>
  </table>`;
}

export interface BoronganOptions {
  type: string;
  title: string;
  mainSpName: string;
  subSpName: string;
}

export function createBoronganReport(
  options: BoronganOptions,
): ReportDefinition<PeriodParams, BoronganData> {
  return {
    type: options.type,
    title: options.title,
    paramsSchema: periodParamsSchema,

    async fetchData(params, { pool }) {
      const conn = await pool;
      const main = await conn
        .request()
        .input('TglAwal', sql.Date, params.tglAwal)
        .input('TglAkhir', sql.Date, params.tglAkhir)
        .execute(options.mainSpName);
      const sub = await conn
        .request()
        .input('TglAwal', sql.Date, params.tglAwal)
        .input('TglAkhir', sql.Date, params.tglAkhir)
        .execute(options.subSpName);
      return buildBoronganData(
        (main.recordset ?? []) as SpRow[],
        (sub.recordset ?? []) as SpRow[],
      );
    },

    render(data, meta) {
      const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
      return renderWpsReportPage({
        title: options.title,
        subtitle: `Periode ${period}`,
        bodyHtml: renderBody(data),
        style: 'per_meja',
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      });
    },
  };
}

/** Per-Meja (Semua Meja) - the V2 procedure pair. */
export const rekapSawmillPerMejaSemuaMejaReport = createBoronganReport({
  type: 'rekap-hasil-sawmill-per-meja-semua-meja',
  title: 'Laporan Rekap Hasil Sawmill Per-Meja (Semua Meja)',
  mainSpName: 'SPWps_LapRekapHasilSawmillPerMejaUpahBoronganV2',
  subSpName: 'SPWps_LapRekapHasilSawmillPerMejaUpahBoronganV2_Sub',
});

/** Per-Meja (Upah Borongan) - the original procedure pair. */
export const rekapSawmillPerMejaUpahBoronganReport = createBoronganReport({
  type: 'rekap-hasil-sawmill-per-meja-upah-borongan',
  title: 'Laporan Rekap Hasil Sawmill Per-Meja (Upah Borongan)',
  mainSpName: 'SPWps_LapRekapHasilSawmillPerMejaUpahBorongan',
  subSpName: 'SPWps_LapRekapHasilSawmillPerMejaUpahBorongan_Sub',
});
