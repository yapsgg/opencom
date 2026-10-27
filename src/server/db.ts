import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { createClient, type Client } from "@libsql/client"

import { config } from "./config"

export type Role = "user" | "assistant"

export interface PageContext {
  url?: string
  title?: string
  lang?: string
  referrer?: string
}

export interface StoredMessage {
  id: string
  role: Role
  content: string
  created_at: number
  rating: number | null
}

export interface ConversationRow {
  id: string
  visitor_id: string
  created_at: number
  updated_at: number
  page_url: string | null
  page_title: string | null
  referrer: string | null
  lang: string | null
  country: string | null
  user_agent: string | null
  messages: StoredMessage[]
}

let client: Client | undefined

export async function db(): Promise<Client> {
  if (client) return client
  if (config.databaseUrl.startsWith("file:")) {
    mkdirSync(dirname(config.databaseUrl.slice("file:".length)), {
      recursive: true,
    })
  }
  client = createClient({
    url: config.databaseUrl,
    authToken: config.databaseAuthToken,
  })
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        visitor_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        page_url TEXT,
        page_title TEXT,
        referrer TEXT,
        lang TEXT,
        country TEXT,
        user_agent TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        page_url TEXT,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        latency_ms INTEGER,
        rating INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS conversations_updated ON conversations(updated_at)`,
    ],
    "write"
  )
  return client
}

export async function findConversation(id: string, visitorId: string) {
  const result = await (await db()).execute({
    sql: "SELECT id FROM conversations WHERE id = ? AND visitor_id = ?",
    args: [id, visitorId],
  })
  return result.rows.length > 0
}

export async function createConversation(input: {
  visitorId: string
  page: PageContext
  country: string | null
  userAgent: string | null
}): Promise<string> {
  const id = randomUUID()
  const now = Date.now()
  await (await db()).execute({
    sql: `INSERT INTO conversations
      (id, visitor_id, created_at, updated_at, page_url, page_title, referrer, lang, country, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.visitorId,
      now,
      now,
      input.page.url ?? null,
      input.page.title ?? null,
      input.page.referrer ?? null,
      input.page.lang ?? null,
      input.country,
      input.userAgent,
    ],
  })
  return id
}

export async function recentMessages(conversationId: string, limit: number) {
  const result = await (await db()).execute({
    sql: `SELECT role, content FROM messages WHERE conversation_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    args: [conversationId, limit],
  })
  return result.rows
    .map((row) => ({ role: row.role as Role, content: String(row.content) }))
    .reverse()
}

export async function countUserMessages(conversationId: string) {
  const result = await (await db()).execute({
    sql: "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'user'",
    args: [conversationId],
  })
  return Number(result.rows[0]?.n ?? 0)
}

export async function saveMessage(input: {
  id?: string
  conversationId: string
  role: Role
  content: string
  pageUrl?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
}) {
  const now = Date.now()
  await (await db()).batch(
    [
      {
        sql: `INSERT INTO messages
          (id, conversation_id, role, content, created_at, page_url, model, input_tokens, output_tokens, latency_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          input.id ?? randomUUID(),
          input.conversationId,
          input.role,
          input.content,
          now,
          input.pageUrl ?? null,
          input.model ?? null,
          input.inputTokens ?? null,
          input.outputTokens ?? null,
          input.latencyMs ?? null,
        ],
      },
      {
        sql: "UPDATE conversations SET updated_at = ? WHERE id = ?",
        args: [now, input.conversationId],
      },
    ],
    "write"
  )
}

export async function rateMessage(
  messageId: string,
  visitorId: string,
  rating: 1 | -1
) {
  const result = await (await db()).execute({
    sql: `UPDATE messages SET rating = ? WHERE id = ? AND role = 'assistant'
      AND conversation_id IN (SELECT id FROM conversations WHERE visitor_id = ?)`,
    args: [rating, messageId, visitorId],
  })
  return result.rowsAffected > 0
}

export async function listConversations(sinceMs: number, limit = 500) {
  const client = await db()
  const conversations = await client.execute({
    sql: `SELECT * FROM conversations WHERE updated_at >= ?
      ORDER BY updated_at DESC LIMIT ?`,
    args: [sinceMs, limit],
  })
  if (conversations.rows.length === 0) return []

  const ids = conversations.rows.map((row) => String(row.id))
  const messages = await client.execute({
    sql: `SELECT id, conversation_id, role, content, created_at, rating FROM messages
      WHERE conversation_id IN (${ids.map(() => "?").join(",")})
      ORDER BY created_at ASC`,
    args: ids,
  })

  const byConversation = new Map<string, StoredMessage[]>()
  for (const row of messages.rows) {
    const key = String(row.conversation_id)
    const list = byConversation.get(key) ?? []
    list.push({
      id: String(row.id),
      role: row.role as Role,
      content: String(row.content),
      created_at: Number(row.created_at),
      rating: row.rating === null ? null : Number(row.rating),
    })
    byConversation.set(key, list)
  }

  return conversations.rows.map(
    (row): ConversationRow => ({
      id: String(row.id),
      visitor_id: String(row.visitor_id),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      page_url: row.page_url as string | null,
      page_title: row.page_title as string | null,
      referrer: row.referrer as string | null,
      lang: row.lang as string | null,
      country: row.country as string | null,
      user_agent: row.user_agent as string | null,
      messages: byConversation.get(String(row.id)) ?? [],
    })
  )
}
