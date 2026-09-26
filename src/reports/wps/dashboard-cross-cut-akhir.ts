import { createDashboardPivotReport } from "./dashboard-pivot";

/**
 * SPWps_LapDashboardCCAkhir — "Laporan Dashboard Cross Cut Akhir".
 *
 * Ported from DashboardCrossCutAkhirReportService and
 * cross-cut-akhir-pdf.blade.php. The service deliberately uses CCMasuk for
 * daily inflow, KeluarALL for daily outflow, CCAkhir for the latest ending
 * balance, and sums CTR across the period. It does not recalculate a running
 * balance from the individual movement columns.
 *
 * The pivot itself is shared with the Finger Joint dashboard; only the SP and
 * the source column names differ.
 */

const COLUMN_ORDER = [
  "JABON FILB A/A",
  "JABON FILB C/C",
  "JABON ISOBO",
  "JABON NISOBO",
  "PULAI ISOBO",
  "PULAI NISOBO",
  "PULAI TASOBO",
  "RAMBUNG A/B",
  "RAMBUNG C/C",
  "RAMBUNG FILB A/A",
  "RAMBUNG FILB A/B",
  "RAMBUNG FILB A/C",
  "RAMBUNG FILB C/C",
];

export const dashboardCrossCutAkhirReport = createDashboardPivotReport({
  type: "dashboard-cross-cut-akhir",
  title: "Laporan Dashboard Cross Cut Akhir",
  storedProcedure: "SPWps_LapDashboardCCAkhir",
  columns: {
    inflow: "CCMasuk",
    outflow: "KeluarALL",
    balance: "CCAkhir",
    ctr: "CTR",
  },
  columnOrder: COLUMN_ORDER,
  ctrDivisor: 65,
  style: "dashboard_cross_cut_akhir",
});
