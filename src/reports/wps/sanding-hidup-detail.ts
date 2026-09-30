import { createHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapSandingHidupDetail — "Laporan Sanding (Hidup) Detail".
 *
 * Live snapshot (the SP takes no parameters), built through the same factory as
 * the Cross Cut Akhir, Finger Joint and Laminating detail reports: DateCreate ->
 * Tanggal, IdLokasi -> Lokasi, "Jenis - NamaGrade" in the Jenis column, sorted
 * Tanggal DESC then NoSanding ASC, with a closing M3 total.
 *
 * The item number column is NoSanding — the same name the mutasi and per-SPK
 * reports already read — and the volume is Kubik, matching the Cross Cut Akhir
 * and Laminating procedures. Only those two names are assumptions here; the
 * rest is the shared family layout.
 */

export const sandingHidupDetailReport = createHidupDetailReport({
  type: "sanding-hidup-detail",
  title: "Laporan Sanding (Hidup) Detail",
  storedProcedure: "SP_LapSandingHidupDetail",
  numberColumn: "NoSanding",
  volumeColumn: "Kubik",
  labels: {
    number: "No Sanding",
    spk: "No SPK",
    batang: "Jmlh Batang",
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "34px",
    number: "88px",
    tanggal: "76px",
    spk: "74px",
    tebal: "44px",
    lebar: "50px",
    panjang: "56px",
    batang: "80px",
    m3: "56px",
    lokasi: "54px",
  },
  style: "sanding_hidup_detail",
});
