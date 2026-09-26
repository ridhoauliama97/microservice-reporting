import { createHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapFingerJointHidupDetail — "Laporan Finger Joint (Hidup) Detail".
 * Ported from open-api-report's FingerJointHidupDetailReportService +
 * finger-joint-hidup-detail-pdf.blade.php.
 *
 * Live snapshot (the SP takes no parameters). The legacy service applies the
 * same aliases and sort as the Cross Cut Akhir variant: DateCreate -> Tanggal,
 * IdLokasi -> Lokasi, and "Jenis - NamaGrade" in the Jenis column, sorted
 * Tanggal DESC then NoFJ ASC. The volume column is already M3 in this SP.
 */

export const fingerJointHidupDetailReport = createHidupDetailReport({
  type: "finger-joint-hidup-detail",
  title: "Laporan Finger Joint (Hidup) Detail",
  storedProcedure: "SP_LapFingerJointHidupDetail",
  numberColumn: "NoFJ",
  volumeColumn: "M3",
  labels: { number: "No FJ", spk: "NoSPK", batang: "Jmlh Batang" },
  widths: {
    no: "34px",
    number: "84px",
    tanggal: "84px",
    spk: "74px",
    tebal: "44px",
    lebar: "44px",
    panjang: "60px",
    batang: "72px",
    m3: "52px",
    lokasi: "54px",
  },
});
