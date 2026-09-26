import { describe, expect, test } from 'bun:test'
import { mainValues, type MutasiRow } from '../src/reports/wps/mutasi-laminating'
import {
  computeLaminatingTotals,
  groupLaminatingByMachine,
  normalizeLaminatingRows,
} from '../src/reports/wps/rekap-produksi-laminating-consolidated'

const mutasiRow: MutasiRow = {
  Jenis: 'JABON',
  LMTAwal: 10,
  AdjOutputLMT: 1,
  BSOutputLMT: 2,
  LMTProdOuput: 3,
  AdjInptLMT: 4,
  BSInptLMT: 5,
  CCAProdInptLMT: 6,
  LMTJual: 7,
  MldProdInptLMT: 8,
  S4SProdInptLMT: 9,
  LMTAkhir: 77,
}

describe('mutasi-laminating mainValues', () => {
  test('Total Masuk sums Adj Out + BS Out + LMT Prod Out', () => {
    expect(mainValues(mutasiRow).totalMasuk).toBe(6)
  })

  test('Total Keluar sums the six Keluar columns', () => {
    // 4 + 5 + 6 + 7 + 8 + 9
    expect(mainValues(mutasiRow).totalKeluar).toBe(39)
  })

  test('Akhir comes from the SP', () => {
    expect(mainValues(mutasiRow).akhir).toBe(77)
  })

  test('reads the upstream-misspelled LMTProdOuput column', () => {
    expect(mainValues(mutasiRow).prodOut).toBe(3)
  })

  test('LMTMasuk is never read, matching the legacy output', () => {
    const withMasuk = mainValues({ ...mutasiRow, LMTMasuk: 99 } as MutasiRow)
    expect(withMasuk.totalMasuk).toBe(6)
  })

  test('treats nulls and blanks as zero', () => {
    const values = mainValues({ ...mutasiRow, AdjOutputLMT: null, BSOutputLMT: '' })
    expect(values.totalMasuk).toBe(3)
  })
})

const raw = [
  { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'MESIN A', JamKerja: 8, JmlhAnggota: 2, BJ: 6, CCAkhir: 0, Moulding: 0, Reproses: 0, Sanding: 0, OutputLaminating: 6 },
  { Tanggal: '2026-08-01', Shift: 2, NamaMesin: 'MESIN A', JamKerja: 4, JmlhAnggota: 3, BJ: 0, CCAkhir: 0, Moulding: 0, Reproses: 4, Sanding: 0, OutputLaminating: 4 },
  { Tanggal: '2026-08-02', Shift: 1, NamaMesin: 'MESIN B', JamKerja: 8, JmlhAnggota: 1, BJ: 0, CCAkhir: 10, Moulding: 0, Reproses: 0, Sanding: 0, OutputLaminating: 9 },
]

describe('rekap produksi laminating consolidated', () => {
  test('Total Input sums all five input columns', () => {
    const rows = normalizeLaminatingRows(raw)
    expect(rows[0]!.totalInput).toBe(6)
    expect(rows[1]!.totalInput).toBe(4)
    expect(rows[2]!.totalInput).toBe(10)
  })

  test('derives Rend per row', () => {
    const rows = normalizeLaminatingRows(raw)
    expect(rows[0]!.rend).toBe(100)
    expect(rows[2]!.rend).toBe(90)
  })

  test('leaves ratios null when the divisor is zero', () => {
    const rows = normalizeLaminatingRows([
      { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'M', JamKerja: 0, JmlhAnggota: 0, BJ: 0, CCAkhir: 0, Moulding: 1, Reproses: 0, Sanding: 0, OutputLaminating: 1 },
    ])
    expect(rows[0]!.m3Jam).toBeNull()
    expect(rows[0]!.m3JamOrg).toBeNull()
  })

  test('totals AVERAGE the ratios, unlike the Finger Joint report which sums them', () => {
    const rows = normalizeLaminatingRows(raw)
    const totals = computeLaminatingTotals(rows)
    // Row ratios are 6/8=0.75 and 4/4=1.0 and 9/8=1.125; the average is 0.9583,
    // whereas summing them would give 2.875.
    expect(totals.m3Jam).toBeCloseTo((0.75 + 1.0 + 1.125) / 3)
    expect(totals.m3Jam).not.toBeCloseTo(0.75 + 1.0 + 1.125)
  })

  test('totals sum the additive columns', () => {
    const totals = computeLaminatingTotals(normalizeLaminatingRows(raw))
    expect(totals.inputs.bj).toBe(6)
    expect(totals.inputs.ccAkhir).toBe(10)
    expect(totals.inputs.reproses).toBe(4)
    expect(totals.totalInput).toBe(20)
    expect(totals.output).toBe(19)
    expect(totals.rend).toBeCloseTo(95)
  })

  test('HK is the machine row count, not calendar days', () => {
    const groups = groupLaminatingByMachine(normalizeLaminatingRows(raw))
    // MESIN A has 2 rows (one date, two shifts), MESIN B has 1.
    expect(groups.find((g) => g.namaMesin === 'MESIN A')!.hk).toBe(2)
    expect(groups.find((g) => g.namaMesin === 'MESIN B')!.hk).toBe(1)
  })

  test('working days count distinct active dates, fewer than the row count', () => {
    const groups = groupLaminatingByMachine(normalizeLaminatingRows(raw))
    const mesinA = groups.find((g) => g.namaMesin === 'MESIN A')!
    expect(mesinA.hk).toBe(2)
    expect(mesinA.hkWorking).toBe(1)
  })

  test('sorts by machine, then date, then shift', () => {
    const rows = normalizeLaminatingRows(raw)
    expect(rows.map((r) => `${r.namaMesin}/${r.tanggal}/${r.shift}`)).toEqual([
      'MESIN A/2026-08-01/1',
      'MESIN A/2026-08-01/2',
      'MESIN B/2026-08-02/1',
    ])
  })
})
