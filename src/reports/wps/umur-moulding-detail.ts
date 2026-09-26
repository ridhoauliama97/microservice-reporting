import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurMoulding — "Laporan Umur Moulding Detail". Ported from
 * UmurMouldingDetailReportService and umur-moulding-detail-pdf.blade.php.
 *
 * Same five period buckets and the same legacy grouping/sorting as the Cross
 * Cut Akhir, Finger Joint and Laminating variants. Like Laminating, the blade
 * spells the dimension headers with units.
 */

export const umurMouldingDetailReport = createUmurDetailReport({
  type: "umur-moulding-detail",
  title: "Laporan Umur Moulding Detail",
  storedProcedure: "SP_LapUmurMoulding",
  labels: {
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "34px",
    jenis: "150px",
    tebal: "44px",
    lebar: "44px",
    panjang: "56px",
    bucket: "10%",
    total: "72px",
  },
  style: "moulding_hidup_detail",
});
