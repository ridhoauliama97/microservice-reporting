import { createSingleTableReport, formatInt } from "./template";

/**
 * SP_Mutasi_KayuBulatKG — "Laporan Mutasi Kayu Bulat - Timbang KG".
 * Same shape as mutasi-kayu-bulat but the SP returns KG figures and
 * SaldoJual is null. formatInt = integer-with-separator, blank when ~zero
 * (legacy $fmt: number_format 0 + blankWhenZero).
 */
export const mutasiKayuBulatKgReport = createSingleTableReport({
  type: "mutasi-kayu-bulat-kg",
  title: "Mutasi Kayu Bulat - Timbang KG",
  spName: "SP_Mutasi_KayuBulatKG",
  columns: [
    { label: "No", kind: "no", width: "30px" },
    { label: "Jenis", kind: "label", field: "Jenis", width: "180px" },
    { label: "Saldo Awal", kind: "number", field: "SaldoAwal", format: formatInt },
    { label: "Saldo Masuk", kind: "number", field: "SaldoMasuk", format: formatInt },
    { label: "Saldo Keluar", kind: "number", field: "SaldoKeluar", format: formatInt },
    { label: "Saldo Jual", kind: "number", field: "SaldoJual", format: formatInt },
    { label: "Saldo Akhir", kind: "number", field: "SaldoAkhir", bold: true, format: formatInt },
  ],
  totals: true,
});
