import { PDF_PAGE_MARGINS } from "../config/pdf-page";

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
 * Formats a number like PHP's number_format(value, 4, '.', ','): 4 fixed
 * decimals with thousands separators, e.g. 1234.5678 -> "1,234.5678".
 * null/undefined (no movement) and near-zero values render as an empty
 * cell, mirroring the legacy WPS (Blade) report output.
 */
export function formatNumber4(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.0000001) return "";
  const [intPart, decPart] = value.toFixed(4).split(".");
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + decPart;
}

const BASE_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  .meta { color: #555555; font-size: 12px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td.num { text-align: right; }
  td.empty { text-align: center; font-style: italic; color: #000; }
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

/** Short date + 24h time, e.g. "22-Sep-2026 08:14". */
export function formatPrintedAt(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mon = MONTHS_SHORT_ID[date.getMonth()];
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}-${mon}-${yyyy} ${hh}:${mi}`;
}

/**
 * number_format(value, decimals, '.', ',') — thousands separators apply to
 * the integer part ONLY (applying them to the whole string corrupts
 * decimals, e.g. "31.9,058").
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number,
  options?: { blankWhenZero?: boolean },
): string {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (options?.blankWhenZero && Math.abs(num) < 0.0000001) return "";
  const [intPart, decPart] = num.toFixed(decimals).split(".");
  const int = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals > 0 ? `${int}.${decPart}` : int;
}

/**
 * Formats a number with up to 4 decimals but STRIPS trailing zeros —
 * 10 -> "10", 2.5 -> "2.5", 43.5261 -> "43.5261" (thousands separators
 * kept). Blank for null/near-zero, mirroring the legacy detail format.
 */
export function formatTrimmed(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.0000001) return "";
  const [intPart, decPart] = value.toFixed(4).split(".");
  const trimmedDec = decPart.replace(/0+$/, "");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${trimmedDec ? `.${trimmedDec}` : ""}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD, e.g. period params) as a short
 * Indonesian date: "2026-01-01" -> "01-Jan-2026". Pure string handling (no
 * Date parsing) to avoid timezone shifts; unparseable input passes through
 * unchanged (period params are validated upstream by Zod).
 */
export function formatTanggalId(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, yyyy, mm, dd] = match;
  const month = MONTHS_SHORT_ID[Number(mm) - 1];
  if (!month) return iso;
  return `${dd}-${month}-${yyyy}`;
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
 *  - CSS px map to PDF pt at 0.75 (96dpi): a margin of M inches equals M × 72pt
 *    of paper, i.e. M × 96px of template padding. Paddings are therefore
 *    computed from PDF_PAGE_MARGINS so both texts stay flush with the table
 *    edges (width: 100% tables span the full content area) whatever the
 *    margins are.
 *
 * Chromium fills <span class="pageNumber"> and <span class="totalPages">
 * automatically; no JavaScript is involved. The 12px top padding (~9pt)
 * keeps the line clear of the content above inside the 36pt margin band.
 */
export function pageFooterHtml(options: PageFooterOptions = {}): string {
  // Footer paddings must equal the page's horizontal margins so the two
  // texts stay flush with the table edges: margin in inches × 96 px
  // (1in = 96 CSS px = 72pt, hence px = pt / 0.75).
  const padLeft = Math.round(PDF_PAGE_MARGINS.left * 96);
  const padRight = Math.round(PDF_PAGE_MARGINS.right * 96);
  const wrapperStyle =
    `width: 100%; box-sizing: border-box; padding: 12px ${padRight}px 0 ${padLeft}px; font-family: Arial, Helvetica, sans-serif; font-size: 9px; font-style: italic; color: #333333; white-space: nowrap;`;

  const printedPart = options.printedBy
    ? `Dicetak oleh: ${escapeHtml(options.printedBy)}${options.printedAt ? ` pada ${escapeHtml(options.printedAt)}` : ""}`
    : "";

  return `<html>
<body>
  <div style="${wrapperStyle}"><span style="float: left;">${printedPart}</span><span style="float: right;">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>
</body>
</html>`;
}
