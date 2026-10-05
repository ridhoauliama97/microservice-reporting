/**
 * Regenerates `src/reports/wps/reference-css.ts` from the legacy Blade sheets in
 * open-api-report.
 *
 *   bun run generate:css             # rewrite the file
 *   bun run generate:css -- --check  # exit 1 if the committed file is stale
 *
 * Twenty reports print through their own blade's stylesheet instead of the
 * shared WPS layout, so those sheets are copied verbatim rather than
 * approximated. This script is what keeps that copy honest: it reads the blade,
 * resolves the stylesheet partials, drops what only wkhtmltopdf understood, and
 * writes the result. Hand-editing the output is pointless - the next run
 * overwrites it.
 *
 * Per-report corrections are NOT here; they are decisions, and they live in
 * `src/reports/wps/reference-css-fixups.ts`.
 *
 * Source root: OPEN_API_REPORT_VIEWS, defaulting to the checked-out legacy
 * project on this machine.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REFERENCE_CSS_FIXUPS } from '../src/reports/wps/reference-css-fixups'

const VIEWS_DIR =
  process.env.OPEN_API_REPORT_VIEWS ?? 'D:\\Projects\\open-api-report\\resources\\views'
const OUTPUT_PATH = process.env.REFERENCE_CSS_OUT ?? 'src/reports/wps/reference-css.ts'

/**
 * Registry `type` -> blade path, relative to VIEWS_DIR.
 *
 * Listed explicitly rather than matched by filename, because the blade names
 * lie: `st-masuk-per-group` renders the sheet in `st-sawmill-masuk-per-group`
 * (SPWps_LapSTMasukPerGroup, `.group-table` sections), while
 * `st-sawmill-masuk-per-group` renders the `-meja` one (SP_LapSTSawmillMasukPerGroup,
 * per-meja columns). Matching by name would swap the two stylesheets silently.
 * A missing blade here is a loud failure, which is the point.
 */
const SHEETS: Array<{ type: string; blade: string }> = [
  { type: 'detail-lembar-tally-hasil-sawmill', blade: 'sawn-timber/detail-lembar-tally-hasil-sawmill-pdf.blade.php' },
  { type: 'rekap-pcs-telly-hasil-sawmill', blade: 'sawn-timber/rekap-pcs-telly-hasil-sawmill-pdf.blade.php' },
  { type: 'rekap-st-penjualan', blade: 'reports/sawn-timber/rekap-st-penjualan-pdf.blade.php' },
  { type: 'saldo-st-hidup-per-produk', blade: 'reports/sawn-timber/saldo-st-hidup-per-produk-pdf.blade.php' },
  { type: 'serah-terima-st-kamar-kd', blade: 'reports/sawn-timber/serah-terima-st-kamar-kd-pdf.blade.php' },
  { type: 'spk-sawmill', blade: 'reports/spk/spk-sawmill-pdf.blade.php' },
  { type: 'st-basah-hidup-per-umur-kayu-ton', blade: 'reports/sawn-timber/st-basah-hidup-per-umur-kayu-ton-pdf.blade.php' },
  { type: 'st-hidup-kering', blade: 'reports/sawn-timber/st-hidup-kering-pdf.blade.php' },
  { type: 'st-hidup-per-spk', blade: 'reports/sawn-timber/st-hidup-per-spk-pdf.blade.php' },
  { type: 'st-masuk-per-group', blade: 'reports/sawn-timber/st-sawmill-masuk-per-group-pdf.blade.php' },
  { type: 'st-rambung-mc1-mc2-detail', blade: 'reports/sawn-timber/st-rambung-mc1-mc2-detail-pdf.blade.php' },
  { type: 'st-rambung-mc1-mc2-rangkuman', blade: 'reports/sawn-timber/st-rambung-mc1-mc2-rangkuman-pdf.blade.php' },
  { type: 'st-sawmill-hari-tebal-lebar', blade: 'reports/sawn-timber/st-sawmill-hari-tebal-lebar-pdf.blade.php' },
  { type: 'st-sawmill-masuk-per-group', blade: 'reports/sawn-timber/st-sawmill-masuk-per-group-meja-pdf.blade.php' },
  { type: 'stock-st-basah', blade: 'reports/sawn-timber/stock-st-basah-pdf.blade.php' },
  { type: 'stock-st-kering', blade: 'reports/sawn-timber/stock-st-kering-pdf.blade.php' },
  { type: 'stok-opname-st-detail-kd', blade: 'reports/sawn-timber/stok-opname-st-detail-kd-pdf.blade.php' },
  { type: 'total-bagus-kulit-rambung', blade: 'reports/sawn-timber/total-bagus-kulit-rambung-pdf.blade.php' },
  { type: 'tracing-st', blade: 'reports/sawn-timber/tracing-st-pdf.blade.php' },
  { type: 'umur-sawn-timber-detail-ton', blade: 'reports/sawn-timber/umur-sawn-timber-detail-ton-pdf.blade.php' },
]

/**
 * Appended to every sheet.
 *
 * The legacy sheets lean on `border-collapse` taking the edge between two cells
 * from whichever side declares it, and they only ever declare `border-left`.
 * That resolves in wkhtmltopdf but drops the right-hand line on rowspan cells
 * and on the last column under Chromium, so vertical rules go missing. Closing
 * the right edge on the same cells changes no measurement. Layout tables (meta
 * blocks, split grids, signatures) are excluded - they are meant to be open.
 */
const CHROMIUM_GRID_CLOSURE = `/* --- Chromium grid closure ----------------------------------------------
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
}`

// --- Blade text surgery -----------------------------------------------------

interface Include {
  start: number
  end: number
  /** Dotted view name, e.g. `reports.partials.pdf-reference-style`. */
  name: string
  /** `'key' => 'value'` string literals passed as the second argument. */
  values: Record<string, string>
}

/** Yields every `@include(...)`, with its balanced-paren body. */
function findIncludes(text: string): Include[] {
  const found: Include[] = []
  const pattern = /@include\s*\(/g
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index
    let index = pattern.lastIndex
    let depth = 1
    while (index < text.length && depth > 0) {
      const char = text[index]
      if (char === '(') depth++
      else if (char === ')') depth--
      index++
    }
    const body = text.slice(pattern.lastIndex, index - 1)
    const name = /^\s*(['"])([^'"]+)\1/.exec(body)?.[2]
    if (!name) continue
    const values: Record<string, string> = {}
    const argument = body.replace(/^\s*(['"])[^'"]+\1\s*,?/, '')
    for (const pair of argument.matchAll(/(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*=>\s*(['"])([\s\S]*?)\3/g)) {
      values[pair[2]!] = pair[4]!
    }
    found.push({ start, end: index, name, values })
  }
  return found
}

/**
 * Removes every `@include(...)` span, last first so the offsets stay valid.
 * Offsets are found here rather than reused from an earlier pass: substitution
 * and the other rewrites change lengths, so a stale offset cuts the wrong text.
 */
function stripIncludes(text: string): string {
  let result = text
  for (const include of [...findIncludes(result)].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, include.start) + result.slice(include.end)
  }
  return result
}

/** Removes an at-rule with a balanced `{ ... }` body, e.g. `@page { ... }`. */
function stripAtRuleWithBody(text: string, keyword: string): string {
  const pattern = new RegExp(`@${keyword}[^{;]*\\{`, 'g')
  let result = text
  for (let match = pattern.exec(result); match; match = pattern.exec(result)) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < result.length && depth > 0) {
      if (result[index] === '{') depth++
      else if (result[index] === '}') depth--
      index++
    }
    result = result.slice(0, match.index) + result.slice(index)
  }
  return result
}

/** Removes `@php ... @endphp` and the other Blade directives. */
function stripBladeDirectives(text: string): string {
  return text
    .replace(/@php[\s\S]*?@endphp/g, '')
    .replace(/@if\s*\([\s\S]*?\)/g, '')
    .replace(/@else(if)?\b/g, '')
    .replace(/@(foreach|forelse|while|unless|isset|empty)\b[\s\S]*?@(endforeach|endforelse|endwhile|endunless|endisset|endempty)/g, '')
    .replace(/@(endforeach|endforelse|endwhile|endunless|endisset|endempty|endif|endphp)\b/g, '')
    .replace(/\{\{--[\s\S]*?--\}\}/g, '')
    .replace(/<\?php[\s\S]*?\?>/g, '')
    .replace(/<\?=[\s\S]*?\?>/g, '')
}

/**
 * `$name = $name ?? 'default';` declarations from a Blade file's `@php` block.
 * The stylesheet partials declare their fallbacks there, outside `<style>`.
 */
function phpDefaults(text: string): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const match of text.matchAll(/\$(\w+)\s*=\s*\$\w+\s*\?\?\s*(['"])([\s\S]*?)\2\s*;/g)) {
    defaults[match[1]!] = match[3]!
  }
  return defaults
}

/**
 * Substitutes `{{ $name }}` with the value passed by the caller, falling back
 * to the partial's own `@php $name = $name ?? 'default';`.
 */
function substituteVariables(
  text: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
  origin: string,
): string {
  const resolve = (name: string): string | undefined => values[name] ?? defaults[name]
  return text.replace(/\{\{\{?\s*\$(\w+)\s*\}?\}\}/g, (_whole, name: string) => {
    const value = resolve(name)
    if (value === undefined) {
      throw new Error(`${origin}: no value for $${name} - the sheet would lose the declaration`)
    }
    return value
  })
}

/** Concatenates the contents of every `<style>` block. */
function styleBlocks(text: string): string {
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]!).join('\n')
}

// --- Formatting -------------------------------------------------------------

/**
 * Re-indents to two spaces per brace level and rejoins declarations the blade
 * split across lines (`font-size:\n    10px;`), which is how the values used to
 * get lost. Purely presentational: CSS ignores the whitespace.
 */
function formatCss(css: string): string {
  const joined: string[] = []
  for (const rawLine of css.split('\n')) {
    const line = rawLine.trim()
    if (line === '') {
      if (joined.length > 0 && joined[joined.length - 1] !== '') joined.push('')
      continue
    }
    const previous = joined[joined.length - 1]
    // `margin:` with its value on the next line.
    if (previous !== undefined && /:(\s*)$/.test(previous) && !previous.trimEnd().endsWith('{')) {
      joined[joined.length - 1] = `${previous} ${line}`
      continue
    }
    joined.push(line)
  }

  let depth = 0
  const output: string[] = []
  for (const line of joined) {
    if (line === '') {
      if (output.length > 0) output.push('')
      continue
    }
    const opens = countUnquoted(line, '{')
    const closes = countUnquoted(line, '}')
    const leadingCloses = line.startsWith('}')
    if (leadingCloses) depth = Math.max(0, depth - 1)
    output.push(`${'  '.repeat(depth)}${line}`)
    depth = Math.max(0, depth + opens - closes)
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '')
}

function countUnquoted(text: string, char: string): number {
  let count = 0
  let quote: string | null = null
  for (const current of text) {
    if (quote) {
      if (current === quote) quote = null
      continue
    }
    if (current === '"' || current === "'") quote = current
    else if (current === char) count++
  }
  return count
}

/** Guards against the silent failure this generator exists to prevent. */
function assertUsable(css: string, origin: string): void {
  const empty = /(^|[;{])\s*[\w-]+\s*:\s*(?=[;}])/m.exec(css)
  if (empty) {
    throw new Error(`${origin}: declaration with no value near "${empty[0].trim()}" - a variable was dropped`)
  }
  if (/\{\{|\}\}|@include|@endphp/.test(css)) {
    throw new Error(`${origin}: Blade syntax survived extraction`)
  }
}

// --- Sheet extraction -------------------------------------------------------

function partialPath(name: string): string {
  // Blade names the partial by its dotted view namespace (`reports.partials.x`),
  // which is the path below VIEWS_DIR with separators swapped.
  return join(VIEWS_DIR, `${name.split('.').join('/')}.blade.php`)
}

function readPartial(name: string): string {
  const path = partialPath(name)
  if (!existsSync(path)) throw new Error(`Missing partial: ${path}`)
  return readFileSync(path, 'utf8')
}

/** The stylesheet partial a blade delegates to, plus the values it passes. */
function styleFromPartial(include: Include): string {
  const partial = readPartial(include.name)
  const css = styleBlocks(partial)
  if (css.trim() === '') {
    throw new Error(`Partial ${include.name} carries no <style> block`)
  }
  return cleanCss(css, include.values, phpDefaults(partial), include.name)
}

function cleanCss(
  css: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
  origin: string,
): string {
  let result = substituteVariables(css, values, defaults, origin)
  result = stripBladeDirectives(result)
  result = stripAtRuleWithBody(result, 'page')
  // A stylesheet partial may pull in another one (`pdf-footer-table-style`);
  // those rules only ever targeted wkhtmltopdf's `htmlpagefooter` element, which
  // does not exist here - Gotenberg's footer is a separate document - so the
  // include is dropped rather than inlined.
  result = stripIncludes(result)
  assertUsable(result, origin)
  return formatCss(result)
}

function buildSheet(type: string, bladeRelativePath: string): string {
  const path = join(VIEWS_DIR, bladeRelativePath)
  if (!existsSync(path)) throw new Error(`Missing blade for "${type}": ${path}`)
  const blade = readFileSync(path, 'utf8')
  const includes = findIncludes(blade)

  const own = styleBlocks(blade)
  const legacy = own.trim() !== ''
    ? cleanCss(own, {}, phpDefaults(blade), bladeRelativePath)
    // Some blades carry no <style> of their own and delegate the whole sheet to
    // a partial, passing it the sizes this report wants.
    : (() => {
        const stylePartial = includes.find((include) => styleBlocks(readPartial(include.name)).trim() !== '')
        if (!stylePartial) throw new Error(`No stylesheet found for "${type}" in ${bladeRelativePath}`)
        return styleFromPartial(stylePartial)
      })()

  const parts = [legacy]
  const fixups = REFERENCE_CSS_FIXUPS[type]
  if (fixups) parts.push(formatCss(fixups))
  parts.push(CHROMIUM_GRID_CLOSURE)
  return parts.filter((part) => part.trim() !== '').join('\n\n')
}

// --- Emit -------------------------------------------------------------------

/** Escapes what would otherwise terminate the template literal. */
function toTemplateLiteral(css: string): string {
  return css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function renderModule(sheets: Record<string, string>): string {
  const entries = Object.entries(sheets)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([type, css]) => `  '${type}': \`\n${toTemplateLiteral(css)}\n\`,`)
    .join('\n')

  return `/**
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
 *   - the per-report corrections from reference-css-fixups.ts, for the handful
 *     of rules the legacy sheet states in a way Chromium resolves differently.
 *
 * GENERATED by scripts/generate-reference-css.ts - do not hand-edit. Change the
 * blade (or the fixups file), then run \`bun run generate:css\`.
 *
 * Source: ${VIEWS_DIR.replace(/\\/g, '\\\\')}
 */

export const WPS_REFERENCE_CSS: Record<string, string> = {
${entries}
}
`
}

async function main(): Promise<void> {
  if (!existsSync(VIEWS_DIR)) {
    console.error(`Legacy views directory not found: ${VIEWS_DIR}`)
    console.error('Set OPEN_API_REPORT_VIEWS to the open-api-report resources/views directory.')
    process.exit(1)
  }

  const sheets: Record<string, string> = {}
  for (const { type, blade } of SHEETS) {
    sheets[type] = buildSheet(type, blade)
    console.log(`  ${type} <- ${blade}`)
  }

  const unknown = Object.keys(REFERENCE_CSS_FIXUPS).filter((type) => !(type in sheets))
  if (unknown.length > 0) {
    console.error(`Fixups with no sheet in SHEETS: ${unknown.join(', ')}`)
    process.exit(1)
  }

  const output = renderModule(sheets)

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : ''
    if (current === output) {
      console.log(`${OUTPUT_PATH} is up to date (${Object.keys(sheets).length} sheets).`)
      return
    }
    console.error(`${OUTPUT_PATH} is stale. Run: bun run generate:css`)
    process.exit(1)
  }

  await Bun.write(OUTPUT_PATH, output)
  console.log(`\nWrote ${OUTPUT_PATH} (${Object.keys(sheets).length} sheets).`)
}

void main()