#!/usr/bin/env node
/* Kitesurf (Cloudflare Browser Run) Quick Actions client.
 * JS-rendered HTML / Markdown / links via Kitesurf.
 * Secrets from env CF_ACCOUNT_ID / CF_BROWSER_RUN_TOKEN, else creds.env beside this file.
 * usage:
 *   node kitesurf.js markdown <url> [--wait networkidle0]
 *   node kitesurf.js content  <url>
 *   node kitesurf.js links    <url>
 *   node kitesurf.js screenshot <url> [--out shot.png] [--wait networkidle0]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://api.cloudflare.com/client/v4/accounts";

function die(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function loadCredsFile() {
  const f = path.join(__dirname, "creds.env");
  const out = {};
  try {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const l = line.trim();
      if (!l || l.startsWith("#") || !l.includes("=")) continue;
      const i = l.indexOf("=");
      out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch (_) {}
  return out;
}

function creds() {
  const env = { CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID, CF_BROWSER_RUN_TOKEN: process.env.CF_BROWSER_RUN_TOKEN };
  const file = loadCredsFile();
  const acct = env.CF_ACCOUNT_ID || file.CF_ACCOUNT_ID;
  const tok = env.CF_BROWSER_RUN_TOKEN || file.CF_BROWSER_RUN_TOKEN;
  if (!acct || !tok) die("env CF_ACCOUNT_ID / CF_BROWSER_RUN_TOKEN を設定、または creds.env に記入してください");
  return { acct, tok };
}

async function request(path_, body) {
  const { acct, tok } = creds();
  const url = BASE + "/" + acct + path_;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) die(`HTTP ${res.status}: ${raw.slice(0, 1500)}`);
  return raw;
}

async function renderAction(action, url, wait) {
  const path_ = `/browser-rendering/${action}?browser=kitesurf`;
  const body = { url };
  if (wait) body.gotoOptions = { waitUntil: wait };
  const raw = await request(path_, body);
  try {
    const obj = JSON.parse(raw);
    if (obj.result !== undefined) {
      console.log(typeof obj.result === "object" ? JSON.stringify(obj.result, null, 2) : String(obj.result));
    } else if (obj.success === false) {
      die((obj.errors || []).map((e) => e.message).join(", ").slice(0, 1000));
    } else {
      console.log(raw.slice(0, 8000));
    }
  } catch (_) {
    console.log(raw.slice(0, 8000));
  }
}

async function binaryAction(action, url, wait, out) {
  const path_ = `/browser-run/${action}?browser=kitesurf`;
  const body = { url };
  if (wait) body.gotoOptions = { waitUntil: wait };
  const res = await fetch(BASE + "/" + creds().acct + path_, {
    method: "POST",
    headers: { Authorization: "Bearer " + creds().tok, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (out) {
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  } else {
    process.stdout.write(buf);
  }
}

function main() {
  const a = process.argv.slice(2);
  if (a.length < 2) die("usage: kitesurf.js <content|markdown|links|scrape|json|snapshot|accessibilityTree|screenshot|pdf> <url> [--out FILE] [--wait networkidle0|networkidle2]");
  const action = a[0];
  const url = a[1];
  let out = null, wait = null;
  for (let i = 2; i < a.length; i++) {
    if (a[i] === "--out") out = a[++i] || null;
    else if (a[i] === "--wait") wait = a[++i] || null;
  }
  (async () => {
    if (["content", "markdown", "links", "scrape", "json", "snapshot", "accessibilityTree"].includes(action)) await renderAction(action, url, wait);
    else if (["screenshot", "pdf"].includes(action)) await binaryAction(action, url, wait, out);
    else die(`unknown action: ${action}`);
  })().catch((e) => die(String(e.message || e)));
}
main();
