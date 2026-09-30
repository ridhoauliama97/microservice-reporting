import { createDashboardPivotReport } from './dashboard-pivot'

/**
 * SPWps_LapDashboardSawnTimber — "Laporan Dashboard Sawn Timber". Ported from
 * open-api-report's DashboardSawnTimberReportService and
 * dashboard/sawn-timber-pdf.blade.php.
 *
 * Same grid as the Cross Cut Akhir, Finger Joint, Moulding and Laminating
 * dashboards - one row per day, a Masuk/Keluar pair per Jenis, then the S Akhir
 * and # Ctr footer and a small total table - so the shared pivot is reused and
 * only the procedure and the source columns differ.
 *
 * The source columns are NOT the obvious ones. The procedure returns 17 columns
 * and the reference resolves them by exact match against a candidate list,
 * walking the result keys in order, which lands on:
 *
 *   date    DATE       (not a Tgl/date pair)
 *   type    Jenis      (idJenis is an id, not the label)
 *   in      Masuk      - NOT MasukALL; "Masuk" comes first in the key order and
 *                        matches the candidate "masuk" exactly
 *   out     Keluar     - NOT KeluarALL, same reason
 *   s akhir Akhir      - NOT Akhir2, same reason
 *   ctr     CTR
 *
 * MasukALL / KeluarALL / Akhir2 are present but unused by the reference view.
 * Verified against the live database: for August 2026 the per-jenis Masuk sums
 * to 5.8728 t while MasukALL sums to 5.9279 t over 31 rows, so the two are not
 * interchangeable and picking the wrong one changes the number on the page.
 *
 * The ending balance takes the latest date's Akhir per Jenis, not the sum of the
 * column: Akhir is a running balance, so summing it would multiply the stock by
 * the number of days in the period.
 *
 * ctr_divisor is 75 for this dashboard, not the 65 the m3 dashboards use. It is
 * only the fallback for a procedure without a CTR column, and this one has CTR.
 *
 * One difference from the reference worth naming: the reference expands the
 * date axis to every day in the requested range, so a day with no movement
 * anywhere still gets a row of zeros. The shared pivot shows the dates the
 * procedure returned. For this procedure that is every day anyway - 310 rows
 * over 10 Jenis in August 2026 is 31 complete days - so the output matches, and
 * reusing the shared pivot keeps the five other dashboards consistent.
 */

/** Legacy `type_order` from config/reports.php. */
const COLUMN_ORDER = [
  'JABON',
  'JABON MERAH',
  'JABON TG',
  'KAYU LAT JABON',
  'KAYU LAT PULAI',
  'KAYU LAT RAMBUNG',
  'PULAI',
  'RAMBUNG - MC 1',
  'RAMBUNG - MC 2',
  'RAMBUNG - STD',
  'SEMBARANG',
]

export const dashboardSawnTimberReport = createDashboardPivotReport({
  type: 'dashboard-sawn-timber',
  title: 'Laporan Dashboard Sawn Timber',
  storedProcedure: 'SPWps_LapDashboardSawnTimber',
  columns: {
    inflow: 'Masuk',
    outflow: 'Keluar',
    balance: 'Akhir',
    ctr: 'CTR',
  },
  columnOrder: COLUMN_ORDER,
  ctrDivisor: 75,
  style: 'dashboard_sawn_timber',
  // Ten ST types, so 21 columns: portrait only just fits them and the figures
  // end up cramped.
  landscape: true,
})
