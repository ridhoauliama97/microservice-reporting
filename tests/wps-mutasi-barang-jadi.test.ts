import { describe, expect, test } from 'bun:test'
import { buildViewModel } from '../src/reports/wps/mutasi-barang-jadi'
import type { MutasiRow, SubRow } from '../src/reports/wps/mutasi-barang-jadi'

const mainRow = (overrides: Partial<MutasiRow>): MutasiRow => ({
  Jenis: 'BJ TEST',
  Awal: null,
  Masuk: null,
  AdjOutput: null,
  BSOutput: null,
  AdjInput: null,
  BSInput: null,
  Keluar: null,
  Jual: null,
  MLDInput: null,
  LMTInput: null,
  CCAInput: null,
  SANDInput: null,
  Akhir: null,
  ...overrides,
})

const subRow = (overrides: Partial<SubRow>): SubRow => ({
  Jenis: 'BJ TEST',
  BarangJadi: null,
  Moulding: null,
  Sanding: null,
  WIP: null,
  WIPLama: null,
  CCAkhir: null,
  ...overrides,
})

describe('buildViewModel (mutasi-barang-jadi)', () => {
  test('computes derived columns: Total Masuk, Total Keluar, WIP, per-row Total', () => {
    const vm = buildViewModel(
      [
        mainRow({
          Jenis: 'BJ A',
          Awal: 10,
          AdjOutput: 1,
          BSOutput: 2,
          Masuk: 3, // displayed as Packing Output
          AdjInput: 4,
          BSInput: 5,
          Jual: 6,
          CCAInput: 7,
          LMTInput: 8,
          MLDInput: 9,
          Keluar: 10, // displayed as Packing Prod Input
          SANDInput: 11,
          Akhir: 99,
        }),
      ],
      [
        subRow({ Jenis: 'BJ A', BarangJadi: 1, CCAkhir: 2, Moulding: 3, Sanding: 4, WIP: 5, WIPLama: 6 }),
      ],
    )

    const row = vm.main[0]
    expect(row.totalMasuk).toBe(1 + 2 + 3)
    expect(row.totalKeluar).toBe(4 + 5 + 6 + 7 + 8 + 9 + 10 + 11)
    expect(vm.sub[0].wip).toBe(5 + 6) // WIP + WIPLama
    expect(vm.sub[0].total).toBe(1 + 2 + 3 + 4 + 11)
  })

  test('accumulates grand totals across rows', () => {
    const vm = buildViewModel(
      [
        mainRow({ Jenis: 'BJ A', Awal: 1, Akhir: 2 }),
        mainRow({ Jenis: 'BJ B', Awal: 3, Akhir: 4 }),
      ],
      [],
    )
    expect(vm.mainTotals.awal).toBe(4)
    expect(vm.mainTotals.akhir).toBe(6)
  })

  test('sorts rows by Jenis ascending', () => {
    const vm = buildViewModel(
      [mainRow({ Jenis: 'C' }), mainRow({ Jenis: 'A' }), mainRow({ Jenis: 'B' })],
      [subRow({ Jenis: 'Z' }), subRow({ Jenis: 'M' })],
    )
    expect(vm.main.map((r) => r.jenis)).toEqual(['A', 'B', 'C'])
    expect(vm.sub.map((r) => r.jenis)).toEqual(['M', 'Z'])
  })

  test('treats null numeric cells as zero in computations', () => {
    const vm = buildViewModel(
      [mainRow({ Jenis: 'BJ A', Awal: null, Masuk: 2 })],
      [],
    )
    expect(vm.main[0].awal).toBe(0)
    expect(vm.main[0].packingOutput).toBe(2)
    expect(vm.main[0].totalMasuk).toBe(2)
  })
})
