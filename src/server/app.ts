import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { Hono, type Context } from "hono"
import { cors } from "hono/cors"
import { stream } from "hono/streaming"

import { config } from "./config"
import {
  countUserMessages,
  createConversation,
  findConversation,
  listConversations,
  rateMessage,
  recentMessages,
  saveMessage,
  type ConversationRow,
  type PageContext,
} from "./db"
import { knowledge } from "./knowledge"
import { streamChat, type Usage } from "./llm"
import { systemMessages } from "./prompt"

const ID = /^[A-Za-z0-9-]{8,64}$/

function clip(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined
}

function originAllowed(origin: string | undefined): boolean {
  if (config.allowedOrigins.length === 0) return true
  return Boolean(origin && config.allowedOrigins.includes(origin))
}

function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  )
}

// A fixed one-minute window per IP. Good enough for one process; put a real
// limiter in front if you run several instances.
const hits = new Map<string, { count: number; resetAt: number }>()
function rateLimited(key: string): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.resetAt < now) {
    if (hits.size > 10_000) hits.clear()
    hits.set(key, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count += 1
  return entry.count > config.rateLimitPerMinute
}

function loadWidget(): string {
  try {
    // In the build, server.js and widget.js sit side by side in dist/.
    return readFileSync(new URL("./widget.js", import.meta.url), "utf8")
  } catch {
    return readFileSync("dist/widget.js", "utf8")
  }
}

function toCsv(conversations: ConversationRow[]): string {
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`
  const rows = [
    [
      "conversation_id",
      "visitor_id",
      "created_at",
      "role",
      "content",
      "rating",
      "page_url",
      "referrer",
      "lang",
      "country",
    ],
  ]
  for (const convo of conversations) {
    for (const message of convo.messages) {
      rows.push([
        convo.id,
        convo.visitor_id,
        new Date(message.created_at).toISOString(),
        message.role,
        message.content,
        String(message.rating ?? ""),
        convo.page_url ?? "",
        convo.referrer ?? "",
        convo.lang ?? "",
        convo.country ?? "",
      ])
    }
  }
  return rows.map((row) => row.map(escape).join(",")).join("\n")
}

export function createApp() {
  const app = new Hono()
  const widget = loadWidget()

  app.get("/", (c) => c.text("opencom is running"))
  app.get("/health", (c) => c.json({ ok: true }))

  app.get("/widget.js", (c) =>
    c.body(widget, 200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    })
  )

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (originAllowed(origin) ? origin || "*" : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
      exposeHeaders: ["x-conversation-id", "x-message-id"],
      maxAge: 86400,
    })
  )

  app.get("/api/config", (c) =>
    c.json({
      name: config.name,
      greeting: config.greeting,
      color: config.color,
    })
  )

  app.post("/api/chat", async (c) => {
    if (!originAllowed(c.req.header("origin"))) {
      return c.json({ error: "origin not allowed" }, 403)
    }
    if (rateLimited(clientIp(c))) {
      return c.json({ error: "Too many messages. Try again in a minute." }, 429)
    }

    const body = await c.req.json().catch(() => null)
    const message = clip(body?.message, config.maxMessageChars)
    const visitorId = clip(body?.visitorId, 64)
    if (!message || !visitorId || !ID.test(visitorId)) {
      return c.json({ error: "message and visitorId are required" }, 400)
    }
    const page: PageContext = {
      url: clip(body?.page?.url, 500),
      title: clip(body?.page?.title, 200),
      lang: clip(body?.page?.lang, 20),
      referrer: clip(body?.page?.referrer, 500),
    }

    let conversationId = clip(body?.conversationId, 64)
    if (
      !conversationId ||
      !ID.test(conversationId) ||
      !(await findConversation(conversationId, visitorId))
    ) {
      conversationId = await createConversation({
        visitorId,
        page,
        country:
          c.req.header("cf-ipcountry") ??
          c.req.header("x-vercel-ip-country") ??
          null,
        userAgent: clip(c.req.header("user-agent"), 300) ?? null,
      })
    } else if (
      (await countUserMessages(conversationId)) >=
      config.maxTurnsPerConversation
    ) {
      return c.json(
        { error: "This chat is full. Start a new one to keep going." },
        429
      )
    }

    const history = await recentMessages(
      conversationId,
      config.historyTurns * 2
    )
    await saveMessage({
      conversationId,
      role: "user",
      content: message,
      pageUrl: page.url,
    })

    const messages = [
      ...systemMessages(await knowledge(), page),
      ...history,
      { role: "user" as const, content: message },
    ]

    const assistantId = randomUUID()
    c.header("x-conversation-id", conversationId)
    c.header("x-message-id", assistantId)
    c.header("content-type", "text/plain; charset=utf-8")
    c.header("cache-control", "no-store")

    const id = conversationId
    return stream(c, async (out) => {
      const upstream = new AbortController()
      out.onAbort(() => upstream.abort())
      const started = Date.now()
      const usage: Usage = {}
      let reply = ""
      try {
        for await (const delta of streamChat(messages, {
          signal: upstream.signal,
          usage,
        })) {
          reply += delta
          await out.write(delta)
        }
      } catch (error) {
        if (!upstream.signal.aborted) {
          console.error("[opencom] chat failed:", error)
          const fallback =
            "Sorry, I couldn't answer just now. Please try again in a moment."
          if (!reply) {
            reply = fallback
            await out.write(fallback)
          }
        }
      } finally {
        if (reply) {
          await saveMessage({
            id: assistantId,
            conversationId: id,
            role: "assistant",
            content: reply,
            pageUrl: page.url,
            model: config.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            latencyMs: Date.now() - started,
          }).catch((error) =>
            console.error("[opencom] could not save reply:", error)
          )
        }
      }
    })
  })

  app.post("/api/feedback", async (c) => {
    const body = await c.req.json().catch(() => null)
    const messageId = clip(body?.messageId, 64)
    const visitorId = clip(body?.visitorId, 64)
    const rating = body?.rating === 1 ? 1 : body?.rating === -1 ? -1 : null
    if (!messageId || !visitorId || rating === null) {
      return c.json({ error: "messageId, visitorId and rating are required" }, 400)
    }
    const ok = await rateMessage(messageId, visitorId, rating)
    return c.json({ ok }, ok ? 200 : 404)
  })

  app.get("/api/admin/conversations", async (c) => {
    if (
      !config.adminToken ||
      c.req.header("authorization") !== `Bearer ${config.adminToken}`
    ) {
      return c.json({ error: "unauthorized" }, 401)
    }
    const days = Number(c.req.query("days") ?? 7)
    const since = Date.now() - (Number.isFinite(days) ? days : 7) * 86_400_000
    const conversations = await listConversations(since)
    if (c.req.query("format") === "csv") {
      return c.body(toCsv(conversations), 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="opencom-${days}d.csv"`,
      })
    }
    return c.json({ conversations })
  })

  return app
}
