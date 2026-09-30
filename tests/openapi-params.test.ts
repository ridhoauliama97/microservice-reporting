import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  buildCreateReportBodySchema,
  collectParamShapes,
  paramShapeSummary,
  reportParamComponents,
  reportTypeEnum,
} from '../src/reports/openapi-params'
import { reports } from '../src/reports/registry'

/**
 * The documented request body for POST /reports.
 *
 * This schema used to be a bare `{ type: string, params?: unknown }`, so the
 * docs described none of the 138 report types and a "Try it out" form sent a
 * date range to a procedure that takes no parameters. What matters here is
 * that the docs stay in step with the registry: a new report, or a changed
 * param shape, has to show up without anyone editing a list by hand.
 */

describe('param shape collection', () => {
  test('every registered report lands in exactly one shape', () => {
    const covered = collectParamShapes().flatMap((shape) => shape.types)
    expect(covered.sort()).toEqual(reportTypeEnum.slice().sort())
    // No duplicates: a report listed twice would document two conflicting
    // bodies for the same type.
    expect(new Set(covered).size).toBe(covered.length)
  })

  test('the shapes collapse 138 reports into a readable handful', () => {
    const shapes = collectParamShapes()
    expect(shapes.length).toBeLessThan(20)
    // The period shape is by far the biggest group.
    expect(shapes[0]!.name).toBe('PeriodParams')
    expect(shapes[0]!.types.length).toBeGreaterThan(50)
  })

  test('the well-known shapes keep readable names', () => {
    const names = collectParamShapes().map((shape) => shape.name)
    expect(names).toContain('PeriodParams')
    expect(names).toContain('AsOfDateParams')
    expect(names).toContain('NoParams')
  })

  test('a no-parameter report shares one shape, not 138 of them', () => {
    const noParams = collectParamShapes().find((shape) => shape.name === 'NoParams')
    expect(noParams).toBeDefined()
    expect(noParams!.types).toContain('label-nyangkut')
    // A group holding every parameterless report must exist, otherwise each
    // one would mint its own branch and the form would be unusable.
    expect(noParams!.types.length).toBeGreaterThan(1)
  })
})

describe('request body schema', () => {
  const schema = buildCreateReportBodySchema()

  test('a parameterless report accepts an empty params and a missing one', () => {
    expect(schema.safeParse({ type: 'label-nyangkut', params: {} }).success).toBe(true)
    expect(schema.safeParse({ type: 'label-nyangkap' }).success).toBe(true)
  })

  test('an unknown type still parses, so the answer is UNKNOWN_REPORT_TYPE', () => {
    // If the body schema rejected it, the caller would get a shape error
    // instead of the documented 400 with the type name in it.
    expect(schema.safeParse({ type: 'tidak-ada' }).success).toBe(true)
  })

  test('a report that needs a period is documented as requiring both dates', () => {
    // The body union keeps a permissive fallback branch so an unknown type is
    // answered UNKNOWN_REPORT_TYPE rather than a shape error. That means the
    // union itself cannot enforce the period, so the requirement has to be
    // visible in the published component instead - and the handler enforces it
    // per report.
    const period = reportParamComponents()['PeriodParams']!
    expect(period.required).toEqual(['tglAwal', 'tglAkhir'])
  })

  test('the body is a union, so the docs render a branch per shape', () => {
    const json = zodSchemaToJson(schema)
    const branches = (json.anyOf ?? json.oneOf ?? []) as Array<
      Record<string, unknown>
    >
    expect(branches.length).toBeGreaterThan(1)
    // Every branch names the reports it covers.
    for (const branch of branches) {
      const properties = branch.properties as Record<string, { enum?: unknown }>
      expect(properties.type).toBeDefined()
    }
  })

  test('each branch describes the params its reports actually take', () => {
    const json = zodSchemaToJson(schema)
    const branches = (json.anyOf ?? json.oneOf ?? []) as Array<
      Record<string, unknown>
    >
    const withAsOf = branches.find((branch) => {
      const properties = branch.properties as Record<string, Record<string, unknown>>
      return Object.keys(properties.params?.properties ?? {}).join() === 'tglAkhir'
    })
    expect(withAsOf).toBeDefined()
    const properties = withAsOf!.properties as Record<
      string,
      { enum?: string[] }
    >
    expect(properties.type!.enum).toContain('rangkuman-bongkar-susun')
    expect(properties.type!.enum).toContain('bahan-terpakai')
    // And NOT a period report: sending a period there is a documented error.
    expect(properties.type!.enum).not.toContain('mutasi-kayu-bulat')
  })

  test('the summary names every shape with a report example', () => {
    const summary = paramShapeSummary()
    expect(summary).toContain('**PeriodParams**')
    expect(summary).toContain('**NoParams**')
    // Each line names reports that actually exist in that shape.
    const shapes = collectParamShapes()
    for (const shape of shapes) {
      expect(summary).toContain(`**${shape.name}**`)
      expect(summary).toContain(shape.types[0]!)
    }
  })
})

describe('component schemas', () => {
  const components = reportParamComponents()

  test('every shape is published as a component', () => {
    for (const shape of collectParamShapes()) {
      expect(components[shape.name]).toBeDefined()
    }
  })

  test('a component carries its params and names the reports using it', () => {
    const period = components['PeriodParams']!
    expect(Object.keys(period.properties as object).sort()).toEqual([
      'tglAkhir',
      'tglAwal',
    ])
    const description = period.description as string
    // The sample is the first few types alphabetically, so assert on the count
    // and on a name that is guaranteed to be in the sample.
    const biggest = collectParamShapes()[0]!
    expect(description).toContain(`${biggest.types.length} laporan`)
    expect(description).toContain(biggest.types[0]!)
  })

  test('a no-parameter component forbids extra keys', () => {
    // This is what tells a form client that a date would be rejected.
    expect(components['NoParams']!.additionalProperties).toBe(false)
  })

  test('the $schema key is stripped, since it is metadata not shape', () => {
    for (const component of Object.values(components)) {
      expect(component.$schema).toBeUndefined()
    }
  })

  test('the documented components agree with the live registry', () => {
    for (const shape of collectParamShapes()) {
      for (const type of shape.types) {
        expect(reports[type]).toBeDefined()
      }
    }
  })
})

/** Converts to the JSON Schema the OpenAPI document actually publishes. */
function zodSchemaToJson(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
  delete converted.$schema
  return converted as Record<string, unknown>
}
