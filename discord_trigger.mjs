/**
 * discord_trigger.mjs — Inject Discord messages into ColaOS via mouse + keyboard
 *
 * Reads pending.jsonl, activates Cola window, clicks the target chat
 * in the sidebar (coordinate mode), then pastes the message and presses Enter.
 *
 * Config: trigger_config.json
 *   navigation.mode = "coordinate": uses absolute screen coordinates
 *   navigation.selectChat.coordinates: { x, y } for sidebar chat entry
 *   navigation.focusInput.coordinates: { x, y } for chat input area
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

// ── Config ─────────────────────────────────────────────────────────────
function loadConfig() {
  const paths = [
    join(__dirname, "trigger_config.json"),
    join(homedir(), ".cola", "channels", "discord", "trigger_config.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  }
  return {
    mod: "normal",
    chatName: "Discord Integration",
    triggerPrefix: "[Discord]",
    navigation: { mode: "coordinate" },
  };
}

const config = loadConfig();

// ── Paths ──────────────────────────────────────────────────────────────
const PENDING_FILE = join(homedir(), ".cola", "channels", "discord", "pending.jsonl");
const DONE_FILE = join(homedir(), ".cola", "channels", "discord", "triggered.jsonl");
const POLL_INTERVAL_MS = 2000;

// ── PowerShell helpers ─────────────────────────────────────────────────
function ps(script, timeoutMs = 5000) {
  const escaped = script.replace(/"/g, '\\"');
  return execSync(`powershell -NoProfile -NonInteractive -Command "${escaped}"`, {
    timeout: timeoutMs, windowsHide: true,
  });
}

function activateColaWindow() {
  try {
    ps(`
      Add-Type @" using System; using System.Runtime.InteropServices;
        public class W32 {
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
          [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        }
        public struct RECT { public int left, top, right, bottom; }
"@
      $h = [W32]::FindWindow("Chrome_WidgetWin_1", "Cola")
      if ($h -eq [IntPtr]::Zero) { exit 1 }
      [W32]::ShowWindow($h, 9); Start-Sleep -Milliseconds 300
      [W32]::SetForegroundWindow($h); Start-Sleep -Milliseconds 200
      $r = New-Object RECT
      [W32]::GetWindowRect($h, [ref]$r)
      Write-Output "$($r.left),$($r.top),$($r.right),$($r.bottom)"
    `);
    return true;
  } catch { return false; }
}

function getColaRect() {
  try {
    const out = ps(`
      Add-Type @" using System; using System.Runtime.InteropServices;
        public class W32 {
          [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        }
        public struct RECT { public int left, top, right, bottom; }
"@
      $h = [W32]::FindWindow("Chrome_WidgetWin_1", "Cola")
      $r = New-Object RECT
      [W32]::GetWindowRect($h, [ref]$r)
      Write-Output "$($r.left),$($r.top),$($r.right),$($r.bottom)"
    `);
    const [l, t, r, b] = out.toString().trim().split(",").map(Number);
    return { left: l, top: t, right: r, bottom: b };
  } catch { return null; }
}

function moveAndClick(x, y) {
  ps(`
    Add-Type @" using System; using System.Runtime.InteropServices;
      public class M32 {
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
      }
"@
    [M32]::SetCursorPos(${x}, ${y})
    Start-Sleep -Milliseconds 100
    [M32]::mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
    Start-Sleep -Milliseconds 50
    [M32]::mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
    Start-Sleep -Milliseconds 200
  `);
}

function typeViaClipboard(text) {
  const escaped = text.replace(/"/g, '`"');
  ps(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText("${escaped}")
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait("{DELETE}")
    Start-Sleep -Milliseconds 50
    [System.Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  `);
}

// ── Navigation ─────────────────────────────────────────────────────────
function selectChat() {
  const nav = config.navigation || {};
  const mode = nav.mode || "coordinate";

  if (mode === "coordinate") {
    const coords = nav.selectChat?.coordinates;
    if (!coords || !coords.x || !coords.y) {
      console.error("  ✗ No coordinates configured. Set navigation.selectChat.coordinates in trigger_config.json");
      return false;
    }
    console.log(`  🖱 Clicking chat at (${coords.x}, ${coords.y})`);
    moveAndClick(coords.x, coords.y);
    return true;
  }

  console.error(`  ✗ Unsupported navigation mode: ${mode} (Node.js trigger uses 'coordinate' mode)`);
  return false;
}

function clickInput() {
  const nav = config.navigation || {};
  const focus = nav.focusInput || {};

  // Try coordinates first, then window-relative
  if (focus.coordinates?.x && focus.coordinates?.y) {
    moveAndClick(focus.coordinates.x, focus.coordinates.y);
    return;
  }

  // Window-relative fallback
  const rect = getColaRect();
  if (rect && focus.windowRelative) {
    const x = rect.left + Math.floor((rect.right - rect.left) * focus.windowRelative.x);
    const y = rect.top + Math.floor((rect.bottom - rect.top) * focus.windowRelative.y);
    moveAndClick(x, y);
    return;
  }

  // Absolute fallback: center-bottom of screen
  const screenW = 1920;
  const screenH = 1080;
  moveAndClick(Math.floor(screenW / 2), Math.floor(screenH * 0.9));
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

function clearPending() { writeFileSync(PENDING_FILE, "", "utf-8"); }

function archiveProcessed(messages) {
  mkdirSync(dirname(DONE_FILE), { recursive: true });
  for (const msg of messages) {
    msg.triggeredAt = new Date().toISOString();
    appendFileSync(DONE_FILE, JSON.stringify(msg) + "\n", "utf-8");
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ───────────────────────────────────────────────────────────────
async function processOnce() {
  const pending = readPending();
  if (pending.length === 0) return 0;

  const mod = config.mod || "normal";
  const prefix = config.triggerPrefix || "[Discord]";

  console.log(`[${new Date().toISOString()}] Processing ${pending.length} message(s) (mod=${mod})`);

  if (!activateColaWindow()) {
    console.error("  Could not activate Cola window.");
    return 0;
  }

  // Select chat via mouse
  if (!selectChat()) return 0;
  await sleep(300);

  // Click input area
  clickInput();
  await sleep(200);

  for (const msg of pending) {
    const author = msg.author || "Cherrie";
    const content = msg.content || "";
    const text = `${prefix} ${author}: ${content}`;
    const preview = text.slice(0, 80) + (text.length > 80 ? "..." : "");

    console.log(`  → Injecting: "${preview}"`);
    typeViaClipboard(text);
    await sleep(300);
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
