import { env } from '../src/config/env'

// Usage: bun run scripts/ws-test.ts <jobId> <token>
const [jobId, token] = process.argv.slice(2)

if (!jobId || !token) {
  console.error('Usage: bun run scripts/ws-test.ts <jobId> <token>')
  process.exit(1)
}

const url = `ws://localhost:${env.PORT}/ws/reports/${jobId}?token=${encodeURIComponent(token)}`
console.log(`Connecting to ${url.replace(/token=[^&]+/, 'token=***')}`)

const ws = new WebSocket(url)

const timeout = setTimeout(() => {
  console.error('TIMEOUT: no terminal message within 30s')
  process.exit(1)
}, 30_000)

ws.addEventListener('open', () => {
  console.log('OPEN')
})

ws.addEventListener('message', (event) => {
  console.log('MESSAGE', event.data)
  try {
    const parsed = JSON.parse(String(event.data)) as { type?: string }
    if (parsed.type === 'completed' || parsed.type === 'failed') {
      clearTimeout(timeout)
      setTimeout(() => process.exit(0), 300) // allow close frame to arrive
    }
  } catch {
    // ignore non-JSON
  }
})

ws.addEventListener('close', (event) => {
  clearTimeout(timeout)
  console.log('CLOSED', event.code, event.reason)
  process.exit(0)
})

ws.addEventListener('error', () => {
  clearTimeout(timeout)
  // The close event usually follows with the code; if it does not, fail here.
  console.error('ERROR: connection failed (rejected before upgrade?)')
  setTimeout(() => process.exit(1), 300)
})
