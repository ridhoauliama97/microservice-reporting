import { createKetahananReport } from "./ketahanan";

/**
 * SP_LapKetahananBarangMoulding — "Laporan Ketahanan Barang Dagang Moulding".
 * Ported from open-api-report's KetahananBarangDagangMouldingReportService +
 * ketahanan-barang-moulding-pdf.blade.php.
 *
 * The SP returns the same Jenis / Stockm3 / m3 shape as the Cross Cut Akhir,
 * Finger Joint and Laminating variants, and the legacy layout is identical
 * too; only the stored procedure and the title differ.
 */

export const ketahananBarangMouldingReport = createKetahananReport({
  type: "ketahanan-barang-moulding",
  title: "Laporan Ketahanan Barang Dagang Moulding",
  storedProcedure: "SP_LapKetahananBarangMoulding",
});
