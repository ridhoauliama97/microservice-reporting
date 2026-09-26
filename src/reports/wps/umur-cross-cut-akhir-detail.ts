import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurCrossCutAkhir — "Laporan Umur CCAkhir Detail". Ported from
 * UmurCrossCutAkhirDetailReportService and umur-cc-akhir-detail-pdf.blade.php.
 */

export const umurCrossCutAkhirDetailReport = createUmurDetailReport({
  type: "umur-cross-cut-akhir-detail",
  title: "Laporan Umur CCAkhir Detail",
  storedProcedure: "SP_LapUmurCrossCutAkhir",
  widths: {
    no: "4%",
    jenis: "20%",
    tebal: "8%",
    lebar: "8%",
    panjang: "8%",
    bucket: "10%",
    total: "10%",
  },
});
