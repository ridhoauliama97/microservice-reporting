import { createKetahananReport } from "./ketahanan";

/**
 * SP_LapKetahananBarangLaminating — "Laporan Ketahanan Barang Dagang
 * Laminating". Ported from open-api-report's
 * KetahananBarangDagangLaminatingReportService +
 * ketahanan-barang-laminating-pdf.blade.php.
 *
 * The SP returns the same Jenis / Stockm3 / m3 shape as the Cross Cut Akhir
 * and Finger Joint variants, and the legacy layout is identical too; only the
 * stored procedure and the title differ.
 */

export const ketahananBarangLaminatingReport = createKetahananReport({
  type: "ketahanan-barang-laminating",
  title: "Laporan Ketahanan Barang Dagang Laminating",
  storedProcedure: "SP_LapKetahananBarangLaminating",
});
