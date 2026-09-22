import { createBunWebSocket } from 'hono/bun'

// Singleton: must be called exactly once. Both the WebSocket routes and the
// entrypoint (src/index.ts) import the handlers from here.
export const { upgradeWebSocket, websocket } = createBunWebSocket()
