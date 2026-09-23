import { createSnapshotTableReport } from "./template";

/** Rasio cell: each group's share of the total living KB, e.g. "62.56%". */
function formatRasio(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${value.toFixed(2)}%`;
}

/** Parameterless live snapshot of the current living KB balance per group,
 * with each group's share (Rasio %) of the grand total. */
export const hidupKbPerGroupReport = createSnapshotTableReport({
  type: "hidup-kb-per-group",
  title: "Laporan Saldo Hidup Kayu Bulat Per Group",
  spName: "sp_LapHidupKBPerGroup",
  columns: [
    { label: "Group", kind: "label", field: "Group" },
    { label: "Ton", kind: "number", field: "Ton" },
    { label: "Rasio (%)", kind: "number", field: "Rasio", format: formatRasio },
  ],
  totals: true,
  transformRows(rows) {
    const total = rows.reduce(
      (sum, row) => sum + (typeof row.Ton === "number" && Number.isFinite(row.Ton) ? row.Ton : 0),
      0,
    );
    return rows.map((row) => ({
      ...row,
      Rasio:
        total > 0 && typeof row.Ton === "number" && Number.isFinite(row.Ton)
          ? (row.Ton / total) * 100
          : null,
    }));
  },
});
