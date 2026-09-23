import { createSingleTableReport } from "./template";

/** M3 = Ton × 1.416 — the legacy WPS report's conversion factor. */
const TON_TO_M3_FACTOR = 1.416;

/**
 * Standard period SP (@TglAwal/@TglAkhir). Columns follow the legacy
 * report (No, Tanggal Masuk, Jenis Kayu, Supplier, Ton, M3 — both bold);
 * the SP's NoKayuBulat/DateUsage are not displayed.
 */
export const saldoKayuBulatReport = createSingleTableReport({
  type: "saldo-kayu-bulat",
  title: "Laporan Saldo Kayu Bulat",
  spName: "SPWps_LapSaldoKayuBulat",
  columns: [
    { label: "No", kind: "no", width: "35px" },
    { label: "Tanggal Masuk", kind: "date", field: "DateCreate" },
    { label: "Jenis Kayu", kind: "label", field: "Jenis", width: "140px" },
    { label: "Supplier", kind: "label", field: "NmSupplier" },
    { label: "Ton", kind: "number", field: "Ton", width: "85px", bold: true },
    { label: "M3", kind: "number", field: "M3", width: "85px", bold: true },
  ],
  totals: { label: "Total (Ton)" },
  transformRows(rows) {
    return rows.map((row) => ({
      ...row,
      M3:
        typeof row.Ton === "number" && Number.isFinite(row.Ton)
          ? row.Ton * TON_TO_M3_FACTOR
          : null,
    }));
  },
});
