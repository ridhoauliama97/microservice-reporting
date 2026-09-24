import { createSingleTableReport } from "./template";
import { formatNumber } from "../../templates/html";

/**
 * SP_Mutasi_KayuBulatKGV2 — "Laporan Mutasi Kayu Bulat (Gantung) - Timbang KG".
 * Identical shape to mutasi-kayu-bulat-kg; the V2 SP accounts for the gantung
 * (hanging) flow and returns SaldoKeluar as decimal(38,15), so every saldo is
 * rendered with 2 decimals (thousand separator on the integer part only).
 */
const fmt2 = (value: number | null | undefined): string => formatNumber(value, 2);

export const mutasiKayuBulatKgGantungReport = createSingleTableReport({
  type: "mutasi-kayu-bulat-kg-gantung",
  title: "Mutasi Kayu Bulat (Gantung) - Timbang KG",
  spName: "SP_Mutasi_KayuBulatKGV2",
  columns: [
    { label: "No", kind: "no", width: "30px" },
    { label: "Jenis", kind: "label", field: "Jenis", width: "180px" },
    { label: "Saldo Awal", kind: "number", field: "SaldoAwal", format: fmt2 },
    { label: "Saldo Masuk", kind: "number", field: "SaldoMasuk", format: fmt2 },
    { label: "Saldo Keluar", kind: "number", field: "SaldoKeluar", format: fmt2 },
    { label: "Saldo Jual", kind: "number", field: "SaldoJual", format: fmt2 },
    { label: "Saldo Akhir", kind: "number", field: "SaldoAkhir", bold: true, format: fmt2 },
  ],
  totals: true,
});
