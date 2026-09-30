import { createDashboardPivotReport } from "./dashboard-pivot";

/**
 * SPWps_LapDashboardSanding — "Laporan Dashboard Sanding".
 *
 * Same grid as the Cross Cut Akhir, Finger Joint, Moulding and Laminating
 * dashboards: one row per day, a Masuk/Keluar pair per Jenis + Grade, then the
 * S Akhir and # Ctr footer and a small total table. The shared pivot is reused;
 * only the procedure and the source columns differ.
 *
 * Column semantics follow the same pattern: SANDMasuk for daily inflow,
 * KeluarALL for daily outflow, SANDAkhir for the latest ending balance, and
 * CTR summed across the period (with a fallback of S Akhir / 65 when the
 * procedure has no CTR column). Those four names, the SAND spelling in
 * particular, come from the Sanding mutasi procedure already used by
 * rekap-mutasi.ts; adjust them here if this procedure spells them differently.
 *
 * `columnOrder` is intentionally empty: the legacy config column order for this
 * dashboard is not known, and the shared pivot appends whatever the procedure
 * returns in alphabetical order, so the report stays usable. Fill the list in
 * when the configured order is available.
 */

export const dashboardSandingReport = createDashboardPivotReport({
  type: "dashboard-sanding",
  title: "Laporan Dashboard Sanding",
  storedProcedure: "SPWps_LapDashboardSanding",
  columns: {
    inflow: "SANDMasuk",
    outflow: "KeluarALL",
    balance: "SANDAkhir",
    ctr: "CTR",
  },
  columnOrder: [],
  ctrDivisor: 65,
  style: "dashboard_sanding",
});
