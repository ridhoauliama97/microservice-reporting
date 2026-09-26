import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurFingerJoint — "Laporan Umur Finger Joint Detail". Ported from
 * UmurFingerJointDetailReportService and umur-finger-joint-detail-pdf.blade.php.
 *
 * Same five period buckets and the same legacy layout as the Cross Cut Akhir
 * variant; only the stored procedure, the title and the column widths differ
 * (this blade uses px, the CCA one uses percentages).
 */

export const umurFingerJointDetailReport = createUmurDetailReport({
  type: "umur-finger-joint-detail",
  title: "Laporan Umur Finger Joint Detail",
  storedProcedure: "SP_LapUmurFingerJoint",
  widths: {
    no: "34px",
    jenis: "150px",
    tebal: "44px",
    lebar: "44px",
    panjang: "56px",
    // The legacy blade emits the age-bucket headers with no width at all.
    bucket: "",
    total: "72px",
  },
});
