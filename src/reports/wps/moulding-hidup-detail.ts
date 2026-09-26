import { createPeriodHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapMouldingHidupDetail — "Laporan Moulding (Hidup) Detail". Ported from
 * open-api-report's MouldingHidupDetailReportService +
 * moulding-hidup-detail-pdf.blade.php.
 *
 * Unlike the Cross Cut Akhir and Laminating variants, whose SPs take no
 * parameters, this one accepts @StartDate / @EndDate, so the report is
 * period-filtered rather than a plain live snapshot. The legacy service takes
 * the same two optional dates; the legacy blade leaves the subtitle empty even
 * though the rows depend on them, so the period is printed here instead.
 */

export const mouldingHidupDetailReport = createPeriodHidupDetailReport({
  type: "moulding-hidup-detail",
  title: "Laporan Moulding (Hidup) Detail",
  storedProcedure: "SP_LapMouldingHidupDetail",
  numberColumn: "NoMoulding",
  volumeColumn: "M3",
  labels: {
    number: "No Moulding",
    spk: "No SPK",
    batang: "Jmlh Batang",
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "32px",
    number: "84px",
    tanggal: "76px",
    spk: "74px",
    tebal: "44px",
    lebar: "50px",
    panjang: "56px",
    batang: "80px",
    m3: "56px",
    lokasi: "54px",
  },
  style: "moulding_hidup_detail",
});
