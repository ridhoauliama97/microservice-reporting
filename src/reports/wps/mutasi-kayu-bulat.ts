import { createSingleTableReport } from "./template";

/**
 * Single stored procedure, single table — the standard WPS report shape.
 * All styling comes from the shared template; this file only declares data.
 */
export const mutasiKayuBulatReport = createSingleTableReport({
  type: "mutasi-kayu-bulat",
  title: "Mutasi Kayu Bulat",
  spName: "SP_Mutasi_KayuBulat",
  columns: [
    { label: "No", kind: "no", width: "30px" },
    { label: "Jenis", kind: "label", field: "Jenis", width: "180px" },
    { label: "Saldo Awal", kind: "number", field: "SaldoAwal" },
    { label: "Saldo Masuk", kind: "number", field: "SaldoMasuk" },
    { label: "Saldo Keluar", kind: "number", field: "SaldoKeluar" },
    { label: "Saldo Jual", kind: "number", field: "SaldoJual" },
    { label: "Saldo Akhir", kind: "number", field: "SaldoAkhir" },
  ],
  totals: true,
});
