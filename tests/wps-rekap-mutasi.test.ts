import { describe, expect, test } from 'bun:test'
import { buildRekapMutasiSections } from '../src/reports/wps/rekap-mutasi'

/**
 * The production sections aggregate the mutasi procedures by wood family and
 * then keep only JABON, PULAI and RAMBUNG. A family outside that list is
 * summed into a group and then dropped, so the totals silently exclude it -
 * worth pinning, along with the fixed section order and the label quirks.
 */

type Row = Record<string, unknown>
type ProductionSources = Record<string, { main: Row[]; sub: Row[] }>

const emptySources = {
  kayuBulat: [] as Row[],
  kayuBulatKg: [] as Row[],
  sawnTimber: [] as Row[],
  barangJadi: [] as Row[],
  barangJadiSub: [] as Row[],
  production: {} as ProductionSources,
}

/** Mirrors the S4S mapper: Masuk sums five columns, Keluar sums five more. */
const s4sRow = (jenis: string, overrides: Row = {}): Row => ({
  Jenis: jenis,
  S4SAwal: 0,
  S4SMasuk: 0,
  AdjOutputS4S: 0,
  BSOutputS4S: 0,
  ProdOutputS4S: 0,
  CCAProdOutputS4S: 0,
  AdjInputS4S: 0,
  BsInputS4S: 0,
  FJinputS4S: 0,
  MldInputS4S: 0,
  S4SInputS4S: 0,
  JualS4S: 0,
  AkhirS4S: 0,
  ...overrides,
})

describe('Rekap Mutasi sections', () => {
  test('always produces the ten numbered sections in order', () => {
    const sections = buildRekapMutasiSections(emptySources)
    expect(sections.map((s) => s.title)).toEqual([
      '1. Kayu Bulat (Ton)',
      '2. Kayu Bulat - Rambung (Kg)',
      '3. Sawntimber (Ton)',
      '4. S4S (m3)',
      '5. Finger Joint (m3)',
      '6. Moulding (m3)',
      '7. Laminating (m3)',
      '8. CC Akhir (m3)',
      '9. Sanding (m3)',
      '10. Barang Jadi (m3)',
    ])
  })

  test('every production section carries an input table and a performance block', () => {
    const sections = buildRekapMutasiSections(emptySources)
    for (const section of sections.slice(3, 9)) {
      expect(section.inputTable).toBeDefined()
      expect(section.performance).toBeDefined()
    }
    expect(sections[9]!.inputTable).toBeDefined()
  })

  test('the kilogram section prints whole numbers and says "Jenis Grade Kayu"', () => {
    const sections = buildRekapMutasiSections(emptySources)
    expect(sections[1]!.valueFormat).toBe('integer0')
    expect(sections[1]!.columns.find(([key]) => key === 'Jenis')?.[1]).toBe('Jenis Grade Kayu')
  })

  test('wood families aggregate and are limited to JABON, PULAI and RAMBUNG', () => {
    const sections = buildRekapMutasiSections({
      ...emptySources,
      production: {
        s4s: {
          main: [
            s4sRow('ST JABON A/A', { S4SAwal: 1, S4SMasuk: 2, AkhirS4S: 3 }),
            s4sRow('ST JABON B/B', { S4SAwal: 10, S4SMasuk: 20, AkhirS4S: 30 }),
            s4sRow('MAHANG C/C', { S4SAwal: 999, S4SMasuk: 999, AkhirS4S: 999 }),
          ],
          sub: [],
        },
      },
    })

    const s4s = sections[3]!
    // JABON rolls up; MAHANG is summed into a group and then discarded.
    expect(s4s.rows.map((row) => row.Jenis)).toEqual(['JABON'])
    expect(s4s.rows[0]!.Awal).toBe(11)
    expect(s4s.rows[0]!.Masuk).toBe(22)
    expect(s4s.totals.Awal).toBe(11)
  })

  test('the mapper sums every upstream column, typos included', () => {
    const sections = buildRekapMutasiSections({
      ...emptySources,
      production: {
        s4s: {
          main: [
            s4sRow('ST JABON', {
              S4SMasuk: 1,
              AdjOutputS4S: 2,
              BSOutputS4S: 3,
              ProdOutputS4S: 4,
              CCAProdOutputS4S: 5,
            }),
          ],
          sub: [],
        },
      },
    })
    // All five Masuk columns contribute, so a mistyped key would lower this.
    expect(sections[3]!.rows[0]!.Masuk).toBe(15)
  })

  test('only the S4S production section derives "Jenis Kayu" from its title', () => {
    const sections = buildRekapMutasiSections(emptySources)
    const jenisLabel = (index: number) =>
      sections[index]!.columns.find(([key]) => key === 'Jenis')?.[1]
    // The six production sections test their title for "S4S", so only section 4
    // qualifies; the rest say just "Jenis".
    expect(jenisLabel(3)).toBe('Jenis Kayu')
    expect(jenisLabel(4)).toBe('Jenis')
    expect(jenisLabel(8)).toBe('Jenis')
    // Barang Jadi is not a production section: its label is set explicitly.
    expect(jenisLabel(9)).toBe('Jenis Kayu')
  })

  test('the CC Akhir summary reads Output then Input, the others Input then Output', () => {
    const sections = buildRekapMutasiSections(emptySources)
    expect(sections[7]!.performance!.leftLabel).toBe('Output')
    expect(sections[7]!.performance!.rightLabel).toBe('Input')
    expect(sections[5]!.performance!.leftLabel).toBe('Input')
    expect(sections[5]!.performance!.rightLabel).toBe('Output')
  })

  test('Kayu Bulat labels drop the "KB " prefix and turn "-" into a space', () => {
    const sections = buildRekapMutasiSections({
      ...emptySources,
      kayuBulat: [
        { Jenis: 'KB JABON - AFKIR', SaldoAwal: 1, SaldoMasuk: 1, SaldoKeluar: 1, SaldoJual: 0, SaldoAkhir: 1 },
        { Jenis: 'KB JABON MC MATA', SaldoAwal: 2, SaldoMasuk: 2, SaldoKeluar: 2, SaldoJual: 0, SaldoAkhir: 2 },
      ],
    })
    expect(sections[0]!.rows.map((row) => row.Jenis)).toEqual(['JABON AFKIR', 'JABON MC-MATA'])
  })

  test('Sawntimber sorts by its fixed wood order, then alphabetically, and renumbers', () => {
    const sections = buildRekapMutasiSections({
      ...emptySources,
      sawnTimber: [
        { Jenis: 'ST KAYU LAT PULAI', Awal: 0 },
        { Jenis: 'ST JABON', Awal: 0 },
        { Jenis: 'ST RAMBUNG - STD', Awal: 0 },
        { Jenis: 'ST KAYU LAT JABON', Awal: 0 },
      ],
    })
    expect(sections[2]!.rows.map((row) => row.Jenis)).toEqual([
      'JABON',
      'KAYU LAT JABON',
      'RAMBUNG - STD',
      'KAYU LAT PULAI',
    ])
    expect(sections[2]!.rows.map((row) => row.No)).toEqual([1, 2, 3, 4])
  })

  test('rendemen is output over input as a percentage, and null when input is zero', () => {
    const sections = buildRekapMutasiSections({
      ...emptySources,
      production: {
        s4s: {
          main: [s4sRow('ST JABON', { AdjInputS4S: 40 })],
          sub: [{ Jenis: 'ST JABON', S4S: 50 }],
        },
      },
    })
    const performance = sections[3]!.performance!
    expect(performance.input).toBe(50)
    expect(performance.output).toBe(40)
    expect(performance.rendemen).toBeCloseTo(80, 10)

    const noInput = buildRekapMutasiSections(emptySources)
    expect(noInput[3]!.performance!.rendemen).toBeNull()
  })
})
