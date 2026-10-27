// Turns recent chats into a product report: what people ask, where the agent
// fails, and what to build or post next.
//
//   npm run analyze -- --days 7
import { mkdirSync, writeFileSync } from "node:fs"

import { config } from "./config"
import { listConversations } from "./db"
import { complete } from "./llm"

const daysArg = process.argv.indexOf("--days")
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 7 : 7
const MAX_TRANSCRIPT_CHARS = 300_000

const conversations = await listConversations(Date.now() - days * 86_400_000, 2000)
const withUser = conversations.filter((c) =>
  c.messages.some((m) => m.role === "user")
)
if (withUser.length === 0) {
  console.log(`No conversations in the last ${days} day(s).`)
  process.exit(0)
}

let transcripts = withUser
  .map((convo) => {
    const meta = [
      convo.page_url && `page=${convo.page_url}`,
      convo.referrer && `from=${convo.referrer}`,
      convo.lang && `lang=${convo.lang}`,
      convo.country && `country=${convo.country}`,
    ]
      .filter(Boolean)
      .join(" ")
    const lines = convo.messages.map((m) => {
      const rating = m.rating === 1 ? " [👍]" : m.rating === -1 ? " [👎]" : ""
      return `${m.role === "user" ? "Visitor" : "Agent"}: ${m.content}${rating}`
    })
    return `### ${convo.id} ${meta}\n${lines.join("\n")}`
  })
  .join("\n\n")
if (transcripts.length > MAX_TRANSCRIPT_CHARS) {
  transcripts = transcripts.slice(0, MAX_TRANSCRIPT_CHARS)
}

const totalMessages = withUser.reduce(
  (sum, c) => sum + c.messages.filter((m) => m.role === "user").length,
  0
)
const downvotes = withUser.reduce(
  (sum, c) => sum + c.messages.filter((m) => m.rating === -1).length,
  0
)

console.log(
  `Analyzing ${withUser.length} conversations (${totalMessages} visitor messages) with ${config.analyzeModel}…`
)

const report = await complete(
  [
    {
      role: "system",
      content: `You analyze support-chat transcripts from the website of ${config.siteName}. The founder reads your report to decide what to improve in the product and the website, and how to grow it. Be concrete, quote visitors, and count things. Do not invent anything not in the transcripts.`,
    },
    {
      role: "user",
      content: `Here are ${withUser.length} chats from the last ${days} day(s). Write a Markdown report with these sections:

1. **Top questions**: the 10 most common intents with rough counts and a typical quote.
2. **Agent failures**: chats where the agent said it didn't know, gave a weak answer, or got a 👎. Say what knowledge is missing.
3. **Objections and blockers**: price, platform, trust, missing features; anything stopping people from downloading or paying.
4. **Feature requests and ideas** visitors mentioned.
5. **Who is asking**: patterns in pages, referrers, languages and countries.
6. **Growth ideas**: 5 specific content, social or product ideas drawn from what visitors said, aimed at word of mouth and virality.
7. **Website fixes**: copy or FAQ changes that would answer these questions before anyone has to ask.

Transcripts:

${transcripts}`,
    },
  ],
  { model: config.analyzeModel, maxTokens: 6000 }
)

const date = new Date().toISOString().slice(0, 10)
const path = `reports/${date}-${days}d.md`
mkdirSync("reports", { recursive: true })
writeFileSync(
  path,
  `# Opencom report: last ${days} day(s)\n\n${withUser.length} conversations · ${totalMessages} visitor messages · ${downvotes} 👎\n\n${report}\n`
)
console.log(`Wrote ${path}`)
