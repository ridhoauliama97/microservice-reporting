import sql from 'mssql'
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from '../../templates/html'
import { periodParamsSchema, type PeriodParams } from '../period-params'
import type { ReportDefinition } from '../types'
import { renderWpsReportPage } from './template'

/**
 * SP_LapRekapKamarKD + SP_LapRekapKamarKD_Sub1 + SP_LapRekapKamarKD_Sub2 —
 * "Laporan Rekap Kamar KD". Ported from open-api-report's
 * RekapKamarKdReportService and reports/sawn-timber/rekap-kamar-kd-pdf.blade.php.
 *
 * Three procedures, because the main one alone cannot answer the question. The
 * report is per drying chamber, and each chamber is broken down by wood type:
 *
 *   SP_LapRekapKamarKD       the lots themselves - chamber, dates, days, type,
 *                            thickness, width, tonnage, average thickness and
 *                            length. This is the right-hand table.
 *   SP_LapRekapKamarKD_Sub1  per chamber and type, one row per thickness, with
 *                            BOTH tonnage and volume. This is the left-hand
 *                            table, and it is also where the cubic metres come
 *                            from - the main procedure has no volume column.
 *   SP_LapRekapKamarKD_Sub2  the chamber's types as a single "--" separated
 *                            string, which is the ORDER they must be printed in.
 *
 * Columns verified against the live database.
 *
 * Two things make this report less obvious than it looks:
 *
 *   - The volume of each individual lot is ESTIMATED, not measured. The volume
 *     is only available per thickness from Sub1, so the report derives a factor
 *     (m3 / Ton) per chamber, type and thickness, then applies it to each lot.
 *     Where a thickness has no Sub1 row the factor falls back to the chamber and
 *     type average, and failing that to zero - so a lot can print 0.0000 m3
 *     while the chamber total is not short, and that is a data gap rather than
 *     an arithmetic error. The "% Capacity" column is derived from that estimate
 *     too, so it inherits the gap.
 *
 *   - There are TWO different capacity percentages and they do not agree, on
 *     purpose. "Jumlah (% Capacity)" is the sum of each type's percentage after
 *     it has been rounded to two decimals, which is what the legacy printout
 *     does and so what the number on the sheet is expected to be. "Ave Capacity
 *     KD" is the chamber's total volume over the capacity in one calculation.
 *     Averaging the two together, or swapping them, changes what the sheet says.
 *
 * CAPACITY_M3 is 80: a chamber's nominal capacity in cubic metres, from the
 * reference. It is not in any procedure.
 *
 * Binds @StartDate / @EndDate on all three.
 */

const EPS = 0.0000001;
const CAPACITY_M3 = 80;

interface MainRow extends Record<string, unknown> {
  NoRuangKD?: unknown;
  TglMasuk?: unknown;
  TglKeluar?: unknown;
  Hari?: unknown;
  Jenis?: unknown;
  Tebal?: unknown;
  Lebar?: unknown;
  Ton?: unknown;
  AveTebal?: unknown;
  AvePanjang?: unknown;
}

interface Sub1Row extends Record<string, unknown> {
  NoRuangKD?: unknown;
  Jenis?: unknown;
  Tebal?: unknown;
  Ton?: unknown;
  m3?: unknown;
}

interface Sub2Row extends Record<string, unknown> {
  NoRuangKD?: unknown;
  Jenis?: unknown;
}

export interface LotLine {
  tebal: number;
  lebar: number;
  ton: number;
  aveTebal: number;
  avePanjang: number;
  /** Estimated from the thickness factor; 0 when there is no factor to use. */
  m3Est: number;
  pctCapacity: number;
}

export interface TebalSummaryLine {
  tebal: number;
  ton: number;
  m3: number;
}

export interface JenisGroup {
  /** Reference letters the types A., B., C. within a chamber. */
  label: string;
  jenis: string;
  summaryRows: TebalSummaryLine[];
  detailRows: LotLine[];
  tonTotal: number;
  pctCapacity: number;
}

export interface RoomGroup {
  noRuangKd: number;
  hari: number;
  jenisConcat: string;
  jenisGroups: JenisGroup[];
  jumlahTon: number;
  /** Sum of the per-type percentages, each already rounded to 2 decimals. */
  jumlahPctCapacity: number;
  /** Total volume over capacity, in one calculation. */
  avePctCapacity: number;
}

export interface RekapKamarKdData {
  rooms: RoomGroup[];
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

/** Thickness is keyed to 4 decimals so float noise cannot fork the lookup. */
const floatKey = (value: unknown): string => toFloat(value).toFixed(4);

/** Dimensions print as whole numbers where they are whole. */
const fmtDim = (value: number): string => {
  if (Math.abs(value) < EPS) return '';
  const isInt = Math.abs(value - Math.round(value)) < EPS;
  return isInt ? String(Math.round(value)) : value.toFixed(1);
};

const fmtTon = (value: number): string =>
  Math.abs(value) < EPS ? '' : formatNumber(value, 4);

const fmtPercent = (value: number): string =>
  Math.abs(value) < EPS ? '' : formatNumber(value, 2);

/** A day count of zero is blank, not "0". */
const fmtInt = (value: number): string => (value <= 0 ? '' : String(Math.round(value)));

const pctOf = (m3: number): number => (CAPACITY_M3 > 0 ? (m3 / CAPACITY_M3) * 100 : 0);

export function buildRekapKamarKdData(
  main: MainRow[],
  sub1: Sub1Row[],
  sub2: Sub2Row[],
): RekapKamarKdData {
  // Sub2: the print order of the types within each chamber.
  const orderByKd = new Map<number, { raw: string; order: string[] }>();
  for (const row of sub2) {
    const kd = Math.trunc(toFloat(row.NoRuangKD));
    const raw = text(row.Jenis);
    if (kd <= 0 || raw === '') continue;
    const order = raw
      .split(/\s*--\s*/)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    orderByKd.set(kd, { raw, order });
  }

  // Chamber -> type -> lots, and the same for the Sub1 thickness summaries.
  const mainByKd = new Map<number, Map<string, MainRow[]>>();
  const sub1ByKd = new Map<number, Map<string, Sub1Row[]>>();
  const jenisByKd = new Map<number, Set<string>>();

  const bucket = <T,>(map: Map<number, Map<string, T[]>>, kd: number, jenis: string, row: T) => {
    const jenisMap = map.get(kd) ?? new Map<string, T[]>();
    const list = jenisMap.get(jenis) ?? [];
    list.push(row);
    jenisMap.set(jenis, list);
    map.set(kd, jenisMap);
  };

  for (const row of main) {
    const kd = Math.trunc(toFloat(row.NoRuangKD));
    const jenis = text(row.Jenis);
    if (kd <= 0 || jenis === '') continue;
    bucket(mainByKd, kd, jenis, row);
    const set = jenisByKd.get(kd) ?? new Set<string>();
    set.add(jenis);
    jenisByKd.set(kd, set);
  }
  for (const row of sub1) {
    const kd = Math.trunc(toFloat(row.NoRuangKD));
    const jenis = text(row.Jenis);
    if (kd <= 0 || jenis === '') continue;
    bucket(sub1ByKd, kd, jenis, row);
    const set = jenisByKd.get(kd) ?? new Set<string>();
    set.add(jenis);
    jenisByKd.set(kd, set);
  }

  const kds = [...jenisByKd.keys()].sort((a, b) => a - b);

  const rooms: RoomGroup[] = kds.map((kd) => {
    // The chamber's days is the longest any of its lots spent, not a sum.
    const hari = main
      .filter((row) => Math.trunc(toFloat(row.NoRuangKD)) === kd)
      .reduce((max, row) => Math.max(max, Math.trunc(toFloat(row.Hari))), 0);

    const order = orderByKd.get(kd)?.order ?? [];
    const position = new Map(order.map((jenis, index) => [jenis, index]));
    const jenisKeys = [...(jenisByKd.get(kd) ?? new Set<string>())].sort((a, b) => {
      const pa = position.get(a) ?? Number.MAX_SAFE_INTEGER;
      const pb = position.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    let jumlahTon = 0;
    let jumlahM3 = 0;
    let sumPctRounded = 0;

    const jenisGroups: JenisGroup[] = jenisKeys.map((jenis, index) => {
      const summarySource = [...(sub1ByKd.get(kd)?.get(jenis) ?? [])].sort(
        (a, b) => toFloat(a.Tebal) - toFloat(b.Tebal),
      );
      const detailSource = [...(mainByKd.get(kd)?.get(jenis) ?? [])].sort(
        (a, b) =>
          toFloat(a.Tebal) - toFloat(b.Tebal) ||
          toFloat(a.Lebar) - toFloat(b.Lebar) ||
          toFloat(b.Ton) - toFloat(a.Ton),
      );

      const summaryRows: TebalSummaryLine[] = summarySource.map((row) => ({
        tebal: toFloat(row.Tebal),
        ton: toFloat(row.Ton),
        m3: toFloat(row.m3),
      }));
      const tonTotal = detailSource.reduce((sum, row) => sum + toFloat(row.Ton), 0);
      const m3Total = summaryRows.reduce((sum, row) => sum + row.m3, 0);
      // The legacy sheet rounds each type's percentage to 2 decimals and then
      // adds them up. The average at the room level does not.
      const pctTotal = Math.round(pctOf(m3Total) * 100) / 100;
      sumPctRounded += pctTotal;
      jumlahTon += tonTotal;
      jumlahM3 += m3Total;

      // m3 per ton for this chamber, type and thickness.
      const factorByTebal = new Map<string, number>();
      for (const row of summarySource) {
        const ton = toFloat(row.Ton);
        if (Math.abs(ton) > EPS) {
          factorByTebal.set(floatKey(row.Tebal), toFloat(row.m3) / ton);
        }
      }

      const detailRows: LotLine[] = detailSource.map((row) => {
        const ton = toFloat(row.Ton);
        const key = floatKey(row.Tebal);
        const factor = factorByTebal.get(key) ?? 0;
        const m3Est = ton * factor;
        return {
          tebal: toFloat(row.Tebal),
          lebar: toFloat(row.Lebar),
          ton,
          aveTebal: toFloat(row.AveTebal),
          avePanjang: toFloat(row.AvePanjang),
          m3Est,
          pctCapacity: pctOf(m3Est),
        };
      });

      return {
        // The reference letters the types within a chamber.
        label: `${String.fromCharCode(65 + index)}.`,
        jenis,
        summaryRows,
        detailRows,
        tonTotal,
        pctCapacity: pctTotal,
      };
    });

    return {
      noRuangKd: kd,
      hari,
      jenisConcat: orderByKd.get(kd)?.raw ?? '',
      jenisGroups,
      jumlahTon,
      jumlahPctCapacity: sumPctRounded,
      avePctCapacity: pctOf(jumlahM3),
    };
  });

  return { rooms };
}

const renderSummaryTable = (group: JenisGroup): string => {
  const body = group.summaryRows
    .map(
      (row, index) => `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${escapeHtml(fmtDim(row.tebal))}</td>
        <td class="number">${escapeHtml(fmtTon(row.ton))}</td>
        <td class="number">${escapeHtml(fmtTon(row.m3))}</td>
      </tr>`,
    )
    .join('\n              ');

  return `<table class="report-table kamar-kd-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 34%;">Tebal</th>
          <th style="width: 33%;">Ton</th>
          <th style="width: 33%;">m3</th>
        </tr>
      </thead>
      <tbody>
        ${body || '<tr><td colspan="3" class="empty-cell">Tidak ada data</td></tr>'}
      </tbody>
    </table>`;
};

const renderDetailTable = (group: JenisGroup): string => {
  const body = group.detailRows
    .map(
      (row, index) => `<tr class="${index % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="center">${escapeHtml(fmtDim(row.tebal))}</td>
        <td class="center">${escapeHtml(fmtDim(row.lebar))}</td>
        <td class="number">${escapeHtml(fmtTon(row.ton))}</td>
        <td class="center">${escapeHtml(fmtDim(row.aveTebal))}</td>
        <td class="center">${escapeHtml(fmtDim(row.avePanjang))}</td>
        <td class="number">${escapeHtml(fmtPercent(row.pctCapacity))}</td>
      </tr>`,
    )
    .join('\n              ');

  return `<table class="report-table kamar-kd-table">
      <thead>
        <tr class="headers-row">
          <th style="width: 12%;">Tebal</th>
          <th style="width: 12%;">Lebar</th>
          <th style="width: 20%;">Ton</th>
          <th style="width: 18%;">Ave (Tebal)</th>
          <th style="width: 18%;">Ave (Panjang)</th>
          <th style="width: 20%;">% Capacity</th>
        </tr>
      </thead>
      <tbody>
        ${body || '<tr><td colspan="6" class="empty-cell">Tidak ada data</td></tr>'}
      </tbody>
    </table>
    <table class="meta-table kamar-kd-meta">
      <tbody>
        <tr>
          <td class="label">Jumlah (Ton)</td>
          <td class="sep">:</td>
          <td class="value">${escapeHtml(fmtTon(group.tonTotal))}</td>
        </tr>
        <tr>
          <td class="label">Jumlah (% Capacity)</td>
          <td class="sep">:</td>
          <td class="value">${escapeHtml(fmtPercent(group.pctCapacity))}</td>
        </tr>
      </tbody>
    </table>`;
};

const metaCell = (label: string, value: string): string =>
  `<td><span class="label">${escapeHtml(label)}</span><span class="sep">:</span><span class="value">${escapeHtml(value)}</span></td>`;

const renderRoom = (room: RoomGroup): string => {
  const blocks = room.jenisGroups
    .map(
      (group) => `<div class="kamar-kd-jenis">
    <p class="jenis-label">${escapeHtml(group.label)} ${escapeHtml(group.jenis)}</p>
    <div class="kamar-kd-pair">
      <div class="kamar-kd-half">${renderSummaryTable(group)}</div>
      <div class="kamar-kd-half">${renderDetailTable(group)}</div>
    </div>
  </div>`,
    )
    .join('\n  ');

  return `<div class="kamar-kd-room">
    <p class="room-label">No. KD : ${room.noRuangKd}${room.jenisConcat ? ` — ${escapeHtml(room.jenisConcat)}` : ''}</p>
  ${blocks}
    <table class="room-footer-table">
      <tbody>
        <tr>
          ${metaCell('Jumlah Hari', fmtInt(room.hari))}
          ${metaCell('Jumlah (Ton)', fmtTon(room.jumlahTon))}
          ${metaCell('Jumlah (% Capacity)', fmtPercent(room.jumlahPctCapacity))}
        </tr>
        <tr>
          ${metaCell('Ave Hari', fmtInt(room.hari))}
          ${metaCell(`Total KD ${room.noRuangKd}`, fmtTon(room.jumlahTon))}
          ${metaCell(`Ave Capacity KD ${room.noRuangKd}`, fmtPercent(room.avePctCapacity))}
        </tr>
      </tbody>
    </table>
  </div>`;
};

function renderBody(data: RekapKamarKdData): string {
  if (data.rooms.length === 0) {
    return `<table class="report-table kamar-kd-table"><tbody><tr><td class="empty-cell">Tidak ada data</td></tr></tbody></table>`;
  }
  return data.rooms.map(renderRoom).join('\n  ');
}

export const rekapKamarKdReport: ReportDefinition<PeriodParams, RekapKamarKdData> = {
  type: 'rekap-kamar-kd',
  title: 'Laporan Rekap Kamar KD',
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const run = (spName: string) =>
      conn
        .request()
        .input('StartDate', sql.Date, params.tglAwal)
        .input('EndDate', sql.Date, params.tglAkhir)
        .execute(spName);

    const [main, sub1, sub2] = await Promise.all([
      run('SP_LapRekapKamarKD'),
      run('SP_LapRekapKamarKD_Sub1'),
      run('SP_LapRekapKamarKD_Sub2'),
    ]);

    return buildRekapKamarKdData(
      (main.recordset ?? []) as MainRow[],
      (sub1.recordset ?? []) as Sub1Row[],
      (sub2.recordset ?? []) as Sub2Row[],
    );
  },

  render(data, meta) {
    const period = `${formatTanggalId(meta.params.tglAwal).replace(/\d{4}$/, (y) => y.slice(-2))} s/d ${formatTanggalId(meta.params.tglAkhir).replace(/\d{4}$/, (y) => y.slice(-2))}`;
    return renderWpsReportPage({
      title: 'Laporan Rekap Kamar KD',
      subtitle: `Periode ${period}`,
      bodyHtml: renderBody(data),
      style: 'kamar_kd',
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
