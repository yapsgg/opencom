import { config } from "./config"

type ContentPart = {
  type: "text"
  text: string
  cache_control?: { type: "ephemeral" }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

export interface Usage {
  inputTokens?: number
  outputTokens?: number
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

function headers() {
  return {
    authorization: `Bearer ${config.openrouterApiKey}`,
    "content-type": "application/json",
    "x-title": "Opencom",
    ...(config.siteUrl ? { "http-referer": config.siteUrl } : {}),
  }
}

/** Streams text deltas from OpenRouter. Usage arrives in the final chunk. */
export async function* streamChat(
  messages: ChatMessage[],
  options: { model?: string; signal?: AbortSignal; usage?: Usage } = {}
): AsyncGenerator<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model ?? config.model,
      messages,
      stream: true,
      max_tokens: 800,
      temperature: 0.3,
      usage: { include: true },
    }),
  })
  if (!response.ok || !response.body) {
    throw new Error(
      `OpenRouter ${response.status}: ${(await response.text()).slice(0, 500)}`
    )
  }

  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      // Lines starting with ":" are OpenRouter keep-alive comments.
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (data === "[DONE]") return

      let event: any
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }
      if (event.error) throw new Error(`OpenRouter: ${event.error.message}`)
      if (event.usage && options.usage) {
        options.usage.inputTokens = event.usage.prompt_tokens
        options.usage.outputTokens = event.usage.completion_tokens
      }
      const delta = event.choices?.[0]?.delta?.content
      if (delta) yield delta
    }
  }
}

export async function complete(
  messages: ChatMessage[],
  options: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: options.model ?? config.model,
      messages,
      max_tokens: options.maxTokens ?? 4000,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `OpenRouter ${response.status}: ${(await response.text()).slice(0, 500)}`
    )
  }
  const json: any = await response.json()
  return json.choices?.[0]?.message?.content ?? ""
}
