import type { z } from 'zod'
import type sql from 'mssql'

export interface RenderMeta<TParams> {
  requestedBy: string
  generatedAt: Date
  params: TParams
}

export interface RenderResult {
  html: string
  footerHtml?: string
  landscape?: boolean
}

export interface ReportDefinition<TParams = unknown, TData = unknown> {
  type: string
  title: string
  paramsSchema: z.ZodType<TParams>
  /**
   * The pool is a lazy promise: it only connects when a database-backed
   * report actually awaits it. Reports that do not need the database (e.g.
   * `example`) never trigger a connection.
   */
  fetchData(params: TParams, ctx: { pool: Promise<sql.ConnectionPool> }): Promise<TData>
  render(data: TData, meta: RenderMeta<TParams>): RenderResult
}
