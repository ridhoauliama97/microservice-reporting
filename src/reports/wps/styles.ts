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
    font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums;
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
    font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums;
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
    font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums;
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

const MUTASI_FINGER_JOINT_CSS = `
  .report-table td.number { white-space: nowrap; }
  /* The legacy blade sizes these columns in px against an 11px header font.
     The shared layout renders at 12px, so the header is pinned back to 11px
     and long labels wrap instead of colliding with their neighbour. */
  .report-table thead tr.headers-row th { font-size: 11px; white-space: normal; line-height: 1.15; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
  .sub-report-table { width: 70%; }
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
  .report-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }

  .grand-total-line { width: 200px; border-top: 1px solid #000; margin: 8px 0 4px; }
  .grand-total-table { width: 200px; margin: 0 0 14px; border-collapse: collapse; }
  .grand-total-table td { padding: 0; font-size: 11px; font-weight: bold; vertical-align: top; border: 0 !important; background: #fff !important; }
  .grand-total-label { width: 58px; text-align: left; }
  .grand-total-value { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }

  .signature-table { margin-top: 14px; table-layout: fixed; }
  .signature-table td { width: 14.28%; text-align: center; vertical-align: top; padding: 0 2px; border: 0 !important; background: #fff !important; }
  .signature-label-row td { padding-bottom: 18px; }
  .signature-placeholder-row td { padding-top: 50px; }
  .signature-placeholder-table { width: 100%; border-collapse: collapse; }
  .signature-placeholder-table td { padding: 0; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; font-size: 11px; font-weight: normal; text-align: center; border: 0 !important; background: #fff !important; }
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
  .money-value { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; width: 150px; font-weight: bold; }
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
  .mini-table td.num { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
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
  .rendemen-total-value-cell { font-size: 24px; font-weight: bold; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; border: 2px solid #000; padding: 4px 30px; background: #fff; }
  .rendemen-total-value-cell h1 { margin: 0; font-size: 24px; }
  .diagram-kategori-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; margin: 0; }
  .diagram-kategori-table th, .diagram-kategori-table td { border: 1px solid #000; padding: 4px 6px; }
  .diagram-kategori-table th { background: #1a3a5c; color: #fff; font-weight: bold; text-align: center; font-size: 11px; }
  .diagram-kategori-table td.num { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
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
  .group-summary-table td.num { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
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
    font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums;
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

// The Laminating blades size their columns in px against a 10px body font,
// while the shared layout renders at 12px, so these presets pin the table
// back to 11px and let long headers wrap instead of colliding.
const LAMINATING_TABLE_CSS = `
  .report-table { font-size: 11px; }
  .report-table thead tr.headers-row th { white-space: normal; line-height: 1.15; }
`;

const MUTASI_LAMINATING_CSS = `${LAMINATING_TABLE_CSS}
  .report-table td.number { white-space: nowrap; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

const REKAP_PRODUKSI_LAMINATING_CONSOLIDATED_CSS = `
  .section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  .production-table { margin-bottom: 12px; font-size: 11px; }
  .production-table th, .production-table td.number { white-space: nowrap; }
  /* The shared layout pads cells 6px/8px, which leaves too little room for a
     two-word header like "Output Laminating" in a 58px column. */
  .production-table thead th { padding: 3px 4px; }
  .production-table thead th[colspan] { text-align: center; }
  .production-table .bounded-row td:first-child { border-left: 1px solid #000; }
  .production-table .bounded-row td:last-child { border-right: 1px solid #000; }
  .production-table tbody tr.totals-row td { font-weight: bold; font-size: 11px; background: #fff; border-top: 1px solid #000; }
  .production-table tbody tr.grand-total-row td { font-weight: bold; font-size: 11px; background: #e8eef7; border-top: 1px solid #000; }
`;

const REKAP_PRODUKSI_LAMINATING_PER_JENIS_PER_GRADE_CSS = `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .grade-table { margin-bottom: 12px; }
  .grade-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .grade-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
`;

const MUTASI_MOULDING_CSS = `${LAMINATING_TABLE_CSS}
  .report-table td.number { white-space: nowrap; }
  .report-table tbody tr.data-row td.data-cell { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: 0; border-left: 0; }
`;

const FLOW_PRODUKSI_PER_PERIODE_CSS = `
  .report-table { font-size: 11px; }
  .report-table thead tr.headers-row th { white-space: normal; line-height: 1.15; padding: 3px 4px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; }
  .summary-table { width: auto; margin-top: 12px; }
  .summary-table td { border: 0 !important; padding: 2px 6px 2px 0; }
`;

const REKAP_MUTASI_CSS = `
  .section-subtitle { margin: 6px 0 3px 0; font-size: 10px; font-weight: bold; }
  .report-table { font-size: 10px; }
  /* auto layout, not the shared fixed one: the 12-column Sawntimber section and
    the 9-column production input tables were splitting totals across two
    lines ("411.900" / "9") and overlapping their header text. Sizing columns
    to their content avoids both. */
  .report-table.rekap-main, .report-table.rekap-input { table-layout: auto; }
  .report-table.rekap-main td.number, .report-table.rekap-input td.number { white-space: nowrap; }
  .report-table.rekap-main thead th, .report-table.rekap-input thead th { white-space: nowrap; padding: 2px 4px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .report-table.rekap-input { width: 62%; }
  /* One wrapper for the input breakdown and the Input/Output/Rendemen summary,
     so both sit on the same left edge under the main table. */
  .section-detail { margin-left: 10px; }
  .section-detail > * { margin-left: 0; }
  .performance-table { width: 28%; margin-top: 4px; margin-bottom: 10px; border-collapse: collapse; }
  .performance-table td { padding: 3px 6px; border: 1px solid #000; font-weight: bold; background: #fff !important; }
`;

const DASHBOARD_RU_CSS = `
  .report-table.dashboard-ru { table-layout: fixed; font-size: 7px; border: 1px solid #000; }
  .report-table.dashboard-ru thead th { font-size: 7px; padding: 2px 1px; line-height: 1.1; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  /* "th + th" rather than a border on every th: the first cell (No) has no left
     border of its own, so the table's outer box is what closes its left edge.
     Without the explicit top border above, the header row had none at all and
     the No cell read as borderless. */
  .report-table.dashboard-ru thead th + th { border-left: 1px solid #000; }
  .report-table.dashboard-ru thead th.no-column { border-right: 2px solid #000 !important; }
  .report-table.dashboard-ru thead th.group-start,
  .report-table.dashboard-ru thead th.stock-type-start { border-left: 2px solid #000 !important; }
  .report-table.dashboard-ru thead tr:first-child th { border-bottom: 0; }
  .report-table.dashboard-ru thead tr.sub-header th { border-top: 1px solid #000; }
  .report-table.dashboard-ru tbody td { padding: 1px 1px; border-left: 1px solid #000; border-top: 0; border-bottom: 0; white-space: nowrap; }
  .report-table.dashboard-ru tbody td.no-column { border-right: 2px solid #000 !important; }
  .report-table.dashboard-ru tbody td.group-start,
  .report-table.dashboard-ru tbody td.stock-type-start { border-left: 2px solid #000 !important; }
  .report-table.dashboard-ru tbody tr.total-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  /* Kiln & Dryer cells carry the longest values in the report across ten narrow
     columns, so they run a point smaller than the rest. */
  .report-table.dashboard-ru tbody td.kiln-cell { font-size: 6px; }
  .report-table.dashboard-ru .tone-blue { color: #005bbb; font-weight: bold; }
  .report-table.dashboard-ru .tone-orange { color: #e67e00; font-weight: bold; }
  .report-table.dashboard-ru .tone-red { color: #c00000; font-weight: bold; }
  .summary-table { width: 38%; border-collapse: collapse; border-spacing: 0; margin-top: 6px; }
  .summary-table td { border: 0 !important; padding: 1px 4px; background: #fff !important; }
`;

const REKAP_MUTASI_CROSS_TAB_CSS = `
  .report-table.cross-tab { font-size: 10px; table-layout: fixed; }
  .report-table.cross-tab thead th { padding: 3px 3px; font-size: 10px; }
  .report-table.cross-tab tbody td { padding: 2px 3px; }
  .report-table.cross-tab tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .stats-table { margin-top: 4px; margin-bottom: 8px; }
`;

const DISCREPANCY_REKAP_MUTASI_CSS = `
  .report-table { font-size: 10px; table-layout: fixed; }
  .report-table thead th { padding: 3px 3px; font-size: 10px; }
  .report-table tbody td { padding: 2px 3px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .stats-table { margin-top: 4px; margin-bottom: 8px; }
`;

const HASIL_PRODUKSI_MESIN_LEMBUR_CSS = `
  .report-table { font-size: 10px; }
  .report-table thead tr th { white-space: normal; line-height: 1.15; padding: 3px 4px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.total-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .report-table tbody tr.date-group-start td { border-top: 1px solid #000 !important; }
  .report-table tbody tr:first-child.date-group-start td { border-top: 0 !important; }
  .page-break-before { break-before: page; page-break-before: always; }
  .rangkuman-title { text-align: center; margin: 0 0 8px 0; font-size: 14px; font-weight: bold; }
`;

const REKAP_STOCK_ON_HAND_CSS = `
  .section-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  .compact-note { margin: 0 0 4px 0; font-size: 9px; color: #444; }
  .report-table { font-size: 10px; }
  .report-table thead tr.headers-row th { white-space: normal; line-height: 1.15; padding: 3px 3px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .report-table.soh-summary { margin-top: 4px; }
`;

const STOCK_HIDUP_PER_NOSPK_CSS = `
  .section-title { margin: 12px 0 4px 0; font-size: 11px; font-weight: bold; }
  .summary-title { margin: 12px 0 4px 0; font-size: 11px; font-weight: bold; }
  .report-table { font-size: 10px; }
  .report-table thead tr.headers-row th { white-space: normal; line-height: 1.15; padding: 3px 3px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .summary-list {
    list-style: none; margin: 4px 0 0 0; padding: 0; width: 34%;
    /* Keep the list whole: a split left the Grand Total stranded alone on an
       otherwise blank page. */
    break-inside: avoid; page-break-inside: avoid;
  }
  .summary-list li {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 2px 4px; border-bottom: 1px solid transparent;
  }
  .summary-list li.summary-last { border-bottom: 1px solid #000; }
  .summary-list li.grand-total { font-weight: bold; }
  .summary-list li .number { text-align: right; white-space: nowrap; }
`;

const PRODUKSI_SEMUA_MESIN_CSS = `
  .report-table.semua-mesin { table-layout: fixed; font-size: 9px; }
  .report-table.semua-mesin thead th { font-size: 9px; padding: 2px 2px; line-height: 1.1; }
  .report-table.semua-mesin thead th[rowspan] { vertical-align: middle; }
  .report-table.semua-mesin thead tr:last-child th { font-size: 8px; }
  .report-table.semua-mesin tbody td { padding: 1px 2px; white-space: nowrap; }
  .report-table.semua-mesin tbody tr.total-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
`;

const PRODUKSI_HULU_HILIR_CSS = `
  .report-table.hulu-hilur { table-layout: fixed; width: 100%; }
  /* 45 columns on one landscape page: 7px keeps values such as "116.5%" inside
     their borders. At 8px they overran the column edge. */
  .report-table.hulu-hilur { font-size: 7px; }
  .report-table.hulu-hilur thead th { font-size: 7px; padding: 2px 2px; line-height: 1.1; }
  .report-table.hulu-hilur tbody td { padding: 1px 2px; white-space: nowrap; }
  .report-table.hulu-hilur tbody tr.total-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; font-size: 7px; }
  .report-table.hulu-hilur tbody tr.target-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .report-table.hulu-hilur .output-below-target { color: #c00000; font-weight: bold; font-style: italic; }
`;

// Koordinat Tanah: a two-column header block above three stacked tables.
const KOORDINAT_TANAH_CSS = `
  .meta-grid { width: 100%; margin-bottom: 10px; }
  .meta-grid td { border: 0 !important; padding: 2px 6px 2px 0; vertical-align: top; }
  .meta-grid table { width: 100%; border-collapse: collapse; }
  .meta-label { width: 68px; white-space: nowrap; }
  .meta-sep { width: 10px; text-align: center; }
  .section-title { margin: 10px 0 6px 0; font-size: 12px; font-weight: bold; }
  .report-table { margin-bottom: 10px; }
  .report-table thead tr th { padding: 2px 3px; font-size: 10px; white-space: normal; line-height: 1.15; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; border-top: 1px solid #000 !important; }
  .ringkasan { margin-top: 8px; font-size: 11px; font-weight: bold; }
`;

// Penjualan Barang Jadi (m3): a header block, then a table per Jenis Kayu each
// followed by its own right-aligned total block.
const PENJUALAN_BARANG_JADI_M3_CSS = `
  .meta-grid { width: 100%; margin-bottom: 10px; }
  .meta-grid td { border: 0 !important; padding: 2px 6px 2px 0; vertical-align: top; }
  .meta-grid table { width: 100%; border-collapse: collapse; }
  .meta-label { width: 68px; white-space: nowrap; }
  .meta-sep { width: 10px; text-align: center; }
  .section-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .report-table thead tr th { padding: 2px 3px; font-size: 10px; white-space: normal; line-height: 1.15; }
  .report-table td.number { white-space: nowrap; }
  .total-line { width: 240px; margin: 0 0 12px auto; border-collapse: collapse; }
  .total-line td { border: 0; padding: 1px 4px; vertical-align: top; }
  .total-line .total-label { text-align: right; white-space: nowrap; }
  .total-line .total-value { text-align: right; white-space: nowrap; font-weight: bold; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .total-line.grand-total { margin-top: 6px; margin-bottom: 0; }
`;

// Surat Jalan is a delivery note, not a report: an all-caps centred title, the
// consignee block on the left and the document block on the right, then the logs
// and a six-column signature block carried in the page footer.
const SURAT_JALAN_CSS = `
  .report-title { display: none; }
  .document-title { margin: 0 0 10px; text-align: center; font-size: 18px; font-weight: bold; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .header-table td { border: 0; padding: 0; vertical-align: top; }
  .recipient-name { margin-top: 2px; font-size: 16px; font-weight: bold; }
  .vehicle { margin-top: 8px; }
  .meta-table { width: auto; border-collapse: collapse; margin-left: auto; }
  .meta-table td { border: 0; padding: 1px 0; }
  .meta-date { text-align: right; }
  .meta-table .meta-label { width: 112px; white-space: nowrap; text-align: right; }
  .meta-table .meta-sep { width: 12px; text-align: center; }
  .meta-table .meta-value { min-width: 170px; text-align: right; }
  /* Breathing room between the rule that closes the header block and the table
     below it. */
  .top-line { border-top: 1px solid #000; margin-bottom: 14px; }
  .report-table { margin-bottom: 26px; }
  .report-table thead tr th { padding: 2px 3px; font-size: 9px; white-space: normal; line-height: 1.15; }
  .report-table td.nowrap, .report-table th { white-space: nowrap; }
  .report-table td.number { white-space: nowrap; }
  /* A rule above the first row of each new delivery date. */
  .report-table tbody tr.date-separator td { border-top: 2px solid #000 !important; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; border-top: 1px solid #000 !important; }
  /* The signature block is part of the body, so it can use normal flow. */
  .signature-top-line { border-top: 1px solid #000; margin-bottom: 8px; }
  .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; }
  .signature-table td { border: 0; padding: 0 2px; vertical-align: top; text-align: center; background: transparent; }
  .signature-label { font-weight: normal; text-align: center; margin: 0; }
  .signature-space td { height: 40px; }
  .signature-line { font-family: "Courier New", monospace; font-size: 11px; }
`;

// Timeline Rekap Penjualan Per-Produk. The month columns are generated, so the
// table is sized for up to fourteen of them (the legacy blade's 3.5% floor on
// 52% of the page width) and stays in portrait to match.
const TIMELINE_PENJUALAN_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .summary-title { margin: 14px 0 4px 0; font-size: 11px; font-weight: bold; }
  .report-table.detail-table, .report-table.summary-table { margin-bottom: 14px; }
  /* Column widths are emitted inline by the report: under table-layout:fixed a
     set of declared percentages that does not add up to 100 is scaled up
     proportionally, so the leftover cannot be left to the month columns here. */
  /* Legacy border model: outer box on the table, cells add only a left rule,
     and the first cell of each row has none so the box is not doubled. */
  .report-table { border: 1px solid #000; }
  .report-table th, .report-table td { border: 0; border-left: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
  .report-table th:first-child, .report-table td:first-child { border-left: 0; }
  /* Close the right-hand side of each row too. Relying on the table's own
     border left the last column looking open where a cell background (zebra,
     or the product-name whiteout) met it. */
  .report-table th:last-child, .report-table td:last-child { border-right: 1px solid #000; }
  .report-table th[colspan] { border-right: 1px solid #000; }
  /* Headings stay on one line. They used to be allowed to wrap, which split
     "Sub Total" over two rows; the column widths are now sized from the widest
     heading, so there is room without wrapping. */
  .report-table th { border-bottom: 1px solid #000; white-space: nowrap; }
  .report-table tbody td { border-top: 0; border-bottom: 0; }
  .report-table td.number { white-space: nowrap; }
  /* The product name sits on one middle row of its block, so its cell is
     whited out: the zebra would otherwise stripe the name's row only. */
  .report-table td.product-name-cell { background: #fff !important; text-align: center !important; }
  /* The total row sits on a white band with a rule above it. Each cell carries
     its own top border so the line runs the full width, including under the
     last column, which a single colspan'd cell would have left open. */
  .report-table tbody tr.totals-row td { font-weight: bold; border-top: 1px solid #000 !important; background: #fff !important; }
  .report-table tbody tr.product-divider td { border-top: 1px solid #000 !important; }
  .report-table.detail-table { width: 100%; }
  .report-table.summary-table { width: 92%; }
`;

// The seven "Produksi Per Nomor Produksi" reports: a two-pane header block,
// then the Input and Output tables one above the other, each full width.
//
// They are stacked rather than side by side because the two sides rarely have
// the same number of lines — the S4S report runs to 26 input rows against 6
// output rows. Side by side, the shorter table's total row lands halfway down
// the page and leaves a column of empty white beside the longer table's
// remaining rows. Stacked, each table is exactly as tall as its own data.
const PRODUKSI_PER_NOMOR_PRODUKSI_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .report-title { margin: 0 0 10px 0; text-align: center; font-size: 15px; font-weight: bold; }
  .meta-grid { margin-bottom: 10px; border-collapse: collapse; }
  .meta-grid td { border: 0 !important; padding: 0; vertical-align: top; }
  .meta-pane-left { width: 50%; }
  .meta-pane-right { width: 26%; }
  .meta-table { border-collapse: collapse; }
  .meta-table td { border: 0 !important; padding: 2px 0; font-size: 10px; vertical-align: top; }
  .meta-label { width: 72px; }
  .meta-sep { width: 10px; text-align: center; }

  .section-heading { margin: 10px 0 3px 0; font-size: 12px; font-weight: bold; }
  /* Input and Output sit side by side, but not touching. At a plain 50/50 the
     two tables' outer rules met and the pair read as one twelve-column table.
     Each table now takes 49% and the leftover 2% is an empty spacer column,
     so each keeps its own box and its own height (vertical-align: top) while
     still sitting across from its counterpart. */
  .split-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* Scoped to the grid's OWN cells with a child combinator. A bare
     ".split-grid td" also matches every td inside the nested detail table, and
     with !important that beat ".detail-table td" outright — which is why the
     data rows came out with no rules at all while the header, whose cells are
     th rather than td, kept its box. */
  .split-grid > tbody > tr > td { border: 0 !important; padding: 0; vertical-align: top; }
  .split-grid .left-pane { width: 49%; }
  .split-grid .right-pane { width: 49%; }
  .split-grid .gutter { width: 2%; }
  /* Keeps a heading, its table and the Rendemen line on the same page so the
     line is never orphaned onto a page of its own. Chromium still splits a
     block that is taller than the page, so a long table still paginates. */
  .report-block { break-inside: avoid; page-break-inside: avoid; }
  /* Every cell is fully boxed: the column rules AND the rules between data rows.
     The legacy stylesheet dropped the horizontal ones, which left the tables
     reading as loose vertical stripes with no row structure at all. */
  .detail-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .detail-table th, .detail-table td { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
  .detail-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .detail-table tbody td { vertical-align: middle; }
  .detail-table tbody tr.row-odd td { background: #eef2f8; }
  .detail-table tbody tr.row-even td { background: #cfd8e6; }
  .detail-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .detail-table tfoot td { font-weight: bold; font-size: 11px; background: #fff; }
  .detail-table .total-label { text-align: center; }
  /* A table that does span a page repeats its header band and keeps its zebra
     counting from the top, so the two pages read as one table. */
  .detail-table thead { display: table-header-group; }
  .detail-table tr { page-break-inside: avoid; }
  .rendemen-line { margin: 8px 0 0 0; font-size: 11px; }
`;

// Rekap Penjualan (Per-Produk, Per-Produk & Per-Buyer, Per-Buyer & Per-Produk).
// The three blades are the same stylesheet, so they share one preset; the inner
// section title is called .group-title because the legacy class name flipped
// between the two export reports (buyer-title / product-title) for no reason.
const REKAP_PENJUALAN_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .section-title { margin: 8px 0 4px 0; font-size: 11px; font-weight: bold; }
  .summary-title { margin: 14px 0 4px 0; font-size: 11px; font-weight: bold; }

  /* Legacy border model: the table carries the outer box and each cell adds a
     LEFT rule, so the column separators run the full height. Only the first
     cell of a row drops its left rule, otherwise the outer box is doubled.
     An earlier version zeroed border-left on EVERY header and total-row cell,
     which left those two bands with no column separators at all. */
  .report-table { border: 1px solid #000; }
  .report-table th, .report-table td { border: 0; border-left: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
  .report-table th:first-child, .report-table td:first-child { border-left: 0; }
  /* The header closes with a rule underneath and keeps its column separators. */
  .report-table thead th { border-bottom: 1px solid #000; font-size: 11px; }
  .report-table tbody td { border-top: 0; border-bottom: 0; }
  .report-table td.number { white-space: nowrap; }
  /* The total row sits on a white band with a rule above it, again keeping the
     column separators so it reads as part of the grid. */
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; border-top: 1px solid #000 !important; }

  /* The two export reports nest a table under each Buyer/Produk heading; the
     table and the heading share one left edge so the two line up. */
  .group-title { margin: 8px 0 4px 18px; font-size: 10px; font-weight: bold; }
  .report-table.product-table.indented-table { margin-left: 18px; width: calc(100% - 18px); }

  .report-table.summary-table { width: 70%; margin-top: 4px; }
  .report-table.summary-table td, .report-table.summary-table th { padding: 2px 4px; }

  /* Per-Produk's Rangkuman is a bordered four-column table of its own. */
  table.summary-table { width: 62%; border-collapse: collapse; margin-top: 4px; }
  table.summary-table th, table.summary-table td { border: 1px solid #000; padding: 2px 5px; }
  table.summary-table th { background: #fff; font-size: 11px; }
  table.summary-table td.number { white-space: nowrap; }
  table.summary-table tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; }
  table.summary-table tr.totals-row td.grand-label { text-align: right; }
`;

// Penjualan Lokal keeps full cell borders on every side (its blade does not use
// the shared "vertical separators only" data-row pattern), so it only needs the
// section-total and grand-total lines aligned under the table.
const PENJUALAN_LOKAL_CSS = `
  .section-title { margin: 12px 0 4px 0; font-size: 12px; font-weight: bold; }
  /* Both total lines span the full table width and carry the same 4px right
     padding as a data cell, so their figures end on exactly the same right edge
     as the Ton column. At the legacy's 97% width they stopped 13pt short of the
     table; at a full width with no padding they overshot the cells by the cell
     padding. */
  .section-total {
    box-sizing: border-box; width: 100%; padding-right: 4px; margin: 6px 0 2px 0;
    text-align: right; font-weight: bold; white-space: nowrap;
  }
  .grand-total {
    box-sizing: border-box; width: 100%; padding-right: 4px; margin: 2px 0 0 0;
    text-align: right; font-weight: bold; white-space: nowrap;
  }
  .report-table.penjualan-lokal-section td.number { white-space: nowrap; }
`;

const LABEL_PERHARI_CSS = `
  .section-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .report-table { font-size: 10px; }
  .report-table.label-perhari-detail { table-layout: fixed; }
  .label-perhari-summary { width: 50% }
  .report-table thead tr.headers-row th { white-space: normal; line-height: 1.15; padding: 3px 3px; }
  .report-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .report-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; }
  .chunk-page-break { break-after: page; page-break-after: always; }
`;

const REKAP_PRODUKSI_MOULDING_CONSOLIDATED_CSS = `
  .section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  .production-table { margin-bottom: 12px; font-size: 11px; }
  /* 18 columns at the legacy 5.55% leaves no room to keep headers on one
    line, so they wrap instead of bleeding into the neighbouring cell, and
    the date column is widened off percentage because "01-Agt-26" does not
    fit 5.55% of the page. */
  .production-table td.number { white-space: nowrap; }
  .production-table thead th { white-space: normal; line-height: 1.15; padding: 3px 3px; }
  .production-table thead th[colspan] { text-align: center; }
  .production-table .strong-number { font-weight: bold; }
  .production-table .bounded-row td:first-child { border-left: 1px solid #000; }
  .production-table .bounded-row td:last-child { border-right: 1px solid #000; }
  .production-table tbody tr.totals-row td { font-weight: bold; font-size: 11px; background: #fff; border-top: 1px solid #000; }
  .production-table tbody tr.grand-total-row td { font-weight: bold; font-size: 11px; background: #e8eef7; border-top: 1px solid #000; }
`;

const REKAP_PRODUKSI_MOULDING_PER_JENIS_PER_GRADE_CSS = `
  .group-title { margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; }
  .grade-table { margin-bottom: 12px; }
  .grade-table tbody tr.data-row td { border-top: 0; border-bottom: 0; border-left: 0; border-right: 1px solid #000; }
  .grade-table tbody tr.totals-row td { background: #fff !important; font-weight: bold; font-size: 11px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
`;

const REKAP_PRODUKSI_FINGER_JOINT_CONSOLIDATED_CSS = `
  .section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  .production-table { margin-bottom: 12px; font-size: 11px; }
  .production-table th, .production-table td.number { white-space: nowrap; }
  .production-table .bounded-row td:first-child { border-left: 1px solid #000; }
  .production-table .bounded-row td:last-child { border-right: 1px solid #000; }
  .production-table tbody tr.totals-row td { font-weight: bold; font-size: 11px; background: #fff; border-top: 1px solid #000; }
  .production-table tbody tr.grand-total-row td { font-weight: bold; font-size: 11px; background: #e8eef7; border-top: 1px solid #000; }
`;

const REKAP_PRODUKSI_CROSS_CUT_AKHIR_CONSOLIDATED_CSS = `
  body { font-size: 10px; line-height: 1.15; }
  .production-section-title { margin: 10px 0 4px 0; font-size: 11px; font-weight: bold; }
  table.production-table { width: 100%; margin-bottom: 0; border-collapse: collapse; table-layout: fixed; page-break-inside: auto; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .production-table th, .production-table td { border: 0; border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
  .production-table th { text-align: center; font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; background: #fff; }
  .production-table tbody td { border-top: 0; border-bottom: 0; }
  .production-table td, .production-table th { white-space: nowrap; }
  .production-table td.number { text-align: right; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
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

const REKAP_PRODUKSI_FINGER_JOINT_PER_JENIS_PER_GRADE_CSS = `
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
  /* Summary "Total (m3) Per-Jenis" sits flush left, aligned with the
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
  .rangkuman-list strong { font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
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

/**
 * The S4S dashboards. A daily movement grid with one column pair per group, and
 * v1 can carry five groups on an A4 landscape page while v2 carries fifteen, so
 * the figures are kept small and every cell fully boxed.
 */
const DASHBOARD_S4S_CSS = `
  .dashboard-s4s-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .dashboard-s4s-table th, .dashboard-s4s-table td { border: 1px solid #000; padding: 1px 3px; font-size: 8px; }
  .dashboard-s4s-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .dashboard-s4s-table thead { display: table-header-group; }
  .dashboard-s4s-table tbody tr { page-break-inside: avoid; }
  .dashboard-s4s-table td.center { text-align: center; }
  .dashboard-s4s-table td.number, .dashboard-s4s-table td.label { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .dashboard-s4s-table td.label { text-align: left; }
  .dashboard-s4s-table tfoot td { font-weight: bold; background: #fff; }
  .dashboard-s4s-table td.empty-cell { text-align: center; font-style: italic; }

  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .summary-table td { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
  .summary-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .summary-table td.label { text-align: left; }
  .summary-table tr.totals-row td { font-weight: bold; background: #fff; }
`;

/**
 * Grade ABC Harian. Four grades, each split into a piece count and its share of
 * the day, so eight figure columns plus a total.
 */
const GRADE_ABC_HARIAN_CSS = `
  .grade-abc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .grade-abc-table th, .grade-abc-table td { border: 1px solid #000; padding: 2px 4px; font-size: 9px; }
  .grade-abc-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .grade-abc-table thead { display: table-header-group; }
  .grade-abc-table tbody tr { page-break-inside: avoid; }
  .grade-abc-table td.center { text-align: center; }
  /* Figures take Noto Sans rather than the serif body font. The serif digits ran
     together at 9px, and an earlier override asked for Calibri, which fontconfig
     silently resolves to Carlito in this image: a narrow humanist sans with a
     small x-height, so the numbers read lighter than the labels beside them. */
  .grade-abc-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .grade-abc-table td.percent { color: #333; }
  .grade-abc-table tfoot td { font-weight: bold; background: #fff; }
  .grade-abc-table td.empty-cell { text-align: center; font-style: italic; }
`;

/**
 * Mutasi S4S shares the mutasi shape: fifteen figure columns across a Masuk and
 * a Keluar band, which only fits on a landscape page. The sub table underneath
 * is the same report the Laminating and Moulding versions produce.
 */
const MUTASI_S4S_CSS = LAMINATING_TABLE_CSS + `
  .sub-report-table { margin-top: 14px; }
  .report-table tbody tr.totals-row td { font-weight: bold; background: #fff; }
  .report-table td.blank { background: #fff; }
`;

/**
 * The two live-label reports. One table per grade inside a Jenis, then a summary
 * table per Jenis, so the section title has to stay with its tables.
 */
const LABEL_S4S_HIDUP_CSS = `
  .label-detail-table { width: 100%; margin-bottom: 6px; }
  .label-summary-table { width: 100%; margin-bottom: 16px; }
  .report-table th, .report-table td { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
  .report-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .report-table thead { display: table-header-group; }
  .report-table tbody tr { page-break-inside: avoid; }
  .report-table td.center { text-align: center; }
  .report-table td.label { text-align: left; }
  .report-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .report-table td.empty-cell { text-align: center; font-style: italic; }
  .report-table tr.totals-row td { font-weight: bold; background: #fff; }
  /* The Jenis heading, and the product heading under it, each stay with the
     table they introduce instead of being stranded at the foot of a page. */
  .group-title { margin: 14px 0 6px 0; font-size: 12px; font-weight: bold; break-after: avoid; page-break-after: avoid; }
  .product-title { margin: 8px 0 4px 0; font-size: 11px; font-weight: bold; break-after: avoid; page-break-after: avoid; }
  .section-title { margin: 14px 0 6px 0; font-size: 12px; font-weight: bold; break-after: avoid; page-break-after: avoid; }
`;

/**
 * Output Produksi S4S Per Grade. One section per machine, and inside each a
 * Target/Output pair per grade grouped under the Jns label, so the header is
 * two rows deep and the table runs wide.
 */
const OUTPUT_S4S_PER_GRADE_CSS = `
  .output-s4s-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 14px; }
  .output-s4s-table th, .output-s4s-table td { border: 1px solid #000; padding: 1px 3px; font-size: 8px; }
  .output-s4s-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .output-s4s-table thead { display: table-header-group; }
  .output-s4s-table tbody tr { page-break-inside: avoid; }
  .output-s4s-table td.center { text-align: center; }
  .output-s4s-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  /* A grade cell holds the day's output and its share of the Jns total. They
     need real separation: as bare inline spans the two runs touch, and the
     result reads as one run-together number ("0.9" + "5.2%" -> "0.95.2"). */
  .cell-split { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .cell-left { text-align: left; }
  .cell-right { text-align: right; }
  .output-s4s-table tfoot td { font-weight: bold; background: #fff; }
  .output-s4s-table td.empty-cell { text-align: center; font-style: italic; }
  .section-title { margin: 12px 0 6px 0; font-size: 12px; font-weight: bold; }
`;

/**
 * Rekap Produksi S4S Rambung Per Grade. Three header rows: Tanggal, then Input
 * and Output, each with a Total/Ratio pair per grade.
 */
const REKAP_PRODUKSI_S4S_RAMBUNG_CSS = `
  .rambung-per-grade-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rambung-per-grade-table th, .rambung-per-grade-table td { border: 1px solid #000; padding: 2px 3px; font-size: 10px; }
  .rambung-per-grade-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .rambung-per-grade-table thead { display: table-header-group; }
  .rambung-per-grade-table tbody tr { page-break-inside: avoid; }
  .rambung-per-grade-table td.center { text-align: center; }
  .rambung-per-grade-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .rambung-per-grade-table tfoot td { font-weight: bold; background: #fff; }
  .rambung-per-grade-table td.empty-cell { text-align: center; font-style: italic; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .summary-table td { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
  .summary-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .summary-table td.label { text-align: left; }
  .summary-table tr.totals-row td { font-weight: bold; background: #fff; }
`;

/**
 * Rekap Rendemen Rambung / Non Rambung. One row per month and thirteen figure
 * columns, so the whole width has to go to the numbers: the row number is
 * pinned and every column is a share of the text column, sized from
 * measurement rather than declared in px.
 *
 * The figures take the body font. An earlier override asked for Calibri, which
 * fontconfig silently resolves to Carlito in this image rather than to the face
 * that was named, and at 9px across thirteen columns the digits ran together and
 * were hard to read. tests/wps-rendemen.test.ts guards this rule, so changing
 * the face here means changing that test on purpose.
 */
const REKAP_RENDEMEN_CSS = `
  .rekap-rendemen-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rekap-rendemen-table th, .rekap-rendemen-table td { border: 1px solid #000; padding: 2px 3px; font-size: 9px; }
  .rekap-rendemen-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .rekap-rendemen-table thead { display: table-header-group; }
  .rekap-rendemen-table tbody tr { page-break-inside: avoid; }
  .rekap-rendemen-table td.center { text-align: center; }
  .rekap-rendemen-table td.number { text-align: right; white-space: nowrap; }
  .rekap-rendemen-table td.empty-cell { text-align: center; font-style: italic; }
`;

/**
 * Rendemen Semua Proses. The pivot is one row per date with a three-column
 * block per process, so it is the one WPS report that runs landscape: eight
 * processes would need 24 figure columns, which cannot hold a readable number
 * each on an A4 portrait page.
 */
const RENDEMEN_SEMUA_PROSES_CSS = `
  body { font-size: 9px; }
  .rendemen-pivot { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rendemen-pivot th, .rendemen-pivot td { border: 1px solid #000; padding: 2px 3px; font-size: 9px; }
  .rendemen-pivot thead th { text-align: center; font-weight: bold; background: #fff; }
  .rendemen-pivot thead { display: table-header-group; }
  .rendemen-pivot tbody tr { page-break-inside: avoid; }
  .rendemen-pivot td.center { text-align: center; }
  .rendemen-pivot td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  .rendemen-pivot td.rendemen-cell { font-weight: bold; }
  .rendemen-pivot td.empty-cell { text-align: center; font-style: italic; }
  .rendemen-pivot tr.totals-row td { font-weight: bold; font-size: 10px; background: #fff; }

  .rangkuman { margin-top: 10px; }
  .rangkuman-title { margin-bottom: 6px; font-size: 12px; font-weight: bold; }
  .rangkuman-table { border-collapse: collapse; }
  .rangkuman-table td { border: 0; padding: 1px 4px 1px 0; font-size: 11px; }
  .rangkuman-table td.number { text-align: left; font-weight: bold; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
`;

/**
 * Produksi Per SPK. The two header tables sit side by side at 49% each with a
 * 2% spacer, and each is only as tall as its own data. The label tables below
 * run the full width.
 */
const PRODUKSI_PER_SPK_CSS = `
  .meta-grid { margin-bottom: 10px; border-collapse: collapse; }
  .meta-grid td { border: 0 !important; padding: 0; vertical-align: top; }
  .meta-pane-left { width: 50%; }
  .meta-pane-right { width: 26%; }
  .meta-table { border-collapse: collapse; }
  .meta-table td { border: 0 !important; padding: 2px 0; font-size: 10px; vertical-align: top; }
  .meta-label { width: 72px; }
  .meta-sep { width: 10px; text-align: center; }

  .spk-dimension-table, .spk-rendemen-table { width: 100%; }

  /* Two header tables side by side: 49% each with a 2% spacer between them, the
     same split the Produksi Per Nomor Produksi reports use. The reset is
     scoped with a child combinator so it cannot reach the nested tables. */
  .split-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .split-grid > tbody > tr > td { border: 0 !important; padding: 0; vertical-align: top; }
  .split-grid .left-pane { width: 49%; }
  .split-grid .right-pane { width: 49%; }
  .split-grid .gutter { width: 2%; }

  .report-table th, .report-table td { border: 1px solid #000; padding: 2px 4px; font-size: 10px; }
  .report-table thead th { text-align: center; font-weight: bold; background: #fff; }
  .report-table thead { display: table-header-group; }
  .report-table tbody tr { page-break-inside: avoid; }
  .report-table td.center { text-align: center; }
  .report-table td.number { text-align: right; white-space: nowrap; font-family: "Noto Sans", "DejaVu Sans", sans-serif; font-variant-numeric: tabular-nums; }
  /* Input / Output / Rend keep the body font, the same as Tebal and Lebar, and
     only take the right alignment: both tables share this page, so giving these
     cells their own face would make them look like separate reports. The
     thirteen-column yield table is a different case, its figures do take Noto
     Sans because there the readability problem is the column count, not the
     pairing. */
  .report-table td.rend-value { text-align: right; white-space: nowrap; }
  .report-table td.empty-cell { text-align: center; font-style: italic; }
  .report-table tr.label-total td { font-weight: bold; background: #fff; }

  .rendemen-global { margin: 4px 0 10px 0; font-size: 11px; font-weight: bold; text-align: right; }
  .section-title { margin: 12px 0 6px 0; font-size: 12px; font-weight: bold; }
  .section-subtitle { margin: 6px 0 4px 0; font-size: 11px; font-weight: bold; }
  /* A category heading belongs to its table: without this the heading can sit
     alone at the foot of a page with the table pushed overleaf. */
  .label-group { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px; }
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
  // Identical layout to the Cross Cut Akhir dashboard, so it reuses the same
  // CSS under its own name rather than duplicating the block.
  dashboard_finger_joint: DASHBOARD_CROSS_CUT_AKHIR_CSS,
  // Same grid layout as the Cross Cut Akhir dashboard.
  dashboard_laminating: DASHBOARD_CROSS_CUT_AKHIR_CSS,
  // Same grid layout as the Cross Cut Akhir dashboard.
  dashboard_moulding: DASHBOARD_CROSS_CUT_AKHIR_CSS,
  dashboard_reproses: DASHBOARD_REPROSES_CSS,
  ketahanan_barang_reproses: KETAHANAN_BARANG_REPROSES_CSS,
  laminating_hidup_detail: LAMINATING_TABLE_CSS,
  umur_laminating_detail: LAMINATING_TABLE_CSS,
  moulding_hidup_detail: LAMINATING_TABLE_CSS,
  umur_moulding_detail: LAMINATING_TABLE_CSS,
  mutasi_laminating: MUTASI_LAMINATING_CSS,
  mutasi_moulding: MUTASI_MOULDING_CSS,
  flow_produksi_per_periode: FLOW_PRODUKSI_PER_PERIODE_CSS,
  label_perhari: LABEL_PERHARI_CSS,
  penjualan_lokal: PENJUALAN_LOKAL_CSS,
  rekap_penjualan: REKAP_PENJUALAN_CSS,
  produksi_per_nomor_produksi: PRODUKSI_PER_NOMOR_PRODUKSI_CSS,
  // Non Rambung and Rambung are the same table, so they share one preset.
  rekap_rendemen: REKAP_RENDEMEN_CSS,
  rendemen_semua_proses: RENDEMEN_SEMUA_PROSES_CSS,
  produksi_per_spk: PRODUKSI_PER_SPK_CSS,
  dashboard_s4s: DASHBOARD_S4S_CSS,
  dashboard_s4s_v2: DASHBOARD_S4S_CSS,
  grade_abc_harian: GRADE_ABC_HARIAN_CSS,
  mutasi_s4s: MUTASI_S4S_CSS,
  label_s4s_hidup: LABEL_S4S_HIDUP_CSS,
  output_s4s_per_grade: OUTPUT_S4S_PER_GRADE_CSS,
  rekap_produksi_s4s_rambung: REKAP_PRODUKSI_S4S_RAMBUNG_CSS,
  timeline_penjualan: TIMELINE_PENJUALAN_CSS,
  koordinat_tanah: KOORDINAT_TANAH_CSS,
  penjualan_barang_jadi_m3: PENJUALAN_BARANG_JADI_M3_CSS,
  surat_jalan: SURAT_JALAN_CSS,
  produksi_hulu_hilur: PRODUKSI_HULU_HILIR_CSS,
  produksi_semua_mesin: PRODUKSI_SEMUA_MESIN_CSS,
  stock_hidup_per_nospk: STOCK_HIDUP_PER_NOSPK_CSS,
  rekap_stock_on_hand: REKAP_STOCK_ON_HAND_CSS,
  hasil_produksi_mesin_lembur: HASIL_PRODUKSI_MESIN_LEMBUR_CSS,
  discrepancy_rekap_mutasi: DISCREPANCY_REKAP_MUTASI_CSS,
  rekap_mutasi_cross_tab: REKAP_MUTASI_CROSS_TAB_CSS,
  dashboard_ru: DASHBOARD_RU_CSS,
  rekap_mutasi: REKAP_MUTASI_CSS,
  mutasi_barang_jadi_per_jenis_per_ukuran:
    MUTASI_BARANG_JADI_PER_JENIS_PER_UKURAN_CSS,
  mutasi_barang_jadi: MUTASI_BARANG_JADI_CSS,
  mutasi_cross_cut_akhir: MUTASI_CROSS_CUT_AKHIR_CSS,
  mutasi_finger_joint: MUTASI_FINGER_JOINT_CSS,
  mutasi_reproses: MUTASI_REPROSES_CSS,
  penerimaan_kayu_bulat_kg: PENERIMAAN_KAYU_BULAT_KG_CSS,
  penerimaan_kayu_bulat_per_supplier_grafik:
    PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GRAFIK_CSS,
  penerimaan_kayu_bulat_per_supplier_group:
    PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_GROUP_CSS,
  penerimaan_kayu_bulat_per_supplier_kg:
    PENERIMAAN_KAYU_BULAT_PER_SUPPLIER_KG_CSS,
  penerimaan_kayu_bulat_ton: PENERIMAAN_KAYU_BULAT_TON_CSS,
  perbandingan_kb_masuk_periode_kg: PERBANDINGAN_KB_MASUK_PERIODE_KG_CSS,
  perbandingan_kb_masuk_periode: PERBANDINGAN_KB_MASUK_PERIODE_CSS,
  rekap_pembelian_kayu_bulat_kg: REKAP_PEMBELIAN_KAYU_BULAT_KG_CSS,
  rekap_penerimaan_st_dari_sawmill_kg: REKAP_PENERIMAAN_ST_DARI_SAWMILL_KG_CSS,
  rekap_penerimaan_st_sawmill_costing_rambung:
    REKAP_PENERIMAAN_ST_SAWMILL_COSTING_RAMBUNG_CSS,
  rekap_produksi_barang_jadi_consolidated:
    REKAP_PRODUKSI_BARANG_JADI_CONSOLIDATED_CSS,
  rekap_produksi_finger_joint_consolidated:
    REKAP_PRODUKSI_FINGER_JOINT_CONSOLIDATED_CSS,
  rekap_produksi_cross_cut_akhir_consolidated:
    REKAP_PRODUKSI_CROSS_CUT_AKHIR_CONSOLIDATED_CSS,
  rekap_produksi_cross_cut_akhir_per_jenis_per_grade:
    REKAP_PRODUKSI_CROSS_CUT_AKHIR_PER_JENIS_PER_GRADE_CSS,
  rekap_produksi_finger_joint_per_jenis_per_grade:
    REKAP_PRODUKSI_FINGER_JOINT_PER_JENIS_PER_GRADE_CSS,
  rekap_produksi_laminating_consolidated:
    REKAP_PRODUKSI_LAMINATING_CONSOLIDATED_CSS,
  rekap_produksi_laminating_per_jenis_per_grade:
    REKAP_PRODUKSI_LAMINATING_PER_JENIS_PER_GRADE_CSS,
  rekap_produksi_moulding_consolidated:
    REKAP_PRODUKSI_MOULDING_CONSOLIDATED_CSS,
  rekap_produksi_moulding_per_jenis_per_grade:
    REKAP_PRODUKSI_MOULDING_PER_JENIS_PER_GRADE_CSS,
  rekap_produksi_packing_per_jenis_per_grade:
    REKAP_PRODUKSI_PACKING_PER_JENIS_PER_GRADE_CSS,
  rekap_rendemen_rambung_per_supplier: REKAP_RENDEMEN_RAMBUNG_PER_SUPPLIER_CSS,
  saldo_barang_jadi_hidup_per_jenis_per_produk:
    SALDO_BARANG_JADI_HIDUP_PER_JENIS_PER_PRODUK_CSS,
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
