/**
 * Shared WPS report layout styles.
 *
 * Report modules keep data and markup only; layout-specific CSS lives here
 * so a visual change is made once instead of being copied into every report.
 */

// Dashboards

const DASHBOARD_BARANG_JADI_CSS = `
  .report-table { table-layout: auto; }
  .section-title { margin: 20px 0 4px; }
  .report-table tfoot { display: table-row-group; }
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tfoot .totals-row td {
    font-weight: bold;
    font-size: 11px;
    border-top: 1px solid #000;
    border-right: 1px solid #000;
    border-bottom: 0;
    border-left: 0;
  }
  td.number {
    font-family: Calibri, "DejaVu Sans", sans-serif;
    white-space: nowrap;
  }
  td.label { white-space: nowrap; }
  .summary-table { width: 230px; }
  .summary-table .totals-row td { border: 1px solid #000 !important; }
`;

const DASHBOARD_CROSS_CUT_AKHIR_CSS = `
  .report-table { table-layout: auto; }
  .report-table tfoot { display: table-row-group; }
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tfoot .totals-row td {
    font-weight: bold;
    font-size: 11px;
    border-top: 1px solid #000;
    border-right: 1px solid #000;
    border-bottom: 0;
    border-left: 0;
  }
  td.number {
    font-family: Calibri, "DejaVu Sans", sans-serif;
    white-space: nowrap;
  }
  td.label { white-space: nowrap; }
  .summary-table { width: 230px; }
  .summary-table .totals-row td { border: 1px solid #000 !important; }
`;

const DASHBOARD_REPROSES_CSS = `
  .dashboard-reproses-table {
    table-layout: fixed;
    border: 0.6px solid #000;
  }
  .dashboard-reproses-table th,
  .dashboard-reproses-table td {
    border: 0.6px solid #000;
  }
  .dashboard-reproses-table th {
    font-size: 8px;
    line-height: 1.05;
    padding: 2px 1px;
    white-space: normal;
    overflow-wrap: normal;
  }
  .dashboard-reproses-table td {
    padding: 2px;
    font-size: 9px;
  }
  .dashboard-reproses-table td.number {
    font-family: Calibri, "DejaVu Sans", sans-serif;
    font-size: 8.5px;
    white-space: nowrap;
  }
  .dashboard-reproses-table td.label { white-space: nowrap; }
  .dashboard-reproses-table tfoot { display: table-row-group; }
  .dashboard-reproses-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; }
  .dashboard-reproses-table tfoot .totals-row td { border: 0.6px solid #000; font-weight: bold; font-size: 9px; }
  .dashboard-reproses-table tfoot .table-end-line td { border: 0; border-top: 0.6px solid #000; padding: 0; height: 0; line-height: 0; }
  .summary-table { width: 230px; border: 0.6px solid #000; }
  .summary-table .summary-label { width: 90px; }
  .summary-table td { border: 0.6px solid #000 !important; }
`;

// Detail reports

const KETAHANAN_BARANG_REPROSES_CSS = `
  .report-table th:nth-child(1) { width: 6%; }
  .report-table th:nth-child(2) { width: 44%; }
  .report-table th:nth-child(3),
  .report-table th:nth-child(4) { width: 12%; }
  .report-table th:nth-child(5) { width: 14%; }
  .report-table th:nth-child(6) { width: 12%; }
`;

// Mutasi

const MUTASI_BARANG_JADI_CSS = `
  table.sub-table { width: 70%; }
`;

const MUTASI_BARANG_JADI_PER_JENIS_PER_UKURAN_CSS = `
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .summary-block { margin-top: 14px; }
  .summary-list { margin: 4px 0 0 18px; padding: 0; font-size: 10px; }
  .summary-list li { margin: 0 0 2px 0; }
  .section-title { margin: 10px 0 6px 0; font-size: 12px; font-weight: bold; }
`;

const MUTASI_CROSS_CUT_AKHIR_CSS = `
  .report-table th, .report-table td.number { white-space: nowrap; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .sub-report-table { width: 92%; }
`;

const MUTASI_REPROSES_CSS = `
  .report-table th, .report-table td { white-space: nowrap; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .main-mutasi-table thead tr:first-child th:nth-child(1) { width: 2.5%; }
  .main-mutasi-table thead tr:first-child th:nth-child(2) { width: 15.5%; }
  .main-mutasi-table thead tr:first-child th:nth-child(3) { width: 5%; }
  .main-mutasi-table thead tr:first-child th:nth-child(5) { width: 6%; }
  .main-mutasi-table thead tr:first-child th:nth-child(7) { width: 6%; }
  .main-mutasi-table thead tr:first-child th:nth-child(8) { width: 5%; }
  .main-mutasi-table thead tr:last-child th { width: 5%; }
  .main-mutasi-table .strong { font-weight: bold; }
  .sub-mutasi-table { table-layout: auto; }
  .sub-mutasi-table th, .sub-mutasi-table td { font-size: 9px; }
  .sub-mutasi-table th:first-child { width: 4%; }
  .sub-mutasi-table th:last-child, .sub-mutasi-table td:last-child { white-space: normal; }
`;

// Forms

const PENERIMAAN_KAYU_BULAT_KG_CSS = `
  .meta-table, .report-table, .signature-table { width: 100%; border-collapse: collapse; }
  .meta-table { margin-bottom: 8px; }
  .meta-table td { padding: 1px 2px; vertical-align: top; border: 0 !important; background: #fff !important; }
  .meta-label { width: 68px; white-space: nowrap; }
  .meta-colon { width: 10px; text-align: center; }
  .spacer-cell { width: 24px; border: 0 !important; background: #fff !important; }

  .summary-row { margin: 12px 0 4px; font-size: 11px; }
  .summary-row span { margin-right: 12px; }

  .grade-title { margin: 12px 0 3px; font-size: 11px; }

  .report-table { width: 180px; margin-bottom: 2px; table-layout: auto; }
  /* The shared template lets labels break anywhere (min-content = 1 char),
     which would wrap the "Jumlah" label letter by letter in the narrow No
     column. The legacy form keeps words intact — restore that here. */
  .report-table td, .report-table th { overflow-wrap: normal; }
  .report-table th, .report-table td { border: 1px solid #000; padding: 3px 5px; }
  .report-table th { text-align: center; font-weight: bold; background: #ffffff; }
  .report-table td { vertical-align: middle; }
  .report-table td.center { text-align: center; }
  .report-table td.number { text-align: right; white-space: nowrap; font-family: "Calibri", "DejaVu Sans", sans-serif; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }

  .grand-total-line { width: 200px; border-top: 1px solid #000; margin: 8px 0 4px; }
  .grand-total-table { width: 200px; margin: 0 0 14px; border-collapse: collapse; }
  .grand-total-table td { padding: 0; font-size: 11px; font-weight: bold; vertical-align: top; border: 0 !important; background: #fff !important; }
  .grand-total-label { width: 58px; text-align: left; }
  .grand-total-value { text-align: right; white-space: nowrap; font-family: "Calibri", "DejaVu Sans", sans-serif; }

  .signature-table { margin-top: 14px; table-layout: fixed; }
  .signature-table td { width: 14.28%; text-align: center; vertical-align: top; padding: 0 2px; border: 0 !important; background: #fff !important; }
  .signature-label-row td { padding-bottom: 18px; }
  .signature-placeholder-row td { padding-top: 50px; }
  .signature-placeholder-table { width: 100%; border-collapse: collapse; }
  .signature-placeholder-table td { padding: 0; font-family: "Calibri", "DejaVu Sans", sans-serif; font-size: 11px; font-weight: normal; text-align: center; border: 0 !important; background: #fff !important; }
  .signature-bracket { width: 100px; }
  .signature-space { width: 100px; }
`;

// Pivot, comparison, and charts

const PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GRAFIK_CSS = `
  .group-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }
  .section-break { page-break-before: always; height: 0; }
  .summary-note { margin: 4px 0 6px 0; font-size: 10px; }
  .summary-note .label { font-weight: bold; text-decoration: underline; }
  .chart-wrap { text-align: center; margin-top: 16px; page-break-inside: avoid; }
  .chart-title { margin: 4px 0 6px 0; font-size: 11px; font-weight: bold; text-align: center; }
`;

const PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GROUP_CSS = `
  .ratio-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .ratio-table td { padding: 0; border: 0 !important; background: #fff !important; }
  .notes-title { margin: 10px 0 2px; font-size: 12px; font-weight: bold; text-decoration: underline; }
  .notes-line { margin: 0; font-size: 10px; }
`;

const PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_KG_CSS = `
  .report-table { width: 100%; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 1px solid #000; border-right: 1px solid #000; }
  .summary-page { margin-top: 14px; page-break-before: auto; }
  .summary-title { margin: 0 0 10px; font-size: 11px; font-weight: bold; }
  .summary-list, .notes-list { margin: 0; padding-left: 18px; font-size: 10px; line-height: 1.2; }
  .summary-list li, .notes-list li { margin: 0 0 2px; }
  .notes { margin-top: 10px; }
  .notes-line { margin: 0 0 2px; font-size: 10px; }
`;

const PENERIMAAN_KAYU_BULAT_TON_CSS = `
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .meta-table td { padding: 1px 2px; vertical-align: top; border: 0 !important; background: #fff !important; }
  .meta-label { width: 68px; white-space: nowrap; }
  .meta-colon { width: 10px; text-align: center; }
  .spacer-cell { width: 24px; }

  .report-table tbody td { border-top: 0; border-bottom: 0; }
  .report-table tbody tr:last-child td { border-bottom: 1px solid #000; }
  .report-table tbody tr.totals-row td { border-top: 1px solid #000; border-bottom: 0; }

  .separator-cell { width: 4%; min-width: 16px; border: 0 !important; background: #fff !important; padding: 0; }

  .summary-block { width: 100%; margin: 4px 0 10px 0; }
  .summary-table { width: 45%; border-collapse: collapse; font-size: 10px; margin-top: 10px; margin-left: auto; }
  .summary-table td { padding: 0 2px 2px 2px; vertical-align: top; border: 0 !important; background: #fff !important; }
  .summary-label { text-align: right; white-space: nowrap; width: 70%; }
  .summary-value { text-align: right; white-space: nowrap; width: 30%; font-weight: bold; }

  .signature-table { margin-top: 14px; table-layout: fixed; width: 100%; border-collapse: collapse; }
  .signature-table td { width: 14.28%; text-align: center; vertical-align: top; padding: 0 2px; border: 0 !important; background: #fff !important; }
  .signature-label-row td { padding-bottom: 18px; }
  .signature-label { margin: 0; }
  .signature-placeholder-row td { padding-top: 50px; }
  .signature-placeholder-table { width: 100%; border-collapse: collapse; }
  .signature-placeholder-table td { padding: 0; font-size: 11px; font-weight: normal; text-align: center; border: 0 !important; background: #fff !important; }
  .signature-bracket { width: 100px; }
  .signature-space { width: 100px; }
`;

const PERBANDINGAN_KB_MASUK_PERIODE_KG_CSS = `
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .trend-up { color: #0b8f3c; font-weight: bold; }
  .trend-down { color: #d11a2a; font-weight: bold; }
  .trend-flat { color: #636466; font-weight: bold; }
`;

const PERBANDINGAN_KB_MASUK_PERIODE_CSS = `
  .trend-up { color: #0b8f3c; font-weight: bold; }
  .trend-down { color: #d11a2a; font-weight: bold; }
  .trend-flat { color: #636466; font-weight: bold; }
  .grand-total-row td { font-weight: bold; font-size: 12px; }
  td.number, th.number-cell { text-align: center; }
`;

const REKAP_PEMBELIAN_KAYU_BULAT_KG_CSS = `
  .report-table td.number, .report-table th { white-space: nowrap; }
`;

const REKAP_PENERIMAAN_ST_DARI_SAWMILL_KG_CSS = `
  .date-separator { height: 14px; }
  .receipt-separator { height: 6px; }
  .section-separator td { padding: 0; height: 0; line-height: 0; border: 0 !important; background: #fff !important; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .meta-line { margin: 2px 0; font-size: 10px; }
  .rendemen-line { margin: 0 0 10px 0; text-align: right; font-size: 11px; font-weight: bold; }
  .group-title { margin: 10px 0; text-align: center; font-size: 12px; font-weight: bold; }
`;

const REKAP_PENERIMAAN_ST_SAWMILL_COSTING_RAMBUNG_CSS = `
  .group-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }
  .date-separator { border-top: 1px solid #000; margin: 10px 0 8px 0; }
  .receipt-separator { border-top: 1px solid #000; margin: 8px 0 10px 0; }
  .receipt-block { margin: 0 0 12px 0; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 1px solid #000; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { font-weight: bold; font-size: 11px; border: 1px solid #000; }
  .section-separator td { padding: 0; height: 0; line-height: 0; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 1px solid #000; background: #fff; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; table-layout: fixed; }
  .meta-table td { border: 0; padding: 0 4px 1px 0; vertical-align: top; text-align: left; background: transparent; word-break: normal; }
  .meta-line { white-space: nowrap; }
  .meta-line.right { text-align: right; }
  .meta-attachment-label { font-weight: bold; }
  .rendemen-attachment { margin: 2px 0 10px 0; text-align: right; font-size: 11px; }
  .bottom-section { width: 100%; margin: 6px 0 0 0; }
  .bottom-layout { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .bottom-layout td { border: 0; padding: 0; vertical-align: top; background: transparent; word-break: normal; }
  .money-box { width: 100%; font-size: 11px; padding-left: 40px; }
  .money-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .money-table td { border: 0; padding: 0 0 2px 0; vertical-align: top; background: transparent; }
  .money-divider-row td { padding: 1px 0 2px 0; }
  .money-divider-line { border-top: 1px solid #000; height: 0; margin-left: 82px; }
  .money-label { width: 68px; font-weight: bold; text-align: left; white-space: nowrap; }
  .money-value { text-align: right; white-space: nowrap; font-family: Calibri, "DejaVu Sans", sans-serif; width: 150px; font-weight: bold; }
  .money-flag-attachment { font-weight: bold; white-space: nowrap; padding-left: 10px; text-align: left; width: 60px; }
  .btul-box { width: 100%; font-size: 11px; padding-left: 26px; }
  .btul-title { font-weight: normal; text-align: left; margin: 0; line-height: 1.15; width: 96px; white-space: normal; word-break: normal; overflow-wrap: normal; }
  .btul-wrap { width: 100%; margin-left: 0; }
  .btul-layout { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .btul-layout td { border: 0; padding: 0; vertical-align: top; background: transparent; word-break: normal; }
  .btul-text-cell { width: 108px; padding-right: 12px; padding-top: 4px; }
  .mini-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .mini-table th, .mini-table td { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
  .mini-table th { text-align: center; font-weight: bold; }
  .mini-table td.label { text-align: left; }
  .mini-table td.label-total { text-align: right; font-weight: bold; }
  .mini-table td.num { text-align: right; white-space: nowrap; font-family: Calibri, "DejaVu Sans", sans-serif; }
  .diagram-section { margin-top: 10px; }
  .diagram-frame { width: 100%; border: 0; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .diagram-frame td { border: 0; padding: 6px 10px; vertical-align: top; background: #fff; font-size: 10px; }
  .diagram-frame td.frame-banner { background: #1a3a5c; color: #fff; font-size: 22px; font-weight: bold; text-align: center; padding: 10px 0; letter-spacing: 1px; }
  .diagram-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .diagram-layout > tbody > tr > td { padding: 0; vertical-align: top; }
  .diagram-chart-cell { width: 42%; vertical-align: middle; text-align: center; padding: 10px 6px 10px 8px; }
  .diagram-side-cell { width: 58%; vertical-align: top; padding: 8px 8px 8px 8px; }
  .diagram-chart-wrap { text-align: center; margin: 0 auto; max-width: 100%; }
  .diagram-chart-wrap svg { max-width: 100%; height: auto; }
  .rendemen-total-table { width: auto; border-collapse: collapse; border: 0; margin: 0 auto; table-layout: auto; }
  .rendemen-total-table td { border: 0; padding: 0; text-align: center; background: transparent; }
  .rendemen-total-label-cell { font-weight: bold; font-size: 12px; text-transform: uppercase; padding-bottom: 4px; }
  .rendemen-total-label-cell h2 { margin: 0; font-size: 18px; }
  .rendemen-total-value-cell { font-size: 24px; font-weight: bold; font-family: Calibri, "DejaVu Sans", sans-serif; border: 2px solid #000; padding: 4px 30px; background: #fff; }
  .rendemen-total-value-cell h1 { margin: 0; font-size: 24px; }
  .diagram-kategori-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; margin: 0; }
  .diagram-kategori-table th, .diagram-kategori-table td { border: 1px solid #000; padding: 4px 6px; }
  .diagram-kategori-table th { background: #1a3a5c; color: #fff; font-weight: bold; text-align: center; font-size: 11px; }
  .diagram-kategori-table td.num { text-align: right; white-space: nowrap; font-family: Calibri, "DejaVu Sans", sans-serif; }
  .diagram-kategori-table td.left { text-align: left; }
  .diagram-kategori-table td.total-row { font-weight: bold; border-top: 1px solid #1a3a5c; background: #eef2f8; }
  .category-swatch { border-radius: 50%; width: 4px; height: 4px; vertical-align: middle; }
  .ringkasan-table { width: 100%; border: 1px solid #000; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: 10px; }
  .ringkasan-table td { border: 0; padding: 3px 10px; background: transparent; vertical-align: top; }
  .ringkasan-table td.ringkasan-head { text-align: center; font-weight: bold; font-size: 12px; padding: 5px 8px; background: #1a3a5c; color: #fff; border-bottom: 1px solid #000; }
  .ringkasan-table td.ringkasan-formula { padding: 4px 10px; border-top: 1px solid #000; font-style: italic; }
  .ringkasan-rendemen-highlight { color: #c0392b; font-weight: bold; }
  .keterangan-box { font-size: 10px; padding: 6px 0 0 0; text-align: left; }
  .keterangan-title { font-weight: bold; font-style: normal; margin: 0 0 4px 0; text-align: left; }
  .keterangan-line { margin: 1px 0; }
  .keterangan-label { font-weight: bold; font-style: normal; }
  .summary-section { page-break-before: always; }
  .summary-frame-table { width: 100%; height: 252mm; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .summary-frame-cell { border: 1px solid #000; padding: 4mm; height: 252mm; vertical-align: top; text-align: left; background: #fff; }
  .summary-section-heading-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 25px 0 14px 0; }
  .summary-section-heading-table td { border: 0; padding: 0; text-align: center; font-size: 12px; font-weight: bold; background: transparent; }
  .summary-rendemen-table { width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed; }
  .summary-rendemen-table td { border: 0; padding: 0 0 2px 0; text-align: right; font-size: 11px; background: transparent; }
  .summary-money-box { width: 92mm; font-size: 11px; text-align: left; }
  .summary-money-box .money-table { width: 92mm; }
  .summary-money-box .money-label { width: 12mm; font-size: 11px; }
  .summary-money-box .money-value { width: 35mm; font-size: 11px; }
  .summary-money-box .money-flag-attachment { width: 45mm; font-size: 11px; line-height: 1.2; padding-left: 12px; white-space: normal; }
  .summary-pair-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 10px 0; }
  .summary-pair-table td { border: 0; padding: 0; vertical-align: top; background: transparent; }
  .summary-pair-left { width: 50%; padding-right: 14px; }
  .summary-pair-right { width: 50%; }
  .group-summary-wrap { width: 295px; margin: 0 0 10px auto; }
  .group-summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
  .group-summary-table th, .group-summary-table td { border: 1px solid #000; padding: 3px 5px; }
  .group-summary-table th { text-align: center; font-weight: bold; }
  .group-summary-table td:first-child { text-align: left; }
  .group-summary-table td.num { text-align: right; white-space: nowrap; font-family: Calibri, "DejaVu Sans", sans-serif; }
  .group-summary-total td { font-weight: bold; }
`;

// Production

const REKAP_PRODUKSI_BARANG_JADI_CONSOLIDATED_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .production-section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  table.production-table {
    width: 100%;
    margin-bottom: 0;
    border-collapse: collapse;
    table-layout: fixed;
    page-break-inside: auto;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
  }
  .production-table th,
  .production-table td {
    border: 0;
    border-left: 1px solid #000;
    border-right: 1px solid #000;
    padding: 2px 3px;
    vertical-align: middle;
  }
  .production-table th {
    text-align: center;
    font-weight: bold;
    font-size: 11px;
    border-bottom: 1px solid #000;
    background: #ffffff;
    color: #000;
  }
  .production-table tbody td {
    border-top: 0;
    border-bottom: 0;
  }
  /* Keep dates ("1-Sep-26") and figures on a single line in the narrow columns. */
  .production-table td,
  .production-table th { white-space: nowrap; }
  .production-table td.number {
    text-align: right;
    white-space: nowrap;
    font-family: Calibri, "DejaVu Sans", sans-serif;
  }
  .production-table .row-odd td { background: #c9d1df; }
  .production-table .row-even td { background: #eef2f8; }
  .production-table .totals-row td {
    font-weight: bold;
    font-size: 11px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    background: #ffffff;
  }
  .production-table .grand-total-row td {
    font-weight: bold;
    font-size: 12px;
    border-top: 1px solid #000;
    border-right: 0;
    border-bottom: 2px solid #000;
    border-left: 0;
    background: #ffffff;
  }
`;

const REKAP_PRODUKSI_CROSS_CUT_AKHIR_CONSOLIDATED_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .production-section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  table.production-table { width: 100%; margin-bottom: 0; border-collapse: collapse; table-layout: fixed; page-break-inside: auto; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .production-table th, .production-table td { border: 0; border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
  .production-table th { text-align: center; font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; background: #fff; }
  .production-table tbody td { border-top: 0; border-bottom: 0; }
  .production-table td, .production-table th { white-space: nowrap; }
  .production-table td.number { text-align: right; font-family: Calibri, "DejaVu Sans", sans-serif; }
  .production-table tbody tr.row-odd td { background: #c9d1df; }
  .production-table tbody tr.row-even td { background: #eef2f8; }
  .production-table .totals-row td { font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; background: #fff; }
  .production-table .grand-total-row td { font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-right: 0 !important; border-bottom: 2px solid #000; border-left: 0 !important; background: #fff; }
`;

const REKAP_PRODUKSI_CROSS_CUT_AKHIR_PER_JENIS_PER_GRADE_CSS = `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .grade-table { margin-bottom: 12px; }
  .grade-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .grade-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
`;

const REKAP_PRODUKSI_PACKING_PER_JENIS_PER_GRADE_CSS = `
  .group-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

const REKAP_RENDEMEN_RAMBUNG_PER_SUPPLIER_CSS = `
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tfoot td { font-weight: bold; font-size: 11px; background: #fff; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

// Detail, stock, and balances

const SALDO_BARANG_JADI_HIDUP_PER_JENIS_PER_PRODUK_CSS = `
  .section-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  .product-title { font-weight: bold; margin: 6px 0 2px 20px; }
  .report-table { margin-left: 20px; width: calc(100% - 20px); table-layout: fixed; }
  .report-table thead th { padding: 2px 3px; }
  .report-table tbody td { padding: 1px 3px; overflow-wrap: normal; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .report-table tbody tr.totals-row td.blank { text-align: center; }
  /* Summary "Total (M3) Per-Jenis" sits flush left, aligned with the
     "JABON" section title (only the product tables are indented) and has no
     border. */
  .report-table-summary { margin-left: 0; margin-top: 4px; border-collapse: collapse; border-spacing: 0; border: 0; }
  .report-table-summary td { padding: 1px 4px; border: 0 !important; }
  .report-table-summary tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border: 0 !important; }
`;

const SALDO_HIDUP_KAYU_BULAT_KG_CSS = `
  .kb-block { margin-bottom: 10px; }
  .kb-meta { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .kb-meta td { padding: 1px 2px; vertical-align: top; border: 0 !important; background: #fff !important; font-size: 10px; }
  .kb-meta .meta-label { width: 78px; white-space: nowrap; }
  .kb-meta .meta-sep { width: 10px; text-align: center; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .summary-page { margin-top: 14px; }
  .summary-wrap { width: 48%; }
`;

const STOCK_OPNAME_KB_CSS = `
  .rangkuman-list { margin: 0 0 10px 18px; padding: 0; font-size: 10px; list-style: none; }
  .rangkuman-list li { margin-bottom: 2px; }
  .rangkuman-list strong { font-family: Calibri, "DejaVu Sans", sans-serif; }
`;

const STOCK_RACIP_KAYU_LAT_CSS = `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; }
`;

// Targets and timelines

const TARGET_MASUK_BB_BULANAN_CSS = `
  .metric-label { font-weight: bold; }
  .under-target { font-weight: bold; }
  .chart-wrap { margin-top: 35px; text-align: center; }
  .chart-title { margin: 0 0 6px 0; text-align: center; font-size: 11px; font-weight: bold; }
`;

const TARGET_MASUK_BB_HARIAN_CSS = `
  .lb-head { background: #e9d8fd !important; }
  .under-target-cell { color: #b02a37; font-weight: bold; }
  .row-label { font-weight: normal; }
  .chart-wrap { margin-top: 35px; text-align: center; }
`;

const TIMELINE_KAYU_BULAT_HARIAN_CSS = `
  .report-table th { white-space: nowrap; }
`;

const TIMELINE_KB_HARIAN_RAMBUNG_KG_CSS = `
  .report-table th { white-space: nowrap; }
  .report-table thead th:nth-child(2), .report-table tbody td:nth-child(2) { width: 20%; }
  .report-table tbody td:nth-child(2) { white-space: nowrap; }
`;

// Age reports

const UMUR_KAYU_BULAT_NON_RAMBUNG_CSS = `
  .duration-bold { font-weight: bold; }
  .section-break { height: 10px; }
  .section-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }

  /* Compact cell sizing so every column fits on one line inside one page. */
  .report-table thead th { font-size: 10px; padding: 2px 3px; }
  .report-table tbody td { font-size: 9px; padding: 1px 3px; }

  /* The shared CSS drops the bottom border of colspan headers (meant for
     two-tier headers). Umur uses a single header row, so the "Tanggal Racip"
     and "Lama Racip" groups would otherwise have no closing line. */
  .report-table thead tr.headers-row:first-child th[colspan] {
    border-bottom: 1px solid #000 !important;
  }

  /* Legacy umur border model: header band with top+bottom lines, data rows
     show vertical separators only, totals row on a white band, and the table
     frame closes with border-left + border-bottom (.report-table). */
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tbody tr.totals-row td {
    background: #fff !important;
    border-top: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
  }
`;

const UMUR_KAYU_BULAT_RAMBUNG_CSS = `
  .duration-bold { font-weight: bold; }
  .section-break { height: 10px; }
  .section-title { margin: 8px 0 4px 0; font-size: 12px; font-weight: bold; }

  /* Compact cells so every column fits on one line (portrait, one page). */
  .report-table thead th { font-size: 10px; padding: 2px 3px; }
  .report-table tbody td { font-size: 9px; padding: 1px 3px; }

  /* The shared CSS drops the bottom border of colspan headers (two-tier
     headers). This report has a single header row, so keep the line. */
  .report-table thead tr.headers-row:first-child th[colspan] {
    border-bottom: 1px solid #000 !important;
  }

  /* Legacy border model: header band with top+bottom lines, data rows show
     vertical separators only, totals row on a white band, and the table frame
     closes with border-left + border-bottom (.report-table). */
  .report-table tbody tr.data-row td.data-cell {
    border-top: 0 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
    border-right: 1px solid #000 !important;
  }
  .report-table tbody tr.totals-row td {
    background: #fff !important;
    font-size: 10px;
    border-top: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    border-bottom: 0 !important;
    border-left: 0 !important;
  }

  .group-note { width: 100%; margin: 4px 0 14px 0; font-size: 11px; }
  .group-note td { border: 0 !important; padding: 0 4px; background: transparent !important; vertical-align: top; white-space: nowrap; }
  .group-note .left { text-align: left; }
  .group-note .center { text-align: center; }
  .group-note .right { text-align: right; }
`;

const REPROSES_HIDUP_DETAIL_CSS = `
  .report-table th:nth-child(1) { width: 32px; }
  .report-table th:nth-child(2) { width: 92px; }
  .report-table th:nth-child(3) { width: 76px; }
  .report-table th:nth-child(4) { width: 74px; }
  .report-table th:nth-child(6) { width: 44px; }
  .report-table th:nth-child(7) { width: 50px; }
  .report-table th:nth-child(8) { width: 56px; }
  .report-table th:nth-child(9) { width: 66px; }
  .report-table th:nth-child(10) { width: 56px; }
  .report-table th:nth-child(11) { width: 54px; }
  .report-table td.m3-total { font-weight: bold; }
`;

const UMUR_REPROSES_DETAIL_CSS = `
  .report-table th:nth-child(1) { width: 34px; }
  .report-table th:nth-child(2) { width: 150px; }
  .report-table th:nth-child(3),
  .report-table th:nth-child(4) { width: 44px; }
  .report-table th:nth-child(5) { width: 56px; }
  .report-table th:nth-child(11) { width: 72px; }
  .report-table td.total-cell { font-weight: bold; }
`;

const WPS_REPORT_STYLES = {
  dashboard_barang_jadi: DASHBOARD_BARANG_JADI_CSS,
  dashboard_cross_cut_akhir: DASHBOARD_CROSS_CUT_AKHIR_CSS,
  dashboard_reproses: DASHBOARD_REPROSES_CSS,
  ketahanan_barang_reproses: KETAHANAN_BARANG_REPROSES_CSS,
  mutasi_barang_jadi_per_jenis_per_ukuran: MUTASI_BARANG_JADI_PER_JENIS_PER_UKURAN_CSS,
  mutasi_barang_jadi: MUTASI_BARANG_JADI_CSS,
  mutasi_cross_cut_akhir: MUTASI_CROSS_CUT_AKHIR_CSS,
  mutasi_reproses: MUTASI_REPROSES_CSS,
  penerimaan_kayu_bulat_kg: PENERIMAAN_KAYU_BULAT_KG_CSS,
  penerimaan_kayu_bulat_per_supplier_grafik: PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GRAFIK_CSS,
  penerimaan_kayu_bulat_per_supplier_group: PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GROUP_CSS,
  penerimaan_kayu_bulat_per_supplier_kg: PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_KG_CSS,
  penerimaan_kayu_bulat_ton: PENERIMAAN_KAYU_BULAT_TON_CSS,
  perbandingan_kb_masuk_periode_kg: PERBANDINGAN_KB_MASUK_PERIODE_KG_CSS,
  perbandingan_kb_masuk_periode: PERBANDINGAN_KB_MASUK_PERIODE_CSS,
  rekap_pembelian_kayu_bulat_kg: REKAP_PEMBELIAN_KAYU_BULAT_KG_CSS,
  rekap_penerimaan_st_dari_sawmill_kg: REKAP_PENERIMAAN_ST_DARI_SAWMILL_KG_CSS,
  rekap_penerimaan_st_sawmill_costing_rambung: REKAP_PENERIMAAN_ST_SAWMILL_COSTING_RAMBUNG_CSS,
  rekap_produksi_barang_jadi_consolidated: REKAP_PRODUKSI_BARANG_JADI_CONSOLIDATED_CSS,
  rekap_produksi_cross_cut_akhir_consolidated: REKAP_PRODUKSI_CROSS_CUT_AKHIR_CONSOLIDATED_CSS,
  rekap_produksi_cross_cut_akhir_per_jenis_per_grade: REKAP_PRODUKSI_CROSS_CUT_AKHIR_PER_JENIS_PER_GRADE_CSS,
  rekap_produksi_packing_per_jenis_per_grade: REKAP_PRODUKSI_PACKING_PER_JENIS_PER_GRADE_CSS,
  rekap_rendemen_rambung_per_supplier: REKAP_RENDEMEN_RAMBUNG_PER_SUPPLIER_CSS,
  saldo_barang_jadi_hidup_per_jenis_per_produk: SALDO_BARANG_JADI_HIDUP_PER_JENIS_PER_PRODUK_CSS,
  saldo_hidup_kayu_bulat_kg: SALDO_HIDUP_KAYU_BULAT_KG_CSS,
  stock_opname_kb: STOCK_OPNAME_KB_CSS,
  stock_racip_kayu_lat: STOCK_RACIP_KAYU_LAT_CSS,
  target_masuk_bb_bulanan: TARGET_MASUK_BB_BULANAN_CSS,
  target_masuk_bb_harian: TARGET_MASUK_BB_HARIAN_CSS,
  timeline_kayu_bulat_harian: TIMELINE_KAYU_BULAT_HARIAN_CSS,
  timeline_kb_harian_rambung_kg: TIMELINE_KB_HARIAN_RAMBUNG_KG_CSS,
  umur_kayu_bulat_non_rambung: UMUR_KAYU_BULAT_NON_RAMBUNG_CSS,
  umur_kayu_bulat_rambung: UMUR_KAYU_BULAT_RAMBUNG_CSS,
  reproses_hidup_detail: REPROSES_HIDUP_DETAIL_CSS,
  umur_reproses_detail: UMUR_REPROSES_DETAIL_CSS,
} as const;

export type WpsReportStyle = keyof typeof WPS_REPORT_STYLES;

export function getWpsReportStyle(style: WpsReportStyle): string {
  return WPS_REPORT_STYLES[style];
}
