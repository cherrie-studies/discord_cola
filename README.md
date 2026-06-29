# Discord Cola Bridge

Bridge Discord messages into ColaOS with full agent capabilities.

## Architecture

```
Discord ──→ plugin/gateway (discord.js) ──→ pending.jsonl
                                                │
                                        discord_trigger.mjs --watch
                                                │
                          ① Activate Cola window
                          ② Click "Discord Integration" in sidebar
                          ③ Click input area → Ctrl+V → Enter
                                                │
                                        Cola agent (full tools)
                                                │
Discord ←── plugin/outbound.sendText ←──────────┘
```

## Quick Start

### Prerequisites
- Node.js (Cola's bundled runtime or system Node 18+)
- Discord bot token ([create one](https://discord.com/developers/applications))
- ColaOS running and visible on screen

### 1. Config
Create `C:\Users\<you>\.cola\plugins\discord\config.json`:
```json
{
  "token": "<your-bot-token>",
  "allowedChannelIds": ["<channel-id>"]
}
```

### 2. Build & Install Plugin
```bash
cd plugin
npm install
npm run build
cp dist/index.js ~/.cola/plugins/discord/dist/index.js
cp -r node_modules/discord.js ~/.cola/plugins/discord/node_modules/
```

### 3. Restart Cola
The plugin loads automatically. Check Cola logs for:
```
[plugin:discord] Discord connected as Cola-AI#5291
Listening on channels: 1519719204071280640
```

### 4. Set coordinates
Find the pixel position of "Discord Integration" in Cola's sidebar. Edit [`trigger_config.json`](trigger_config.json):
```json
{
  "navigation": {
    "mode": "coordinate",
    "selectChat": {
      "coordinates": { "x": 200, "y": 350 }
    },
    "focusInput": {
      "coordinates": { "x": 960, "y": 950 }
    }
  }
}
```

**Tip:** Use the [Python helper](https://github.com/cherrie-studies/discord_cola_py) for automatic image-based coordinate detection:
```bash
cd ../discord_cola_py
python capture_chat.py --test   # prints exact coordinates
```

### 5. Run Trigger
```bash
node discord_trigger.mjs --watch
```

Send a message in your Discord channel — it appears in Cola within 2 seconds.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `mod` | `"normal"` | Which Cola mod (`"normal"` or `"vibe_cola"`) |
| `chatName` | `"Discord Integration"` | Target chat session name |
| `triggerPrefix` | `"[Discord]"` | Prepended to every injected message |
| `navigation.mode` | `"coordinate"` | `"coordinate"` = fixed screen pixels |
| `navigation.selectChat.coordinates` | `{"x":null,"y":null}` | Pixel position of sidebar chat entry |
| `navigation.focusInput.coordinates` | `{"x":null,"y":null}` | Pixel position of chat input area |
| `navigation.focusInput.windowRelative` | `{"x":0.5,"y":0.9}` | Fallback if coordinates not set |

## Test Scripts

```bash
# Standalone Discord round-trip (no Cola needed)
node test_pipeline.cjs

# 19 config checks
node test_config.cjs
```

## Files

| File | Purpose |
|------|---------|
| `plugin/src/index.ts` | Cola channel plugin (gateway + outbound) |
| `discord_trigger.mjs` | Mouse + keyboard injection script |
| `trigger_config.json` | Shared config (mod, chat, coordinates) |
| `test_pipeline.cjs` | Standalone Discord round-trip test |
| `test_config.cjs` | Plugin config verification (19 checks) |
| `legacy/` | Deprecated cron-based approach (archived) |

## Companion Project

[`discord_cola_py`](https://github.com/cherrie-studies/discord_cola_py) — Python version with image-based navigation (no manual coordinates needed).
