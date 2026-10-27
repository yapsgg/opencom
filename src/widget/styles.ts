export const styles = `
:host {
  all: initial;
  --oc-accent: #111111;
  --oc-accent-text: #ffffff;
  --oc-bg: #ffffff;
  --oc-surface: #f4f4f5;
  --oc-text: #18181b;
  --oc-muted: #71717a;
  --oc-border: rgba(0, 0, 0, 0.08);
  --oc-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--oc-text);
}
:host([data-theme="dark"]) {
  --oc-bg: #18181b;
  --oc-surface: #27272a;
  --oc-text: #f4f4f5;
  --oc-muted: #a1a1aa;
  --oc-border: rgba(255, 255, 255, 0.1);
  --oc-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }

.launcher {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483000;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 50%;
  background: var(--oc-accent);
  color: var(--oc-accent-text);
  box-shadow: var(--oc-shadow);
  display: grid;
  place-items: center;
  transition: transform 160ms ease;
}
.launcher:hover { transform: scale(1.06); }
.launcher:focus-visible { outline: 2px solid var(--oc-accent); outline-offset: 3px; }
.launcher svg { width: 26px; height: 26px; }
:host([data-position="left"]) .launcher,
:host([data-position="left"]) .panel { right: auto; left: 20px; }

.panel {
  position: fixed;
  bottom: 88px;
  right: 20px;
  z-index: 2147483000;
  width: 380px;
  height: min(600px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--oc-bg);
  border: 1px solid var(--oc-border);
  border-radius: 16px;
  box-shadow: var(--oc-shadow);
  overflow: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  transform-origin: bottom right;
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}
.panel.open { opacity: 1; transform: none; pointer-events: auto; }
@media (max-width: 480px) {
  .panel { inset: 0; width: 100%; height: 100%; border-radius: 0; border: 0; }
  .panel.open ~ .launcher { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .launcher { transition: none; }
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--oc-border);
}
.header .title { flex: 1; font-weight: 600; font-size: 15px; }
.icon-btn {
  border: 0;
  background: transparent;
  color: var(--oc-muted);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
}
.icon-btn:hover { background: var(--oc-surface); color: var(--oc-text); }
.icon-btn svg { width: 18px; height: 18px; }

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overscroll-behavior: contain;
}
.msg {
  max-width: 85%;
  padding: 9px 13px;
  border-radius: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.msg.assistant { align-self: flex-start; background: var(--oc-surface); border-bottom-left-radius: 4px; }
.msg.user { align-self: flex-end; background: var(--oc-accent); color: var(--oc-accent-text); border-bottom-right-radius: 4px; }
.msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.msg.typing { color: var(--oc-muted); }
.msg.typing::after { content: "…"; animation: oc-blink 1s steps(2) infinite; }
@keyframes oc-blink { 50% { opacity: 0.2; } }

.rate { display: flex; gap: 2px; margin: -4px 0 0 4px; }
.rate button {
  border: 0;
  background: transparent;
  color: var(--oc-muted);
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 6px;
  opacity: 0.7;
}
.rate button:hover, .rate button[aria-pressed="true"] { opacity: 1; background: var(--oc-surface); }

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--oc-border);
}
textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--oc-border);
  background: var(--oc-surface);
  color: var(--oc-text);
  border-radius: 12px;
  padding: 9px 12px;
  font: inherit;
  max-height: 120px;
  min-height: 40px;
  outline: none;
}
textarea:focus { border-color: var(--oc-accent); }
.send {
  border: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--oc-accent);
  color: var(--oc-accent-text);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.send:disabled { opacity: 0.4; cursor: default; }
.send svg { width: 18px; height: 18px; }

.footer {
  text-align: center;
  font-size: 11px;
  color: var(--oc-muted);
  padding: 0 0 8px;
}
.footer a { color: inherit; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`
