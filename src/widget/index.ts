import { styles } from "./styles"

interface Message {
  role: "user" | "assistant"
  content: string
  id?: string
  rating?: 1 | -1
}

interface State {
  conversationId?: string
  messages: Message[]
}

const ICONS = {
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
}

const script = document.currentScript as HTMLScriptElement | null
const dataset = script?.dataset ?? {}
const apiBase = (dataset.api || (script ? new URL(script.src).origin : "")).replace(/\/$/, "")
const STORE = `opencom:${apiBase}`

function storage(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key)
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the chat still works, it just won't persist.
  }
  return null
}

function randomId(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
}

function visitorId(): string {
  const existing = storage(`${STORE}:visitor`)
  if (existing) return existing
  const id = randomId()
  storage(`${STORE}:visitor`, id)
  return id
}

function loadState(): State {
  try {
    const parsed = JSON.parse(storage(`${STORE}:state`) || "null")
    if (parsed && Array.isArray(parsed.messages)) return parsed
  } catch {}
  return { messages: [] }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// A deliberately tiny Markdown subset: links, bare URLs, bold and inline code.
// Everything is escaped first, so only these tags can ever appear.
function render(text: string): string {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
    .replace(
      /(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?])/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

function mount() {
  const host = document.createElement("div")
  host.id = "opencom"
  host.dataset.position = dataset.position === "left" ? "left" : "right"
  const theme =
    dataset.theme === "dark" || dataset.theme === "light"
      ? dataset.theme
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
  host.dataset.theme = theme
  document.body.appendChild(host)

  const root = host.attachShadow({ mode: "open" })
  root.innerHTML = `
    <style>${styles}</style>
    <div class="panel" role="dialog" aria-label="Chat" aria-hidden="true">
      <div class="header">
        <div class="title"></div>
        <button class="icon-btn reset" type="button" aria-label="Start a new chat" title="New chat">${ICONS.reset}</button>
        <button class="icon-btn close" type="button" aria-label="Close chat">${ICONS.down}</button>
      </div>
      <div class="messages" aria-live="polite"></div>
      <form class="composer">
        <label class="sr-only" for="oc-input">Message</label>
        <textarea id="oc-input" rows="1" placeholder="Ask a question…" maxlength="2000"></textarea>
        <button class="send" type="submit" aria-label="Send" disabled>${ICONS.send}</button>
      </form>
      <div class="footer">Powered by <a href="https://github.com/yapsgg/opencom" target="_blank" rel="noopener">Opencom</a></div>
    </div>
    <button class="launcher" type="button" aria-label="Open chat" aria-expanded="false">${ICONS.chat}</button>
  `

  const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T
  const panel = $<HTMLDivElement>(".panel")
  const launcher = $<HTMLButtonElement>(".launcher")
  const list = $<HTMLDivElement>(".messages")
  const form = $<HTMLFormElement>(".composer")
  const input = $<HTMLTextAreaElement>("textarea")
  const send = $<HTMLButtonElement>(".send")
  const title = $<HTMLDivElement>(".title")

  let state = loadState()
  let greeting = dataset.greeting || "Hi! Ask me anything."
  let busy = false
  const visitor = visitorId()

  function setAccent(color: string) {
    host.style.setProperty("--oc-accent", color)
    // Pick dark or light text so any brand color stays readable.
    const hex = color.replace("#", "")
    const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex
    if (/^[0-9a-f]{6}$/i.test(full)) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
      const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
      host.style.setProperty("--oc-accent-text", light ? "#111111" : "#ffffff")
    }
  }
  title.textContent = dataset.title || "Chat"
  if (dataset.color) setAccent(dataset.color)

  fetch(`${apiBase}/api/config`)
    .then((r) => r.json())
    .then((cfg) => {
      if (!dataset.title && cfg.name) title.textContent = cfg.name
      if (!dataset.color && cfg.color) setAccent(cfg.color)
      if (!dataset.greeting && cfg.greeting) {
        greeting = cfg.greeting
        if (!busy) draw()
      }
    })
    .catch(() => {})

  function save() {
    // Keep the stored transcript small; the server has the full history.
    storage(
      `${STORE}:state`,
      JSON.stringify({ ...state, messages: state.messages.slice(-30) })
    )
  }

  function rate(message: Message, rating: 1 | -1) {
    if (!message.id) return
    message.rating = message.rating === rating ? undefined : rating
    save()
    draw()
    if (message.rating) {
      fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: message.id, visitorId: visitor, rating }),
      }).catch(() => {})
    }
  }

  function bubble(message: Message, typing = false) {
    const el = document.createElement("div")
    el.className = `msg ${message.role}${typing ? " typing" : ""}`
    el.innerHTML = render(message.content)
    list.appendChild(el)
    if (message.role === "assistant" && message.id && !typing) {
      const row = document.createElement("div")
      row.className = "rate"
      for (const [value, label, text] of [
        [1, "Helpful", "👍"],
        [-1, "Not helpful", "👎"],
      ] as const) {
        const button = document.createElement("button")
        button.type = "button"
        button.textContent = text
        button.setAttribute("aria-label", label)
        button.setAttribute("aria-pressed", String(message.rating === value))
        button.onclick = () => rate(message, value)
        row.appendChild(button)
      }
      list.appendChild(row)
    }
    return el
  }

  function draw() {
    list.textContent = ""
    bubble({ role: "assistant", content: greeting })
    for (const message of state.messages) bubble(message)
    list.scrollTop = list.scrollHeight
  }

  function open(next: boolean) {
    panel.classList.toggle("open", next)
    panel.setAttribute("aria-hidden", String(!next))
    launcher.setAttribute("aria-expanded", String(next))
    launcher.setAttribute("aria-label", next ? "Close chat" : "Open chat")
    launcher.innerHTML = next ? ICONS.close : ICONS.chat
    storage(`${STORE}:open`, next ? "1" : "0")
    if (next) {
      draw()
      setTimeout(() => input.focus(), 50)
    }
  }

  async function ask(text: string) {
    busy = true
    send.disabled = true
    state.messages.push({ role: "user", content: text })
    save()
    draw()

    const reply: Message = { role: "assistant", content: "" }
    const el = bubble(reply, true)
    list.scrollTop = list.scrollHeight

    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          visitorId: visitor,
          conversationId: state.conversationId,
          page: {
            url: location.href,
            title: document.title,
            lang: dataset.lang || document.documentElement.lang || navigator.language,
            referrer: document.referrer,
          },
        }),
      })
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || "Something went wrong. Please try again.")
      }
      state.conversationId = response.headers.get("x-conversation-id") || state.conversationId
      reply.id = response.headers.get("x-message-id") || undefined

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        reply.content += decoder.decode(value, { stream: true })
        el.classList.remove("typing")
        el.innerHTML = render(reply.content)
        list.scrollTop = list.scrollHeight
      }
    } catch (error) {
      reply.content = (error as Error).message || "Something went wrong. Please try again."
      reply.id = undefined
    }

    if (reply.content) state.messages.push(reply)
    save()
    draw()
    busy = false
    send.disabled = !input.value.trim()
  }

  launcher.onclick = () => open(!panel.classList.contains("open"))
  $<HTMLButtonElement>(".close").onclick = () => open(false)
  $<HTMLButtonElement>(".reset").onclick = () => {
    if (busy) return
    state = { messages: [] }
    save()
    draw()
    input.focus()
  }
  root.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape") open(false)
  })

  input.addEventListener("input", () => {
    send.disabled = busy || !input.value.trim()
    input.style.height = "auto"
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  })
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text || busy) return
    input.value = ""
    input.style.height = "auto"
    void ask(text)
  })

  // Reopen the panel if the visitor had it open on the previous page.
  if (storage(`${STORE}:open`) === "1") open(true)

  ;(window as any).Opencom = {
    open: () => open(true),
    close: () => open(false),
  }
}

if (!document.getElementById("opencom")) {
  if (document.body) mount()
  else document.addEventListener("DOMContentLoaded", mount)
}
