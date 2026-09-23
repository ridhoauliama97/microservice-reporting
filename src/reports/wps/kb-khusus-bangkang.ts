import { createSnapshotTableReport } from "./template";

/** Parameterless live snapshot — currently empty until bangkang usage data exists. */
export const kbKhususBangkangReport = createSnapshotTableReport({
  type: "kb-khusus-bangkang",
  title: "Laporan KB Khusus Bangkang",
  spName: "SP_LapKBKhususBangkang",
  columns: [
    { label: "No Kayu Bulat", kind: "label", field: "NoKayuBulat" },
    { label: "Tanggal Masuk", kind: "date", field: "DateCreate" },
    { label: "Tanggal Pemakaian", kind: "date", field: "DateUsage" },
    { label: "Supplier", kind: "label", field: "NmSupplier" },
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "No Truk", kind: "label", field: "NoTruk" },
    { label: "Qty", kind: "int", field: "Qty" },
    { label: "Ton", kind: "number", field: "Ton" },
  ],
  totals: true,
  emptyMessage: "Tidak ada data",
});
