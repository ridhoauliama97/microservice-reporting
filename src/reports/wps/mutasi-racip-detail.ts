import { createSingleTableReport } from "./template";
import { formatTrimmed } from "../../templates/html";

/**
 * Standard period SP (@TglAwal/@TglAkhir), 17 columns -> landscape.
 * Grouped headers follow the legacy report: Saldo Awal (2), Masuk (4),
 * Keluar (4), Saldo Akhir (2); dimension columns are centered, rendered
 * without trailing zeros (like Jlh Batang) and not summed; AkhirJlhBtg
 * renders red when negative. Totals row covers everything after the
 * No/Jenis/dims columns (legacy colspan 5).
 */
export const mutasiRacipDetailReport = createSingleTableReport({
  type: "mutasi-racip-detail",
  title: "Laporan Mutasi Racip Detail",
  spName: "SPWps_LapMutasiRacipanDetail",
  landscape: true,
  columns: [
    { label: "No", kind: "no", width: "35px" },
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "Tebal (mm)", kind: "number", field: "Tebal", align: "center", sumInTotal: false, format: formatTrimmed },
    { label: "Lebar (mm)", kind: "number", field: "Lebar", align: "center", sumInTotal: false, format: formatTrimmed },
    { label: "Panjang\n(ft)", kind: "number", field: "Panjang", align: "center", sumInTotal: false, format: formatTrimmed },
    { label: "Awal", kind: "number", field: "Sawal", group: "Saldo Awal" },
    { label: "Jlh\nBatang", kind: "int", field: "SawalJlhBtg", group: "Saldo Awal", bold: true },
    { label: "Masuk", kind: "number", field: "Masuk", group: "Masuk" },
    { label: "Jlh\nBatang", kind: "int", field: "MskJlhBtg", group: "Masuk" },
    { label: "Adj Out", kind: "number", field: "AdjusmentOutput", group: "Masuk" },
    { label: "Jlh\nBatang", kind: "int", field: "AdjOutJlhBtg", group: "Masuk" },
    { label: "Keluar", kind: "number", field: "Keluar", group: "Keluar" },
    { label: "Jlh\nBatang", kind: "int", field: "KeluarJlhBtg", group: "Keluar" },
    { label: "Adj In", kind: "number", field: "AdjusmentInput", group: "Keluar" },
    { label: "Jlh\nBatang", kind: "int", field: "AdjInJlhBtg", group: "Keluar" },
    { label: "Akhir", kind: "number", field: "Akhir", group: "Saldo Akhir", bold: true },
    {
      label: "Jlh\nBatang",
      kind: "int",
      field: "AkhirJlhBtg",
      group: "Saldo Akhir",
      bold: true,
      colorNegative: true,
    },
  ],
  totals: { colspan: 5 },
});
