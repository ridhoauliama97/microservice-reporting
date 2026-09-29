import { createKetahananReport } from "./ketahanan";

/**
 * SP_LapKetahananBarangCCAkhir — "Laporan Ketahanan Barang Dagang CC Akhir"
 * (the user-facing name is "Laporan Ketahanan Barang Dagang Cross Cut Akhir").
 * Ported from open-api-report's
 * KetahananBarangDagangCrossCutAkhirReportService +
 * ketahanan-barang-cc-akhir-pdf.blade.php.
 */

export const ketahananBarangCcAkhirReport = createKetahananReport({
  type: "ketahanan-barang-cc-akhir",
  title: "Laporan Ketahanan Barang Dagang CC Akhir",
  storedProcedure: "SP_LapKetahananBarangCCAkhir",
});
