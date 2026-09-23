import { createSingleTableReport } from "./template";

/**
 * Standard period SP (@TglAwal/@TglAkhir), same shape as the V1 mutasi —
 * legacy "Laporan Mutasi Kayu Bulat Gantung" (kayu-bulat-v2-pdf) bolds the
 * Saldo Akhir column.
 */
export const mutasiKayuBulatGantungReport = createSingleTableReport({
  type: "mutasi-kayu-bulat-gantung",
  title: "Laporan Mutasi Kayu Bulat Gantung",
  spName: "SP_Mutasi_KayuBulatV2B",
  columns: [
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "Saldo Awal", kind: "number", field: "SaldoAwal" },
    { label: "Saldo Masuk", kind: "number", field: "SaldoMasuk" },
    { label: "Saldo Keluar", kind: "number", field: "SaldoKeluar" },
    { label: "Saldo Jual", kind: "number", field: "SaldoJual" },
    { label: "Saldo Akhir", kind: "number", field: "SaldoAkhir", bold: true },
  ],
  totals: true,
});
