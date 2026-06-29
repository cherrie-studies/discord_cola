/**
 * discord_trigger.mjs — Inject Discord messages into ColaOS via keyboard simulation
 *
 * Reads pending.jsonl, activates Cola window, navigates to target chat,
 * pastes the message, and presses Enter.
 *
 * Config: read from trigger_config.json (shared with Python version)
 *
 * Usage:
 *   node discord_trigger.mjs           # run once
 *   node discord_trigger.mjs --watch   # poll every 2s
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = __dirname;

// ── Config ─────────────────────────────────────────────────────────────
function loadConfig() {
  // Try script dir, then channels dir
  const paths = [
    join(SCRIPT_DIR, "trigger_config.json"),
    join(homedir(), ".cola", "channels", "discord", "trigger_config.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8"));
    }
  }
  return {
    mod: "normal",
    chatName: "Discord Integration",
    triggerPrefix: "[Discord]",
    navigation: {
      clearSearch: { keys: ["escape"], waitMs: 200 },
      activateChat: { keys: ["ctrl", "k"] },
      typeAndSelect: { waitAfterTypeMs: 500 },
    },
  };
}

const config = loadConfig();

// ── Paths ──────────────────────────────────────────────────────────────
const PENDING_FILE = join(homedir(), ".cola", "channels", "discord", "pending.jsonl");
const DONE_FILE = join(homedir(), ".cola", "channels", "discord", "triggered.jsonl");
const POLL_INTERVAL_MS = 2000;

// ── PowerShell helpers ─────────────────────────────────────────────────
function runPS(script, timeoutMs = 5000) {
  const escaped = script.replace(/"/g, '\\"');
  return execSync(`powershell -NoProfile -NonInteractive -Command "${escaped}"`, {
    timeout: timeoutMs,
    windowsHide: true,
  });
}

function activateColaWindow() {
  const ps = `
    Add-Type @"
      using System; using System.Runtime.InteropServices;
      public class W32 {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int n);
      }
"@
    $h = [W32]::FindWindow("Chrome_WidgetWin_1", "Cola")
    if ($h -eq [IntPtr]::Zero) { exit 1 }
    [W32]::ShowWindow($h, 9); Start-Sleep -Milliseconds 300
    [W32]::SetForegroundWindow($h); Start-Sleep -Milliseconds 200
  `;
  try { runPS(ps); return true; } catch { return false; }
}

function sendKeysCombo(keys, waitMs = 300) {
  const keyExpr = keys.map(k => {
    if (k === "ctrl") return "^";
    if (k === "shift") return "+";
    if (k === "alt") return "%";
    if (k === "escape") return "{ESC}";
    if (k === "enter") return "{ENTER}";
    return `{${k.toUpperCase()}}`;
  }).join("");

  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("${keyExpr}")
    Start-Sleep -Milliseconds ${waitMs}
  `;
  runPS(ps);
}

function typeViaClipboard(text) {
  const escaped = text.replace(/"/g, '`"');
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText("${escaped}")
    [System.Windows.Forms.SendKeys]::SendWait("^v")
  `;
  runPS(ps);
}

function sendEnter() {
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  `;
  runPS(ps);
}

// ── Navigation ─────────────────────────────────────────────────────────
function navigateToChat(chatName) {
  const nav = config.navigation;

  // Step 1: Clear any open popups
  const clear = nav.clearSearch || { keys: ["escape"], waitMs: 200 };
  sendKeysCombo(clear.keys, clear.waitMs);

  // Step 2: Open command palette
  const activate = nav.activateChat || { keys: ["ctrl", "k"] };
  sendKeysCombo(activate.keys, 500);

  // Step 3: Type chat name
  typeViaClipboard(chatName);

  // Step 4: Select
  const select = nav.typeAndSelect || { waitAfterTypeMs: 500 };
  const wait = new Promise(r => setTimeout(r, select.waitAfterTypeMs || 500));
  wait.then(() => sendEnter()).then(() => new Promise(r => setTimeout(r, 300)));

  console.log(`  Navigated to chat: ${chatName}`);
}

// ── Message queue ──────────────────────────────────────────────────────
function readPending() {
  if (!existsSync(PENDING_FILE)) return [];
  try {
    const raw = readFileSync(PENDING_FILE, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function clearPending() {
  writeFileSync(PENDING_FILE, "", "utf-8");
}

function archiveProcessed(messages) {
  mkdirSync(dirname(DONE_FILE), { recursive: true });
  for (const msg of messages) {
    msg.triggeredAt = new Date().toISOString();
    appendFileSync(DONE_FILE, JSON.stringify(msg) + "\n", "utf-8");
  }
}

// ── Main ───────────────────────────────────────────────────────────────
async function processOnce() {
  const pending = readPending();
  if (pending.length === 0) return 0;

  const mod = config.mod || "normal";
  const chatName = config.chatName || "Discord Integration";
  const prefix = config.triggerPrefix || "[Discord]";

  console.log(`[${new Date().toISOString()}] Processing ${pending.length} message(s) (mod=${mod}, chat=${chatName})`);

  if (!activateColaWindow()) {
    console.error("  Could not activate Cola window.");
    return 0;
  }

  // Navigate to target chat
  navigateToChat(chatName);
  await new Promise(r => setTimeout(r, 700));  // wait for nav to settle

  for (const msg of pending) {
    const author = msg.author || "Cherrie";
    const content = msg.content || "";
    const text = `${prefix} ${author}: ${content}`;
    const preview = text.slice(0, 80) + (text.length > 80 ? "..." : "");

    console.log(`  → Injecting: "${preview}"`);
    typeViaClipboard(text);
    await new Promise(r => setTimeout(r, 200));
    sendEnter();
    await new Promise(r => setTimeout(r, 300));
    console.log("  ✓ Sent");
  }

  archiveProcessed(pending);
  clearPending();
  return pending.length;
}

// ── Entry ──────────────────────────────────────────────────────────────
const watchMode = process.argv.includes("--watch");

if (watchMode) {
  const mod = config.mod || "normal";
  const chat = config.chatName || "Discord Integration";
  console.log(`Discord trigger watching ${PENDING_FILE}`);
  console.log(`  Mod: ${mod} | Chat: ${chat} | Poll: ${POLL_INTERVAL_MS / 1000}s`);
  console.log("Press Ctrl+C to stop.\n");

  setInterval(async () => {
    try { await processOnce(); } catch (e) { console.error(`Error: ${e.message}`); }
  }, POLL_INTERVAL_MS);

  process.on("SIGINT", () => process.exit(0));
} else {
  const count = await processOnce();
  console.log(count > 0 ? `Processed ${count} messages.` : "No pending messages.");
}
