#!/usr/bin/env node
/* Kitesurf MCP server (stdio transport). Exposes:
 *   markdown  - render a page (JS) and return Markdown
 *   html      - render a page (JS) and return fully rendered HTML
 *   links     - extract links from a rendered page
 *   screenshot- capture a screenshot of a rendered page (image/png, base64)
 *
 * Creds: env CF_ACCOUNT_ID / CF_BROWSER_RUN_TOKEN, or creds.env next to this file.
 *
 * Examples:
 *   Claude Code : claude mcp add kitesurf node -- "C:/Users/ru628/_scratch/kitesurf/kitesurf-mcp.js"
 *   Cursor/Windsurf: add the same under mcpServers in settings.json (command: ["node",".../kitesurf-mcp.js"])
 */
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://api.cloudflare.com/client/v4/accounts";

function creds() {
  const env = { CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID, CF_BROWSER_RUN_TOKEN: process.env.CF_BROWSER_RUN_TOKEN };
  let acct = env.CF_ACCOUNT_ID, tok = env.CF_BROWSER_RUN_TOKEN;
  try {
    for (const line of fs.readFileSync(path.join(__dirname, "creds.env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t[0] === "#" || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      if (k === "CF_ACCOUNT_ID") acct = t.slice(i + 1).trim();
      if (k === "CF_BROWSER_RUN_TOKEN") tok = t.slice(i + 1).trim();
    }
  } catch (_) {}
  return { acct, tok };
}

async function request(action, body) {
  const { acct, tok } = creds();
  const url = `${BASE}/${acct}/browser-rendering/${action}?browser=kitesurf`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.slice(0, 1000)}`);
  try {
    const o = JSON.parse(raw);
    if (o.result !== undefined) return typeof o.result === "object" ? JSON.stringify(o.result, null, 2) : String(o.result);
    if (o.success === false) return "ERROR: " + (o.errors || []).map((e) => e.message).join(", ");
  } catch (_) {}
  return raw;
}

function screenshot(url, wait) {
  const { acct, tok } = creds();
  const url2 = `${BASE}/${acct}/browser-run/screenshot?browser=kitesurf`;
  const body = { url };
  if (wait) body.gotoOptions = { waitUntil: wait };
  return fetch(url2, {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.arrayBuffer()).then((buf) => ({ type: "image", data: Buffer.from(buf).toString("base64"), mimeType: "image/png" }));
}

function parseResult(raw) {
  try {
    const o = JSON.parse(raw);
    if (o.result !== undefined) return typeof o.result === "object" ? JSON.stringify(o.result, null, 2) : String(o.result);
    if (o.success === false) return "ERROR: " + (o.errors || []).map((e) => e.message).join(", ");
  } catch (_) {}
  return raw;
}

const TOOLS = [
  {
    name: "markdown",
    description: "Render a page (executes JS) and return its content as Markdown. Best for reading JS-heavy sites.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, wait: { type: "string", enum: ["domcontentloaded", "networkidle2", "networkidle0"] }, userAgent: { type: "string" } }, required: ["url"] },
  },
  {
    name: "html",
    description: "Render a page (executes JS) and return the fully rendered HTML.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, wait: { type: "string", enum: ["domcontentloaded", "networkidle2", "networkidle0"] } }, required: ["url"] },
  },
  {
    name: "links",
    description: "Extract links from a rendered page.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "screenshot",
    description: "Capture a screenshot (image/png) of a rendered page.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, wait: { type: "string", enum: ["domcontentloaded", "networkidle2", "networkidle0"] } }, required: ["url"] },
  },
];

async function handleToolCall(name, args) {
  const url = args.url;
  if (!url) return { error: { code: -32602, message: "missing required 'url'" } };
  const body = { url };
  if (args.wait) body.gotoOptions = { waitUntil: args.wait };
  if (args.userAgent) body.userAgent = args.userAgent;
  try {
    if (name === "markdown") return { content: [{ type: "text", text: await request("markdown", body) }] };
    if (name === "html") return { content: [{ type: "text", text: await request("content", body) }] };
    if (name === "links") return { content: [{ type: "text", text: await request("links", body) }] };
    if (name === "screenshot") return { content: [{ ...(await screenshot(url, args.wait)) }] };
  } catch (e) { return { error: { code: -32000, message: String(e.message || e) } }; }
  return { error: { code: -32601, message: "unknown tool: " + name } };
}

const rl = readline.createInterface({ input: process.stdin });
let buf = "";
rl.on("line", (line) => {
  buf += line + "\n";
  const idx = buf.indexOf("\n");
  if (idx < 0) return;
  const raw = buf.slice(0, idx).trim();
  buf = buf.slice(idx + 1);
  if (!raw) return;
  let msg; try { msg = JSON.parse(raw); } catch (_) { return; }
  const { id, method, params } = msg;
  const respond = (result, error) => {
    const out = { jsonrpc: "2.0", id };
    if (result !== undefined) out.result = result;
    else out.error = error || { code: -32603, message: "internal" };
    process.stdout.write(JSON.stringify(out) + "\n");
  };

  if (method === "initialize") {
    respond({
      protocolVersion: params.protocolVersion || "2024-11-05",
      capabilities: { tools: {}, sampling: {} },
      serverInfo: { name: "kitesurf-mcp", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "ping") { respond({}); return; }
  if (method === "tools/list") { respond({ tools: TOOLS }); return; }
  if (method === "tools/call") {
    const args = params.arguments || {};
    (async () => { respond(await handleToolCall(params.name, args)); })();
    return;
  }
  respond(undefined, { code: -32601, message: "method not found: " + method });
});
