import { describe, expect, test } from 'bun:test'
import { normalizeHidupRows } from '../src/reports/wps/hidup-detail'
import { buildKetahananView } from '../src/reports/wps/ketahanan'

const CCA = { numberColumn: 'NoCCAkhir', volumeColumn: 'Kubik' }
const FJ = { numberColumn: 'NoFJ', volumeColumn: 'M3' }

describe('normalizeHidupRows', () => {
  const raw = [
    {
      NoCCAkhir: 'V.015988',
      NoFJ: 'F.000001',
      DateCreate: '2026-09-21T00:00:00.000Z',
      NoSPK: '2026-50',
      Jenis: 'RAMBUNG',
      NamaGrade: 'FJLB C/C',
      Tebal: 36,
      Lebar: 82,
      Panjang: 405,
      JmlhBatang: 4,
      Kubik: 0.0047,
      M3: 0.0047,
      IdLokasi: null,
    },
  ]

  test('reads the item number and volume from the configured columns', () => {
    expect(normalizeHidupRows(raw, CCA)[0]!.no).toBe('V.015988')
    expect(normalizeHidupRows(raw, FJ)[0]!.no).toBe('F.000001')
  })

  test('aliases DateCreate -> tanggal and IdLokasi -> lokasi', () => {
    const row = normalizeHidupRows(raw, FJ)[0]!
    expect(row.tanggal).toBe('2026-09-21T00:00:00.000Z')
    expect(row.lokasi).toBeNull()
  })

  test('renders "Jenis - NamaGrade" like the legacy jenisDisplay', () => {
    expect(normalizeHidupRows(raw, FJ)[0]!.jenis).toBe('RAMBUNG - FJLB C/C')
  })

  test('falls back to the grade alone when Jenis is blank', () => {
    const rows = normalizeHidupRows([{ ...raw[0], Jenis: null }], FJ)
    expect(rows[0]!.jenis).toBe('FJLB C/C')
  })

  test('leaves jenis null when both Jenis and NamaGrade are blank', () => {
    const rows = normalizeHidupRows([{ ...raw[0], Jenis: null, NamaGrade: null }], FJ)
    expect(rows[0]!.jenis).toBeNull()
  })
})

describe('buildKetahananView', () => {
  test('maps Stockm3 -> Stock and m3 -> Penjualan', () => {
    const [row] = buildKetahananView([{ Jenis: 'JABON', Stockm3: 10, m3: 4 }])
    expect(row).toEqual({ Jenis: 'JABON', Stock: 10, Penjualan: 4, AvgPenjualan: 4, Ketahanan: 2.5 })
  })

  test('falls back to Penjualan when AvgPenjualan is absent', () => {
    const [row] = buildKetahananView([{ Jenis: 'JABON', Stockm3: 10, m3: 4, AvgPenjualan: null }])
    expect(row!.AvgPenjualan).toBe(4)
  })

  test('derives Ketahanan as Stock / Avg Penjualan when the SP omits it', () => {
    const [row] = buildKetahananView([{ Jenis: 'JABON', Stockm3: 10, m3: 4, Ketahanan: null }])
    expect(row!.Ketahanan).toBe(2.5)
  })

  test('reports Ketahanan 0 rather than dividing by zero', () => {
    const [row] = buildKetahananView([{ Jenis: 'JABON', Stockm3: 10, m3: 0 }])
    expect(row!.Ketahanan).toBe(0)
  })

  test('prefers the Ketahanan value supplied by the SP', () => {
    const [row] = buildKetahananView([
      { Jenis: 'JABON', Stockm3: 10, m3: 4, AvgPenjualan: 2, Ketahanan: 7 },
    ])
    expect(row!.Ketahanan).toBe(7)
  })
})
