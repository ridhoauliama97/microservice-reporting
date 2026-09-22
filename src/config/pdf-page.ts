/**
 * Gotenberg page margins in INCHES — the single source of truth shared by
 * the PDF conversion (services/pdf.ts) and the footer template (which pads
 * itself by margin × 96 px to stay flush with the table edges).
 */
export const PDF_PAGE_MARGINS = {
  /** Inches. Content taller than a margin is clipped (Gotenberg docs). */
  top: 0.25,
  bottom: 0.5,
  left: 0.25,
  right: 0.25,
} as const;
