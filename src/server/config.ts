function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const env = process.env

export const config = {
  port: int(env.PORT, 8787),

  openrouterApiKey: env.OPENROUTER_API_KEY ?? "",
  model: env.OPENCOM_MODEL || "anthropic/claude-haiku-5.5",
  analyzeModel: env.OPENCOM_ANALYZE_MODEL || "anthropic/claude-sonnet-5.5",

  // Shown in the widget header and used in the system prompt.
  name: env.OPENCOM_NAME || "Assistant",
  siteName: env.OPENCOM_SITE_NAME || "this website",
  siteUrl: env.OPENCOM_SITE_URL || "",
  greeting: env.OPENCOM_GREETING || "Hi! Ask me anything.",
  color: env.OPENCOM_COLOR || "#111111",
  instructions: env.OPENCOM_INSTRUCTIONS || "",

  // Pages (llms.txt works best) and a folder of .md/.txt files the agent answers from.
  knowledgeUrls: list(env.OPENCOM_KNOWLEDGE_URLS),
  knowledgeDir: env.OPENCOM_KNOWLEDGE_DIR || "knowledge",
  knowledgeMaxChars: int(env.OPENCOM_KNOWLEDGE_MAX_CHARS, 200_000),
  knowledgeRefreshMinutes: int(env.OPENCOM_KNOWLEDGE_REFRESH_MINUTES, 60),

  // libSQL: a local file by default, or a Turso URL for hosts without a disk.
  databaseUrl: env.DATABASE_URL || "file:data/opencom.db",
  databaseAuthToken: env.DATABASE_AUTH_TOKEN || undefined,

  // Empty means any origin may embed the widget.
  allowedOrigins: list(env.OPENCOM_ALLOWED_ORIGINS),
  adminToken: env.OPENCOM_ADMIN_TOKEN || "",

  rateLimitPerMinute: int(env.OPENCOM_RATE_LIMIT_PER_MINUTE, 12),
  maxMessageChars: int(env.OPENCOM_MAX_MESSAGE_CHARS, 2000),
  maxTurnsPerConversation: int(env.OPENCOM_MAX_TURNS, 40),
  historyTurns: int(env.OPENCOM_HISTORY_TURNS, 12),
}

export type Config = typeof config
