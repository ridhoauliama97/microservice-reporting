import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurLaminating — "Laporan Umur Laminating Detail". Ported from
 * UmurLaminatingDetailReportService and umur-laminating-detail-pdf.blade.php.
 *
 * Same five period buckets and the same legacy grouping/sorting as the Cross
 * Cut Akhir and Finger Joint variants. This blade spells the dimension headers
 * with units and, unlike the Finger Joint one, gives the age buckets a width.
 */

export const umurLaminatingDetailReport = createUmurDetailReport({
  type: "umur-laminating-detail",
  title: "Laporan Umur Laminating Detail",
  storedProcedure: "SP_LapUmurLaminating",
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
  style: "umur_laminating_detail",
});
