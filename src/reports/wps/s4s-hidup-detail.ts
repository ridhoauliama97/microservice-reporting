import { createHidupDetailReport } from "./hidup-detail";

/**
 * SP_LapS4SHidupDetail — "Laporan Label S4S (Hidup)".
 *
 * Live snapshot: the SP takes no parameters, so the request has no date range
 * and the page carries no subtitle — same as the Laminating, Cross Cut Akhir
 * and Finger Joint variants of this family.
 *
 * Shares the family normalisation: DateCreate -> Tanggal, IdLokasi -> Lokasi,
 * "Jenis - NamaGrade" in the Jenis column, sorted Tanggal DESC then the item
 * number ASC, and a closing M3 total.
 *
 * Column names follow the family: the item number is NoS4S (as NoCCAkhir,
 * NoFJ, NoLaminating and NoSanding are for the other products) and the volume
 * is Kubik, which is what the Cross Cut Akhir and Laminating procedures
 * return. Both are the one assumption in this file — if the procedure names
 * them differently, only `numberColumn` / `volumeColumn` below need changing.
 */

export const s4sHidupDetailReport = createHidupDetailReport({
  type: "s4s-hidup-detail",
  title: "Laporan Label S4S (Hidup)",
  storedProcedure: "SP_LapS4SHidupDetail",
  numberColumn: "NoS4S",
  volumeColumn: "Kubik",
  labels: {
    number: "No S4S",
    spk: "No SPK",
    batang: "Jmlh Batang",
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "34px",
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
  style: "s4s_hidup_detail",
});
