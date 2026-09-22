import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')

/**
 * Shared parameter schema for reports that take a date range (passed to the
 * stored procedures as the SQL `date` type).
 */
export const periodParamsSchema = z
  .object({
    tglAwal: isoDate,
    tglAkhir: isoDate,
  })
  .refine((v) => v.tglAkhir >= v.tglAwal, {
    message: 'tglAkhir tidak boleh lebih awal dari tglAwal',
    path: ['tglAkhir'],
  })

export type PeriodParams = z.infer<typeof periodParamsSchema>
