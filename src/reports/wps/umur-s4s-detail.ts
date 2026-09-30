import { createUmurDetailReport } from "./umur-detail";

/**
 * SP_LapUmurS4S — "Laporan Umur S4S Detail".
 *
 * Same five age buckets, the same grouping by Jenis + dimensions, the same
 * zero-row removal and the same sort as the Cross Cut Akhir, Finger Joint,
 * Laminating and Moulding ageing reports, so the shared factory is used. The
 * four cut-offs are passed as Umur1..Umur4 and the procedure returns Period1..5.
 *
 * The dimension headers are spelled with units, as in the Laminating and
 * Moulding blades. The column widths are those of the Moulding variant; the
 * only assumption here is the header text, since no reference layout for this
 * particular procedure is available in the repo.
 */

export const umurS4SDetailReport = createUmurDetailReport({
  type: "umur-s4s-detail",
  title: "Laporan Umur S4S Detail",
  storedProcedure: "SP_LapUmurS4S",
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
  style: "umur_s4s_detail",
});
