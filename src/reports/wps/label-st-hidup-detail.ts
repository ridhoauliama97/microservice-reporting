import { createSnapshotTableReport } from './template'

/**
 * SP_LapLabelSTHidupDetail — "Laporan Label ST (Hidup) Detail". Ported from
 * open-api-report's LabelStHidupDetailReportService and
 * reports/sawn-timber/label-st-hidup-detail-pdf.blade.php.
 *
 * A live snapshot of Sawn Timber still on hand: the procedure takes no
 * parameters, so this report does neither. At the time of writing it returns
 * roughly 4900 rows.
 *
 * The reference picks each output column by candidate match rather than by
 * name, and two of those picks are not the obvious ones. Verified against the
 * live database, the procedure returns NoST, DateCreate, NoSPK, Jenis, Tebal,
 * Lebar, Panjang, JmlhBatang, Awal, IdLokasi:
 *
 *   Tanggal <- Date, Tanggal, Tgl, TglLaporan, DateCreate, TanggalST
 *              -> DateCreate, the fourth candidate and the only date present
 *   Lokasi  <- Lokasi, IdLokasi, Ruang, NoRuang, KodeLokasi -> IdLokasi
 *   Total   <- Total, Awal, Ton, TonST, TotalTon -> Awal
 *
 * "Awal" as the ton-like measure is deliberate: each label carries the volume
 * it was opened with, and the reference header prints the column as
 * "Total (Ton)".
 *
 * No totals row. The reference service does total the measure and returns it
 * as grand_total, but its blade never renders it, so the PDF has no total
 * line; the ported layout matches the PDF rather than the unused summary.
 */

/**
 * Reference $fmtDim: one decimal with a thousands separator, empty when the
 * value is missing. Board dimensions are whole millimetres and feet, so the
 * shared 4-decimal measure would print "20.0000" where the legacy view prints
 * "20.0".
 */
const fmtDim = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const [intPart, decPart] = value.toFixed(1).split('.');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + decPart;
};

export const labelStHidupDetailReport = createSnapshotTableReport({
  type: 'label-st-hidup-detail',
  title: 'Laporan Label ST (Hidup) Detail',
  spName: 'SP_LapLabelSTHidupDetail',
  columns: [
    { label: 'No', kind: 'no', width: '5%' },
    { label: 'No ST', kind: 'label', field: 'NoST', width: '10%' },
    { label: 'Tanggal', kind: 'date', field: 'DateCreate', width: '7%' },
    { label: 'No SPK', kind: 'label', field: 'NoSPK', width: '12%' },
    { label: 'Jenis', kind: 'label', field: 'Jenis', width: '15%' },
    // Board dimensions print with one decimal, not as a 4-decimal measure.
    { label: 'Tebal\n(mm)', kind: 'number', field: 'Tebal', width: '6%', format: fmtDim },
    { label: 'Lebar\n(mm)', kind: 'number', field: 'Lebar', width: '6%', format: fmtDim },
    { label: 'Panjang\n(ft)', kind: 'number', field: 'Panjang', width: '8%', format: fmtDim },
    { label: 'Jmlh Batang\n(pcs)', kind: 'int', field: 'JmlhBatang', width: '12%' },
    { label: 'Lokasi', kind: 'label', field: 'IdLokasi', width: '7%' },
    { label: 'Total\n(Ton)', kind: 'number', field: 'Awal', width: '10%', bold: true },
  ],
})
