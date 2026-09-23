import { createSingleTableReport } from "./template";

/**
 * Standard period SP (@TglAwal/@TglAkhir). Labels follow the legacy report:
 * Sawal -> "Saldo Awal", AdjusmentInput/Output -> "Adjust Input/Output";
 * the Akhir column renders bold.
 */
export const mutasiHasilRacipReport = createSingleTableReport({
  type: "mutasi-hasil-racip",
  title: "Laporan Mutasi Hasil Racip",
  spName: "SPWps_LapMutasiHasilRacip",
  columns: [
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "Saldo Awal", kind: "number", field: "Sawal" },
    { label: "Masuk", kind: "number", field: "Masuk" },
    { label: "Keluar", kind: "number", field: "Keluar" },
    { label: "Adjust Input", kind: "number", field: "AdjusmentInput" },
    { label: "Adjust Output", kind: "number", field: "AdjusmentOutput" },
    { label: "Akhir", kind: "number", field: "Akhir", bold: true },
  ],
  totals: true,
});
