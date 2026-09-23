import { createPenerimaanTonReport } from "./penerimaan-kayu-bulat-ton";

/** Penerimaan kayu bulat INT (Ton) — legacy form layout for one NoKayuBulat. */
export const penerimaanKayuBulatIntTonReport = createPenerimaanTonReport({
  type: "penerimaan-kayu-bulat-int-ton",
  title: "Laporan Penerimaan Kayu Bulat - Int Ton",
  spName: "SP_PenKBInTon",
});
