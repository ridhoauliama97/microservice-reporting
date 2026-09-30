import { createSingleTableReport } from './template'

/**
 * SP_Mutasi_ST — "Laporan Mutasi Sawn Timber (Ton)". Ported from
 * open-api-report's MutasiSTReportService and reports/mutasi/st-pdf.blade.php.
 *
 * Column names verified against the live database: Jenis, Awal, Masuk, Beli,
 * AdjustmentPlus, AdjustmentMinus, BongkarSusunPlus, BongkarSusunMinus, Jual,
 * Keluar, Akhir. The reference blade discovers its columns from whatever the
 * procedure returns; they are declared here instead so the OpenAPI spec can
 * publish them, and they are asserted in the tests so a change in the procedure
 * fails a test instead of quietly shifting a column.
 *
 * Four headers are renamed, as in the reference: the raw AdjustmentPlus style
 * names become Adjust (+), Adjust (-), B.Susun (+) and B.Susun (-).
 *
 * Every numeric column is totalled. Awal and Akhir are balances rather than
 * movements, so their "total" is a column sum like the reference produces - it
 * is what the reference prints, and a reader comparing it against the per-row
 * figures expects the same column sum.
 *
 * The reference also has an optional sub-report, but its procedure name is empty
 * by default (MUTASI_ST_SUB_REPORT_PROCEDURE), so no second table is rendered
 * here. Set the sub procedure name in the reference deployment and a second
 * table belongs with it.
 *
 * Takes @TglAwal and @TglAkhir, so this is a period report.
 */

export const mutasiSawnTimberTonReport = createSingleTableReport({
  type: 'mutasi-sawn-timber-ton',
  title: 'Laporan Mutasi Sawn Timber (Ton)',
  spName: 'SP_Mutasi_ST',
  inputNames: { tglAwal: 'TglAwal', tglAkhir: 'TglAkhir' },
  landscape: true,
  columns: [
    { label: 'No', kind: 'no', width: '30px' },
    { label: 'Jenis', kind: 'label', field: 'Jenis', width: '150px' },
    { label: 'Awal', kind: 'number', field: 'Awal' },
    { label: 'Masuk', kind: 'number', field: 'Masuk' },
    { label: 'Beli', kind: 'number', field: 'Beli' },
    { label: 'Adjust (+)', kind: 'number', field: 'AdjustmentPlus' },
    { label: 'Adjust (-)', kind: 'number', field: 'AdjustmentMinus' },
    { label: 'B.Susun (+)', kind: 'number', field: 'BongkarSusunPlus' },
    { label: 'B.Susun (-)', kind: 'number', field: 'BongkarSusunMinus' },
    { label: 'Jual', kind: 'number', field: 'Jual' },
    { label: 'Keluar', kind: 'number', field: 'Keluar' },
    { label: 'Akhir', kind: 'number', field: 'Akhir', bold: true },
  ],
  totals: true,
})
