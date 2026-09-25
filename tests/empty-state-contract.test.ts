import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const reportDirectory = join(process.cwd(), 'src', 'reports', 'wps')
const reportFiles = readdirSync(reportDirectory).filter(
  (name) => name.endsWith('.ts') && name !== 'template.ts' && name !== 'styles.ts',
)

describe('WPS empty-state contract', () => {
  test('report modules do not keep legacy empty wording or per-report overrides', () => {
    const legacyPatterns = [
      /Data tidak tersedia/,
      /Tidak ada data\./,
      /Tidak ada data untuk periode/,
      /emptyMessage\s*:/,
    ]

    for (const file of reportFiles) {
      const source = readFileSync(join(reportDirectory, file), 'utf8')
      for (const pattern of legacyPatterns) {
        expect(`${file}: ${source}`).not.toMatch(pattern)
      }
    }
  })
})
