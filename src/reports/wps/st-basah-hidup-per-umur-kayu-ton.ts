import { createSnapshotTableReport } from "./template";

/**
 * SP_LapSTBasahHidupPerUmurKayu — "Laporan ST Basah Hidup Per-Umur Kayu
 * (Ton)". Ported from open-api-report's
 * StBasahHidupPerUmurKayuTonReportService +
 * st-basah-hidup-per-umur-kayu-ton-pdf.blade.php.
 *
 * Live snapshot: one row per Kayu Bulat group, tonnage bucketed into five
 * age ranges. The "Total" column is derived here (sum of the five buckets),
 * and the same tonnage is summed in the grand-total row.
 */
export const stBasahHidupPerUmurKayuTonReport = createSnapshotTableReport({
  type: "st-basah-hidup-per-umur-kayu-ton",
  title: "Laporan ST Basah Hidup Per-Umur Kayu (Ton)",
  spName: "SP_LapSTBasahHidupPerUmurKayu",
  columns: [
    { label: "No", kind: "no", width: "18px" },
    { label: "Group", kind: "label", field: "Group", width: "100px" },
    { label: "≤ 2 Minggu", kind: "number", field: "Ton2WkLess", width: "70px" },
    { label: "2 - 4 Minggu", kind: "number", field: "Ton2to4Wk", width: "70px" },
    { label: "4 - 6 Minggu", kind: "number", field: "Ton4to6Wk", width: "70px" },
    { label: "6 - 8 Minggu", kind: "number", field: "Ton6to8Wk", width: "70px" },
    { label: "> 8 Minggu", kind: "number", field: "Ton8WkMore", width: "70px" },
    { label: "Total", kind: "number", field: "Total", width: "70px" },
  ],
  totals: true,
  transformRows: (rows) =>
    rows.map((row) => ({
      ...row,
      Total:
        Number(row.Ton2WkLess ?? 0) +
        Number(row.Ton2to4Wk ?? 0) +
        Number(row.Ton4to6Wk ?? 0) +
        Number(row.Ton6to8Wk ?? 0) +
        Number(row.Ton8WkMore ?? 0),
    })),
});
