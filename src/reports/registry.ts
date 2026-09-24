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
import { penerimaanKayuBulatPerSupplierGrafikReport } from './wps/penerimaan-kayu-bulat-per-supplier-grafik'
import { penerimaanKayuBulatPerSupplierGroupReport } from './wps/penerimaan-kayu-bulat-per-supplier-group'
import { penerimaanKayuBulatPerSupplierReport } from './wps/penerimaan-kayu-bulat-per-supplier'
import { perbandinganKbMasukReport } from './wps/perbandingan-kb-masuk-periode'
import { rekapPembelianKayuBulatReport } from './wps/rekap-pembelian-kayu-bulat'
import { saldoKayuBulatReport } from './wps/saldo-kayu-bulat'
import { stockOpnameKbReport } from './wps/stock-opname-kb'
import { stockRacipKayuLatReport } from './wps/stock-racip-kayu-lat'
import { targetMasukBBBulananReport } from './wps/target-masuk-bb-bulanan'
import { targetMasukBBHarianReport } from './wps/target-masuk-bb-harian'
import { timelineKbBulananReport } from './wps/timeline-kayu-bulat-bulanan'
import { timelineKbHarianReport } from './wps/timeline-kayu-bulat-harian'
import { umurKayuBulatReport } from './wps/umur-kayu-bulat-non-rambung'
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
  'penerimaan-kayu-bulat-int-ton': penerimaanKayuBulatIntTonReport,
  'penerimaan-kayu-bulat-ext-ton': penerimaanKayuBulatExtTonReport,
  'perbandingan-kb-masuk-periode-1-dan-2': perbandinganKbMasukReport,
  'rekap-pembelian-kayu-bulat': rekapPembelianKayuBulatReport,
  'stock-racip-kayu-lat': stockRacipKayuLatReport,
  'target-masuk-bb-bulanan': targetMasukBBBulananReport,
  'target-masuk-bb-harian': targetMasukBBHarianReport,
  'stock-opname-kb': stockOpnameKbReport,
  'timeline-kayu-bulat-bulanan': timelineKbBulananReport,
  'timeline-kayu-bulat-harian': timelineKbHarianReport,
  'umur-kayu-bulat-non-rambung': umurKayuBulatReport,
}
