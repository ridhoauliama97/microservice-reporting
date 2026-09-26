import { describe, expect, test } from 'bun:test'
import { mainValues, type MutasiRow } from '../src/reports/wps/mutasi-moulding'
import {
  computeMouldingTotals,
  groupMouldingByMachine,
  normalizeMouldingRows,
} from '../src/reports/wps/rekap-produksi-moulding-consolidated'
import { mouldingHidupDetailReport } from '../src/reports/wps/moulding-hidup-detail'
import { crossCutAkhirHidupDetailReport } from '../src/reports/wps/cross-cut-akhir-hidup-detail'

const mutasiRow: MutasiRow = {
  Jenis: 'JABON',
  MLDAwal: 10,
  AdjOutputMLD: 1,
  /** Misspelled upstream. */
  BSOutptutMLD: 2,
  MLDProdOutput: 3,
  AdjInptMLD: 4,
  BSInptMLD: 5,
  MLDJual: 6,
  CCAInptMLD: 7,
  LMTInptMLD: 8,
  MLDInptMLD: 9,
  PACKInptMLD: 10,
  SANDInptMLD: 11,
  S4SinptMLD: 12,
  MLDAkhir: 99,
}

describe('mutasi-moulding mainValues', () => {
  test('Total Masuk sums the three Masuk columns', () => {
    expect(mainValues(mutasiRow).totalMasuk).toBe(6)
  })

  test('Total Keluar sums all nine Keluar columns', () => {
    // 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12
    expect(mainValues(mutasiRow).totalKeluar).toBe(72)
  })

  test('Akhir comes from the SP', () => {
    expect(mainValues(mutasiRow).akhir).toBe(99)
  })

  test('reads the upstream-misspelled BSOutptutMLD column', () => {
    expect(mainValues(mutasiRow).bsOut).toBe(2)
  })

  test('MLDMasuk is never read, matching the legacy output', () => {
    const values = mainValues({ ...mutasiRow, MLDMasuk: 500 } as MutasiRow)
    expect(values.totalMasuk).toBe(6)
  })
})

const raw = [
  { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'MOULDING 1', JamKerja: 8, JmlhAnggota: 2, BJ: 0, CCAkhir: 0, FJ: 0, Laminating: 6, Moulding: 0, Reproses: 0, S4S: 0, OutputMoulding: 4, OutputReproses: 2 },
  { Tanggal: '2026-08-01', Shift: 2, NamaMesin: 'MOULDING 1', JamKerja: 4, JmlhAnggota: 3, BJ: 0, CCAkhir: 0, FJ: 4, Laminating: 0, Moulding: 0, Reproses: 0, S4S: 0, OutputMoulding: 0, OutputReproses: 0 },
  { Tanggal: '2026-08-02', Shift: 1, NamaMesin: 'MOULDING 2', JamKerja: 8, JmlhAnggota: 1, BJ: 0, CCAkhir: 10, FJ: 0, Laminating: 0, Moulding: 0, Reproses: 0, S4S: 0, OutputMoulding: 9, OutputReproses: 0 },
]

describe('rekap produksi moulding consolidated', () => {
  test('Total Input sums all seven input columns', () => {
    expect(normalizeMouldingRows(raw)[0]!.totalInput).toBe(6)
    expect(normalizeMouldingRows(raw)[2]!.totalInput).toBe(10)
  })

  test('Total Output is OutputMoulding + OutputReproses, and drives the ratios', () => {
    const row = normalizeMouldingRows(raw)[0]!
    expect(row.totalOutput).toBe(6)
    expect(row.m3Jam).toBe(0.75) // 6 / 8
    expect(row.m3JamOrg).toBeCloseTo(0.375) // 6 / (8 * 2)
    expect(row.rend).toBe(100) // 6 / 6
  })

  test('Rend uses the combined output, not OutputMoulding alone', () => {
    const row = normalizeMouldingRows(raw)[0]!
    expect(row.rend).not.toBe((4 / 6) * 100)
  })

  test('leaves ratios null when output is zero', () => {
    const rows = normalizeMouldingRows([
      { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'M', JamKerja: 8, JmlhAnggota: 1, BJ: 0, CCAkhir: 0, FJ: 0, Laminating: 0, Moulding: 5, Reproses: 0, S4S: 0, OutputMoulding: 0, OutputReproses: 0 },
    ])
    expect(rows[0]!.m3Jam).toBeNull()
    expect(rows[0]!.rend).toBeNull()
  })

  test('totals AVERAGE the ratios, as the Laminating reference does', () => {
    const totals = computeMouldingTotals(normalizeMouldingRows(raw))
    // 0.75 + 0 + 1.125 averaged over three rows.
    expect(totals.m3Jam).toBeCloseTo((0.75 + 0 + 1.125) / 3)
    expect(totals.m3Jam).not.toBeCloseTo(0.75 + 0 + 1.125)
  })

  test('totals sum the additive columns including both outputs', () => {
    const totals = computeMouldingTotals(normalizeMouldingRows(raw))
    expect(totals.inputs.Laminating).toBe(6)
    expect(totals.inputs.FJ).toBe(4)
    expect(totals.inputs.CCAkhir).toBe(10)
    expect(totals.outputs.OutputMoulding).toBe(13)
    expect(totals.outputs.OutputReproses).toBe(2)
    expect(totals.totalInput).toBe(20)
    expect(totals.totalOutput).toBe(15)
    expect(totals.rend).toBeCloseTo(75)
  })

  test('HK is the machine row count, not calendar days', () => {
    const groups = groupMouldingByMachine(normalizeMouldingRows(raw))
    expect(groups.find((g) => g.namaMesin === 'MOULDING 1')!.hk).toBe(2)
    expect(groups.find((g) => g.namaMesin === 'MOULDING 1')!.hkWorking).toBe(1)
  })

  test('sorts by machine, then date, then shift', () => {
    const rows = normalizeMouldingRows(raw)
    expect(rows.map((r) => `${r.namaMesin}/${r.tanggal}/${r.shift}`)).toEqual([
      'MOULDING 1/2026-08-01/1',
      'MOULDING 1/2026-08-01/2',
      'MOULDING 2/2026-08-02/1',
    ])
  })
})

describe('moulding hidup detail is period-filtered', () => {
  const schemaOf = (r: unknown) =>
    (r as { paramsSchema: { safeParse: (v: unknown) => { success: boolean } } }).paramsSchema

  test('requires a period, unlike the snapshot variants', () => {
    const schema = schemaOf(mouldingHidupDetailReport)
    expect(schema.safeParse({ tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ tglAwal: '2026-08-31', tglAkhir: '2026-08-01' }).success).toBe(false)
  })

  test('leaves the Cross Cut Akhir snapshot report parameterless', () => {
    const schema = schemaOf(crossCutAkhirHidupDetailReport)
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }).success).toBe(false)
  })
})
