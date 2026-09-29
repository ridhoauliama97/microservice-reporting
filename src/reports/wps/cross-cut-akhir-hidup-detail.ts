import { createHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapCCAkhirHidupDetail — "Laporan Cross Cut Akhir (Hidup) Detail". Ported
 * from open-api-report's CrossCutAkhirHidupDetailReportService +
 * cc-akhir-hidup-detail-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters). The legacy service:
 *  - aliases DateCreate -> Tanggal, IdLokasi -> Lokasi, Kubik -> M3;
 *  - renders "Jenis - NamaGrade" in the Jenis column ($jenisDisplay);
 *  - sorts Tanggal DESC, then NoCCAkhir ASC.
 * Column order follows the legacy blade (M3 comes before Lokasi here).
 */

export const crossCutAkhirHidupDetailReport = createHidupDetailReport({
  type: "cross-cut-akhir-hidup-detail",
  title: "Laporan Cross Cut Akhir (Hidup) Detail",
  storedProcedure: "SP_LapCCAkhirHidupDetail",
  numberColumn: "NoCCAkhir",
  volumeColumn: "Kubik",
  labels: { number: "No CC Akhir", spk: "No SPK", batang: "Jumlah Batang" },
  widths: {
    no: "32px",
    number: "84px",
    tanggal: "76px",
    spk: "74px",
    tebal: "44px",
    lebar: "50px",
    panjang: "56px",
    batang: "66px",
    m3: "56px",
    lokasi: "54px",
  },
});
