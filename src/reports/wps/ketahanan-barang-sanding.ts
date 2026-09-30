import { createKetahananReport } from "./ketahanan";

/**
 * SP_LapKetahananBarangSanding — "Laporan Ketahanan Barang Dagang Sanding".
 *
 * The SP is expected to return the same Jenis / Stockm3 / m3 shape as the Cross
 * Cut Akhir, Finger Joint, Laminating and Moulding Ketahanan reports, so the
 * shared factory is used: Stock <- Stockm3, Penjualan <- m3, Avg Penjualan
 * falls back to Penjualan, and Ketahanan is derived as Stock / Avg Penjualan
 * when the procedure omits it.
 *
 * Only the stored procedure and the title differ. Nothing product-specific is
 * configured, so nothing here is an assumption.
 */

export const ketahananBarangSandingReport = createKetahananReport({
  type: "ketahanan-barang-sanding",
  title: "Laporan Ketahanan Barang Dagang Sanding",
  storedProcedure: "SP_LapKetahananBarangSanding",
});
