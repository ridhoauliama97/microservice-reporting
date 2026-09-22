import sql from 'mssql'
import { env } from '../config/env'
import { logger } from '../lib/logger'

let poolPromise: Promise<sql.ConnectionPool> | undefined

function createPool(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool({
    server: env.DB_SERVER,
    port: env.DB_PORT,
    database: env.DB_DATABASE,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_CERT,
    },
    pool: { max: 10, min: 0 },
  })

  // Without this handler, runtime pool errors can crash the process.
  pool.on('error', (err) => {
    logger.error({ err }, 'SQL Server pool error')
  })

  return pool.connect()
}

/**
 * Lazy singleton: the pool is created on first call, never at import time,
 * so the API stays alive when SQL Server is down. On failure the singleton
 * is reset so the next call retries.
 */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = undefined
      logger.error({ err }, 'SQL Server pool connection failed')
      throw err
    })
  }
  return poolPromise
}

export async function closePool(): Promise<void> {
  const promise = poolPromise
  poolPromise = undefined
  if (!promise) return
  try {
    const pool = await promise
    await pool.close()
    logger.info('SQL Server pool closed')
  } catch (err) {
    logger.warn({ err }, 'Error while closing SQL Server pool')
  }
}

/**
 * A truly lazy pool promise: the connection is only attempted when the report
 * actually awaits it. Reports that never touch the database (e.g. `example`)
 * must not trigger a connection — otherwise every job would wait for (and
 * log) a failed DB connection when SQL Server is unreachable.
 */
export function lazyPool(): Promise<sql.ConnectionPool> {
  let promise: Promise<sql.ConnectionPool> | undefined
  const lazy = {
    then: <TResult1 = sql.ConnectionPool, TResult2 = never>(
      onfulfilled?:
        | ((value: sql.ConnectionPool) => TResult1 | PromiseLike<TResult1>)
        | undefined
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | undefined
        | null,
    ): Promise<TResult1 | TResult2> => {
      promise ??= getPool()
      return promise.then(onfulfilled, onrejected)
    },
  }
  return lazy as unknown as Promise<sql.ConnectionPool>
}
