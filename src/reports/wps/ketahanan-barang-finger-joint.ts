import { createKetahananReport } from "./ketahanan";

/**
 * SP_LapKetahananBarangFingerJoint — "Laporan Ketahanan Barang Dagang Finger
 * Joint". Ported from open-api-report's
 * KetahananBarangDagangFingerJointReportService +
 * ketahanan-barang-finger-joint-pdf.blade.php.
 *
 * Same Jenis / Stockm3 / m3 shape and same legacy layout as the Cross Cut
 * Akhir variant; only the stored procedure and the title differ.
 */

export const ketahananBarangFingerJointReport = createKetahananReport({
  type: "ketahanan-barang-finger-joint",
  title: "Laporan Ketahanan Barang Dagang Finger Joint",
  storedProcedure: "SP_LapKetahananBarangFingerJoint",
});
