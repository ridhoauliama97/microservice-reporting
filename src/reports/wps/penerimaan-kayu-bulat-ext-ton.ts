import { createPenerimaanTonReport } from "./penerimaan-kayu-bulat-ton";

/** Penerimaan kayu bulat EXT (Ton) — legacy form layout for one NoKayuBulat. */
export const penerimaanKayuBulatExtTonReport = createPenerimaanTonReport({
  type: "penerimaan-kayu-bulat-ext-ton",
  title: "Laporan Penerimaan Kayu Bulat - Ext Ton",
  spName: "SP_PenKBOutTon",
});
