import { z } from 'zod'
import { reports } from './registry'

/**
 * `POST /reports` has a body whose shape depends on another field: `params`
 * means something different for every report. It used to be published as a bare
 * `object`, which is why the docs could describe none of the 170 types and why a
 * "Try it out" form happily sent a date range to a procedure that takes no
 * parameters.
 *
 * The body is therefore built from the registry here, so the documented params
 * come from the same Zod schema the API validates with and cannot drift.
 *
 * Many report types but only a handful of distinct param shapes, so the body is
 * a `oneOf` per SHAPE rather than per report. Each branch pins `type` to the
 * reports that use that shape, so the docs still say exactly which reports take
 * what, and a body naming `label-nyangkap` cannot also carry a period.
 *
 * The union is built with Zod rather than hand-written JSON Schema so the
 * OpenAPI generator derives the `oneOf` itself, and so `c.req.valid('json')`
 * stays typed for the handler.
 */

export interface ParamShape {
  /** Stable component name, e.g. "PeriodParams". */
  name: string
  /** When to use it, and what it means. */
  summary: string
  /** The params schema, straight from a report definition. */
  schema: z.ZodType
  /** Registry keys that validate against this shape. */
  types: string[]
}

const NAMED_SHAPES: Array<{ probe: string; name: string; summary: string }> = [
  {
    probe: 'mutasi-kayu-bulat',
    name: 'PeriodParams',
    summary: 'Rentang tanggal wajib; tglAkhir tidak boleh mendahului tglAwal.',
  },
  {
    probe: 'rangkuman-bongkar-susun',
    name: 'AsOfDateParams',
    summary:
      'Satu tanggal acuan. Procedure-nya hanya mendeklarasikan @TglAwal, jadi nilai dikirim ke sana.',
  },
  {
    probe: 'label-nyangkut',
    name: 'NoParams',
    summary: 'Snapshot langsung: procedure tidak punya parameter sama sekali.',
  },
]

/** Structural fingerprint, so reports sharing a shape collapse into one branch. */
function fingerprint(schema: z.ZodType): string {
  const converted = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
  delete converted.$schema
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== '$schema')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    )
  }
  return JSON.stringify(canonical(converted))
}

/** Groups the registry by param shape, largest group first. */
export function collectParamShapes(): ParamShape[] {
  const groups = new Map<string, { schema: z.ZodType; types: string[] }>()
  for (const [type, definition] of Object.entries(reports)) {
    const key = fingerprint(definition.paramsSchema)
    const existing = groups.get(key)
    if (existing) existing.types.push(type)
    else groups.set(key, { schema: definition.paramsSchema, types: [type] })
  }

  const namedByKey = new Map<string, { name: string; summary: string }>()
  for (const { probe, name, summary } of NAMED_SHAPES) {
    const definition = reports[probe]
    if (definition) {
      namedByKey.set(fingerprint(definition.paramsSchema), { name, summary })
    }
  }

  return [...groups.entries()]
    .map(([key, { schema, types }]) => {
      const named = namedByKey.get(key)
      return {
        name: named?.name ?? `Params${toPascalCase(types[0]!)}`,
        summary: named?.summary ?? 'Parameter khusus laporan ini.',
        schema,
        types: types.sort(),
      }
    })
    .sort((left, right) => right.types.length - left.types.length)
}

function toPascalCase(type: string): string {
  return type
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}

/** Every registry key, so the docs can offer a complete type list. */
export const reportTypeEnum: string[] = Object.keys(reports).sort()

/**
 * The `POST /reports` body.
 *
 * Each branch is `{ type: <the reports taking this shape>, params: <their
 * schema> }`. `params` is optional on every branch: omitting it means "no
 * params", which is how a parameterless snapshot is meant to be called. The
 * cross-check against the type is a documentation guarantee; the handler still
 * validates `params` against the report's own schema and returns 400 with the
 * offending field names.
 */
export function buildCreateReportBodySchema(): z.ZodType {
  const branches = collectParamShapes().map(
    (shape) =>
      z.object({
        type: z
          .enum(shape.types as [string, ...string[]])
          .describe(`Laporan dengan bentuk parameter "${shape.name}". ${shape.summary}`),
        params: (shape.schema as z.ZodType).optional(),
      }),
  )

  // Fallback for a type this build does not know: still a valid body shape, so
  // an unknown type is answered 400 UNKNOWN_REPORT_TYPE rather than a shape
  // error the caller cannot act on.
  const fallback = z.object({
    type: z.string().describe('Jenis laporan. Tidak dikenal akan dijawab 400 UNKNOWN_REPORT_TYPE.'),
    params: z.unknown().optional(),
  })

  return z.union([...branches, fallback] as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]])
}

/** Component schemas to merge into the generated OpenAPI document. */
export function reportParamComponents(): Record<string, Record<string, unknown>> {
  const components: Record<string, Record<string, unknown>> = {}
  for (const shape of collectParamShapes()) {
    const json = z.toJSONSchema(shape.schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>
    delete json.$schema
    const sample = shape.types.slice(0, 5).join(', ')
    components[shape.name] = {
      ...json,
      description:
        `${shape.summary} Dipakai ${shape.types.length} laporan: ${sample}` +
        `${shape.types.length > 5 ? ', ...' : ''}`,
    }
  }
  return components
}

/** Human-readable map of shape to reports, for the endpoint description. */
export function paramShapeSummary(): string {
  return collectParamShapes()
    .map((shape) => {
      const sample = shape.types.slice(0, 4).join(', ')
      return `- **${shape.name}** (${shape.types.length} laporan) — ${shape.summary} Contoh: ${sample}${shape.types.length > 4 ? ', ...' : ''}`
    })
    .join('\n')
}
