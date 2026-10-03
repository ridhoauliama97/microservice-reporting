/**
 * The legacy stylesheets, lifted verbatim from open-api-report's report blades.
 *
 * Every entry is that blade's own <style> block with its @include'd partials
 * resolved in. Only what Blade/PHP needs at render time is removed (@page,
 * @include, @php, {{ }}); the rules themselves are unchanged, so a report here
 * lays out the way its legacy sheet did instead of the way a hand-written
 * approximation happened to.
 *
 * Two small additions ride along at the end of each sheet:
 *   - a grid-closure block, because the legacy sheets only ever declare
 *     border-left and Chromium drops the right-hand rule that wkhtmltopdf kept;
 *   - per-report corrections from fixups.py, for the handful of rules the
 *     legacy sheet states in a way Chromium resolves differently.
 *
 * Generated from resources/views/reports/**-pdf.blade.php - do not hand-edit;
 * change the blade, then re-run the generator.
 */

export const WPS_REFERENCE_CSS: Record<string, string> = {
  'rekap-st-penjualan': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .buyer-title  {
              margin: 10px 0 6px 0;
              font-size: 11px;
              font-weight: bold;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              table-layout: fixed;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 0;
              border-left: 1px solid #000;
              border-top: 0;
              border-bottom: 0;
              padding: 2px 3px;
              vertical-align: middle;
    }
          table.data-table th:first-child,
          table.data-table td:first-child  {
              border-left: 0;
    }
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
              font-size: 10px;
              white-space: nowrap;
              border-bottom: 1px solid #000;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          table.data-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
    }
          table.data-table tbody tr.totals-row td  {
              border-top: 1px solid #000;
              font-weight: bold;
              background: #fff;
    }
          table.data-table tbody tr.empty-row td  {
              background: #c9d1df;
              border-bottom: 1px solid #000;
              font-size: 11px;
              font-weight: bold;
              font-style: italic;
              text-align: center;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'saldo-st-hidup-per-produk': `
      *  {
          box-sizing: border-box;
    }
    }
  ;
          footer: html_reportFooter;
    }
      body  {
          margin: 0;
          font-family: "Noto Serif", serif;
          font-size:
              ;
          line-height: 1.2;
          color: #000;
    }
      .page-break  {
          page-break-before: always;
    }
      .report-title  {
          margin: 0;
          text-align: center;
          font-size:
              ;
          font-weight: bold;
    }
      .report-subtitle  {
          margin:
              ;
          text-align: center;
          font-size: 12px;
          color: #636466;
    }
      .section-title  {
          margin: 10px 0 4px;
          font-size: 11px;
          font-weight: bold;
    }
      .section-rangkuman-title  {
          margin: 10px 0 4px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          text-decoration: underline;
    }
      table  {
          width: 100%;
          border-collapse: collapse;
          margin-bottom:
              ;
          page-break-inside: auto;
          table-layout: fixed;
    }
      .report-table  {
          border-collapse: collapse;
          border-spacing: 0;
          border: 1px solid #000;
    }
      .report-table-total  {
          border-collapse: collapse;
          border: none !important;
          width: 100%;
          border-spacing: 0;
    }
      .total-report-table  {
          border-collapse: collapse;
          border-spacing: 0;
          border: 0px;
    }
      .total-report-table th,
      .total-report-table td  {
          border: none !important;
    }
      thead  {
          display: table-header-group;
    }
      tfoot  {
          display: table-footer-group;
    }
      th,
      td  {
          border: 1px solid #000;
          padding: 3px 4px;
          vertical-align: middle;
    }
      th  {
          text-align: center;
          font-weight: bold;
          font-size: 11px;
    }
      td.center  {
          text-align: center;
    }
      td.number  {
          text-align: right;
          white-space: nowrap;
          font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
      .headers-row th  {
          font-size: 11px;
          border-top: 0;
          border-bottom: 1px solid #000;
    }
      .row-odd td  {
          background: #c9d1df;
    }
      .row-even td  {
          background: #eef2f8;
    }
      .report-table tbody tr.data-row td.data-cell  {
          border-top: none !important;
          border-bottom: none !important;
          border-left: 1px solid #000 !important;
          border-right: 1px solid #000 !important;
    }
      .report-table tbody tr.row-last td.data-cell  {
          border-bottom: 1px solid #000 !important;
    }
      .totals-row td  {
          font-size: 11px;
          font-weight: bold;
          border: 1px solid #000;
    }
      .report-table tbody tr.totals-row:last-child td  {
          border-bottom: 0 !important;
    }
      .table-end-line td  {
          border-top: 1px solid #000 !important;
          border-right: 0 !important;
          border-bottom: 0 !important;
          border-left: 0 !important;
          padding: 0 !important;
          height: 0 !important;
          line-height: 0 !important;
          background: #fff !important;
    }
      .summary-page  {
          page-break-before: always;
          margin-top: 8px;
    }
      .summary-title,
      .notes-title  {
          margin: 0 0 10px;
          font-size: 11px;
          font-weight: bold;
    }
      .summary-list,
      .notes-list  {
          margin: 0;
          padding-left: 18px;
          font-size: 10px;
          line-height: 1.2;
    }
      .summary-list li,
      .notes-list li  {
          margin: 0 0 2px;
    }
      .notes  {
          margin-top: 10px;
    }
      .notes-line  {
          margin: 0 0 2px;
          font-size: 10px;
    }
      .notes-indent  {
          padding-left: 28px;
    }
      @include('reports.partials.pdf-footer-table-style')
  .report-table-total tbody tr.totals-row td { border-bottom: 1px solid #000 !important; }
.report-table-total tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'serah-terima-st-kamar-kd': `
          *  {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 16px;
              font-weight: bold;
    }
          .meta-table  {
              width: 100%;
              margin: 14px 0 10px 0;
              border-collapse: collapse;
    }
          .meta-table td  {
              border: 0;
              padding: 1px 4px;
              vertical-align: top;
    }
          .meta-label  {
              width: 16%;
              white-space: nowrap;
    }
          .meta-separator  {
              width: 2%;
              text-align: center;
    }
          .meta-value  {
              width: 32%;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              table-layout: fixed;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 0;
              border-left: 1px solid #000;
              padding: 2px 3px;
              vertical-align: middle;
    }
          table.data-table th:first-child,
          table.data-table td:first-child  {
              border-left: 0;
    }
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              font-size: 10px;
              border-bottom: 1px solid #000;
              background: #fff;
    }
          table.data-table tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          table.data-table tbody tr.no-st-start td  {
              border-top: 1px solid #000;
    }
          table.data-table tfoot td  {
              border-top: 1px solid #000;
              font-weight: bold;
              font-size: 11px;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .summary-table  {
              width: 46%;
              margin-top: 14px;
              border-collapse: collapse;
    }
          .summary-table td  {
              border: 0;
              padding: 2px 4px;
    }
          .handover-summary  {
              width: 100%;
              margin-top: 10px;
              border-collapse: collapse;
              font-size: 10px;
    }
          .handover-summary td  {
              border: 0;
              padding: 0 4px;
              vertical-align: top;
    }
          .signature-table  {
              width: 100%;
              margin-top: 26px;
              border-collapse: collapse;
              font-size: 10px;
    }
          .signature-table td  {
              border: 0;
              padding: 0 4px;
              text-align: center;
              vertical-align: top;
    }
          .signature-space  {
              height: 60px;
    }
  table.data-table > tbody > tr > td { border-right: 1px solid #000; }
table.data-table > tbody > tr > td:nth-child(2) { border-right: 1px solid #000 !important; }
table.data-table > tbody > tr > td:nth-child(3) { border-right: 1px solid #000 !important; }
table.data-table tfoot td { border: 1px solid #000 !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'spk-sawmill': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              margin: 0;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              margin: 2px 0 14px 0;
              text-align: center;
              font-size: 12px;
              color: #636466;
    }
          table  {
              border-collapse: collapse;
              border-spacing: 0;
              page-break-inside: auto;
              table-layout: fixed;
    }
          .report-table  {
              border: 1px solid #000;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
    }
          th  {
              text-align: center;
              font-weight: bold;
              font-size: 11px;
    }
          .headers-row th  {
              font-size: 11px;
              border-top: 0;
              border-bottom: 1px solid #000;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .report-table tbody tr.data-row td.data-cell,
          .report-table tbody tr.blank-row td.data-cell  {
              border-top: none !important;
              border-bottom: none !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          .report-table tbody tr.row-last td.data-cell  {
              border-bottom: 1px solid #000 !important;
    }
          td.number,
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          td.center  {
              text-align: center;
    }
          .meta-table  {
              width: 100%;
              table-layout: fixed;
              margin-bottom: 8px;
              border: 0;
    }
          .meta-table td  {
              border: 0 !important;
              padding: 0 4px 4px 0;
              vertical-align: top;
    }
          .meta-inner  {
              width: 100%;
              border: 0;
              margin-bottom: 0;
    }
          .meta-label  {
              width: 86px;
              white-space: nowrap;
    }
          .meta-sep  {
              width: 14px;
              text-align: center;
    }
          .size-table  {
              width: 220px;
              margin-top: 4px;
              margin-bottom: 8px;
    }
          .request-row  {
              margin: 8px 0 18px;
              font-size: 11px;
    }
          .request-value  {
              display: block;
              margin-left: 8px;
              font-size: 18px;
              font-weight: bold;
              line-height: 1;
    }
          .detail-layout  {
              width: 100%;
              table-layout: fixed;
              border: 0;
              margin-bottom: 0;
    }
          .detail-layout.single-detail-layout  {
              width: 48%;
    }
          .detail-layout td  {
              border: 0 !important;
              padding: 0;
              vertical-align: top;
    }
          .detail-gap  {
              width: 10%;
    }
          .racip-table  {
              width: 100%;
              table-layout: fixed;
              margin-bottom: 0;
    }
          .racip-table th  {
              font-size: 8px;
              line-height: 1.05;
    }
          .racip-table th,
          .racip-table td  {
              padding: 1px 4px;
              font-size: 7.5px;
              line-height: 1.05;
    }
          .size-table th,
          .size-table td  {
              padding: 2px 6px;
    }
          .racip-table .blank-row td,
          .racip-table tbody tr.data-row td  {
              height: 11px;
    }
  .meta-table td, .size-table td, .size-table th,
.racip-table td, .racip-table th { font-size: 10px !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-sawmill-masuk-per-group': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto;
              border: 1px solid #000;
    }
          thead  {
              display: table-header-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 0;
              border-left: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
    }
          th:first-child,
          td:first-child  {
              border-left: 0;
    }
          th  {
              text-align: center;
              font-weight: bold;
              font-size: 11px;
              border-bottom: 1px solid #000;
              background: #fff;
    }
          tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
              white-space: nowrap;
    }
          .totals-row td  {
              font-weight: bold;
              font-size: 11px;
              border-top: 1px solid #000;
    }
          .tfoot-line td  {
              border-top: 1px solid #000;
              padding: 0;
              height: 0;
              line-height: 0;
              font-size: 0;
    }
          tfoot  {
              display: table-footer-group;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
  table > tbody > tr > td[rowspan] { border-right: 1px solid #000 !important; }
table > tbody > tr > td:first-child,
table > tbody > tr > td:nth-child(2),
table > tbody > tr > td:nth-child(3) { border-right: 1px solid #000 !important; }
tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; font-weight: bold; font-size: 11px; }
tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-basah-hidup-per-umur-kayu-ton': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto;
              border: 1px solid #000;
              table-layout: fixed;
    }
          thead  {
              display: table-header-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 0;
              border-left: 1px solid #000;
              border-right: 1px solid #000;
              padding: 2px 3px;
              vertical-align: middle;
    }
          th:first-child,
          td:first-child  {
              border-left: 0;
    }
          th  {
              text-align: center;
              font-weight: bold;
              font-size: 11px;
              border-bottom: 1px solid #000;
    }
          tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .total-column  {
              font-weight: bold;
    }
          .center  {
              text-align: center;
    }
          .totals-row td  {
              font-weight: bold;
              font-size: 11px;
              border-top: 1px solid #000;
    }
          tfoot  {
              display: table-footer-group;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-hidup-kering': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              font-size: 10px;
              border: 1px solid #000;
              table-layout: fixed;
              margin-bottom: 8px;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 1px solid #000;
              padding: 2px 3px;
              vertical-align: middle;
    }
          table.data-table th:first-child,
          table.data-table td:first-child 
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
              font-size: 11px;
              white-space: nowrap;
    }
          table.data-table tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          table.data-table tbody tr:last-child td  {
              border-bottom: 1px solid #000;
    }
          .jenis-title  {
              margin: 8px 0 4px 0;
              font-weight: bold;
              font-size: 11px;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-hidup-per-spk': `
      *  {
          box-sizing: border-box;
    }
    }
  ;
          footer: html_reportFooter;
    }
      body  {
          margin: 0;
          font-family: "Noto Serif", serif;
          font-size:
              ;
          line-height: 1.2;
          color: #000;
    }
      .page-break  {
          page-break-before: always;
    }
      .report-title  {
          margin: 0;
          text-align: center;
          font-size:
              ;
          font-weight: bold;
    }
      .report-subtitle  {
          margin:
              ;
          text-align: center;
          font-size: 12px;
          color: #636466;
    }
      .section-title  {
          margin: 10px 0 4px;
          font-size: 11px;
          font-weight: bold;
    }
      .section-rangkuman-title  {
          margin: 10px 0 4px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          text-decoration: underline;
    }
      table  {
          width: 100%;
          border-collapse: collapse;
          margin-bottom:
              ;
          page-break-inside: auto;
          table-layout: fixed;
    }
      .report-table  {
          border-collapse: collapse;
          border-spacing: 0;
          border: 1px solid #000;
    }
      .report-table-total  {
          border-collapse: collapse;
          border: none !important;
          width: 100%;
          border-spacing: 0;
    }
      .total-report-table  {
          border-collapse: collapse;
          border-spacing: 0;
          border: 0px;
    }
      .total-report-table th,
      .total-report-table td  {
          border: none !important;
    }
      thead  {
          display: table-header-group;
    }
      tfoot  {
          display: table-footer-group;
    }
      th,
      td  {
          border: 1px solid #000;
          padding: 3px 4px;
          vertical-align: middle;
    }
      th  {
          text-align: center;
          font-weight: bold;
          font-size: 11px;
    }
      td.center  {
          text-align: center;
    }
      td.number  {
          text-align: right;
          white-space: nowrap;
          font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
      .headers-row th  {
          font-size: 11px;
          border-top: 0;
          border-bottom: 1px solid #000;
    }
      .row-odd td  {
          background: #c9d1df;
    }
      .row-even td  {
          background: #eef2f8;
    }
      .report-table tbody tr.data-row td.data-cell  {
          border-top: none !important;
          border-bottom: none !important;
          border-left: 1px solid #000 !important;
          border-right: 1px solid #000 !important;
    }
      .report-table tbody tr.row-last td.data-cell  {
          border-bottom: 1px solid #000 !important;
    }
      .totals-row td  {
          font-size: 11px;
          font-weight: bold;
          border: 1px solid #000;
    }
      .report-table tbody tr.totals-row:last-child td  {
          border-bottom: 0 !important;
    }
      .table-end-line td  {
          border-top: 1px solid #000 !important;
          border-right: 0 !important;
          border-bottom: 0 !important;
          border-left: 0 !important;
          padding: 0 !important;
          height: 0 !important;
          line-height: 0 !important;
          background: #fff !important;
    }
      .summary-page  {
          page-break-before: always;
          margin-top: 8px;
    }
      .summary-title,
      .notes-title  {
          margin: 0 0 10px;
          font-size: 11px;
          font-weight: bold;
    }
      .summary-list,
      .notes-list  {
          margin: 0;
          padding-left: 18px;
          font-size: 10px;
          line-height: 1.2;
    }
      .summary-list li,
      .notes-list li  {
          margin: 0 0 2px;
    }
      .notes  {
          margin-top: 10px;
    }
      .notes-line  {
          margin: 0 0 2px;
          font-size: 10px;
    }
      .notes-indent  {
          padding-left: 28px;
    }
      @include('reports.partials.pdf-footer-table-style')
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-masuk-per-group': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
              page-break-inside: auto;
    }
          thead  {
              display: table-header-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
    }
          th  {
              text-align: center;
              font-weight: bold;
    }
          td.center  {
              text-align: center;
    }
          td.number  {
              text-align: right;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
              white-space: nowrap;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .headers-row th  {
              font-weight: bold;
              font-size: 11px;
              border: 1px solid #000;
    }
          .totals-row td  {
              font-weight: bold;
              border: 1px solid #000;
    }
          tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          .group-section-title  {
              font-weight: bold;
              font-size: 11px;
              margin: 12px 0 5px 0;
    }
          .group-table  {
              width: 260px;
              margin-left: 12px;
    }
          @include('reports.partials.pdf-footer-table-style')
      htmlpagefooter table.footer-table  {
          width: 100%;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          table-layout: fixed;
          border: 0 !important;
          margin: 0 !important;
    }
      htmlpagefooter table.footer-table tr,
      htmlpagefooter table.footer-table td  {
          border: 0 !important;
          background: transparent !important;
    }
      htmlpagefooter table.footer-table td  {
          font-family: "Noto Serif", serif !important;
          font-size: 8px !important;
          font-style: italic !important;
          font-weight: normal !important;
          line-height: 1.2 !important;
          padding: 0 !important;
          vertical-align: bottom !important;
    }
      htmlpagefooter table.footer-table td.footer-print  {
          text-align: left !important;
          white-space: nowrap;
    }
      htmlpagefooter table.footer-table td.footer-page-cell  {
          text-align: right !important;
          white-space: nowrap;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-rambung-mc1-mc2-detail': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .group-title  {
              margin: 10px 0 2px 0;
              font-size: 12px;
              font-weight: bold;
              text-align: left;
    }
          .sub-title  {
              margin: 0 0 6px 8px;
              font-size: 11px;
              font-weight: bold;
              text-align: left;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              font-size: 10px;
              border: 1px solid #000;
              table-layout: fixed;
              margin: 0 0 4px 8px;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 0;
              border-left: 1px solid #000;
              border-top: 0;
              border-bottom: 0;
              padding: 2px 3px;
              vertical-align: middle;
    }
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
              font-size: 11px;
              white-space: nowrap;
              border-bottom: 1px solid #000;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          table.data-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
    }
          table.data-table tbody tr.totals-row td  {
              border-top: 1px solid #000;
              font-weight: bold;
              background: #fff;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .section-title  {
              margin: 14px 0 6px 0;
              font-size: 12px;
              font-weight: bold;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-rambung-mc1-mc2-rangkuman': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .sub-title  {
              margin: 20px 0 6px 0;
              font-size: 11px;
              font-weight: bold;
              text-align: left;
    }
          .section-title  {
              margin: 14px 0 6px 0;
              font-size: 11px;
              font-weight: bold;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              font-size: 10px;
              border: 1px solid #000;
              table-layout: fixed;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 0;
              border-left: 1px solid #000;
              border-top: 0;
              border-bottom: 0;
              padding: 2px 3px;
              vertical-align: middle;
    }
          table.data-table th:first-child,
          table.data-table td:first-child  {
              border-left: 0;
    }
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
              font-size: 10px;
              white-space: nowrap;
              border-bottom: 1px solid #000;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          table.data-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
    }
          table.data-table tbody tr.totals-row td  {
              border-top: 1px solid #000;
              font-weight: bold;
              background: #fff;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          @include('reports.partials.pdf-footer-table-style')
      htmlpagefooter table.footer-table  {
          width: 100%;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          table-layout: fixed;
          border: 0 !important;
          margin: 0 !important;
    }
      htmlpagefooter table.footer-table tr,
      htmlpagefooter table.footer-table td  {
          border: 0 !important;
          background: transparent !important;
    }
      htmlpagefooter table.footer-table td  {
          font-family: "Noto Serif", serif !important;
          font-size: 8px !important;
          font-style: italic !important;
          font-weight: normal !important;
          line-height: 1.2 !important;
          padding: 0 !important;
          vertical-align: bottom !important;
    }
      htmlpagefooter table.footer-table td.footer-print  {
          text-align: left !important;
          white-space: nowrap;
    }
      htmlpagefooter table.footer-table td.footer-page-cell  {
          text-align: right !important;
          white-space: nowrap;
    }
  table.data-table tbody tr.row-odd td { background: #c9d1df; }
table.data-table tbody tr.row-even td { background: #eef2f8; }
table.data-table tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; font-weight: bold; font-size: 11px; }
table.data-table tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
/* The sheet zeroes border-left on every first cell and never puts a bottom
   rule on the totals row, which left the Grand Total band open on two sides. */
table.data-table tbody tr.grand-total-row > td { border: 1px solid #000 !important; }
table.data-table tbody tr.grand-total-row > td:first-child { border-left: 1px solid #000 !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'st-sawmill-hari-tebal-lebar': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 12px 0;
              font-size: 12px;
              color: #636466;
    }
          .group-title  {
              margin: 0 0 6px 0;
              font-size: 10px;
              font-weight: bold;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto;
              border: 1px solid #000;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 0;
              border-left: 1px solid #000;
              padding: 2px 3px;
              vertical-align: middle;
    }
          th:first-child,
          td:first-child  {
              border-left: 0;
    }
          th  {
              text-align: center;
              font-weight: bold;
              border-bottom: 1px solid #000;
    }
          tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          tbody td.col-group  {
              border-bottom: 1px solid #000;
              background: #c9d1df !important;
              font-weight: bold;
    }
          tbody td.col-group-span  {
              border-bottom: 1px solid #000;
    }
          tbody td.col-tebal-span  {
              border-bottom: 1px solid #000;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .zebra-table tbody tr:nth-child(odd) td  {
              background: #c9d1df;
    }
          .zebra-table tbody tr:nth-child(even) td  {
              background: #eef2f8;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .center  {
              text-align: center;
    }
          .totals-row td  {
              font-weight: bold;
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
    }
          tbody tr:last-child.totals-row td  {
              border-bottom: 0;
    }
          .tfoot-line td  {
              border-top: 1px solid #000;
              padding: 0;
              height: 0;
              line-height: 0;
              font-size: 0;
    }
          .page-break  {
              page-break-before: always;
    }
          .section-title  {
              margin: 0 0 6px 0;
              font-size: 12px;
              font-weight: bold;
    }
          .grand-total-table  {
              width: 420px !important;
              table-layout: fixed;
    }
          .rangkuman-table  {
              width: 420px !important;
              table-layout: fixed;
    }
          .rangkuman-table th,
          .rangkuman-table td  {
              padding: 2px 3px;
    }
          .rangkuman-group  {
              page-break-inside: avoid;
    }
          .rangkuman-group-start td  {
              border-top: 1px solid #000 !important;
    }
          .rangkuman-table td.jenis-cell  {
              font-weight: bold;
              vertical-align: middle;
              background: #c9d1df !important;
              border-top: 1px solid #000 !important;
              border-bottom: 1px solid #000 !important;
    }
          .table-end-line td  {
              border-top: 1px solid #000 !important;
              border-right: 0 !important;
              border-bottom: 0 !important;
              border-left: 0 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: #fff !important;
    }
  table > tbody > tr > td[rowspan], table > thead > tr > th[rowspan] { border-right: 1px solid #000 !important; }
table > tbody > tr > td:first-child, table > tbody > tr > td:nth-child(2) { border-right: 1px solid #000 !important; }
.rangkuman-table tbody tr td:first-child { border-right: 1px solid #000 !important; }
.rangkuman-table tbody tr.totals-row td { border: 1px solid #000 !important; background: #fff !important; }
.rangkuman-table tbody tr.totals-row:last-child td { border-bottom: 1px solid #000 !important; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'stock-st-basah': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 65%;
              border-collapse: collapse;
              page-break-inside: auto;
              border: 1;
              table-layout: fixed;
              margin: 2px 0 6px 10px;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-row-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
    }
          th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
    }
          td.center  {
              text-align: center;
    }
          td.number  {
              text-align: right;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .jenis-title  {
              margin: 10px 0 0 0;
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
    }
          .produk-title  {
              margin: 6px 0 0 10px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
    }
          .subtotal-row td  {
              font-weight: 700;
              background: #f6f7fb !important;
    }
          .summary-title  {
              margin: 12px 0 4px;
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
    }
          .summary-table  {
              width: 55%;
    }
          .jenis-summary  {
              width: 70%;
              margin: 0 0 10px -4px;
              font-size: 11px;
              font-weight: bold;
              border: 0 !important;
              border-left: 0 ! important;
              border-right: 0 ! important;
              border-collapse: collapse;
              background: transparent;
    }
          table.jenis-summary tbody tr td  {
              border: 0;
              border-collapse: collapse;
              border-spacing: 0;
    }
          tfoot,
          .table-end-line  {
              display: none !important;
    }
          table.data-table,
          table.report-table,
          table  {
              border-bottom: 0 !important;
    }
          table.data-table tbody td,
          table.report-table tbody td,
          tbody td  {
              border-top: 0 !important;
              border-bottom: 0 !important;
    }
          table.data-table tbody tr td,
          table.report-table tbody tr td,
          tbody tr td  {
              border-top: 0 !important;
    }
          table.data-table tbody tr.subtotal-row td,
          table.data-table tbody tr.total-row td,
          table.data-table tbody tr.totals-row td,
          table.data-table tbody tr.group-total-row td,
          table.data-table tbody tr.group-subtotal-row td,
          table.report-table tbody tr.subtotal-row td,
          table.report-table tbody tr.total-row td,
          table.report-table tbody tr.totals-row td,
          table.report-table tbody tr.group-total-row td,
          table.report-table tbody tr.group-subtotal-row td,
          tbody tr.subtotal-row td,
          tbody tr.total-row td,
          tbody tr.totals-row td,
          tbody tr.group-total-row td,
          tbody tr.group-subtotal-row td  {
              border-top: 1px solid #000 !important;
              border-bottom: 1px solid #000 !important;
              font-weight: bold;
              background: #fff !important;
    }
          table.data-table tbody tr:last-child td,
          table.report-table tbody tr:last-child td,
          tbody tr:last-child td  {
              border-bottom: 1px solid #000 !important;
    }
          table.data-table tbody td:nth-child(7),
          table.report-table tbody td:nth-child(7),
          tbody td:nth-child(7)  {
              text-align: center !important;
    }
          .headers-row th  {
              font-weight: bold;
              font-size: 11px;
              border-top: 0;
              border-bottom: 1px solid #000;
    }
          .totals-row td  {
              font-weight: bold;
              font-size: 11px;
              border: 1px solid #000;
    }
          .report-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          tr.data-row.row-negative td  {
              color: red !important;
    }
          .table-end-line td  {
              border: 0 !important;
              border-top: 1px solid #000 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: transparent !important;
    }
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
table.report-table thead th { white-space: nowrap; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'stock-st-kering': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              margin: 2px 10px 0 10px;
    }
          .report-table  {
              width: 75%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              margin: 2px 10px 0 10px;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-row-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
              white-space: nowrap;
    }
          th  {
              text-align: center;
              font-weight: 700;
              background: #fff;
    }
          td.center  {
              text-align: center;
    }
          td.number  {
              text-align: right;
              font-family: "Calibri", sans-serif;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .jenis-title  {
              margin: 10px 0 0 0;
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
    }
          .produk-title  {
              margin: 6px 0 0 10px;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
    }
          .subtotal-row td  {
              font-weight: 700;
              background: #f6f7fb !important;
    }
          .summary-title  {
              margin: 12px 0 4px;
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
    }
          .summary-table  {
              width: 55%;
    }
          .jenis-summary  {
              width: 70%;
              margin: 0 0 10px -4px;
              font-size: 11px;
              font-weight: bold;
              border: 0 !important;
              border-left: 0 ! important;
              border-right: 0 ! important;
              border-collapse: collapse;
              background: transparent;
    }
          table.jenis-summary tbody tr td  {
              border: 0;
              border-collapse: collapse;
              border-spacing: 0;
    }
          .headers-row th  {
              font-weight: bold;
              font-size: 11px;
              border-bottom: 1px solid #000;
    }
          .totals-row td  {
              font-weight: bold;
              font-size: 11px;
              border: 1px solid #000;
    }
          .report-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          .table-end-line td  {
              border: 0 !important;
              border-top: 1px solid #000 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: transparent !important;
    }
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
table.report-table thead th { white-space: nowrap; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'stok-opname-st-detail-kd': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .meta-table  {
              width: 100%;
              margin: 0 0 8px 0;
              border-collapse: collapse;
              table-layout: fixed;
    }
          .meta-table td  {
              border: 0;
              padding: 0 8px 3px 0;
              vertical-align: top;
    }
          .meta-label  {
              width: 82px;
              white-space: nowrap;
              font-weight: bold;
    }
          .meta-sep  {
              width: 8px;
              text-align: center;
    }
          table.data-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              table-layout: fixed;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-footer-group;
    }
          tr  {
              page-break-inside: avoid;
    }
          table.data-table th,
          table.data-table td  {
              border: 1px solid #000;
              padding: 2px 3px;
              vertical-align: middle;
              font-size: 10px;
    }
          table.data-table th  {
              text-align: center;
              font-weight: bold;
              background: #fff;
              white-space: nowrap;
    }
          table.data-table tbody td  {
              border-top: 0;
              border-bottom: 0;
    }
          table.data-table tbody tr:last-child td  {
              border-bottom: 1px solid #000;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .totals-row td  {
              font-size: 11px;
              font-weight: bold;
              border: 1px solid #000 !important;
              background: #fff !important;
    }
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
}
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'detail-lembar-tally-hasil-sawmill': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .page-break  {
              page-break-before: always;
    }
          .report-title  {
              margin: 0;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .section-title  {
              margin: 10px 0 6px;
              font-size: 12px;
              font-weight: bold;
    }
          table  {
              border-collapse: collapse;
              border-spacing: 0;
              width: 100%;
    }
          .meta-layout  {
              margin-bottom: 8px;
              table-layout: fixed;
    }
          .meta-layout td  {
              border: 0;
              padding: 0;
              vertical-align: top;
    }
          .meta-block  {
              table-layout: fixed;
    }
          .meta-block td  {
              border: 0;
              padding: 0 0 2px 0;
              vertical-align: top;
              font-size: 9.5px;
    }
          .meta-label  {
              width: 72px;
              white-space: nowrap;
    }
          .meta-separator  {
              width: 10px;
              text-align: center;
    }
          .meta-value  {
              word-break: break-word;
    }
          .report-table  {
              margin: 0 0 8px 0;
              border: 1px solid #000;
              border-collapse: collapse;
              border-spacing: 0;
              table-layout: fixed;
              font-size: 10px;
    }
          .report-table th,
          .report-table td  {
              border: 1px solid #000;
              padding: 2px 4px;
              text-align: center;
              vertical-align: middle;
    }
          .report-table thead th  {
              background: #fff;
              font-weight: bold;
    }
          .headers-row th  {
              border-top: 0;
              border-bottom: 1px solid #000;
              font-size: 11px;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .report-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          .report-table tbody tr.row-last td.data-cell  {
              border-bottom: 1px solid #000 !important;
    }
          .number  {
              text-align: right;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
              white-space: nowrap;
    }
          .totals-row td  {
              background: #fff;
              font-weight: bold;
              font-size: 11px;
    }
          .totals-label  {
              text-align: right;
    }
          .signature-layout  {
              width: 62%;
              margin: 18px auto 0;
              table-layout: fixed;
    }
          .signature-layout td  {
              width: 33.33%;
              border: 0;
              padding: 0 10px;
              text-align: center;
              vertical-align: top;
              font-size: 10px;
    }
          .signature-space td  {
              height: 58px;
    }
          .signature-line  {
              display: block;
              width: 120px;
              border-top: 1px solid #000;
              margin: 0 auto 2px;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'total-bagus-kulit-rambung': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
    }
          .report-table  {
              border: 1px solid #000;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 5px 6px;
              vertical-align: middle;
    }
          th  {
              text-align: center;
              font-weight: bold;
              font-size: 11px;
    }
          .data-row td  {
              border-top: 0;
              border-bottom: 0;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .empty-row td  {
              background: #c9d1df;
              font-weight: bold;
              font-style: italic;
    }
          .center  {
              text-align: center;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .dim  {
              text-align: center;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .total-row td  {
              font-weight: bold;
              font-size: 11px;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'tracing-st': `
          *  {
              box-sizing: border-box;
    }
          body  {
              font-family: "Noto Serif", serif;
              font-size: 10px;
              color: #000;
    }
          .title  {
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              margin: 0 0 20px 0;
    }
          .meta  {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 6px;
    }
          .meta td  {
              padding: 1px 0;
              vertical-align: top;
    }
          .label  {
              color: #000;
              width: 26mm;
    }
          .value  {
              font-weight: bold;
    }
          .section  {
              border-top: 0.4px solid #111;
              padding-top: 4px;
              margin-top: 5px;
    }
          .step  {
              width: 100%;
              border-collapse: collapse;
              margin: 0 0 3px 0;
    }
          .step td  {
              vertical-align: top;
              padding: 1px 0;
    }
          .step-name  {
              width: 31mm;
              font-weight: bold;
    }
          .step-date  {
              width: 20mm;
              text-align: right;
    }
          .day  {
              font-size: 10px;
              color: #333;
              text-align: right;
    }
          .summary  {
              font-size: 10px;
              font-style: italic;
    }
          .page-break  {
              page-break-after: always;
    }
  table.meta, table.meta td, table.step, table.step td { border: 0 !important; background: #fff !important; }
table.meta, table.step { table-layout: auto !important; }
table.step td { padding: 1px 0 !important; }
table.step td.step-name { width: 31mm; font-weight: bold; }
table.step td.step-date { width: auto; text-align: right; white-space: nowrap; padding-left: 8px !important; }
table.step td.day { font-size: 10px; color: #333; text-align: right; padding: 1px 0 3px 0 !important; }
table.meta td.label { width: 26mm; color: #000; }
table.meta td.value { font-weight: bold; }
.section { border-top: 0.4px solid #111; padding-top: 4px; margin-top: 5px; }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'umur-sawn-timber-detail-ton': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.2;
              color: #000;
    }
          .report-title  {
              text-align: center;
              margin: 0;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .report-meta  {
              text-align: center;
              margin: 0 0 14px;
              font-size: 10px;
              color: #444;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
              page-break-inside: auto;
    }
          .report-table  {
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
    }
          thead  {
              display: table-header-group;
    }
          tfoot  {
              display: table-row-group;
    }
          tr  {
              page-break-inside: avoid;
              page-break-after: auto;
    }
          th,
          td  {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
    }
          th  {
              text-align: center;
              font-weight: 700;
              background: #fff;
              color: #000;
    }
          td.center  {
              text-align: center;
    }
          td.number  {
              text-align: right;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
              white-space: nowrap;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .headers-row th  {
              font-weight: bold;
              font-size: 11px;
              border-bottom: 1px solid #000;
    }
          .totals-row td  {
              font-weight: bold;
              border: 1px solid #000;
              font-size: 11px;
              background: #fff;
    }
          .report-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          .table-end-line td  {
              border: 0 !important;
              border-top: 1px solid #000 !important;
              padding: 0 !important;
              height: 0 !important;
              line-height: 0 !important;
              background: transparent !important;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
  'rekap-pcs-telly-hasil-sawmill': `
          *  {
              box-sizing: border-box;
    }
          body  {
              margin: 0;
              font-family: "Noto Serif", serif;
              font-size: 10px;
              line-height: 1.15;
              color: #000;
    }
          .page-break  {
              page-break-before: always;
    }
          .report-title  {
              margin: 0;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
    }
          .report-subtitle  {
              text-align: center;
              margin: 2px 0 20px 0;
              font-size: 12px;
              color: #636466;
    }
          .meta-layout  {
              width: 100%;
              margin: 10px 0 10px;
              table-layout: fixed;
    }
          .meta-layout td  {
              border: 0;
              padding: 0;
              vertical-align: top;
    }
          .meta-block  {
              width: 100%;
              table-layout: fixed;
    }
          .meta-block td  {
              border: 0;
              padding: 0 0 2px 0;
              font-size: 9.5px;
              vertical-align: top;
    }
          .meta-label  {
              width: 88px;
              white-space: nowrap;
    }
          .meta-separator  {
              width: 10px;
              text-align: center;
    }
          .grade-title  {
              margin: 10px 0 6px;
              font-size: 11px;
              font-weight: bold;
    }
          table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              table-layout: fixed;
    }
          .split-layout  {
              width: 100%;
              table-layout: fixed;
              margin: 0 0 6px 0;
    }
          .split-layout td  {
              border: 0;
              padding: 0;
              vertical-align: top;
    }
          .split-gap  {
              width: 5%;
    }
          .tebal-table  {
              width: 100%;
              border-collapse: collapse;
              border-spacing: 0;
              border: 1px solid #000;
              margin-bottom: 3px;
    }
          .tebal-table th,
          .tebal-table td  {
              border: 1px solid #000;
              padding: 2px 4px;
              text-align: center;
              vertical-align: middle;
    }
          .tebal-table .headers-row th  {
              font-size: 10px;
              font-weight: bold;
              border-top: 0;
              border-bottom: 1px solid #000;
              background: #fff;
    }
          .tebal-table tbody tr.data-row td.data-cell  {
              border-top: 0 !important;
              border-bottom: 0 !important;
              border-left: 1px solid #000 !important;
              border-right: 1px solid #000 !important;
    }
          .tebal-table tbody tr.row-last td.data-cell  {
              border-bottom: 1px solid #000 !important;
    }
          .row-odd td  {
              background: #c9d1df;
    }
          .row-even td  {
              background: #eef2f8;
    }
          .number  {
              text-align: right;
              white-space: nowrap;
              font-family: "Calibri", "DejaVu Sans", sans-serif;
    }
          .tebal-total  {
              margin: 0 0 10px;
              text-align: right;
              font-size: 10px;
    }
          .grade-total  {
              margin: 2px 0 10px;
              font-size: 11px;
    }
          .footer-summary  {
              width: 100%;
              margin-top: 10px;
              table-layout: fixed;
    }
          .footer-summary td  {
              border: 0;
              padding: 0;
              font-size: 11px;
    }
          .footer-summary .left  {
              text-align: left;
    }
          .footer-summary .right  {
              text-align: right;
    }
          .bottom-line  {
              width: 100%;
              border: 1px solid #000;
              margin-top: 4px;
    }
          .bottom-line td  {
              border: 0;
              padding: 2px 6px;
              text-align: right;
              font-size: 11px;
    }
  /* --- Chromium grid closure ----------------------------------------------
   The legacy sheets lean on border-collapse taking the edge between two cells
   from whichever side declares it, and they only ever declare border-left.
   That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
   and on the last column under Chromium, so vertical rules go missing.
   Declaring the right edge on the same cells closes the grid; no measurement
   changes. Layout tables (meta blocks, split grids, signatures) are excluded. */
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > thead > tr > th,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tbody > tr > td,
table:not(.meta-table):not(.meta-layout):not(.meta-block):not(.split-layout):not(.signature-table):not(.signature-layout):not(.bottom-line):not(.footer-summary):not(.jenis-summary):not(.report-table-total):not(.meta):not(.step):not(.summary) > tfoot > tr > td {
  border-right: 1px solid #000;
}
  `,
}
