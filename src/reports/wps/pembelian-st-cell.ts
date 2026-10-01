/**
 * Shared cell rendering for the two "Pembelian ST" cross-tabs
 * (per-supplier and timeline). Both are the same shape - a supplier down the
 * side, a measure across the top - and the reference gives them byte-identical
 * cell logic, so it lives here once.
 *
 * A cell is the tonnage on the left and, on the right, that cell's share of its
 * column: "11.2303 (9%)". Three details are deliberate:
 *
 *   - The share is rounded to a whole percent, and a share that rounds to zero
 *     prints "-%" rather than "0%". The reference treats "0%" as misleading -
 *     there IS a figure there, it is just small - so the dash stands in for
 *     "too small to express as a percentage".
 *   - A zero or negative tonnage leaves the cell completely empty, not
 *     "0.0000(0%)". Most cells in these two reports are zero, and filling them
 *     would bury the handful of real ones.
 *   - The tonnage is right of the share pair, both in a monospace face, so the
 *     percentages line up down the column instead of drifting with the digit
 *     count.
 *
 * The alignment is done with flexbox rather than by padding the tonnage with
 * spaces to a fixed character width. The reference pads to 16 characters, which
 * assumes columns wide enough to hold that; with this project's 9px face and
 * column sizing it overflows into the neighbouring cell and the figures collide.
 * Flexbox gives the same right-aligned shares at any column width.
 */

import { escapeHtml, formatNumber } from '../../templates/html';

export const formatTon = (value: number): string =>
  formatNumber(value, 4, { noSeparator: true });

/** Whole-percent share, or "-%" when it would round to zero. Empty at zero. */
export function formatShare(ton: number, columnTotal: number): string {
  if (ton <= 0 || columnTotal <= 0) return '';
  const pct = Math.round((ton / columnTotal) * 100);
  return pct === 0 ? '-%' : `${pct}%`;
}

const pair = (ton: number, share: string): string =>
  `<span class="cell-pre"><span class="cell-ton">${escapeHtml(formatTon(ton))}</span>${
    share === '' ? '' : `<span class="cell-pct">(${escapeHtml(share)})</span>`
  }</span>`;

/** A data cell, carrying its share of the column total. */
export function renderPivotCell(
  ton: number,
  columnTotal: number,
  withShare = true,
): string {
  if (ton <= 0) return '';
  return pair(ton, withShare ? formatShare(ton, columnTotal) : '');
}

/** A totals cell, which the reference always marks as 100%. */
export const renderTotalCell = (ton: number, withShare = true): string =>
  ton > 0 ? pair(ton, withShare ? '100%' : '') : '';

/** Natural, case-insensitive: "SUP A2" before "SUP A10", lower case not exiled. */
export const naturalCaseInsensitive = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Even widths for the measure columns, matching the reference's colgroup: the
 * label columns take their share and what is left is split evenly. Each measure
 * column also gets a floor, because a cross-tab with many months otherwise
 * squeezes the tonnage below the width of its own digits.
 *
 * A4 portrait gives about 7.5in of table after margins. Stacked, a measure
 * column needs roughly 7% to hold "119.6592" in an 8px monospace face, so past
 * about eleven columns the share has to be dropped by the caller - see
 * `cellFitsShare`.
 */
export function pivotColumnWidths(
  measureCount: number,
  labelPercent: number,
  minimumMeasurePercent = 6,
): string {
  if (measureCount <= 0) return '0';
  const available = Math.max(0, 100 - labelPercent);
  return Math.max(minimumMeasurePercent, available / measureCount).toFixed(4);
}

/**
 * Whether a measure column is wide enough to carry the tonnage AND its share on
 * A4 portrait. Past this the share is dropped rather than printed over the
 * figure: a percentage with no tonnage next to it is noise, and a tonnage with
 * its last digits clipped is a wrong number.
 */
export function cellFitsShare(
  measureCount: number,
  labelPercent: number,
  minimumMeasurePercent = 6,
): boolean {
  if (measureCount <= 0) return false;
  return (
    Number(pivotColumnWidths(measureCount, labelPercent, minimumMeasurePercent)) >= 7
  );
}
