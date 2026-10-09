/**
 * Generates the report catalog under docs/reports/ from src/reports/registry.ts.
 *
 *   bun run docs/scripts/generate-catalog.ts
 *   bun run docs/scripts/generate-catalog.ts --check   # fail if stale
 *
 * Safe to re-run: the generated files are rewritten from scratch and nothing
 * outside docs/ is touched.
 *
 * Importing the registry pulls in src/config/env.ts, which validates the
 * environment and throws without it. The dummy values below are set on
 * process.env only for this process (never written to .env) and only when the
 * variables are missing, so a real .env still wins. They are never used to talk
 * to a database: this script only reads schemas and source text.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = resolve(HERE, '..')
const ROOT = resolve(DOCS, '..')
const REPORTS_SRC = join(ROOT, 'src', 'reports')
const WPS_SRC = join(REPORTS_SRC, 'wps')

/**
 * Registry types that are NOT WPS reports, so the catalog does not document
 * them. `example` builds its rows in memory and never touches the database or
 * any stored procedure - it exists to prove the queue/Gotenberg pipeline works,
 * and it has no counterpart in open-api-report's menu.
 */
const NON_WPS_TYPES = new Set(['example'])


const DUMMY_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  DB_SERVER: 'localhost',
  DB_DATABASE: 'docs',
  DB_USER: 'docs',
  DB_PASSWORD: 'docs',
  JWT_SECRET: 'docs_generation_only_not_a_real_secret',
}

for (const [key, value] of Object.entries(DUMMY_ENV)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value
  }
}

// Imported after the environment is in place.
const { reports } = await import(join(REPORTS_SRC, 'registry'))
const { collectParamShapes } = await import(join(REPORTS_SRC, 'openapi-params'))

// --- types -----------------------------------------------------------------

type JsonSchema = {
  type?: string
  format?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  default?: unknown
  items?: JsonSchema
  anyOf?: JsonSchema[]
}

interface SpBinding {
  /** The `params` field it binds, or null when the source names only the SP param. */
  field: string | null
  param: string
  /** True for a hand-written `.input(...)` call, false for a factory spec. */
  fromInput: boolean
}

interface ReportInfo {
  type: string
  title: string
  file: string | null
  sps: string[]
  spBindings: SpBinding[]
  landscape: boolean
  orientationKnown: boolean
  notes: string[]
  category: string
  shapeName: string
}

interface ShapeInfo {
  name: string
  summary: string
  schema: z.ZodType
  types: string[]
  json: JsonSchema
  required: string[]
  properties: Array<[string, JsonSchema]>
}

// --- read metadata from the report source files ---------------------------

/**
 * Only true helpers go here. A file that DEFINES a report type must not be
 * excluded even when it also exports a factory, or its procedure and params go
 * missing from the catalog.
 */
const SHARED_MODULE_NAMES = new Set([
  'template.ts',
  'styles.ts',
  'reference-css.ts',
  'reference-css-fixups.ts',
])

interface SourceFacts {
  sps: string[]
  spBindings: SpBinding[]
  landscape: boolean
  orientationKnown: boolean
  notes: string[]
}

/** Every `type: '<x>'` in a file, with the slice of source that belongs to it. */
function blocksByType(src: string): Map<string, string> {
  const marker = /\btype\s*:\s*['"]([a-z0-9-]+)['"]/g
  const found = [...src.matchAll(marker)]
  const blocks = new Map<string, string>()
  for (let i = 0; i < found.length; i++) {
    const hit = found[i]!
    // Start at the export statement that opens this definition, so the docblock
    // above it is included - some files name the procedure only there.
    const before = src.lastIndexOf('export ', hit.index)
    const start = before === -1 ? 0 : before
    const end = i + 1 < found.length ? found[i + 1]!.index : src.length
    const block = src.slice(start, end)
    if (!blocks.has(hit[1]!)) blocks.set(hit[1]!, block)
  }
  return blocks
}

/**
 * Stored procedure names and SP parameter bindings are written two different
 * ways in this tree, and a factory-built report never calls execute() itself:
 *
 *   storedProcedure: "SP_x"   (factory spec)
 *   spName: "SP_x"            (factory spec)
 *   .execute("SP_x")          (hand-written fetchData)
 *
 * Both quote styles appear, so each pattern matches either.
 *
 * Extraction is scoped to ONE report type, not to the whole file. Several files
 * define several reports side by side (produksi-per-nomor-produksi.ts defines
 * seven, one per product, each with its own SP); attributing every SP in the
 * file to every report in it would be wrong.
 */
function readSourceFacts(fileName: string | null, type: string): SourceFacts {
  const empty: SourceFacts = {
    sps: [],
    spBindings: [],
    landscape: false,
    orientationKnown: false,
    notes: [],
  }
  if (!fileName) return empty

  const src = readFileSync(join(WPS_SRC, fileName), 'utf8')
  const blocks = blocksByType(src)
  // A file that defines several reports names its procedures inside each
  // report's own block, so scoping is required there. A file with a single
  // report often declares the procedure in a top-level constant instead
  // (outside any block), so the whole file is the correct scope for it.
  let scope = blocks.size > 1 ? (blocks.get(type) ?? src) : src

  const collectSps = (text: string): string[] => [
    ...new Set(
      [
        ...[
          ...text.matchAll(
            /(?:storedProcedure|spName|mainSpName|mainSp|subSp)\s*:\s*['"]([A-Za-z0-9_]+)['"]/g,
          ),
        ].map((m) => m[1]!),
        // Any SP string literal in the report's scope, e.g. run("SP_x").
        ...[...text.matchAll(/['"](SP[A-Za-z0-9_]+)['"]/g)].map((m) => m[1]!),
        ...[...text.matchAll(/\.execute\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]!),
        // A constant holding the name, e.g. const STORED_PROCEDURE = "SP_x";
        ...[...text.matchAll(/=\s*['"](SP[A-Za-z0-9_]+)['"]/g)].map((m) => m[1]!),
        // Some blocks name the procedure only in the leading docblock.
        ...[...text.matchAll(/^\s*\*\s*(SP[A-Za-z0-9_]+)/gm)].map((m) => m[1]!),
      ].filter((s) => /^SP/i.test(s)),
    ),
  ].sort()

  let sps = collectSps(scope)
  if (sps.length === 0) {
    // The procedure sits in a factory declared above this report's block, which
    // the per-type slice cannot see. The whole file is the only place left, and
    // this fallback only runs when the precise scope found nothing - so it can
    // never re-attribute a sibling report's procedure.
    scope = src
    sps = collectSps(scope)
  }

  const spBindings = collectSpBindings(scope)

  const landscape = /landscape\s*:\s*true/.test(scope)

  // Any report that reaches renderWpsReportPage declares an orientation,
  // whether it says landscape: true or landscape: false.
  const rendersPage = /renderWpsReportPage\s*\(/.test(scope) || /\blandscape\b\s*:/.test(scope)

  return {
    sps,
    spBindings,
    landscape,
    orientationKnown: rendersPage,
    notes: [],
  }
}

/**
 * The SP parameter names a report binds, each tied to the `params` field it
 * feeds. Kept as field -> param rather than a flat list because the caller has
 * to tell a real rename (`tglAkhir` -> `EndDate`) from the factory default,
 * which is just the field name in PascalCase (`tglAkhir` -> `TglAkhir`).
 *
 * Three forms appear in this tree:
 *   inputNames: { tglAwal: 'StartDate', tglAkhir: 'EndDate' }
 *   inputName: 'EndDate'                       (single-param factories)
 *   .input('NoProduksi', sql.NVarChar, params.noProduksi)
 */
function collectSpBindings(scope: string): SpBinding[] {
  const found: SpBinding[] = []
  for (const m of scope.matchAll(/inputNames\s*:\s*\{([^}]*)\}/g)) {
    for (const pair of m[1]!.matchAll(/([A-Za-z0-9_]+)\s*:\s*['"]([A-Za-z0-9_]+)['"]/g)) {
      found.push({ field: pair[1]!, param: pair[2]!, fromInput: false })
    }
  }
  // .input('Param', sql.Type, params.field) - the field is known.
  // .input('Param', sql.Type, <expr>)       - an internal switch, not a field.
  for (const m of scope.matchAll(
    /\.input\s*\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*sql\.[A-Za-z0-9_]+(?:\s*\([^)]*\))?\s*,\s*(params\.([A-Za-z0-9_]+)|[^)]+)/g,
  )) {
    found.push({ field: m[3] ?? null, param: m[1]!, fromInput: true })
  }
  for (const m of scope.matchAll(/inputName\s*:\s*['"]([A-Za-z0-9_]+)['"]/g)) {
    found.push({ field: null, param: m[1]!, fromInput: false })
  }
  const seen = new Set<string>()
  return found.filter((b) => {
    const key = `${b.field ?? ''}:${b.param}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// --- categories ------------------------------------------------------------

/**
 * Report types grouped by PROCESS.
 *
 * The grouping is open-api-report's own WPS menu, read from
 * `resources/views/welcome.blade.php` - not the folder layout under
 * `resources/views/reports/`, which drifts from what the project actually
 * offers. The menu's routes line up 1:1 with the WPS registry types, which is
 * what makes it usable as the source of truth.
 *
 * Two things that menu says that the folder layout does not:
 *   - `Kayu Bulat` and `Kayu Bulat (Rambung)` are separate processes;
 *   - there is no Mutasi or Dashboard category. Those reports are listed under
 *     the product they mutate, so `mutasi-s4s` is an S4S report here.
 *
 * HTML comments were stripped before reading it: the menu's SPK card is
 * commented out, so SPK is not a live category and `spk-sawmill` sits with
 * Sawn Timber, which is where the menu lists it.
 *
 * Static data on purpose - the generator must rebuild the catalog without the
 * sibling repo checked out. A registry type missing from this table is an error,
 * so a newly added report cannot slip into the catalog uncategorised.
 */
const PROCESS_CATEGORIES: Array<{ category: string; types: string[] }> = [
  {
    category: "Kayu Bulat",
    types: [
      "balok-sudah-semprot", "hasil-output-racip-harian", "hidup-kb-per-group", "kayu-bulat-hidup",
      "kb-khusus-bangkang", "mutasi-hasil-racip", "mutasi-kayu-bulat", "mutasi-kayu-bulat-gantung",
      "mutasi-racip-detail", "penerimaan-kayu-bulat-ext-ton", "penerimaan-kayu-bulat-int-ton", "penerimaan-kayu-bulat-per-supplier",
      "penerimaan-kayu-bulat-per-supplier-grafik", "penerimaan-kayu-bulat-per-supplier-group", "perbandingan-kb-masuk-periode-1-dan-2", "rekap-pembelian-kayu-bulat",
      "saldo-kayu-bulat", "stock-opname-kb", "stock-racip-kayu-lat", "target-masuk-bb-bulanan",
      "target-masuk-bb-harian", "timeline-kayu-bulat-bulanan", "timeline-kayu-bulat-harian", "umur-kayu-bulat-non-rambung",
    ],
  },
  {
    category: "Kayu Bulat (Rambung)",
    types: [
      "mutasi-kayu-bulat-kg", "mutasi-kayu-bulat-kg-gantung", "penerimaan-kayu-bulat-ext-kg", "penerimaan-kayu-bulat-kg",
      "penerimaan-kayu-bulat-per-supplier-kg", "perbandingan-kb-masuk-periode-1-dan-2-kg", "rekap-pembelian-kayu-bulat-kg", "rekap-penerimaan-st-dari-sawmill-kg",
      "rekap-penerimaan-st-sawmill-costing-rambung", "rekap-rendemen-rambung-per-supplier", "saldo-hidup-kayu-bulat-kg", "supplier-intel",
      "timeline-kb-bulanan-rambung-kg", "timeline-kb-harian-rambung-kg", "umur-kayu-bulat-rambung",
    ],
  },
  {
    category: "Sawn Timber",
    types: [
      "dashboard-sawn-timber", "detail-lembar-tally-hasil-sawmill", "kd-keluar-masuk", "kd-upah-per-customer",
      "kd-upah-per-no-proc-kd-detail", "ketahanan-barang-st", "label-st-hidup-detail", "lembar-perhitungan-upah-borongan-sawmill",
      "mutasi-kd", "mutasi-sawn-timber-ton", "pemakaian-obat-vacuum", "pembelian-st-per-supplier-ton",
      "pembelian-st-timeline-ton", "penerimaan-st-hasil-sawmill", "penerimaan-st-sawmill-kg", "qc-sawmill",
      "qc-sawmill-discrepancy", "qc-sawmill-summary", "rekap-hasil-sawmill-per-meja", "rekap-hasil-sawmill-per-meja-semua-meja",
      "rekap-hasil-sawmill-per-meja-upah-borongan", "rekap-kamar-kd", "rekap-pcs-telly-hasil-sawmill", "rekap-penerimaan-st-non-rambung",
      "rekap-produktivitas-sawmill", "rekap-st-penjualan", "saldo-st-hidup-per-produk", "serah-terima-st-kamar-kd",
      "spk-sawmill", "st-basah-hidup-per-umur-kayu-ton", "st-hidup-kering", "st-hidup-per-spk",
      "st-masuk-per-group", "st-rambung-mc1-mc2-detail", "st-rambung-mc1-mc2-rangkuman", "st-sawmill-hari-tebal-lebar",
      "st-sawmill-masuk-per-group", "stock-st-basah", "stock-st-kering", "stok-opname-st-detail-kd",
      "total-bagus-kulit-rambung", "tracing-st", "umur-sawn-timber-detail-ton",
    ],
  },
  {
    category: "S4S",
    types: [
      "dashboard-s4s", "dashboard-s4s-v2", "grade-abc-harian", "ketahanan-barang-s4s",
      "label-s4s-hidup-per-jenis-kayu", "label-s4s-hidup-per-produk-per-jenis-kayu", "mutasi-s4s", "output-produksi-s4s-per-grade",
      "rekap-produksi-s4s-consolidated", "rekap-produksi-s4s-per-jenis-per-grade", "rekap-produksi-s4s-rambung-per-grade", "s4s-hidup-detail",
      "umur-s4s-detail",
    ],
  },
  {
    category: "Sanding",
    types: [
      "dashboard-sanding", "ketahanan-barang-sanding", "mutasi-sanding", "rekap-produksi-sanding-consolidated",
      "rekap-produksi-sanding-per-jenis-per-grade", "sanding-hidup-detail", "umur-sanding-detail",
    ],
  },
  {
    category: "Laminating",
    types: [
      "dashboard-laminating", "ketahanan-barang-laminating", "laminating-hidup-detail", "mutasi-laminating",
      "rekap-produksi-laminating-consolidated", "rekap-produksi-laminating-per-jenis-per-grade", "umur-laminating-detail",
    ],
  },
  {
    category: "Moulding",
    types: [
      "dashboard-moulding", "ketahanan-barang-moulding", "moulding-hidup-detail", "mutasi-moulding",
      "rekap-produksi-moulding-consolidated", "rekap-produksi-moulding-per-jenis-per-grade", "umur-moulding-detail",
    ],
  },
  {
    category: "Finger Joint",
    types: [
      "dashboard-finger-joint", "finger-joint-hidup-detail", "ketahanan-barang-finger-joint", "mutasi-finger-joint",
      "rekap-produksi-finger-joint-consolidated", "rekap-produksi-finger-joint-per-jenis-per-grade", "umur-finger-joint-detail",
    ],
  },
  {
    category: "Cross Cut Akhir",
    types: [
      "cross-cut-akhir-hidup-detail", "dashboard-cross-cut-akhir", "ketahanan-barang-cc-akhir", "mutasi-cross-cut-akhir",
      "rekap-produksi-cross-cut-akhir-consolidated", "rekap-produksi-cross-cut-akhir-per-jenis-per-grade", "umur-cross-cut-akhir-detail",
    ],
  },
  {
    category: "Barang Jadi",
    types: [
      "barang-jadi-hidup-detail", "dashboard-barang-jadi", "mutasi-barang-jadi", "mutasi-barang-jadi-per-jenis-per-ukuran",
      "rekap-produksi-barang-jadi-consolidated", "rekap-produksi-packing-per-jenis-per-grade", "saldo-barang-jadi-hidup-per-jenis-per-produk", "umur-barang-jadi-detail",
    ],
  },
  {
    category: "Reproses",
    types: [
      "dashboard-reproses", "ketahanan-barang-reproses", "mutasi-reproses", "reproses-hidup-detail",
      "umur-reproses-detail",
    ],
  },
  {
    category: "Proses Produksi",
    types: [
      "produksi-cc-akhir-per-nomor-produksi", "produksi-fj-per-nomor-produksi", "produksi-laminating-per-nomor-produksi", "produksi-moulding-per-nomor-produksi",
      "produksi-packing-per-nomor-produksi", "produksi-s4s-per-nomor-produksi", "produksi-sanding-per-nomor-produksi",
    ],
  },
  {
    category: "Rendemen Kayu",
    types: [
      "produksi-per-spk", "rekap-rendemen-non-rambung", "rekap-rendemen-rambung", "rendemen-semua-proses",
    ],
  },
  {
    category: "Penjualan Kayu",
    types: [
      "koordinat-tanah", "penjualan-barang-jadi-m3", "penjualan-lokal", "rekap-penjualan-ekspor-per-buyer-per-produk",
      "rekap-penjualan-ekspor-per-produk-per-buyer", "rekap-penjualan-per-produk", "surat-jalan", "timeline-rekap-penjualan-per-produk",
    ],
  },
  {
    category: "Management",
    types: [
      "dashboard-ru", "discrepancy-rekap-mutasi", "flow-produksi-per-periode", "hasil-produksi-mesin-lembur-dan-non-lembur",
      "label-perhari", "produksi-hulu-hilir", "produksi-semua-mesin", "rekap-mutasi",
      "rekap-mutasi-cross-tab", "rekap-stock-on-hand", "stock-hidup-per-nospk", "stock-hidup-per-nospk-discrepancy",
    ],
  },
  {
    category: "Verifikasi",
    types: [
      "bahan-terpakai", "bahan-yang-dihasilkan", "kapasitas-racip-kayu-bulat-hidup", "label-nyangkut",
      "rangkuman-bongkar-susun", "rangkuman-jumlah-label-input",
    ],
  },
  {
    category: "Contoh",
    types: [
      "example",
    ],
  },
]
/** URL-safe: no spaces, no ampersands, lowercase. */
function slugOf(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Navigation order: raw material first, then the processes that consume it,
 * then the cross-cutting and administrative reports. Independent of the order
 * the table above happens to be written in.
 */
const CATEGORY_ORDER = [
  'Kayu Bulat',
  'Kayu Bulat (Rambung)',
  'Sawn Timber',
  'S4S',
  'Sanding',
  'Laminating',
  'Moulding',
  'Finger Joint',
  'Cross Cut Akhir',
  'Barang Jadi',
  'Reproses',
  'Proses Produksi',
  'Rendemen Kayu',
  'Penjualan Kayu',
  'Management',
  'Verifikasi',
  'Lainnya',
]

function categoryOf(type: string): string {
  for (const group of PROCESS_CATEGORIES) {
    if (group.types.includes(type)) return group.category
  }
  return 'Lainnya'
}

// --- collect ---------------------------------------------------------------

const shapes: ShapeInfo[] = collectParamShapes().map((shape) => {
  const json = z.toJSONSchema(shape.schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema
  delete (json as Record<string, unknown>).$schema
  return {
    name: shape.name,
    summary: shape.summary,
    schema: shape.schema,
    types: [...shape.types].sort(),
    json,
    required: json.required ?? [],
    properties: Object.entries(json.properties ?? {}),
  }
})

// `example` is filtered out of the catalog, so the param shape only it uses has
// to go too - otherwise the overview lists a shape whose single report is not
// documented anywhere.
const documentedTypes = new Set(
  Object.keys(reports).filter((type) => !NON_WPS_TYPES.has(type)),
)
const shapesWithExample = shapes.filter((shape) => shape.types.some((t) => documentedTypes.has(t)))
shapes.length = 0
shapes.push(...shapesWithExample)

// Every WPS report must appear in PROCESS_CATEGORIES, or it would silently
// vanish from the catalog.
const uncategorised = [...documentedTypes].filter(
  (type) => !PROCESS_CATEGORIES.some((group) => group.types.includes(type)),
)
if (uncategorised.length > 0) {
  console.error(
    `Laporan WPS tanpa kategori (${uncategorised.length}): ${uncategorised.join(', ')}`,
  )
  process.exit(1)
}

const shapeOfType = new Map<string, ShapeInfo>()
for (const shape of shapes) {
  for (const type of shape.types) shapeOfType.set(type, shape)
}

const sourceFileByType = new Map<string, string>()
for (const file of readdirSync(WPS_SRC)) {
  if (!file.endsWith('.ts') || SHARED_MODULE_NAMES.has(file)) continue
  const src = readFileSync(join(WPS_SRC, file), 'utf8')
  for (const match of src.matchAll(/type\s*:\s*['"]([a-z0-9-]+)['"]/g)) {
    if (!sourceFileByType.has(match[1]!)) sourceFileByType.set(match[1]!, file)
  }
}

const reportList: ReportInfo[] = Object.entries(reports)
  .filter(([type]) => !NON_WPS_TYPES.has(type))
  .map(([type, definition]) => {
    const file = sourceFileByType.get(type) ?? null
    const facts = readSourceFacts(file, type)
    const shape = shapeOfType.get(type)
    return {
      type,
      title: definition.title,
      file,
      sps: facts.sps,
      spBindings: facts.spBindings,
      landscape: facts.landscape,
      orientationKnown: facts.orientationKnown,
      notes: [],
      category: categoryOf(type),
      shapeName: shape?.name ?? 'Tidak diketahui',
    }
  })
  .sort((a, b) => a.type.localeCompare(b.type))

const byCategory = new Map<string, ReportInfo[]>()
for (const report of reportList) {
  const list = byCategory.get(report.category) ?? []
  list.push(report)
  byCategory.set(report.category, list)
}
// A category missing from CATEGORY_ORDER would silently sort last, which is
// how a misspelled name goes unnoticed. Fail instead.
const unordered = [...byCategory.keys()].filter((name) => CATEGORY_ORDER.indexOf(name) === -1)
if (unordered.length > 0) {
  console.error('Kategori tidak ada di CATEGORY_ORDER: ' + unordered.join(', '))
  process.exit(1)
}

const categories = [...byCategory.keys()].sort((a, b) => {
  const orderA = CATEGORY_ORDER.indexOf(a)
  const orderB = CATEGORY_ORDER.indexOf(b)
  return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB)
})

// --- rendering helpers -----------------------------------------------------

const escapeCell = (value: string): string => value.replace(/\|/g, '\\|')

function humanType(schema: JsonSchema): string {
  if (schema.anyOf) return schema.anyOf.map(humanType).join(' atau ')
  const base = schema.type ?? 'string'
  if (base === 'integer' || base === 'number') return 'number'
  return base
}

function constraintsOf(schema: JsonSchema): string {
  const parts: string[] = []
  if (schema.pattern) {
    const readable = schema.pattern
      .replace(/\\d/g, 'digit')
      .replace(/[{}]/g, '')
      .replace(/\^|\$/g, '')
      .replace(/\\/g, '')
    parts.push(`pola \`${readable}\``)
  }
  if (schema.minLength !== undefined) parts.push(`min. ${schema.minLength} karakter`)
  if (schema.maxLength !== undefined) parts.push(`maks. ${schema.maxLength} karakter`)
  if (schema.minimum !== undefined) parts.push(`min. ${schema.minimum}`)
  if (schema.maximum !== undefined && schema.maximum < 1000) parts.push(`maks. ${schema.maximum}`)
  return parts.join(', ')
}

/** One example params object per distinct shape, built from the schema itself. */
function exampleParams(shape: ShapeInfo): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const [name, schema] of shape.properties) {
    if (schema.default !== undefined) {
      params[name] = schema.default
      continue
    }
    switch (name) {
      case 'tglAwal':
      case 'periode1Awal':
      case 'periode2Awal':
        params[name] = '2026-09-01'
        continue
      case 'tglAkhir':
      case 'periode1Akhir':
      case 'periode2Akhir':
      case 'tanggal':
        params[name] = '2026-09-30'
        continue
      case 'tahun':
        params[name] = 2026
        continue
      case 'bulan':
        params[name] = 9
        continue
      case 'hari':
        params[name] = 30
        continue
      case 'include':
        params[name] = true
        continue
      case 'exclude':
        params[name] = false
        continue
      case 'noRuangKd':
        params[name] = 1
        continue
      case 'noProduksi':
        params[name] = 'SA.004791'
        continue
      case 'noKayuBulat':
        params[name] = 'A.017234'
        continue
      case 'noJual':
        params[name] = 'G.002618'
        continue
      case 'noProcKd':
        params[name] = 'H.001277'
        continue
      case 'noSpk':
        params[name] = '2026-97'
        continue
      case 'noPenST':
        params[name] = 'B.162237'
        continue
      case 'noProduk':
        params[name] = 'E.520353'
        continue
      default:
        continue
    }
  }
  return params
}

function paramsCell(shape: ShapeInfo): string {
  if (shape.properties.length === 0) return 'tanpa params'
  return shape.properties
    .map(([name, schema]) => {
      const required = shape.required.includes(name)
      return `\`${name}\`${required ? '' : '?'}`
    })
    .join(', ')
}

/** The factory default for a field: its name in PascalCase, e.g. tglAwal -> TglAwal. */
const toPascal = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

/**
 * What the SP will actually be called with, field by field. An explicit binding
 * wins; otherwise the factory default is the field name in PascalCase. `differs`
 * is true only when a bound name is NOT that default, which is what makes a
 * rename worth warning about (`tglAkhir` -> `EndDate`, or `tglAkhir` -> `TglAwal`
 * for an "as of" procedure that declares only @TglAwal).
 */
function spParamsFor(
  report: ReportInfo,
  shape: ShapeInfo,
): { fields: string[]; params: string[]; differs: boolean } {
  const fields = shape.properties.map(([name]) => name)
  // One field can feed several SP parameters (e.g. noProcKd -> NoProcKD and
  // NoProcKdLookup), so each field keeps a list.
  const byField = new Map<string, string[]>()
  const loose: string[] = []
  for (const binding of report.spBindings) {
    if (binding.field) {
      const list = byField.get(binding.field) ?? []
      if (!list.includes(binding.param)) list.push(binding.param)
      byField.set(binding.field, list)
    } else if (!loose.includes(binding.param)) {
      loose.push(binding.param)
    }
  }
  // `inputName` names the SP param only; the factory it belongs to has a single
  // field, so it can be tied to that one.
  if (loose.length > 0 && fields.length === 1 && !byField.has(fields[0]!)) {
    byField.set(fields[0]!, [loose[0]!])
    loose.length = 0
  }
  // A hand-written report binds every parameter it sends; a field it does not
  // bind is folded into another parameter (e.g. include/exclude -> @Mode) or is
  // not a parameter at all, so it is left out rather than guessed.
  const handWritten = report.spBindings.some((binding) => binding.fromInput)
  const params: string[] = []
  let differs = false
  for (const field of fields) {
    const bound = byField.get(field)
    if (bound && bound.length > 0) {
      params.push(...bound)
      if (bound.some((param) => param.toLowerCase() !== field.toLowerCase())) differs = true
    } else if (!handWritten) {
      params.push(toPascal(field))
    }
  }
  for (const param of loose) {
    if (!params.includes(param)) {
      params.push(param)
      differs = true
    }
  }
  return { fields, params, differs }
}

/** The "Nama parameter SP" line: no params, the factory defaults, or a rename. */
function spParamText(sp: { fields: string[]; params: string[]; differs: boolean } | null): string {
  if (!sp || sp.fields.length === 0) return 'procedure tidak punya parameter'
  if (sp.params.length === 0) return 'Belum terdokumentasi di kode'
  if (!sp.differs) {
    return `memakai nama default ${sp.params.map((p) => `\`@${p}\``).join(' dan ')}`
  }
  return `${sp.params.map((p) => `\`${p}\``).join(', ')} (berbeda dari nama field di \`params\`)`
}

function orientationCell(report: ReportInfo): string {
  if (!report.orientationKnown) return '—'
  return report.landscape ? 'landscape' : 'portrait'
}

function spCell(report: ReportInfo): string {
  if (report.sps.length === 0) return 'Belum terdokumentasi di kode'
  return report.sps.map((s) => `\`${s}\``).join(', ')
}

// --- page builders ---------------------------------------------------------

function categoryPage(category: string, reportsInCategory: ReportInfo[]): string {
  const usedShapes = [...new Set(reportsInCategory.map((r) => r.shapeName))]
  const lines: string[] = [
    '---',
    `title: "${category}"`,
    `description: "Laporan dalam kelompok ${category}."`,
    '---',
    '',
    `${reportsInCategory.length} jenis laporan.`,
    '',
    '| type | Judul | Params | Stored procedure | Orientasi |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const report of reportsInCategory) {
    const shape = shapes.find((s) => s.name === report.shapeName)
    lines.push(
      `| \`${report.type}\` | ${escapeCell(report.title)} | ${paramsCell(shape!)} | ${spCell(report)} | ${orientationCell(report)} |`,
    )
  }

  lines.push('', '## Sumber data', '')

  for (const report of reportsInCategory) {
    lines.push(`### \`${report.type}\``, '')

    const shape = shapes.find((s) => s.name === report.shapeName)
    const sp = shape ? spParamsFor(report, shape) : null

    if (report.sps.length === 0) {
      lines.push(
        '- Stored procedure: Belum terdokumentasi di kode',
        '- Nama parameter SP: Belum terdokumentasi di kode',
      )
    } else {
      lines.push(`- Stored procedure: ${report.sps.map((s) => `\`${s}\``).join(', ')}`)
      lines.push(`- Nama parameter SP: ${spParamText(sp)}`)
    }
    lines.push(`- Orientasi: ${orientationCell(report)}`)
    lines.push('')
  }

  const diffReports = reportsInCategory.filter((r) => {
    const shape = shapes.find((s) => s.name === r.shapeName)
    return shape ? spParamsFor(r, shape).differs : false
  })
  if (diffReports.length > 0) {
    lines.push(
      '<Warning>',
      'Laporan di bawah ini mengikat nama parameter SP yang **berbeda** dari nama field di `params`. KalauSP-nya diganti nama, nama parameter pun harus ikut menyesuaikan.',
      '</Warning>',
      '',
      '| type | Nama field di params | Nama parameter SP |',
      '| --- | --- | --- |',
    )
    for (const report of diffReports) {
      const shape = shapes.find((s) => s.name === report.shapeName)!
      lines.push(
        `| \`${report.type}\` | ${paramsCell(shape)} | ${spParamsFor(report, shape).params.map((p) => `\`${p}\``).join(', ')} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Contoh Request Body', '')
  for (const shapeName of usedShapes) {
    const shape = shapes.find((s) => s.name === shapeName)!
    const sample = reportsInCategory.find((r) => r.shapeName === shapeName)!
    const params = exampleParams(shape)
    const body =
      Object.keys(params).length === 0
        ? { type: sample.type }
        : { type: sample.type, params }
    lines.push(
      `### Bentuk \`${shape.name}\`${Object.keys(params).length === 0 ? ' — tanpa params' : ''}`,
      '',
      '```json',
      JSON.stringify(body, null, 2),
      '```',
      '',
    )
  }

  return lines.join('\n')
}

function overviewPage(): string {
  const total = reportList.length
  const lines: string[] = [
    '---',
    'title: "Reports"',
    'description: "Katalog laporan WPS dan bentuk parameternya."',
    '---',
    '',
    `Ada **${total}** jenis laporan WPS di \`src/reports/registry.ts\`. Registry itulah sumber kebenarannya — daftar ini digenerate darinya, mengikuti menu WPS \`open-api-report\` (\`resources/views/welcome.blade.php\`).`,
    '',
    `<Note>\`example\` ada di registry tapi tidak ada di sini: itu laporan contoh dengan data dummy di memori untuk membuktikan pipeline, bukan laporan WPS. Jadi hitungannya ${total}, bukan ${total + 1}.\</Note>`,
    '',
    '## Cara mengirim params',
    '',
    'Setiap laporan punya `paramsSchema` sendiri, jadi bentuk `params` berbeda-beda. Ada **' +
      String(shapes.length) +
      '** bentuk yang berbeda. Kirim `params` sesuai bentuk laporan yang dipilih:',
    '',
    '```json',
    '{',
    '  "type": "<jenis laporan>",',
    '  "params": { "...": "sesuai bentuk laporan itu" }',
    '}',
    '```',
    '',
    'Validasi dilakukan ulang terhadap `paramsSchema` laporan tersebut. Kalau tidak cocok, dijawab `400 VALIDATION_ERROR` dengan `details` berisi field yang bermasalah.',
    '',
    '> Header body dan contoh: [Create Report](/endpoints/create-report).',
    '',
    '## Bentuk params',
    '',
    '| Bentuk | Jumlah laporan | Field |',
    '| --- | --- | --- |',
  ]

  for (const shape of shapes) {
    const fields =
      shape.properties.length === 0
        ? '—'
        : shape.properties
            .map(([name, schema]) => {
              const required = shape.required.includes(name)
              return `\`${name}\`${required ? '' : '?'} (${humanType(schema)})`
            })
            .join(', ')
    lines.push(`| \`${shape.name}\` | ${shape.types.length} | ${fields} |`)
  }

  lines.push('', 'Field bertanda `?` berarti opsional.', '')

  for (const shape of shapes) {
    const params = exampleParams(shape)
    const sample = shape.types[0]!
    const body = Object.keys(params).length === 0 ? { type: sample } : { type: sample, params }
    lines.push(
      `### \`${shape.name}\` — ${shape.types.length} laporan`,
      '',
      shape.summary,
      '',
      '```json',
      JSON.stringify(body, null, 2),
      '```',
      '',
      '<details>',
      `<summary>Laporan yang memakai bentuk ini (${shape.types.length})</summary>`,
      '',
      shape.types.map((t) => `- \`${t}\``).join('\n'),
      '',
      '</details>',
      '',
    )
  }

  return lines.join('\n')
}

function docJson(categoryPages: string[]): string {
  return JSON.stringify(
    {
      $schema: 'https://mintlify.com/docs.json',
      theme: 'mint',
      name: 'report-service',
      colors: {
        primary: '#1a3a5c',
        light: '#eef2f8',
        dark: '#0f1a2b',
      },
      // `navigation` is required by the Mintlify schema, and `tabs` lives
      // inside it. Putting `tabs` at the top level passes `mint broken-links`
      // but fails the prebuild step in `mint dev`, so the shape matters.
      navigation: {
        tabs: [
          { tab: 'API', pages: ['introduction', 'authentication', 'errors'] },
          {
            tab: 'Endpoints',
            pages: [
              'endpoints/health',
              'endpoints/health-ready',
              'endpoints/create-report',
              'endpoints/get-report-status',
              'endpoints/download-report',
              'endpoints/websocket',
            ],
          },
          {
            tab: 'Reports',
            pages: ['reports/overview', ...categoryPages.map((c) => `reports/${c}`)],
          },
        ],
      },
    },
    null,
    2,
  ).concat('\n')
}

// --- write -----------------------------------------------------------------

const generatedFiles: Array<{ path: string; content: string }> = []

for (const category of categories) {
  const slug = slugOf(category)
  generatedFiles.push({
    path: join(DOCS, 'reports', `${slug}.mdx`),
    content: categoryPage(category, byCategory.get(category)!),
  })
}
generatedFiles.push({ path: join(DOCS, 'reports', 'overview.mdx'), content: overviewPage() })
generatedFiles.push({
  path: join(DOCS, 'docs.json'),
  content: docJson(categories.map(slugOf)),
})

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const check = process.argv.includes('--check')
const stale: string[] = []
const expected = new Set(generatedFiles.map((file) => file.path))

/**
 * Pages for categories that no longer exist would otherwise linger forever and
 * still show up in `git status` and in any directory listing, so a re-run has
 * to remove them. overview.mdx is generated too, hence it is in `expected`.
 */
const orphaned = check
  ? []
  : readdirSync(join(DOCS, 'reports'))
      .filter((name) => name.endsWith('.mdx'))
      .map((name) => join(DOCS, 'reports', name))
      .filter((path) => !expected.has(path))

for (const file of generatedFiles) {
  if (check) {
    if (readFileOrNull(file.path) !== file.content) stale.push(file.path)
    continue
  }
  await Bun.write(file.path, file.content)
}

for (const path of orphaned) {
  // node:fs's unlink needs a callback under Bun; Bun.file().delete() does not.
  await Bun.file(path).delete()
  console.log(`  menghapus page basi: ${path.replace(ROOT + '\\', '')}`)
}

if (check) {
  if (stale.length > 0) {
    console.error('Katalog sudah basi. Jalankan ulang tanpa --check:')
    for (const path of stale) console.error(`  ${path}`)
    process.exit(1)
  }
  console.log('Katalog sudah sesuai dengan registry.')
} else {
  console.log(`Menulis ${generatedFiles.length} file:`)
  for (const file of generatedFiles) console.log(`  ${file.path.replace(ROOT + '\\', '')}`)
  console.log(`\nTotal report type: ${reportList.length}`)
  console.log(`Bentuk params     : ${shapes.length}`)
  console.log(`Kategori          : ${categories.length}`)
}