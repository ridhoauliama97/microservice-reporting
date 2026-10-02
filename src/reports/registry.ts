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
import { dashboardFingerJointReport } from './wps/dashboard-finger-joint'
import { dashboardLaminatingReport } from './wps/dashboard-laminating'
import { dashboardMouldingReport } from './wps/dashboard-moulding'
import { dashboardRuReport } from './wps/dashboard-ru'
import { discrepancyRekapMutasiReport } from './wps/discrepancy-rekap-mutasi'
import { flowProduksiPerPeriodeReport } from './wps/flow-produksi-per-periode'
import { hasilProduksiMesinLemburReport } from './wps/hasil-produksi-mesin-lembur'
import { labelPerhariReport } from './wps/label-perhari'
import { penjualanLokalReport } from './wps/penjualan-lokal'
import { rekapPenjualanPerProdukReport } from './wps/rekap-penjualan-per-produk'
import {
  rekapPenjualanEksporPerBuyerPerProdukReport,
  rekapPenjualanEksporPerProdukPerBuyerReport,
} from './wps/rekap-penjualan-ekspor'
import { timelineRekapPenjualanPerProdukReport } from './wps/timeline-rekap-penjualan-per-produk'
import { koordinatTanahReport } from './wps/koordinat-tanah'
import { penjualanBarangJadiM3Report } from './wps/penjualan-barang-jadi-m3'
import {
  ProduksiCcAkhirPerNomorProduksiReport,
  produksiFjPerNomorProduksiReport,
  produksiLaminatingPerNomorProduksiReport,
  produksiMouldingPerNomorProduksiReport,
  produksiPackingPerNomorProduksiReport,
  produksiS4SPerNomorProduksiReport,
  produksiSandingPerNomorProduksiReport,
} from './wps/produksi-per-nomor-produksi'
import { suratJalanReport } from './wps/surat-jalan'
import {
  rekapRendemenNonRambungReport,
  rekapRendemenRambungReport,
} from './wps/rekap-rendemen'
import { rendemenSemuaProsesReport } from './wps/rendemen-semua-proses'
import { produksiPerSpkReport } from './wps/produksi-per-spk'
import { dashboardS4SReport, dashboardS4SV2Report } from './wps/dashboard-s4s'
import { gradeAbcHarianReport } from './wps/grade-abc-harian'
import { ketahananBarangS4sReport } from './wps/ketahanan-barang-s4s'
import {
  labelS4SHidupPerJenisKayuReport,
  labelS4SHidupPerProdukPerJenisKayuReport,
} from './wps/label-s4s-hidup'
import { mutasiS4sReport } from './wps/mutasi-s4s'
import { outputProduksiS4SPerGradeReport } from './wps/output-produksi-s4s-per-grade'
import { rekapProduksiS4SRambungPerGradeReport } from './wps/rekap-produksi-s4s-rambung'
import { produksiHuluHilirReport } from './wps/produksi-hulu-hilir'
import { produksiSemuaMesinReport } from './wps/produksi-semua-mesin'
import { rekapMutasiReport } from './wps/rekap-mutasi'
import { rekapMutasiCrossTabReport } from './wps/rekap-mutasi-cross-tab'
import { rekapStockOnHandReport } from './wps/rekap-stock-on-hand'
import {
  stockHidupPerNoSpkDiscrepancyReport,
  stockHidupPerNoSpkReport,
} from './wps/stock-hidup-per-nospk'
import { laminatingHidupDetailReport } from './wps/laminating-hidup-detail'
import { ketahananBarangLaminatingReport } from './wps/ketahanan-barang-laminating'
import { ketahananBarangMouldingReport } from './wps/ketahanan-barang-moulding'
import { mouldingHidupDetailReport } from './wps/moulding-hidup-detail'
import { mutasiLaminatingReport } from './wps/mutasi-laminating'
import { mutasiMouldingReport } from './wps/mutasi-moulding'
import { rekapProduksiLaminatingConsolidatedReport } from './wps/rekap-produksi-laminating-consolidated'
import { rekapProduksiLaminatingPerJenisPerGradeReport } from './wps/rekap-produksi-laminating-per-jenis-per-grade'
import { rekapProduksiMouldingConsolidatedReport } from './wps/rekap-produksi-moulding-consolidated'
import { rekapProduksiMouldingPerJenisPerGradeReport } from './wps/rekap-produksi-moulding-per-jenis-per-grade'
import { umurLaminatingDetailReport } from './wps/umur-laminating-detail'
import { umurMouldingDetailReport } from './wps/umur-moulding-detail'
import { dashboardReprosesReport } from './wps/dashboard-reproses'
import { fingerJointHidupDetailReport } from './wps/finger-joint-hidup-detail'
import { ketahananBarangFingerJointReport } from './wps/ketahanan-barang-finger-joint'
import { mutasiFingerJointReport } from './wps/mutasi-finger-joint'
import { rekapProduksiFingerJointConsolidatedReport } from './wps/rekap-produksi-finger-joint-consolidated'
import { rekapProduksiFingerJointPerJenisPerGradeReport } from './wps/rekap-produksi-finger-joint-per-jenis-per-grade'
import { umurFingerJointDetailReport } from './wps/umur-finger-joint-detail'
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
import { s4sHidupDetailReport } from './wps/s4s-hidup-detail'
import { umurS4SDetailReport } from './wps/umur-s4s-detail'
import { rekapProduksiS4SConsolidatedReport } from './wps/rekap-produksi-s4s-consolidated'
import { rekapProduksiS4SPerJenisPerGradeReport } from './wps/rekap-produksi-s4s-per-jenis-per-grade'
import { dashboardSandingReport } from './wps/dashboard-sanding'
import { ketahananBarangSandingReport } from './wps/ketahanan-barang-sanding'
import { mutasiSandingReport } from './wps/mutasi-sanding'
import { rekapProduksiSandingConsolidatedReport } from './wps/rekap-produksi-sanding-consolidated'
import { rekapProduksiSandingPerJenisPerGradeReport } from './wps/rekap-produksi-sanding-per-jenis-per-grade'
import { sandingHidupDetailReport } from './wps/sanding-hidup-detail'
import { umurSandingDetailReport } from './wps/umur-sanding-detail'
import { mutasiSawnTimberTonReport } from './wps/mutasi-sawn-timber'
import { mutasiKdReport } from './wps/mutasi-kd'
import { dashboardSawnTimberReport } from './wps/dashboard-sawn-timber'
import { qcSawmillReport, qcSawmillDiscrepancyReport } from './wps/qc-sawmill'
import { qcSawmillSummaryReport } from './wps/qc-sawmill-summary'
import { rekapHasilSawmillPerMejaReport } from './wps/rekap-hasil-sawmill-per-meja'
import { rekapStPenjualanReport } from './wps/rekap-st-penjualan'
import { saldoStHidupPerProdukReport } from './wps/saldo-st-hidup-per-produk'
import { serahTerimaStKamarKdReport } from './wps/serah-terima-st-kamar-kd'
import { spkSawmillReport } from './wps/spk-sawmill'
import { stSawmillMasukPerGroupReport } from './wps/st-sawmill-masuk-per-group'
import { stBasahHidupPerUmurKayuTonReport } from './wps/st-basah-hidup-per-umur-kayu-ton'
import { stHidupKeringReport } from './wps/st-hidup-kering'
import { stHidupPerSpkReport } from './wps/st-hidup-per-spk'
import { stMasukPerGroupReport } from './wps/st-masuk-per-group'
import { stRambungMc1Mc2DetailReport } from './wps/st-rambung-mc1-mc2-detail'
import {
  rekapSawmillPerMejaSemuaMejaReport,
  rekapSawmillPerMejaUpahBoronganReport,
} from './wps/rekap-hasil-sawmill-per-meja-borongan'
import { rekapKamarKdReport } from './wps/rekap-kamar-kd'
import { rekapProduktivitasSawmillReport } from './wps/rekap-produktivitas-sawmill'
import { penerimaanStHasilSawmillReport } from './wps/penerimaan-st-hasil-sawmill'
import { rekapPenerimaanStNonRambungReport } from './wps/rekap-penerimaan-st-non-rambung'
import { kdKeluarMasukReport } from './wps/kd-keluar-masuk'
import { kdUpahPerCustomerReport } from './wps/kd-upah-per-customer'
import { kdUpahPerNoProcKdDetailReport } from './wps/kd-upah-per-no-proc-kd-detail'
import { ketahananBarangStReport } from './wps/ketahanan-barang-st'
import { labelStHidupDetailReport } from './wps/label-st-hidup-detail'
import { lembarPerhitunganUpahBoronganSawmillReport } from './wps/lembar-upah-borongan-sawmill'
import { pemakaianObatVacuumReport } from './wps/pemakaian-obat-vacuum'
import { pembelianStPerSupplierReport } from './wps/pembelian-st-per-supplier'
import { pembelianStTimelineReport } from './wps/pembelian-st-timeline'
import { penerimaanStSawmillKgReport } from './wps/penerimaan-st-sawmill-kg'
import { bahanTerpakaiReport } from './wps/bahan-terpakai'
import { bahanYangDihasilkanReport } from './wps/bahan-yang-dihasilkan'
import { labelNyangkutReport } from './wps/label-nyangkut'
import { rangkumanBongkarSusunReport } from './wps/rangkuman-bongkar-susun'
import { rangkumanJumlahLabelInputReport } from './wps/rangkuman-jumlah-label-input'
import { kapasitasRacipKayuBulatHidupReport } from './wps/kapasitas-racip-kayu-bulat-hidup'
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
  'dashboard-finger-joint': dashboardFingerJointReport,
  'dashboard-laminating': dashboardLaminatingReport,
  'dashboard-moulding': dashboardMouldingReport,
  'dashboard-ru': dashboardRuReport,
  'discrepancy-rekap-mutasi': discrepancyRekapMutasiReport,
  'flow-produksi-per-periode': flowProduksiPerPeriodeReport,
  'hasil-produksi-mesin-lembur-dan-non-lembur': hasilProduksiMesinLemburReport,
  'label-perhari': labelPerhariReport,
  'penjualan-lokal': penjualanLokalReport,
  'rekap-penjualan-per-produk': rekapPenjualanPerProdukReport,
  'rekap-penjualan-ekspor-per-produk-per-buyer':
    rekapPenjualanEksporPerProdukPerBuyerReport,
  'rekap-penjualan-ekspor-per-buyer-per-produk':
    rekapPenjualanEksporPerBuyerPerProdukReport,
  'timeline-rekap-penjualan-per-produk':
    timelineRekapPenjualanPerProdukReport,
  'koordinat-tanah': koordinatTanahReport,
  'penjualan-barang-jadi-m3': penjualanBarangJadiM3Report,
  'surat-jalan': suratJalanReport,
  'produksi-fj-per-nomor-produksi': produksiFjPerNomorProduksiReport,
  'produksi-laminating-per-nomor-produksi':
    produksiLaminatingPerNomorProduksiReport,
  'produksi-moulding-per-nomor-produksi': produksiMouldingPerNomorProduksiReport,
  'produksi-packing-per-nomor-produksi': produksiPackingPerNomorProduksiReport,
  'produksi-s4s-per-nomor-produksi': produksiS4SPerNomorProduksiReport,
  'produksi-sanding-per-nomor-produksi': produksiSandingPerNomorProduksiReport,
  'produksi-cc-akhir-per-nomor-produksi': ProduksiCcAkhirPerNomorProduksiReport,
  'produksi-per-spk': produksiPerSpkReport,
  'rekap-rendemen-non-rambung': rekapRendemenNonRambungReport,
  'rekap-rendemen-rambung': rekapRendemenRambungReport,
  'rendemen-semua-proses': rendemenSemuaProsesReport,
  'dashboard-s4s': dashboardS4SReport,
  'dashboard-s4s-v2': dashboardS4SV2Report,
  'grade-abc-harian': gradeAbcHarianReport,
  'ketahanan-barang-s4s': ketahananBarangS4sReport,
  'label-s4s-hidup-per-jenis-kayu': labelS4SHidupPerJenisKayuReport,
  'label-s4s-hidup-per-produk-per-jenis-kayu': labelS4SHidupPerProdukPerJenisKayuReport,
  'mutasi-s4s': mutasiS4sReport,
  'output-produksi-s4s-per-grade': outputProduksiS4SPerGradeReport,
  'rekap-produksi-s4s-rambung-per-grade': rekapProduksiS4SRambungPerGradeReport,
  'produksi-hulu-hilir': produksiHuluHilirReport,
  'produksi-semua-mesin': produksiSemuaMesinReport,
  'rekap-mutasi': rekapMutasiReport,
  'rekap-mutasi-cross-tab': rekapMutasiCrossTabReport,
  'rekap-stock-on-hand': rekapStockOnHandReport,
  'stock-hidup-per-nospk': stockHidupPerNoSpkReport,
  'stock-hidup-per-nospk-discrepancy': stockHidupPerNoSpkDiscrepancyReport,
  'laminating-hidup-detail': laminatingHidupDetailReport,
  'ketahanan-barang-laminating': ketahananBarangLaminatingReport,
  'ketahanan-barang-moulding': ketahananBarangMouldingReport,
  'moulding-hidup-detail': mouldingHidupDetailReport,
  'mutasi-laminating': mutasiLaminatingReport,
  'mutasi-moulding': mutasiMouldingReport,
  'rekap-produksi-laminating-consolidated': rekapProduksiLaminatingConsolidatedReport,
  'rekap-produksi-laminating-per-jenis-per-grade': rekapProduksiLaminatingPerJenisPerGradeReport,
  'rekap-produksi-moulding-consolidated': rekapProduksiMouldingConsolidatedReport,
  'rekap-produksi-moulding-per-jenis-per-grade': rekapProduksiMouldingPerJenisPerGradeReport,
  'umur-laminating-detail': umurLaminatingDetailReport,
  'umur-moulding-detail': umurMouldingDetailReport,
  'finger-joint-hidup-detail': fingerJointHidupDetailReport,
  'ketahanan-barang-finger-joint': ketahananBarangFingerJointReport,
  'dashboard-reproses': dashboardReprosesReport,
  'ketahanan-barang-cc-akhir': ketahananBarangCcAkhirReport,
  'ketahanan-barang-reproses': ketahananBarangReprosesReport,
  'mutasi-cross-cut-akhir': mutasiCrossCutAkhirReport,
  'mutasi-finger-joint': mutasiFingerJointReport,
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
  'rekap-produksi-finger-joint-consolidated': rekapProduksiFingerJointConsolidatedReport,
  'rekap-produksi-finger-joint-per-jenis-per-grade': rekapProduksiFingerJointPerJenisPerGradeReport,
  'saldo-barang-jadi-hidup-per-jenis-per-produk': saldoBarangJadiHidupPerJenisPerProdukReport,
  'umur-barang-jadi-detail': umurBarangJadiDetailReport,
  'umur-cross-cut-akhir-detail': umurCrossCutAkhirDetailReport,
  'umur-finger-joint-detail': umurFingerJointDetailReport,
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
  's4s-hidup-detail': s4sHidupDetailReport,
  'umur-s4s-detail': umurS4SDetailReport,
  'rekap-produksi-s4s-consolidated': rekapProduksiS4SConsolidatedReport,
  'rekap-produksi-s4s-per-jenis-per-grade':
    rekapProduksiS4SPerJenisPerGradeReport,
  'dashboard-sanding': dashboardSandingReport,
  'ketahanan-barang-sanding': ketahananBarangSandingReport,
  'mutasi-sanding': mutasiSandingReport,
  'rekap-produksi-sanding-consolidated': rekapProduksiSandingConsolidatedReport,
  'rekap-produksi-sanding-per-jenis-per-grade':
    rekapProduksiSandingPerJenisPerGradeReport,
  'sanding-hidup-detail': sandingHidupDetailReport,
  'umur-sanding-detail': umurSandingDetailReport,
  'bahan-terpakai': bahanTerpakaiReport,
  'bahan-yang-dihasilkan': bahanYangDihasilkanReport,
  'label-nyangkut': labelNyangkutReport,
  'rangkuman-bongkar-susun': rangkumanBongkarSusunReport,
  'rangkuman-jumlah-label-input': rangkumanJumlahLabelInputReport,
  'kapasitas-racip-kayu-bulat-hidup': kapasitasRacipKayuBulatHidupReport,
  'mutasi-sawn-timber-ton': mutasiSawnTimberTonReport,
  'mutasi-kd': mutasiKdReport,
  'dashboard-sawn-timber': dashboardSawnTimberReport,
  'kd-keluar-masuk': kdKeluarMasukReport,
  'kd-upah-per-customer': kdUpahPerCustomerReport,
  'kd-upah-per-no-proc-kd-detail': kdUpahPerNoProcKdDetailReport,
  'ketahanan-barang-st': ketahananBarangStReport,
  'label-st-hidup-detail': labelStHidupDetailReport,
  'lembar-perhitungan-upah-borongan-sawmill': lembarPerhitunganUpahBoronganSawmillReport,
  'pemakaian-obat-vacuum': pemakaianObatVacuumReport,
  'pembelian-st-per-supplier-ton': pembelianStPerSupplierReport,
  'pembelian-st-timeline-ton': pembelianStTimelineReport,
  'penerimaan-st-sawmill-kg': penerimaanStSawmillKgReport,
  'qc-sawmill': qcSawmillReport,
  'qc-sawmill-discrepancy': qcSawmillDiscrepancyReport,
  'qc-sawmill-summary': qcSawmillSummaryReport,
  'rekap-st-penjualan': rekapStPenjualanReport,
  'saldo-st-hidup-per-produk': saldoStHidupPerProdukReport,
  'serah-terima-st-kamar-kd': serahTerimaStKamarKdReport,
  'spk-sawmill': spkSawmillReport,
  'st-sawmill-masuk-per-group': stSawmillMasukPerGroupReport,
  'st-basah-hidup-per-umur-kayu-ton': stBasahHidupPerUmurKayuTonReport,
  'st-hidup-kering': stHidupKeringReport,
  'st-hidup-per-spk': stHidupPerSpkReport,
  'st-masuk-per-group': stMasukPerGroupReport,
  'st-rambung-mc1-mc2-detail': stRambungMc1Mc2DetailReport,
  'rekap-hasil-sawmill-per-meja': rekapHasilSawmillPerMejaReport,
  'rekap-hasil-sawmill-per-meja-semua-meja': rekapSawmillPerMejaSemuaMejaReport,
  'rekap-hasil-sawmill-per-meja-upah-borongan': rekapSawmillPerMejaUpahBoronganReport,
  'rekap-kamar-kd': rekapKamarKdReport,
  'rekap-produktivitas-sawmill': rekapProduktivitasSawmillReport,
  'penerimaan-st-hasil-sawmill': penerimaanStHasilSawmillReport,
  'rekap-penerimaan-st-non-rambung': rekapPenerimaanStNonRambungReport,
}
