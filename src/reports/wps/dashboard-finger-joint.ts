import { createDashboardPivotReport } from "./dashboard-pivot";

/**
 * SPWps_LapDashboardFJ — "Laporan Dashboard Finger Joint".
 *
 * Ported from DashboardFingerJointReportService and finger-joint-pdf.blade.php.
 * Same layout and same legacy column semantics as the Cross Cut Akhir
 * dashboard: FJMasuk for daily inflow, KeluarALL for daily outflow, FJAkhir
 * for the latest ending balance, and CTR summed across the period. No running
 * balance is recalculated from the individual movement columns.
 *
 * The pivot is shared with the Cross Cut Akhir dashboard; only the SP and the
 * source column names differ. Column order and ctr_divisor come from legacy
 * config/reports.php `dashboard_finger_joint`.
 */

const COLUMN_ORDER = [
  "JABON A/A",
  "JABON ISOBO",
  "JABON NISOBO",
  "JABON TG A/A",
  "PULAI ISOBO",
  "PULAI NISOBO",
  "RAMBUNG A/A",
  "RAMBUNG A/B",
  "RAMBUNG C/C",
];

export const dashboardFingerJointReport = createDashboardPivotReport({
  type: "dashboard-finger-joint",
  title: "Laporan Dashboard Finger Joint",
  storedProcedure: "SPWps_LapDashboardFJ",
  columns: {
    inflow: "FJMasuk",
    outflow: "KeluarALL",
    balance: "FJAkhir",
    ctr: "CTR",
  },
  columnOrder: COLUMN_ORDER,
  ctrDivisor: 65,
  style: "dashboard_finger_joint",
});
