import { createKetahananReport } from './ketahanan'

/**
 * SP_LapKetahananBarangST — "Laporan Ketahanan Barang Dagang ST". Ported from
 * open-api-report's KetahananBarangDagangStReportService and
 * reports/sawn-timber/ketahanan-barang-st-pdf.blade.php.
 *
 * The layout is the stock-coverage table the m3 reports already use, so the
 * shared factory renders it: No, Jenis, Stock, Penjualan, Avg Penjualan,
 * Ketahanan, two decimals with no thousands separator, and a "-" for zero.
 *
 * Only the source columns differ. The reference resolves them by candidate
 * match against the result keys, which lands on StockTon and Ton:
 *
 *   Stock     <- Stock, Stok, Saldo, StockTon, StokTon
 *   Penjualan <- Penjualan, Jual, Ton, TonJual
 *
 * SP_LapKetahananBarangST returns exactly Jenis, StockTon, Ton - verified
 * against the live database. Ton was the non-null movement column and
 * StockTon the balance, so the mapping is Stock=StockTon, Penjualan=Ton.
 *
 * Two derivations the reference makes, reproduced by the factory:
 *
 *   - Avg Penjualan is NOT Penjualan divided by the number of days. The SP
 *     provides no average column, so the reference falls back to Penjualan
 *     itself, and says so in a comment. Dividing by the period length would be
 *     the more usual reading of the column name and would be wrong here.
 *   - Ketahanan is derived, Stock / Avg Penjualan, and is 0 when the average is
 *     0 rather than a division by zero.
 *
 * Binds @StartDate / @EndDate, the same names the factory already uses.
 */

export const ketahananBarangStReport = createKetahananReport({
  type: 'ketahanan-barang-st',
  title: 'Laporan Ketahanan Barang Dagang ST',
  storedProcedure: 'SP_LapKetahananBarangST',
  stockField: 'StockTon',
  salesField: 'Ton',
})
