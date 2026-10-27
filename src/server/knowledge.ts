import { readdir, readFile } from "node:fs/promises"
import { extname, join } from "node:path"

import { config } from "./config"

interface Source {
  label: string
  text: string
}

let cached: { text: string; loadedAt: number } | undefined
let loading: Promise<string> | undefined

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}

async function fromUrl(url: string): Promise<Source | undefined> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "opencom-knowledge/0.1" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.text()
    const isHtml = (response.headers.get("content-type") ?? "").includes("html")
    return { label: url, text: isHtml ? htmlToText(body) : body.trim() }
  } catch (error) {
    console.warn(`[opencom] knowledge: could not load ${url}:`, error)
    return undefined
  }
}

async function fromDir(dir: string): Promise<Source[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const files = names
    .filter((name) => [".md", ".mdx", ".txt"].includes(extname(name)))
    .sort()
  return Promise.all(
    files.map(async (name) => ({
      label: name,
      text: (await readFile(join(dir, name), "utf8")).trim(),
    }))
  )
}

async function load(): Promise<string> {
  const sources = [
    ...(await fromDir(config.knowledgeDir)),
    ...(await Promise.all(config.knowledgeUrls.map(fromUrl))).filter(
      (source): source is Source => Boolean(source)
    ),
  ]

  let text = sources
    .map((source) => `<source name="${source.label}">\n${source.text}\n</source>`)
    .join("\n\n")
  if (text.length > config.knowledgeMaxChars) {
    console.warn(
      `[opencom] knowledge is ${text.length} chars, truncating to ${config.knowledgeMaxChars}`
    )
    text = text.slice(0, config.knowledgeMaxChars)
  }

  // Keep the last good copy if every source failed this time round.
  if (!text && cached?.text) return cached.text
  cached = { text, loadedAt: Date.now() }
  console.log(
    `[opencom] knowledge loaded: ${sources.length} source(s), ${text.length} chars`
  )
  return text
}

export async function knowledge(): Promise<string> {
  const maxAge = config.knowledgeRefreshMinutes * 60_000
  if (cached && Date.now() - cached.loadedAt < maxAge) return cached.text

  loading ??= load().finally(() => {
    loading = undefined
  })
  // Serve the stale copy while a refresh runs in the background.
  return cached ? cached.text : loading
}
