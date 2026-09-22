import { z } from 'zod'
import { escapeHtml, formatPrintedAt, pageFooterHtml, renderPage } from '../templates/html'
import type { ReportDefinition, RenderMeta } from './types'

export const exampleParamsSchema = z.object({
  title: z.string().min(1).max(100).default('Laporan Contoh'),
  rows: z.number().int().min(1).max(500).default(20),
})

type ExampleParams = z.infer<typeof exampleParamsSchema>

interface ExampleRow {
  no: number
  nama: string
  jumlah: number
  keterangan: string
}

/**
 * Example report proving the full pipeline (queue -> render -> Gotenberg ->
 * file -> WebSocket). It generates dummy data in memory and NEVER touches the
 * database, so it works even when SQL Server is unreachable.
 */
export const exampleReport: ReportDefinition<ExampleParams, ExampleRow[]> = {
  type: 'example',
  title: 'Laporan Contoh',
  paramsSchema: exampleParamsSchema,

  async fetchData(params) {
    const rows: ExampleRow[] = []
    for (let i = 1; i <= params.rows; i++) {
      rows.push({
        no: i,
        nama: `Item contoh ${i}`,
        jumlah: i * 3,
        keterangan: i % 5 === 0 ? 'Baris <penting> & "spesial"' : 'Baris biasa',
      })
    }
    return rows
  },

  render(rows, meta: RenderMeta<ExampleParams>) {
    const body = `
<h1>${escapeHtml(meta.params.title)}</h1>
<div class="meta">
  Diminta oleh: ${escapeHtml(meta.requestedBy)} &middot;
  Dibuat: ${escapeHtml(meta.generatedAt.toISOString())}
</div>
<table>
  <thead>
    <tr><th>No</th><th>Nama</th><th>Jumlah</th><th>Keterangan</th></tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (row) => `<tr>
      <td>${escapeHtml(row.no)}</td>
      <td>${escapeHtml(row.nama)}</td>
      <td>${escapeHtml(row.jumlah)}</td>
      <td>${escapeHtml(row.keterangan)}</td>
    </tr>`,
      )
      .join('\n')}
  </tbody>
</table>
<div class="footer-note">Dokumen ini dihasilkan otomatis oleh report-service.</div>`

    return {
      html: renderPage({ title: meta.params.title, bodyHtml: body }),
      footerHtml: pageFooterHtml({
        printedBy: meta.requestedBy,
        printedAt: formatPrintedAt(meta.generatedAt),
      }),
    }
  },
}
