import { createKetahananReport } from './ketahanan'

/**
 * SP_LapKetahananBarangS4S — "Laporan Ketahanan Barang Dagang S4S". Ported
 * from open-api-report's KetahananBarangDagangS4sReportService +
 * ketahanan-barang-s4s-pdf.blade.php.
 *
 * The SP returns the same Jenis / Stockm3 / m3 shape as the Cross Cut Akhir
 * and Finger Joint variants, and the legacy layout is identical too; only the
 * stored procedure and the title differ.
 */
export const ketahananBarangS4sReport = createKetahananReport({
  type: 'ketahanan-barang-s4s',
  title: 'Laporan Ketahanan Barang Dagang S4S',
  storedProcedure: 'SP_LapKetahananBarangS4S',
})
