import { createSingleDateTableReport } from "./template";
import { formatTrimmed } from "../../templates/html";

/**
 * "As of" daily report — the SP takes only @EndDate, body params are a
 * single { tgl }. Columns follow the legacy report: non-Masuk columns
 * first, then Masuk; Masuk and Jlh Batang render bold; the totals row
 * shows only the Masuk total (colspan covers the other columns).
 */
export const hasilOutputRacipHarianReport = createSingleDateTableReport({
  type: "hasil-output-racip-harian",
  title: "Laporan Hasil Output Racip Harian",
  spName: "SP_LapHasilOutputRacipHarian",
  inputName: "EndDate",
  columns: [
    { label: "No", kind: "no", width: "40px" },
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "Tebal (mm)", kind: "number", field: "Tebal", sumInTotal: false, format: formatTrimmed },
    { label: "Lebar (mm)", kind: "number", field: "Lebar", sumInTotal: false, format: formatTrimmed },
    { label: "Panjang (ft)", kind: "number", field: "Panjang", sumInTotal: false, format: formatTrimmed },
    { label: "Jumlah Batang (pcs)", kind: "int", field: "JlhBtg", bold: true },
    { label: "Masuk", kind: "number", field: "Masuk", bold: true },
  ],
  totals: { label: "Total", colspan: 6 },
});
