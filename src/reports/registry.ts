import { exampleReport } from './example'
import { balokSudahSemprotReport } from './wps/balok-sudah-semprot'
import { hasilOutputRacipHarianReport } from './wps/hasil-output-racip-harian'
import { hidupKbPerGroupReport } from './wps/hidup-kb-per-group'
import { kayuBulatHidupReport } from './wps/kayu-bulat-hidup'
import { kbKhususBangkangReport } from './wps/kb-khusus-bangkang'
import { barangJadiHidupDetailReport } from './wps/barang-jadi-hidup-detail'
import { crossCutAkhirHidupDetailReport } from './wps/cross-cut-akhir-hidup-detail'
import { dashboardBarangJadiReport } from './wps/dashboard-barang-jadi'
import { dashboardCrossCutAkhirReport } from './wps/dashboard-cross-cut-akhir'
import { dashboardReprosesReport } from './wps/dashboard-reproses'
import { ketahananBarangCcAkhirReport } from './wps/ketahanan-barang-cc-akhir'
import { ketahananBarangReprosesReport } from './wps/ketahanan-barang-reproses'
import { mutasiCrossCutAkhirReport } from './wps/mutasi-cross-cut-akhir'
import { mutasiReprosesReport } from './wps/mutasi-reproses'
import { mutasiHasilRacipReport } from './wps/mutasi-hasil-racip'
import { mutasiKayuBulatGantungReport } from './wps/mutasi-kayu-bulat-gantung'
import { mutasiKayuBulatKgReport } from './wps/mutasi-kayu-bulat-kg'
import { mutasiKayuBulatKgGantungReport } from './wps/mutasi-kayu-bulat-kg-gantung'
import { mutasiBarangJadiReport } from './wps/mutasi-barang-jadi'
import { mutasiBarangJadiPerJenisPerUkuranReport } from './wps/mutasi-barang-jadi-per-jenis-per-ukuran'
import { mutasiKayuBulatReport } from './wps/mutasi-kayu-bulat'
import { mutasiRacipDetailReport } from './wps/mutasi-racip-detail'
import { penerimaanKayuBulatExtTonReport } from './wps/penerimaan-kayu-bulat-ext-ton'
import { penerimaanKayuBulatIntTonReport } from './wps/penerimaan-kayu-bulat-int-ton'
import {
  penerimaanKayuBulatExtKgReport,
  penerimaanKayuBulatKgReport,
} from './wps/penerimaan-kayu-bulat-kg'
import { penerimaanKayuBulatPerSupplierGrafikReport } from './wps/penerimaan-kayu-bulat-per-supplier-grafik'
import { penerimaanKayuBulatPerSupplierGroupReport } from './wps/penerimaan-kayu-bulat-per-supplier-group'
import { penerimaanKayuBulatPerSupplierKgReport } from './wps/penerimaan-kayu-bulat-per-supplier-kg'
import { penerimaanKayuBulatPerSupplierReport } from './wps/penerimaan-kayu-bulat-per-supplier'
import { perbandinganKbMasukKgReport } from './wps/perbandingan-kb-masuk-periode-kg'
import { perbandinganKbMasukReport } from './wps/perbandingan-kb-masuk-periode'
import { rekapPembelianKayuBulatKgReport } from './wps/rekap-pembelian-kayu-bulat-kg'
import { rekapPembelianKayuBulatReport } from './wps/rekap-pembelian-kayu-bulat'
import { rekapProduksiPackingPerJenisPerGradeReport } from './wps/rekap-produksi-packing-per-jenis-per-grade'
import { rekapProduksiBarangJadiConsolidatedReport } from './wps/rekap-produksi-barang-jadi-consolidated'
import { rekapProduksiCrossCutAkhirConsolidatedReport } from './wps/rekap-produksi-cross-cut-akhir-consolidated'
import { rekapProduksiCrossCutAkhirPerJenisPerGradeReport } from './wps/rekap-produksi-cross-cut-akhir-per-jenis-per-grade'
import { saldoBarangJadiHidupPerJenisPerProdukReport } from './wps/saldo-barang-jadi-hidup-per-jenis-per-produk'
import { umurBarangJadiDetailReport } from './wps/umur-barang-jadi-detail'
import { umurCrossCutAkhirDetailReport } from './wps/umur-cross-cut-akhir-detail'
import { umurReprosesDetailReport } from './wps/umur-reproses-detail'
import { reprosesHidupDetailReport } from './wps/reproses-hidup-detail'
import { rekapPenerimaanStDariSawmillKgReport } from './wps/rekap-penerimaan-st-dari-sawmill-kg'
import { rekapPenerimaanStSawmillCostingRambungReport } from './wps/rekap-penerimaan-st-sawmill-costing-rambung'
import { rekapRendemenRambungPerSupplierReport } from './wps/rekap-rendemen-rambung-per-supplier'
import { saldoKayuBulatReport } from './wps/saldo-kayu-bulat'
import { saldoHidupKayuBulatKgReport } from './wps/saldo-hidup-kayu-bulat-kg'
import { supplierIntelReport } from './wps/supplier-intel'
import { stockOpnameKbReport } from './wps/stock-opname-kb'
import { stockRacipKayuLatReport } from './wps/stock-racip-kayu-lat'
import { targetMasukBBBulananReport } from './wps/target-masuk-bb-bulanan'
import { targetMasukBBHarianReport } from './wps/target-masuk-bb-harian'
import { timelineKbBulananReport } from './wps/timeline-kayu-bulat-bulanan'
import { timelineKbHarianReport } from './wps/timeline-kayu-bulat-harian'
import { timelineKbBulananKgReport } from './wps/timeline-kb-bulanan-rambung-kg'
import { timelineKbHarianKgReport } from './wps/timeline-kb-harian-rambung-kg'
import { umurKayuBulatReport } from './wps/umur-kayu-bulat-non-rambung'
import { umurKayuBulatRambungReport } from './wps/umur-kayu-bulat-rambung'
import type { ReportDefinition } from './types'

// The single allowed `any` in the codebase (AGENTS.md 7.9): each report has
// its own params/data types, and generic bookkeeping here adds no safety —
// params are validated against each report's paramsSchema before use.
export const reports: Record<string, ReportDefinition<any, any>> = {
  example: exampleReport,
  'mutasi-kayu-bulat': mutasiKayuBulatReport,
  'mutasi-kayu-bulat-gantung': mutasiKayuBulatGantungReport,
  'mutasi-kayu-bulat-kg': mutasiKayuBulatKgReport,
  'mutasi-kayu-bulat-kg-gantung': mutasiKayuBulatKgGantungReport,
  'mutasi-barang-jadi': mutasiBarangJadiReport,
  'barang-jadi-hidup-detail': barangJadiHidupDetailReport,
  'cross-cut-akhir-hidup-detail': crossCutAkhirHidupDetailReport,
  'dashboard-barang-jadi': dashboardBarangJadiReport,
  'dashboard-cross-cut-akhir': dashboardCrossCutAkhirReport,
  'dashboard-reproses': dashboardReprosesReport,
  'ketahanan-barang-cc-akhir': ketahananBarangCcAkhirReport,
  'ketahanan-barang-reproses': ketahananBarangReprosesReport,
  'mutasi-cross-cut-akhir': mutasiCrossCutAkhirReport,
  'mutasi-reproses': mutasiReprosesReport,
  'reproses-hidup-detail': reprosesHidupDetailReport,
  'mutasi-barang-jadi-per-jenis-per-ukuran': mutasiBarangJadiPerJenisPerUkuranReport,
  'mutasi-hasil-racip': mutasiHasilRacipReport,
  'mutasi-racip-detail': mutasiRacipDetailReport,
  'balok-sudah-semprot': balokSudahSemprotReport,
  'hasil-output-racip-harian': hasilOutputRacipHarianReport,
  'hidup-kb-per-group': hidupKbPerGroupReport,
  'kayu-bulat-hidup': kayuBulatHidupReport,
  'saldo-kayu-bulat': saldoKayuBulatReport,
  'saldo-hidup-kayu-bulat-kg': saldoHidupKayuBulatKgReport,
  'supplier-intel': supplierIntelReport,
  'kb-khusus-bangkang': kbKhususBangkangReport,
  'penerimaan-kayu-bulat-int-ton': penerimaanKayuBulatIntTonReport,
  'penerimaan-kayu-bulat-ext-ton': penerimaanKayuBulatExtTonReport,
  'penerimaan-kayu-bulat-kg': penerimaanKayuBulatKgReport,
  'penerimaan-kayu-bulat-ext-kg': penerimaanKayuBulatExtKgReport,
  'penerimaan-kayu-bulat-per-supplier-kg': penerimaanKayuBulatPerSupplierKgReport,
  'penerimaan-kayu-bulat-per-supplier': penerimaanKayuBulatPerSupplierReport,
  'penerimaan-kayu-bulat-per-supplier-grafik': penerimaanKayuBulatPerSupplierGrafikReport,
  'penerimaan-kayu-bulat-per-supplier-group': penerimaanKayuBulatPerSupplierGroupReport,
  'perbandingan-kb-masuk-periode-1-dan-2': perbandinganKbMasukReport,
  'perbandingan-kb-masuk-periode-1-dan-2-kg': perbandinganKbMasukKgReport,
  'rekap-pembelian-kayu-bulat': rekapPembelianKayuBulatReport,
  'rekap-pembelian-kayu-bulat-kg': rekapPembelianKayuBulatKgReport,
  'rekap-produksi-packing-per-jenis-per-grade': rekapProduksiPackingPerJenisPerGradeReport,
  'rekap-produksi-barang-jadi-consolidated': rekapProduksiBarangJadiConsolidatedReport,
  'rekap-produksi-cross-cut-akhir-consolidated': rekapProduksiCrossCutAkhirConsolidatedReport,
  'rekap-produksi-cross-cut-akhir-per-jenis-per-grade': rekapProduksiCrossCutAkhirPerJenisPerGradeReport,
  'saldo-barang-jadi-hidup-per-jenis-per-produk': saldoBarangJadiHidupPerJenisPerProdukReport,
  'umur-barang-jadi-detail': umurBarangJadiDetailReport,
  'umur-cross-cut-akhir-detail': umurCrossCutAkhirDetailReport,
  'umur-reproses-detail': umurReprosesDetailReport,
  'rekap-penerimaan-st-dari-sawmill-kg': rekapPenerimaanStDariSawmillKgReport,
  'rekap-penerimaan-st-sawmill-costing-rambung': rekapPenerimaanStSawmillCostingRambungReport,
  'rekap-rendemen-rambung-per-supplier': rekapRendemenRambungPerSupplierReport,
  'stock-racip-kayu-lat': stockRacipKayuLatReport,
  'target-masuk-bb-bulanan': targetMasukBBBulananReport,
  'target-masuk-bb-harian': targetMasukBBHarianReport,
  'stock-opname-kb': stockOpnameKbReport,
  'timeline-kayu-bulat-bulanan': timelineKbBulananReport,
  'timeline-kayu-bulat-harian': timelineKbHarianReport,
  'timeline-kb-bulanan-rambung-kg': timelineKbBulananKgReport,
  'timeline-kb-harian-rambung-kg': timelineKbHarianKgReport,
  'umur-kayu-bulat-non-rambung': umurKayuBulatReport,
  'umur-kayu-bulat-rambung': umurKayuBulatRambungReport,
}
