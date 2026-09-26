import { createDashboardPivotReport } from "./dashboard-pivot";

/**
 * SPWps_LapDashboardLaminating — "Laporan Dashboard Laminating". Ported from
 * DashboardLaminatingReportService and laminating-pdf.blade.php.
 *
 * Same layout and legacy column semantics as the Cross Cut Akhir and Finger
 * Joint dashboards: LmtMasuk for daily inflow, KeluarALL for daily outflow,
 * LmtAkhir for the latest ending balance, and CTR summed across the period.
 * The pivot is shared with those two; only the SP and source columns differ.
 *
 * Column order and ctr_divisor come from legacy config/reports.php
 * `dashboard_laminating`. The live data stores the grade as "FJLB A/A", which
 * the shared normalisation rewrites to "FILB A/A" so it lands on the
 * configured column key.
 */

const COLUMN_ORDER = [
  "JABON FILB A/A",
  "JABON FILB C/C",
  "JABON TASOBO",
  "PULAI NISOBO",
  "PULAI TASOBO",
  "RAMBUNG FILB A/A",
  "RAMBUNG FILB A/B",
  "RAMBUNG FILB C/C",
];

export const dashboardLaminatingReport = createDashboardPivotReport({
  type: "dashboard-laminating",
  title: "Laporan Dashboard Laminating",
  storedProcedure: "SPWps_LapDashboardLaminating",
  columns: {
    inflow: "LmtMasuk",
    outflow: "KeluarALL",
    balance: "LmtAkhir",
    ctr: "CTR",
  },
  columnOrder: COLUMN_ORDER,
  ctrDivisor: 65,
  style: "dashboard_laminating",
});
