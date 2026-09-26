import { createDashboardPivotReport } from "./dashboard-pivot";

/**
 * SPWps_LapDashboardMoulding — "Laporan Dashboard Moulding". Ported from
 * DashboardMouldingReportService and moulding-pdf.blade.php.
 *
 * Same layout and legacy column semantics as the Cross Cut Akhir, Finger Joint
 * and Laminating dashboards: MldMasuk for daily inflow, KeluarALL for daily
 * outflow, MldAkhir for the latest ending balance, and CTR summed across the
 * period. Column order and ctr_divisor come from legacy config/reports.php
 * `dashboard_moulding`.
 */

const COLUMN_ORDER = [
  "JABON A/A",
  "JABON ISOBO",
  "JABON NISOBO",
  "JABON TASOBO",
  "PULAI ISOBO",
  "PULAI NISOBO",
  "PULAI TASOBO",
  "RAMBUNG A/A",
  "RAMBUNG A/B",
  "RAMBUNG C/C",
];

export const dashboardMouldingReport = createDashboardPivotReport({
  type: "dashboard-moulding",
  title: "Laporan Dashboard Moulding",
  storedProcedure: "SPWps_LapDashboardMoulding",
  columns: {
    inflow: "MldMasuk",
    outflow: "KeluarALL",
    balance: "MldAkhir",
    ctr: "CTR",
  },
  columnOrder: COLUMN_ORDER,
  ctrDivisor: 65,
  style: "dashboard_moulding",
});
