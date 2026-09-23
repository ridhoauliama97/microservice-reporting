import { exampleReport } from './example'
import { balokSudahSemprotReport } from './wps/balok-sudah-semprot'
import { hasilOutputRacipHarianReport } from './wps/hasil-output-racip-harian'
import { hidupKbPerGroupReport } from './wps/hidup-kb-per-group'
import { kayuBulatHidupReport } from './wps/kayu-bulat-hidup'
import { kbKhususBangkangReport } from './wps/kb-khusus-bangkang'
import { mutasiHasilRacipReport } from './wps/mutasi-hasil-racip'
import { mutasiKayuBulatGantungReport } from './wps/mutasi-kayu-bulat-gantung'
import { mutasiBarangJadiReport } from './wps/mutasi-barang-jadi'
import { mutasiKayuBulatReport } from './wps/mutasi-kayu-bulat'
import { mutasiRacipDetailReport } from './wps/mutasi-racip-detail'
import { penerimaanKayuBulatExtTonReport } from './wps/penerimaan-kayu-bulat-ext-ton'
import { penerimaanKayuBulatIntTonReport } from './wps/penerimaan-kayu-bulat-int-ton'
import { penerimaanKayuBulatPerSupplierReport } from './wps/penerimaan-kayu-bulat-per-supplier'
import { saldoKayuBulatReport } from './wps/saldo-kayu-bulat'
import type { ReportDefinition } from './types'

// The single allowed `any` in the codebase (AGENTS.md 7.9): each report has
// its own params/data types, and generic bookkeeping here adds no safety —
// params are validated against each report's paramsSchema before use.
export const reports: Record<string, ReportDefinition<any, any>> = {
  example: exampleReport,
  'mutasi-kayu-bulat': mutasiKayuBulatReport,
  'mutasi-kayu-bulat-gantung': mutasiKayuBulatGantungReport,
  'mutasi-barang-jadi': mutasiBarangJadiReport,
  'mutasi-hasil-racip': mutasiHasilRacipReport,
  'mutasi-racip-detail': mutasiRacipDetailReport,
  'balok-sudah-semprot': balokSudahSemprotReport,
  'hasil-output-racip-harian': hasilOutputRacipHarianReport,
  'hidup-kb-per-group': hidupKbPerGroupReport,
  'kayu-bulat-hidup': kayuBulatHidupReport,
  'saldo-kayu-bulat': saldoKayuBulatReport,
  'kb-khusus-bangkang': kbKhususBangkangReport,
  'penerimaan-kayu-bulat-per-supplier': penerimaanKayuBulatPerSupplierReport,
  'penerimaan-kayu-bulat-int-ton': penerimaanKayuBulatIntTonReport,
  'penerimaan-kayu-bulat-ext-ton': penerimaanKayuBulatExtTonReport,
}
