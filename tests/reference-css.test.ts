import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { WPS_REFERENCE_CSS } from '../src/reports/wps/reference-css'
import { REFERENCE_CSS_FIXUPS } from '../src/reports/wps/reference-css-fixups'

/**
 * The generated stylesheets, locked against the four ways they went wrong.
 *
 * `reference-css.ts` is generated (scripts/generate-reference-css.ts), so these
 * are guards on the generator's OUTPUT, not on the legacy project it reads -
 * the tests must pass without that checkout being present.
 *
 * Each case below is a bug that actually shipped. None of them threw: CSS that
 * parses fine, or a value silently emptied, prints a plausible sheet that is
 * simply wrong, which is the failure mode this file exists to prevent.
 */

const sheets = Object.entries(WPS_REFERENCE_CSS)

/** Matches a declaration with no value at all: `font-size:;`. */
const EMPTY_DECLARATION = /:\s*(?=[;}])/

describe('every generated sheet is usable CSS', () => {
  test('there is at least one sheet, and none is empty', () => {
    expect(sheets.length).toBeGreaterThan(0)
    for (const [type, css] of sheets) {
      expect(`${type}: ${css.trim().length}`).not.toBe(0)
    }
  })

  test('every sheet closes the grid for Chromium', () => {
    // The legacy sheets only declare border-left, which Chromium drops on the
    // right-hand edge. Without this block the vertical rules go missing.
    const missing = sheets
      .filter(([, css]) => !css.includes('Chromium grid closure'))
      .map(([type]) => type)
    expect(missing).toEqual([])
  })

  test('no sheet still contains Blade syntax', () => {
    // A leftover `@include` is inert but a leftover `{{ $var }}` means a value
    // was dropped rather than substituted.
    for (const [type, css] of sheets) {
      expect(`${type}: ${css}`).not.toMatch(/\{\{|\}\}|@include|@php|@page\b/)
    }
  })

  test('no declaration lost its value', () => {
    // This is how two sheets lost their font sizes: the partial parameterised
    // them, the value was stripped instead of substituted, and the declaration
    // was left as `font-size:;`. Chromium ignores that, so the report rendered
    // at its default font size and nobody could tell from the code.
    for (const [type, css] of sheets) {
      expect(`${type}: ${css}`).not.toMatch(EMPTY_DECLARATION)
    }
  })

  test('no sheet carries wkhtmltopdf-only footer rules', () => {
    // `htmlpagefooter` is the element wkhtmltopdf invented for a page footer.
    // Gotenberg's footer is a separate document rendered from footer.html, so
    // these selectors matched nothing and were only ever dead weight.
    for (const [type, css] of sheets) {
      expect(`${type}: ${css}`).not.toContain('htmlpagefooter')
    }
  })
})

describe('the two sheets that delegate to a stylesheet partial', () => {
  // These pull their whole sheet from reports/partials/pdf-reference-style,
  // which is parameterised: the blade passes the sizes, the partial declares
  // defaults in a @php block outside <style>. Both steps have to work or the
  // numbers go missing without any error.
  const PARTIAL_BACKED: string[] = ['saldo-st-hidup-per-produk', 'st-hidup-per-spk']

  test.each(PARTIAL_BACKED)('%s keeps the body font size', (type) => {
    expect(WPS_REFERENCE_CSS[type]).toMatch(/body\s*\{[^}]*font-size:\s*10px/)
  })

  test.each(PARTIAL_BACKED)('%s keeps the title font size', (type) => {
    expect(WPS_REFERENCE_CSS[type]).toMatch(/\.report-title\s*\{[^}]*font-size:\s*16px/)
  })

  test.each(PARTIAL_BACKED)('%s declares no @page residue', (type) => {
    // The margin block was cut out but left a dangling `;` and a stray
    // `footer: html_reportFooter;` behind.
    const css = WPS_REFERENCE_CSS[type]!
    expect(css).not.toContain('html_reportFooter')
    expect(css).not.toMatch(/^\s*;\s*$/m)
  })
})

describe('values that a previous extraction pass corrupted', () => {
  test('spk-sawmill keeps the attachment-block display value', () => {
    // The blade says `display: attachment-block` (a paged-media box). An
    // earlier pass rewrote it to `block`, which changes the meaning of the rule
    // even though Chromium falls back to the same thing.
    expect(WPS_REFERENCE_CSS['spk-sawmill']).toContain('display: attachment-block')
  })

  test('comments written into the blades survive generation', () => {
    // The blade author left these to record why a rule exists. They were being
    // stripped along with the Blade syntax, so the next person to read the
    // sheet had no idea which rules were deliberate.
    const preserved: Array<[string, string]> = [
      ['rekap-st-penjualan', '/* Hilangkan garis horizontal antar baris data. */'],
      ['st-rambung-mc1-mc2-detail', '/* Tfoot tipis untuk "garis akhir tabel" ketika page break terjadi di tengah data. */'],
      ['st-basah-hidup-per-umur-kayu-ton', '/* Default: hanya garis vertikal antar kolom. */'],
      ['st-sawmill-hari-tebal-lebar', '/* Khusus kolom Group: tampilkan garis horizontal antar baris (hanya kolom ini saja). */'],
      ['tracing-st', '/* text-transform: uppercase; */'],
      ['stock-st-basah', '/* .report-table {'],
    ]
    const stripped: string[] = []
    // Checked by name first: a typo in a key otherwise surfaces as a TypeError
    // about `.includes`, which says nothing about what is actually wrong.
    const unknown = preserved.map(([type]) => type).filter((type) => !(type in WPS_REFERENCE_CSS))
    expect(unknown).toEqual([])
    for (const [type, comment] of preserved) {
      if (!WPS_REFERENCE_CSS[type]!.includes(comment)) stripped.push(type)
    }
    expect(stripped).toEqual([])
  })
})

describe('the sheets stay wired to real reports', () => {
  test('every sheet key is a registry type', () => {
    // Renaming a registry type without renaming the sheet would leave an orphan
    // nobody renders, and the report would silently fall back to the shared
    // layout.
    const orphans = Object.keys(WPS_REFERENCE_CSS).filter((type) => !(type in reports))
    expect(orphans).toEqual([])
  })

  test('every fixup has a sheet to attach to', () => {
    // The generator errors on this too; this keeps the failure close to the
    // file being edited.
    const dangling = Object.keys(REFERENCE_CSS_FIXUPS).filter(
      (type) => !(type in WPS_REFERENCE_CSS),
    )
    expect(dangling).toEqual([])
  })
})