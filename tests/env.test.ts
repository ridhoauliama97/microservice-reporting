import { describe, expect, test } from 'bun:test'

const PROJECT_ROOT = import.meta.dir.replace(/tests$/, '')

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * env.ts parses process.env at import time, so each scenario runs in a fresh
 * subprocess with its own environment.
 */
function runEnvScript(script: string, extraEnv: Record<string, string>): RunResult {
  const proc = Bun.spawnSync(['bun', '-e', script], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...extraEnv },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    code: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  }
}

const VALID_MINIMAL: Record<string, string> = {
  DB_SERVER: 'localhost',
  DB_DATABASE: 'test_db',
  DB_USER: 'test_user',
  DB_PASSWORD: 'test_password',
  JWT_SECRET: 'a-valid-secret-with-16-chars',
}

const DUMP = "import('./src/config/env').then(m => console.log('PARSED ' + JSON.stringify({ dbEncrypt: m.env.DB_ENCRYPT, dbTrustCert: m.env.DB_TRUST_CERT, port: m.env.PORT, corsOrigins: m.env.CORS_ORIGINS })))"

describe('config/env', () => {
  test('accepts valid values', () => {
    const result = runEnvScript(DUMP, VALID_MINIMAL)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('PARSED')
  })

  test('rejects a too-short JWT_SECRET and names it', () => {
    const result = runEnvScript(DUMP, { ...VALID_MINIMAL, JWT_SECRET: 'short' })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('JWT_SECRET')
  })

  test('parses DB_ENCRYPT="false" as boolean false (not true)', () => {
    const result = runEnvScript(DUMP, { ...VALID_MINIMAL, DB_ENCRYPT: 'false' })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('"dbEncrypt":false')
  })

  test('parses DB_TRUST_CERT="true" as boolean true', () => {
    const result = runEnvScript(DUMP, { ...VALID_MINIMAL, DB_TRUST_CERT: 'true' })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('"dbTrustCert":true')
  })

  test('applies defaults for omitted variables', () => {
    const result = runEnvScript(DUMP, VALID_MINIMAL)
    expect(result.stdout).toContain('"port":5003')
    expect(result.stdout).toContain('"corsOrigins":["http://localhost:5173"]')
  })
})
