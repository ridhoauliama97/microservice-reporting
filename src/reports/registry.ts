import { exampleReport } from './example'
import { balokSudahSemprotReport } from './wps/balok-sudah-semprot'
import { mutasiBarangJadiReport } from './wps/mutasi-barang-jadi'
import { mutasiKayuBulatReport } from './wps/mutasi-kayu-bulat'
import type { ReportDefinition } from './types'

// The single allowed `any` in the codebase (AGENTS.md 7.9): each report has
// its own params/data types, and generic bookkeeping here adds no safety —
// params are validated against each report's paramsSchema before use.
export const reports: Record<string, ReportDefinition<any, any>> = {
  example: exampleReport,
  'mutasi-kayu-bulat': mutasiKayuBulatReport,
  'mutasi-barang-jadi': mutasiBarangJadiReport,
  'balok-sudah-semprot': balokSudahSemprotReport,
}
