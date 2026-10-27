import { serve } from "@hono/node-server"

import { createApp } from "./app"
import { config } from "./config"
import { db } from "./db"
import { knowledge } from "./knowledge"

if (!config.openrouterApiKey) {
  console.error("[opencom] OPENROUTER_API_KEY is not set. See .env.example.")
  process.exit(1)
}

await db()
// Warm the knowledge cache so the first visitor doesn't wait for it.
void knowledge()

serve({ fetch: createApp().fetch, port: config.port }, (info) => {
  console.log(`[opencom] listening on http://localhost:${info.port}`)
  console.log(
    `[opencom] embed: <script src="http://localhost:${info.port}/widget.js" async></script>`
  )
})
