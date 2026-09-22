import { sign } from 'hono/jwt'
import { env } from '../src/config/env'

// Local testing helper — must never run in production.
if (env.NODE_ENV === 'production') {
  console.error('dev-token refuses to run when NODE_ENV=production')
  process.exit(1)
}

const username = process.argv[2] || 'tester'
const now = Math.floor(Date.now() / 1000)

const token = await sign(
  { [env.JWT_USERNAME_CLAIM]: username, exp: now + 3600 },
  env.JWT_SECRET,
  env.JWT_ALG,
)

console.log(token)
