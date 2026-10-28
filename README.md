# Opencom

An open-source AI support agent for any website. Add one script tag and a chat bubble appears in the corner, answering visitors from your own content. Every chat is saved so you can learn what people actually ask.

```html
<script src="https://your-opencom-host/widget.js" async></script>
```

- **Tiny widget.** About 4 KB gzipped, no dependencies, rendered in a Shadow DOM so it can't clash with your CSS.
- **Answers from your content.** Point it at your `llms.txt` (or any pages) and drop extra `.md` files in `knowledge/`. The agent answers only from that and says when it doesn't know.
- **Any model.** Runs on [OpenRouter](https://openrouter.ai), so you can use Claude, GPT, Gemini, Llama or anything else they list.
- **Chats you can learn from.** Every conversation is stored with its page, referrer, language and country, plus 👍/👎 ratings from visitors. Export it as JSON or CSV, or run `npm run analyze` to get a report on what visitors ask, where the agent fails, and what to build next.
- **Self-hosted.** One Node process and one SQLite file. No accounts, no dashboard to set up.

## Used by

- [slay: AI Composition Guide Camera](https://www.slaycamera.com), where Opencom started

Using Opencom? Open a PR to add your site.

## Quick start

```bash
git clone https://github.com/yapsgg/opencom
cd opencom
npm install
cp .env.example .env   # set OPENROUTER_API_KEY and OPENCOM_KNOWLEDGE_URLS
npm run dev
```

Open `examples/index.html` through any static server (`npx serve examples`) and click the bubble.

## Add it to your site

```html
<script
  src="https://chat.example.com/widget.js"
  data-title="Acme"
  data-color="#ff5a1f"
  data-position="right"
  data-theme="auto"
  async
></script>
```

Every `data-` attribute is optional. Values left out come from the server's `.env`.

| Attribute | Default | |
|---|---|---|
| `data-title` | `OPENCOM_NAME` | Header text |
| `data-color` | `OPENCOM_COLOR` | Accent color. Text color is picked automatically for contrast |
| `data-greeting` | `OPENCOM_GREETING` | First message |
| `data-position` | `right` | `right` or `left` |
| `data-theme` | `auto` | `auto`, `light` or `dark` |
| `data-lang` | `<html lang>` | Page language hint sent to the agent |
| `data-api` | script origin | Server URL, if it differs from where `widget.js` is served |

From JavaScript you can call `window.Opencom.open()` and `window.Opencom.close()`, for example from a "Chat with us" button.

### Next.js

```tsx
import Script from "next/script"

<Script src="https://chat.example.com/widget.js" strategy="lazyOnload" />
```

## Configuration

Everything is set with environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | |
|---|---|
| `OPENROUTER_API_KEY` | Required |
| `OPENCOM_MODEL` | Chat model. Default `anthropic/claude-haiku-5.5` |
| `OPENCOM_KNOWLEDGE_URLS` | Comma-separated URLs to answer from. An [`llms.txt`](https://llmstxt.org) is ideal. Refetched hourly |
| `OPENCOM_KNOWLEDGE_DIR` | Folder of `.md`/`.txt` files to answer from. Default `knowledge/` |
| `OPENCOM_INSTRUCTIONS` | Extra rules for the agent: tone, what to recommend, what to avoid |
| `OPENCOM_ALLOWED_ORIGINS` | Sites allowed to embed the widget. Set this in production |
| `OPENCOM_ADMIN_TOKEN` | Enables the export endpoint |
| `DATABASE_URL` | `file:data/opencom.db` by default, or a [Turso](https://turso.tech) `libsql://` URL |

All knowledge goes straight into the system prompt (cached by providers that support it), so there's no vector database to run. This works well up to a few hundred KB of text, which covers most product sites. The limit is set by `OPENCOM_KNOWLEDGE_MAX_CHARS`.

## Learn from your chats

Export chats:

```bash
curl -H "Authorization: Bearer $OPENCOM_ADMIN_TOKEN" \
  "https://chat.example.com/api/admin/conversations?days=7"            # JSON
curl -H "Authorization: Bearer $OPENCOM_ADMIN_TOKEN" \
  "https://chat.example.com/api/admin/conversations?days=30&format=csv" > chats.csv
```

Get a report:

```bash
npm run analyze -- --days 7   # writes reports/YYYY-MM-DD-7d.md
```

The report covers top questions, agent failures and the knowledge they point to, objections that stop people from converting, feature requests, who's asking, growth ideas, and website copy fixes. It uses `OPENCOM_ANALYZE_MODEL` (default `anthropic/claude-sonnet-5.5`).

Opencom stores the message text, page URL, referrer, language, country (from `cf-ipcountry` / `x-vercel-ip-country` headers) and user agent. It never stores IP addresses. Mention the chat in your privacy policy.

## Deploy

Opencom is one long-running Node process.

- **A VM with HTTPS** (EC2, Lightsail, DigitalOcean, any VPS): `docker-compose.yml` runs Opencom behind [Caddy](https://caddyserver.com), which gets a Let's Encrypt certificate for you. Point your domain's A record at the machine, add `.env`, then run `OPENCOM_DOMAIN=chat.example.com docker compose up -d --build`. On EC2, [`deploy/ec2-setup.sh`](deploy/ec2-setup.sh) is user data for Amazon Linux 2023 that installs Docker and clones the repo. Open ports 80 and 443; a `t4g.small` is plenty.
- **Docker** (Railway, Fly.io, Render, a VPS): `docker build -t opencom . && docker run -p 8787:8787 --env-file .env -v opencom-data:/app/data opencom`. Mount `/app/data` so chats survive restarts.
- **No persistent disk?** Set `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN` to use a free Turso database instead.
- **Plain Node:** `npm run build && npm start`.

Put it on its own subdomain (e.g. `chat.example.com`) and set `OPENCOM_ALLOWED_ORIGINS` to your site.

## API

| Route | |
|---|---|
| `GET /widget.js` | The widget |
| `GET /api/config` | Name, greeting and color for the widget |
| `POST /api/chat` | `{ message, visitorId, conversationId?, page? }` → streamed plain text. Headers `x-conversation-id` and `x-message-id` |
| `POST /api/feedback` | `{ messageId, visitorId, rating: 1 \| -1 }` |
| `GET /api/admin/conversations` | `?days=7&format=json\|csv`, needs `Authorization: Bearer <OPENCOM_ADMIN_TOKEN>` |

Rate limits apply per IP (`OPENCOM_RATE_LIMIT_PER_MINUTE`, default 12) and per conversation (`OPENCOM_MAX_TURNS`, default 40). The limiter is in-memory, so with several instances put one in front.

## License

MIT
