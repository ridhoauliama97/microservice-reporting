import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { renderWpsReportPage } from '../src/reports/wps/template'
import { buildKeluarMasukData } from '../src/reports/wps/kd-keluar-masuk'
import { buildCustomerGroups } from '../src/reports/wps/kd-upah-per-customer'
import { buildDetailData } from '../src/reports/wps/kd-upah-per-no-proc-kd-detail'
import { buildKetahananView } from '../src/reports/wps/ketahanan'
import { buildObatData } from '../src/reports/wps/pemakaian-obat-vacuum'
import { buildPerSupplierData } from '../src/reports/wps/pembelian-st-per-supplier'
import { buildTimelineData } from '../src/reports/wps/pembelian-st-timeline'
import { buildPenerimaanData } from '../src/reports/wps/penerimaan-st-sawmill-kg'
import { buildSawmillSheet } from '../src/reports/wps/lembar-upah-borongan-sawmill'

/**
 * What each report prints above its table, locked against
 * open-api-report's blades.
 *
 * This exists because four reports had grown a header line the legacy sheets do
 * not have - a receipt count appended to one subtitle, a process number and a
 * production number turned into subtitles that the reference leaves empty, and
 * a chamber filter glued onto a period string instead of standing on its own
 * line. Each was a small invented addition and none of the other tests noticed,
 * because nothing asserted the header at all.
 *
 * The expected values below were read off the blades in
 * resources/views/reports/sawn-timber/, not off this service's output.
 */

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }

type Meta = { requestedBy: string; generatedAt: Date; params: unknown }

/** Empty data in each report's own shape, so the empty state renders. */
const EMPTY: Record<string, unknown> = {
  'kd-keluar-masuk': buildKeluarMasukData([]),
  'kd-upah-per-customer': buildCustomerGroups([]),
  'kd-upah-per-no-proc-kd-detail': buildDetailData([], 'H.000771'),
  'ketahanan-barang-st': buildKetahananView([]),
  'label-st-hidup-detail': [],
  'lembar-perhitungan-upah-borongan-sawmill': buildSawmillSheet([]),
  'pemakaian-obat-vacuum': buildObatData([]),
  'pembelian-st-per-supplier-ton': buildPerSupplierData([]),
  'pembelian-st-timeline-ton': buildTimelineData([]),
  'penerimaan-st-sawmill-kg': buildPenerimaanData([]),
}

const render = (type: string, params: unknown): string =>
  (reports[type] as unknown as { render: (d: never, m: Meta) => { html: string } }).render(
    EMPTY[type] as never,
    { requestedBy: 'budi', generatedAt: new Date('2026-10-01T08:00:00Z'), params },
  ).html

/** The h1 and, if present, the line under it. */
const headerOf = (type: string, params: unknown = PERIOD): { title: string; subtitle: string } => {
  const html = render(type, params)
  return {
    title: /<h1 class="report-title"[^>]*>([^<]*)<\/h1>/.exec(html)?.[1] ?? '',
    subtitle: /<p class="report-subtitle">([^<]*)<\/p>/.exec(html)?.[1] ?? '',
  }
}

/**
 * Present/absent is asserted on the element, never on the class name alone:
 * every sheet carries the .report-subtitle and .report-meta rules in its
 * stylesheet whether or not it uses them.
 */
const hasSubtitle = (html: string): boolean => /<p class="report-subtitle">/.test(html)
const hasMetaLine = (html: string): boolean => /<p class="report-meta">/.test(html)

const SHORT_PERIOD = 'Periode 01-Agt-26 s/d 31-Agt-26'

describe('report headers match the reference blades', () => {
  test('Penerimaan ST: title plus period, and nothing else', () => {
    // The receipt count that used to be appended here ("| 12 Penerimaan") is a
    // figure this service derived, not one the legacy sheet prints.
    expect(headerOf('penerimaan-st-sawmill-kg')).toEqual({
      title: 'Laporan Penerimaan ST Dari Sawmill - Timbang KG',
      subtitle: SHORT_PERIOD,
    })
  })

  test('KD Upah Per-No.Proses: the reference prints no subtitle at all', () => {
    // The process number belongs in the header block, once.
    expect(headerOf('kd-upah-per-no-proc-kd-detail', { noProcKd: 'H.000771' })).toEqual({
      title: 'Laporan KD Upah Per-No.Proses KD Per-Cutomer Detail',
      subtitle: '',
    })
  })

  test('Upah Borongan Sawmill: the reference prints no subtitle at all', () => {
    // The production number is already the "Nomor Lembaran" field below.
    expect(headerOf('lembar-perhitungan-upah-borongan-sawmill', { noProduksi: 'D.040749' })).toEqual({
      title: 'Lembaran Perhitungan Upah Borongan Sawmill',
      subtitle: '',
    })
  })

  test('KD Upah Per-Customer and Label ST (Hidup): title only, no period', () => {
    // Both procedures take no parameters, so there is no period to state.
    expect(headerOf('kd-upah-per-customer', {})).toEqual({
      title: 'Laporan KD Upah Per-Customer',
      subtitle: '',
    })
    expect(headerOf('label-st-hidup-detail', {})).toEqual({
      title: 'Laporan Label ST (Hidup) Detail',
      subtitle: '',
    })
  })

  test('the seven period reports: title plus the period, verbatim', () => {
    for (const [type, title] of [
      ['kd-keluar-masuk', 'Laporan KD (Keluar - Masuk)'],
      ['ketahanan-barang-st', 'Laporan Ketahanan Barang Dagang ST'],
      ['pemakaian-obat-vacuum', 'Laporan Pemakaian Obat Vacuum'],
      ['pembelian-st-per-supplier-ton', 'Laporan Pembelian ST Per Supplier (Ton)'],
      ['pembelian-st-timeline-ton', 'Laporan Pembelian ST Timeline (Ton)'],
    ] as const) {
      expect(headerOf(type)).toEqual({ title, subtitle: SHORT_PERIOD })
    }
  })
})

describe('the chamber filter stands on its own line', () => {
  test('it is absent when the report was not filtered', () => {
    const html = render('kd-keluar-masuk', PERIOD)
    expect(hasMetaLine(html)).toBe(false)
    expect(hasSubtitle(html)).toBe(true)
  })

  test('it is its own line, not appended to the period', () => {
    const html = render('kd-keluar-masuk', { ...PERIOD, noRuangKd: 3 })
    // The period line is exactly the period - no " | Filter No KD" on the end.
    expect(/<p class="report-subtitle">([^<]*)<\/p>/.exec(html)?.[1]).toBe(SHORT_PERIOD)
    expect(hasMetaLine(html)).toBe(true)
    expect(html).toContain('<p class="report-meta">Filter No KD : <strong>3</strong></p>')
  })
})

describe('a report with no subtitle gets the title gap instead', () => {
  test('the shell still renders and the title is present', () => {
    // Guards the shell path: subtitle omitted entirely, not an empty string.
    const html = renderWpsReportPage({
      title: 'X',
      bodyHtml: '<table></table>',
    }).html
    expect(html).toContain('>X</h1>')
    expect(hasSubtitle(html)).toBe(false)
  })
})
