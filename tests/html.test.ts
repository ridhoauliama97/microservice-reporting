import { describe, expect, test } from 'bun:test'
import { escapeHtml, formatNumber4, formatTanggalId, pageFooterHtml, renderPage } from '../src/templates/html'
import { PDF_PAGE_MARGINS } from '../src/config/pdf-page'

describe('escapeHtml', () => {
  test('escapes <script> tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  test('escapes double and single quotes', () => {
    expect(escapeHtml('"opsi A" \'opsi B\'')).toBe(
      '&quot;opsi A&quot; &#39;opsi B&#39;',
    )
  })

  test('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B')
  })

  test('null and undefined become an empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  test('numbers are stringified', () => {
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('renderPage', () => {
  test('wraps the body with the base layout and escapes the title', () => {
    const html = renderPage({ title: '<XSS>', bodyHtml: '<p>halo</p>' })
    expect(html).toContain('<meta charset="utf-8" />')
    expect(html).toContain('&lt;XSS&gt;')
    expect(html).toContain('<p>halo</p>')
  })
})

describe('formatNumber4', () => {
  test('formats like PHP number_format(value, 4, ".", ",")', () => {
    expect(formatNumber4(1234.5678)).toBe('1,234.5678')
    expect(formatNumber4(-1234.5)).toBe('-1,234.5000')
    expect(formatNumber4(0.5)).toBe('0.5000')
  })

  test('renders null, undefined and near-zero values as empty strings', () => {
    expect(formatNumber4(null)).toBe('')
    expect(formatNumber4(undefined)).toBe('')
    expect(formatNumber4(0)).toBe('')
    expect(formatNumber4(0.00000005)).toBe('')
  })
})

describe('formatTanggalId', () => {
  test('formats ISO dates as short Indonesian dates with 4-digit year', () => {
    expect(formatTanggalId('2026-01-01')).toBe('01-Jan-2026')
    expect(formatTanggalId('2026-09-21')).toBe('21-Sep-2026')
    expect(formatTanggalId('2026-05-15')).toBe('15-Mei-2026')
  })

  test('passes through unparseable input unchanged', () => {
    expect(formatTanggalId('not-a-date')).toBe('not-a-date')
  })
})

describe('pageFooterHtml', () => {
  test('contains page number and total counters with explicit styles', () => {
    const footer = pageFooterHtml()
    expect(footer).toContain('pageNumber')
    expect(footer).toContain('totalPages')
    expect(footer).toContain('font-size')
  })

  test('wrapper spans the paper and aligns texts with the table edges', () => {
    const footer = pageFooterHtml()
    const padL = Math.round(PDF_PAGE_MARGINS.left * 96)
    const padR = Math.round(PDF_PAGE_MARGINS.right * 96)
    expect(footer).toContain('width: 100%')
    expect(footer).toContain('box-sizing: border-box')
    expect(footer).toContain(`padding: 12px ${padR}px 0 ${padL}px`)
    expect(footer).toContain('float: left')
    expect(footer).toContain('float: right')
  })

  test('escapes printedBy and printedAt values', () => {
    const footer = pageFooterHtml({
      printedBy: '<budi>',
      printedAt: '01-Jan-00',
    })
    expect(footer).toContain('Dicetak oleh: &lt;budi&gt; pada 01-Jan-00')
  })
})
