import { createHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapLaminatingHidupDetail — "Laporan Laminating (Hidup) Detail". Ported
 * from open-api-report's LaminatingHidupDetailReportService +
 * laminating-hidup-detail-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters). Same legacy aliases and sort as
 * the Cross Cut Akhir variant: DateCreate -> Tanggal, IdLokasi -> Lokasi, and
 * "Jenis - NamaGrade" in the Jenis column, sorted Tanggal DESC then NoLaminating
 * ASC. This blade spells the dimension headers with units, unlike the CCA and
 * Finger Joint ones.
 */

export const laminatingHidupDetailReport = createHidupDetailReport({
  type: "laminating-hidup-detail",
  title: "Laporan Laminating (Hidup) Detail",
  storedProcedure: "SP_LapLaminatingHidupDetail",
  numberColumn: "NoLaminating",
  volumeColumn: "Kubik",
  labels: {
    number: "No Laminating",
    spk: "No SPK",
    batang: "Jmlh Batang",
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "34px",
    number: "82px",
    tanggal: "76px",
    spk: "74px",
    tebal: "44px",
    lebar: "50px",
    panjang: "56px",
    batang: "80px",
    m3: "56px",
    lokasi: "54px",
  },
  style: "laminating_hidup_detail",
});
