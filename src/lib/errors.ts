import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Application error with a stable machine-readable code and an
 * Indonesian user-facing message.
 */
export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function validationError(details?: unknown): AppError {
  return new AppError('VALIDATION_ERROR', 400, 'Input tidak valid', details)
}

export function unknownReportTypeError(type: string): AppError {
  return new AppError(
    'UNKNOWN_REPORT_TYPE',
    400,
    `Jenis laporan tidak dikenal: ${type}`,
  )
}

export function unauthorizedError(): AppError {
  return new AppError(
    'UNAUTHORIZED',
    401,
    'Token tidak valid atau kedaluwarsa',
  )
}

export function notFoundError(message = 'Data tidak ditemukan'): AppError {
  return new AppError('NOT_FOUND', 404, message)
}

export function reportNotReadyError(): AppError {
  return new AppError(
    'REPORT_NOT_READY',
    409,
    'Laporan belum selesai dibuat',
  )
}

export function fileExpiredError(): AppError {
  return new AppError(
    'FILE_EXPIRED',
    410,
    'File laporan sudah tidak tersedia (kedaluwarsa)',
  )
}

export function payloadTooLargeError(): AppError {
  return new AppError('PAYLOAD_TOO_LARGE', 413, 'Ukuran request terlalu besar')
}

export function internalError(): AppError {
  return new AppError(
    'INTERNAL_ERROR',
    500,
    'Terjadi kesalahan internal pada server',
  )
}

/** Uniform error body shape for all failures. */
export function errorBody(err: unknown): {
  error: { code: string; message: string; details?: unknown }
} {
  return formatErrorResponse(err).body
}

/** Uniform error response shape for all failures. */
export function formatErrorResponse(err: unknown): {
  body: { error: { code: string; message: string; details?: unknown } }
  status: number
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: { code: err.code, message: err.message, details: err.details },
      },
    }
  }
  // Never leak internals to the client; log the real error at call site.
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan internal pada server',
      },
    },
  }
}

/** Convenience helper for handlers: build a Hono JSON error response. */
export function errorResponse(c: Context, err: unknown): Response {
  const { status, body } = formatErrorResponse(err)
  return c.json(body, status as ContentfulStatusCode)
}
