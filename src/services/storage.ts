import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env'
import { logger } from '../lib/logger'
import type { ReportJobResult } from '../queue/report.queue'

/**
 * The on-disk file name is formed ONLY from the jobId (never from user input,
 * preventing path traversal). The download name may be more descriptive —
 * that is just a label for the user, not a server path.
 */
export function resolveReportPath(jobId: string): string {
  return path.join(env.STORAGE_DIR, `report-${jobId}.pdf`)
}

export async function saveReportPdf(
  jobId: string,
  pdf: Uint8Array,
): Promise<Pick<ReportJobResult, 'fileName' | 'size'>> {
  await mkdir(env.STORAGE_DIR, { recursive: true })
  const filePath = resolveReportPath(jobId)
  await Bun.write(filePath, pdf)
  const file = Bun.file(filePath)
  return { fileName: path.basename(filePath), size: file.size }
}

export function getReportFile(jobId: string) {
  return Bun.file(resolveReportPath(jobId))
}

const REPORT_FILE_PATTERN = /^report-.+\.pdf$/

/**
 * Deletes report-*.pdf files older than FILE_RETENTION_DAYS. Runs once when
 * the worker starts.
 */
export async function cleanupExpiredReports(): Promise<void> {
  const cutoff = Date.now() - env.FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000

  let entries: string[]
  try {
    entries = await readdir(env.STORAGE_DIR)
  } catch {
    return // storage dir does not exist yet — nothing to clean
  }

  for (const name of entries) {
    if (!REPORT_FILE_PATTERN.test(name)) continue
    try {
      const filePath = path.join(env.STORAGE_DIR, name)
      const info = await stat(filePath)
      if (info.mtimeMs < cutoff) {
        await unlink(filePath)
        logger.info({ file: name }, 'Deleted expired report file')
      }
    } catch (err) {
      logger.warn({ err, file: name }, 'Failed to clean up report file')
    }
  }
}
