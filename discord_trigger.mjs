/**
 * discord_trigger.mjs — Injects Discord messages into Cola via keyboard simulation
 * 
 * Usage: node discord_trigger.mjs
 * 
 * Reads from C:/Users/Cherrie/.cola/channels/discord/pending.jsonl
 * For each pending message:
 *   1. Activates Cola window
 *   2. Types the message into Cola's chat input
 *   3. Presses Enter
 * Moves processed messages to pending.done.jsonl
 * 
 * Run this in background: node discord_trigger.mjs --watch
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const PENDING_FILE = join(homedir(), ".cola", "channels", "discord", "pending.jsonl");
const DONE_FILE = join(homedir(), ".cola", "channels", "discord", "triggered.jsonl");
const COLA_WINDOW_TITLE = "Cola";
const POLL_INTERVAL_MS = 2000;

// ── Keyboard injection via PowerShell ──────────────────────────────────
function sendKeys(text) {
  // Escape special chars for VBScript SendKeys
  const escaped = text
    .replace(/[+^%~()]/g, "{$&}")  // Special SendKeys chars
    .replace(/\n/g, "{ENTER}")      // Newlines → Enter
    .replace(/\{/g, "{{}")          // Escape braces
    .replace(/\}/g, "{}}")
    .slice(0, 1000);                // Safety limit

  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("${escaped}")
  `;
  execSync(`powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`, { 
    timeout: 5000,
    windowsHide: true,
  });
}

function activateColaWindow() {
  const ps = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      }
"@
    $hwnd = [Win32]::FindWindow("Chrome_WidgetWin_1", "Cola")
    if ($hwnd -eq [IntPtr]::Zero) { exit 1 }
    [Win32]::ShowWindow($hwnd, 9)  # SW_RESTORE
    [Win32]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 500
    exit 0
  `;
  try {
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { 
      timeout: 5000, 
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Message file handling ──────────────────────────────────────────────
function readPending() {
  if (!existsSync(PENDING_FILE)) return [];
  try {
    const raw = readFileSync(PENDING_FILE, "utf-8").trim();
    if (!raw) return [];
    return raw.split("\n").map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function clearPending() {
  writeFileSync(PENDING_FILE, "", "utf-8");
}

function archiveProcessed(messages) {
  mkdirSync(dirname(DONE_FILE), { recursive: true });
  for (const msg of messages) {
    appendFileSync(DONE_FILE, JSON.stringify({ ...msg, triggeredAt: new Date().toISOString() }) + "\n", "utf-8");
  }
}

// ── Main ───────────────────────────────────────────────────────────────
async function processOnce() {
  const pending = readPending();
  if (pending.length === 0) return 0;

  console.log(`[${new Date().toISOString()}] Processing ${pending.length} pending message(s)`);

  // Activate Cola window
  const activated = activateColaWindow();
  if (!activated) {
    console.error("  Could not activate Cola window. Is Cola running?");
    return 0;
  }

  for (const msg of pending) {
    const text = `[Discord] ${msg.author || "Cherrie"}: ${msg.content}`;
    console.log(`  → Typing: "${text.slice(0, 80)}..."`);
    
    // Paste the message
    // Use clipboard approach for reliability
    const ps = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Clipboard]::SetText("${text.replace(/"/g, '`"')}")
      [System.Windows.Forms.SendKeys]::SendWait("^v")
      Start-Sleep -Milliseconds 300
      [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    `;
    try {
      execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { 
        timeout: 10000, 
        windowsHide: true,
      });
      console.log("  ✓ Sent");
    } catch (e) {
      console.error(`  ✗ Failed: ${e.message}`);
    }
  }

  archiveProcessed(pending);
  clearPending();
  return pending.length;
}

// ── Entry ──────────────────────────────────────────────────────────────
const watchMode = process.argv.includes("--watch");

if (watchMode) {
  console.log(`Discord trigger watching ${PENDING_FILE} every ${POLL_INTERVAL_MS / 1000}s`);
  console.log("Press Ctrl+C to stop.\n");
  
  const interval = setInterval(async () => {
    try {
      await processOnce();
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }, POLL_INTERVAL_MS);

  process.on("SIGINT", () => { clearInterval(interval); process.exit(0); });
} else {
  const count = await processOnce();
  console.log(count > 0 ? `Processed ${count} messages.` : "No pending messages.");
}
