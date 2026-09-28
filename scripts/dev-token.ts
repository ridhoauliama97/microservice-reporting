import { sign } from 'hono/jwt'
import { env } from '../src/config/env'

/**
 * Local testing helper — must never run in production.
 *
 *   bun run dev:token                 -> user "tester", valid 1 hour
 *   bun run dev:token budi            -> user "budi", valid 1 hour
 *   bun run dev:token budi 24         -> user "budi", valid 24 hours
 *
 * The token itself goes to stdout so it can be captured with $(...); the
 * expiry note goes to stderr so it never ends up inside the variable.
 */
if (env.NODE_ENV === 'production') {
  console.error('dev-token refuses to run when NODE_ENV=production')
  process.exit(1)
}

const username = process.argv[2] || 'tester'

const HOUR = 3600
const MAX_HOURS = 24 * 30

const rawHours = process.argv[3]
let hours = 1

if (rawHours !== undefined) {
  hours = Number(rawHours)
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(`Jam harus angka positif, dapat: ${rawHours}`)
    process.exit(1)
  }
  if (hours > MAX_HOURS) {
    console.error(`Maksimal ${MAX_HOURS} jam (30 hari), diminta ${hours}.`)
    process.exit(1)
  }
}

const now = Math.floor(Date.now() / 1000)
const expiresAt = now + Math.round(hours * HOUR)

const token = await sign(
  { [env.JWT_USERNAME_CLAIM]: username, exp: expiresAt },
  env.JWT_SECRET,
  env.JWT_ALG,
)

console.error(
  `user=${username}  berlaku ${hours} jam  sampai ${new Date(expiresAt * 1000).toISOString()}`,
)
console.log(token)
