import { createSingleTableReport } from "./template";

/** Standard period SP (@TglAwal/@TglAkhir). The SP returns its NoKayuBulat
 * column twice, so the driver hands it over as an array — the template
 * renders the first value. */
export const kayuBulatHidupReport = createSingleTableReport({
  type: "kayu-bulat-hidup",
  title: "Laporan Kayu Bulat Hidup",
  spName: "SPWps_LapkayuBulatHidup",
  columns: [
    { label: "No Kayu Bulat", kind: "label", field: "NoKayuBulat" },
    { label: "Tanggal Masuk", kind: "date", field: "DateCreate" },
    { label: "Supplier", kind: "label", field: "NmSupplier" },
    { label: "No Truk", kind: "label", field: "NoTruk" },
    { label: "Jenis", kind: "label", field: "Jenis" },
    { label: "Pcs", kind: "int", field: "Pcs" },
    { label: "Blk Tepakai", kind: "int", field: "BlkTepakai" },
  ],
  totals: true,
});
