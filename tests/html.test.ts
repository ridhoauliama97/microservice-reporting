import { describe, expect, test } from 'bun:test'
import { escapeHtml, pageFooterHtml, renderPage } from '../src/templates/html'

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

describe('pageFooterHtml', () => {
  test('contains page number and total counters with explicit styles', () => {
    const footer = pageFooterHtml()
    expect(footer).toContain('pageNumber')
    expect(footer).toContain('totalPages')
    expect(footer).toContain('font-size')
  })

  test('wrapper spans the paper and aligns texts with the table edges (48px = 0.5in)', () => {
    const footer = pageFooterHtml()
    expect(footer).toContain('width: 100%')
    expect(footer).toContain('box-sizing: border-box')
    expect(footer).toContain('padding: 12px 48px 0 48px')
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
