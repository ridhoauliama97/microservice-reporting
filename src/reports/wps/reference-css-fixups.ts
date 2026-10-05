/**
 * Hand-written corrections appended to a few of the legacy stylesheets.
 *
 * `reference-css.ts` is generated (see `scripts/generate-reference-css.ts`), and
 * its sheets are lifted verbatim from open-api-report's blades. A handful of
 * those sheets say things that resolve differently under Chromium than they did
 * under wkhtmltopdf, or that read badly at Gotenberg's font sizes. Those
 * corrections cannot be derived from the blade - they are decisions - so they
 * live here, next to the generated file, each with the reason it exists.
 *
 * Keyed by the registry `type`, so the generator can look one up by name. The
 * grid closure every sheet receives is NOT here: it is a single shared block in
 * the generator.
 */

export const REFERENCE_CSS_FIXUPS: Record<string, string> = {
  'rekap-st-penjualan': `
/* The sheet zeroes border-left on every first cell and never puts a bottom rule
   on the totals row, which left the Grand Total band open on two sides. */
table.data-table tbody tr.row-odd td { background: #c9d1df; }
table.data-table tbody tr.row-even td { background: #eef2f8; }
table.data-table tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; font-weight: bold; font-size: 11px; }
table.data-table tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
table.data-table tbody tr.grand-total-row > td { border: 1px solid #000 !important; }
table.data-table tbody tr.grand-total-row > td:first-child { border-left: 1px solid #000 !important; }`,

  'saldo-st-hidup-per-produk': `
.report-table-total tbody tr.totals-row td { border-bottom: 1px solid #000 !important; }
.report-table-total tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }`,

  'serah-terima-st-kamar-kd': `
table.data-table > tbody > tr > td { border-right: 1px solid #000; }
table.data-table > tbody > tr > td:nth-child(2) { border-right: 1px solid #000 !important; }
table.data-table > tbody > tr > td:nth-child(3) { border-right: 1px solid #000 !important; }
table.data-table tfoot td { border: 1px solid #000 !important; }`,

  'spk-sawmill': `
.meta-table td, .size-table td, .size-table th,
.racip-table td, .racip-table th { font-size: 10px !important; }`,

  'st-sawmill-masuk-per-group': `
table > tbody > tr > td[rowspan] { border-right: 1px solid #000 !important; }
table > tbody > tr > td:first-child,
table > tbody > tr > td:nth-child(2),
table > tbody > tr > td:nth-child(3) { border-right: 1px solid #000 !important; }
tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; font-weight: bold; font-size: 11px; }
tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }`,

  'st-rambung-mc1-mc2-rangkuman': `
table.data-table tbody tr.row-odd td { background: #c9d1df; }
table.data-table tbody tr.row-even td { background: #eef2f8; }
table.data-table tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; font-weight: bold; font-size: 11px; }
table.data-table tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
/* The sheet zeroes border-left on every first cell and never puts a bottom rule
   on the totals row, which left the Grand Total band open on two sides. */
table.data-table tbody tr.grand-total-row > td { border: 1px solid #000 !important; }
table.data-table tbody tr.grand-total-row > td:first-child { border-left: 1px solid #000 !important; }`,

  'st-sawmill-hari-tebal-lebar': `
table > tbody > tr > td[rowspan], table > thead > tr > th[rowspan] { border-right: 1px solid #000 !important; }
table > tbody > tr > td:first-child, table > tbody > tr > td:nth-child(2) { border-right: 1px solid #000 !important; }
.rangkuman-table tbody tr td:first-child { border-right: 1px solid #000 !important; }
.rangkuman-table tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; }
.rangkuman-table tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }`,

  'stock-st-basah': `
/* Jenis sits flush left, every Produk heading is indented 10px, and the table
   lines up under its Produk - so the table keeps that 10px and gives up the
   same 10px of width instead of hanging past the right margin. */
table.report-table { width: calc(100% - 10px); margin: 2px 0 6px 10px; }
td.number, th.number, .number {
  white-space: nowrap;
  font-family: "Noto Sans", "Liberation Sans", sans-serif;
  font-size: 11px;
}
/* Basah's sheet has no nowrap on th, so every two-word header broke over two
   lines while Kering's sat on one. Same geometry, same result. */
table.report-table thead th { white-space: nowrap; }`,

  'stock-st-kering': `
/* Jenis sits flush left, every Produk heading is indented 10px, and the table
   lines up under its Produk - so the table keeps that 10px and gives up the
   same 10px of width instead of hanging past the right margin. */
table.report-table { width: calc(100% - 10px); margin: 2px 0 6px 10px; }
td.number, th.number, .number {
  white-space: nowrap;
  font-family: "Noto Sans", "Liberation Sans", sans-serif;
  font-size: 11px;
}
/* Basah's sheet has no nowrap on th, so every two-word header broke over two
   lines while Kering's sat on one. Same geometry, same result. */
table.report-table thead th { white-space: nowrap; }`,

  'stok-opname-st-detail-kd': `
.data-table td.tanggal-cell, .data-table th.tanggal-cell { white-space: nowrap; }
/* Same figures treatment as the stock sheets: the sheet asks for "Calibri",
   which the renderer does not have, so every number silently fell back to the
   generic sans at 10px - small and hard to read. "Noto Sans" is installed
   (verified against the renderer) and reads cleanly at 11px, matching the
   header size so the table sits on one rhythm. */
.data-table td.number, .data-table th.number, .number {
  white-space: nowrap;
  font-family: "Noto Sans", "Liberation Sans", sans-serif;
  font-size: 11px;
}`,

  'tracing-st': `
/* The sheet sizes its layout tables in mm, which the shared template's px
   paddings then fight, so every cell ended up with a border. These are the
   measurements the blade meant, without the borders. */
table.meta, table.meta td, table.step, table.step td { border: 0 !important; background: #fff !important; }
table.meta, table.step { table-layout: auto !important; }
table.step td { padding: 1px 0 !important; }
table.step td.step-name { width: 31mm; font-weight: bold; }
table.step td.step-date { width: auto; text-align: right; white-space: nowrap; padding-left: 8px !important; }
table.step td.day { font-size: 10px; color: #333; text-align: right; padding: 1px 0 3px 0 !important; }
table.meta td.label { width: 26mm; color: #000; }
table.meta td.value { font-weight: bold; }
.section { border-top: 0.4px solid #111; padding-top: 4px; margin-top: 5px; }`,
}