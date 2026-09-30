import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurSanding — "Laporan Umur Sanding Detail".
 *
 * Same five age buckets and the same legacy grouping, zero-row removal and sort
 * as the other "Umur ... Detail" reports, so the shared factory is used.
 *
 * The dimension headers carry units, as in the Laminating and Moulding blades.
 * Header text and column widths are the one assumption in this file: there is
 * no reference layout for this procedure in the repo yet.
 */

export const umurSandingDetailReport = createUmurDetailReport({
  type: "umur-sanding-detail",
  title: "Laporan Umur Sanding Detail",
  storedProcedure: "SP_LapUmurSanding",
  labels: {
    tebal: "Tebal (mm)",
    lebar: "Lebar (mm)",
    panjang: "Panjang (ft)",
  },
  widths: {
    no: "34px",
    jenis: "150px",
    tebal: "44px",
    lebar: "44px",
    panjang: "56px",
    bucket: "10%",
    total: "72px",
  },
  style: "umur_sanding_detail",
});
