/**
 * Escapes any value for safe inclusion in HTML. Null/undefined become an
 * empty string. EVERY value coming from the database or the user MUST go
 * through this before being placed into a template.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formats a m³ volume with fixed 4 decimals. null/undefined (no movement)
 * renders as an empty cell.
 */
export function formatVolume(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(4)
    : "";
}

const BASE_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  .meta { color: #555555; font-size: 11px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999999; padding: 6px 8px; text-align: left; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td.num { text-align: right; }
  td.empty { text-align: center; font-style: italic; color: #777777; }
  h2 { font-size: 15px; margin: 18px 0 6px 0; }
  h2.section-break { page-break-before: always; margin-top: 0; }
  .center { text-align: center; }
  .footer-note { color: #777777; font-size: 10px; margin-top: 16px; }
`;

interface PageOptions {
  title: string;
  bodyHtml: string;
  /** Raw HTML appended into <head> (e.g. external font <link> tags). */
  extraHead?: string;
  /** Extra CSS appended AFTER the base CSS so it can override it. */
  extraCss?: string;
}

/**
 * Wraps body HTML in the base document layout. Gotenberg runs with JavaScript
 * disabled, so templates must never depend on JS.
 */
export function renderPage(options: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  ${options.extraHead ?? ""}
  <style>${BASE_CSS}${options.extraCss ? `\n${options.extraCss}` : ""}</style>
</head>
<body>
${options.bodyHtml}
</body>
</html>`;
}

export interface PageFooterOptions {
  /** "Dicetak oleh: <name> pada <datetime>", left-aligned with the table. */
  printedBy?: string;
  /** Pre-formatted timestamp (see formatPrintedAt). */
  printedAt?: string;
}

/** Short Indonesian month abbreviations, e.g. index 8 -> "Sep". */
export const MONTHS_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/** Short date + 24h time, e.g. "22-Sep-26 08:14". */
export function formatPrintedAt(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mon = MONTHS_SHORT_ID[date.getMonth()];
  const yy = String(date.getFullYear()).slice(2);
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}-${mon}-${yy} ${hh}:${mi}`;
}

/**
 * Single-line page footer, stamped on EVERY page inside the bottom margin:
 * left  "Dicetak oleh: <name> pada <datetime>" (flush with the table's LEFT
 * edge), right "Halaman <n> dari <m>" (flush with the table's RIGHT edge).
 *
 * Quirks of Gotenberg/Chromium footer rendering (verified by probing a real
 * conversion and measuring the result with PyMuPDF):
 *  - Styles on <body> of the footer template are IGNORED; only inline styles
 *    on child elements survive. All styling lives on the wrapper <div>.
 *  - The template is laid out with shrink-to-fit width, so flex/space-between
 *    has no room to distribute. The wrapper needs an explicit `width: 100%`
 *    to span the paper, after which the classic float-left/float-right pair
 *    puts the two texts at opposite edges on one line.
 *  - CSS px map to PDF pt at 0.75 (96dpi): the page's 0.5in margin equals
 *    36pt, i.e. 48px. 48px paddings therefore line both texts up exactly
 *    with the table edges (width: 100% tables span the full content area).
 *
 * Chromium fills <span class="pageNumber"> and <span class="totalPages">
 * automatically; no JavaScript is involved. The 12px top padding (~9pt)
 * keeps the line clear of the content above inside the 36pt margin band.
 */
export function pageFooterHtml(options: PageFooterOptions = {}): string {
  const wrapperStyle =
    "width: 100%; box-sizing: border-box; padding: 12px 48px 0 48px; font-family: Arial, Helvetica, sans-serif; font-size: 9px; font-style: italic; color: #333333; white-space: nowrap;";

  const printedPart = options.printedBy
    ? `Dicetak oleh: ${escapeHtml(options.printedBy)}${options.printedAt ? ` pada ${escapeHtml(options.printedAt)}` : ""}`
    : "";

  return `<html>
<body>
  <div style="${wrapperStyle}"><span style="float: left;">${printedPart}</span><span style="float: right;">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>
</body>
</html>`;
}
