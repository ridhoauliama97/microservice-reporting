import { createSingleTableReport, type ReportColumn } from "./template";

/**
 * Weight cell: >= 1000 → whole Kg with thousand separators (e.g. "3,760 Kg");
 * below 1000 → 4-decimal Ton (e.g. "0.3147 Ton"). Empty for null/near-zero.
 */
function formatBerat(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.0000001) return "";
  if (Math.abs(value) >= 1000) {
    const kg = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${kg} Kg`;
  }
  return `${value.toFixed(4)} Ton`;
}

/**
 * Single stored procedure, single table — the standard WPS report shape.
 * The SP binds its period to @StartDate/@EndDate, hence inputNames.
 * All styling comes from the shared template; this file only declares data.
 */
export const balokSudahSemprotReport = createSingleTableReport({
  type: "balok-sudah-semprot",
  title: "Laporan Balok Sudah Semprot",
  spName: "SP_LapBalokSudahSemprot",
  inputNames: { tglAwal: "StartDate", tglAkhir: "EndDate" },
  columns: [
    { label: "No Kayu Bulat", kind: "label", field: "NoKayuBulat" },
    { label: "Tanggal Masuk", kind: "date", field: "DateCreate" },
    { label: "Jam Masuk", kind: "label", field: "JamMasuk" },
    { label: "Supplier", kind: "label", field: "NmSupplier" },
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "No Truk", kind: "label", field: "NoTruk" },
    { label: "Type", kind: "label", field: "Type" },
    { label: "Jam Siap Bongkar", kind: "label", field: "JamSiapBongkar" },
    { label: "Tanggal Semprot", kind: "date", field: "TglSemprot" },
    { label: "Berat", kind: "number", field: "Berat", width: "78px", format: formatBerat },
  ],
  totals: false,
});
