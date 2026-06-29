# Discord Cola Bridge

Bridge Discord messages into ColaOS with full agent capabilities (tools, memory bank, multi-turn reasoning).

## Architecture

```
Discord ──→ plugin/gateway (discord.js) ──→ pending.jsonl
                                                │
                                        discord_trigger.mjs
                                                │
                                        Activate Cola → paste → Enter
                                                │
                                        Cola agent (full tools)
                                                │
Discord ←── plugin/outbound.sendText ←──────────┘
```

## Setup

### 1. Discord Bot
- Create a bot at https://discord.com/developers/applications
- Enable **Message Content Intent** in Bot settings
- Invite to your server with `bot` + `messages.read` scopes
- Copy the bot token

### 2. Config
Create `C:\Users\<you>\.cola\plugins\discord\config.json`:
```json
{
  "token": "<your-bot-token>",
  "allowedChannelIds": ["<channel-id>"]
}
```
Or: `C:\Users\<you>\.cola\channels\discord\config.json`

### 3. Build & Install Plugin
```bash
cd plugin
npm install
npm run build
```
Then copy `plugin/dist/index.js` to `C:\Users\<you>\.cola\plugins\discord\dist\index.js`.

Also copy `node_modules/discord.js` and its dependencies to the plugin dir.

### 4. Start
Restart Cola. The plugin loads automatically.

### 5. Run Trigger
```bash
node discord_trigger.mjs --watch
```
This polls `pending.jsonl` every 2 seconds and injects messages into Cola via keyboard.

## Test

### Pipeline test (standalone)
```bash
node test_pipeline.cjs
```
Connects to Discord, sets presence, waits for messages, echoes replies.

### Config test
```bash
node test_config.cjs
```
19 checks verifying plugin installation and config.

## Files

| File | Purpose |
|------|---------|
| `plugin/src/index.ts` | Cola channel plugin (gateway + outbound) |
| `discord_trigger.mjs` | Keyboard injection script |
| `test_pipeline.cjs` | Standalone Discord round-trip test |
| `test_config.cjs` | Plugin config verification |
| `legacy/` | Deprecated cron-based approach (archived) |
