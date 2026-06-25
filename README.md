# Discord Cola Bridge

Push-based Discord ↔ Cola message bridge using Discord's gateway (WebSocket). No polling.

## Architecture

```
Discord Gateway (push)
       │
       ▼
   ┌────────┐     inbox/<group>/messages.jsonl     ┌──────────────┐
   │ bot.py │ ──────────────────────────────────►  │ ColaOS cron   │
   └────────┘                                      │ (every 10s)   │
       ▲                                           └──────────────┘
       │                                                  │
       │     outbox/*.json (written by reply command)     │
       └──────────────────────────────────────────────────┘
```

- **bot.py** — Connects to Discord gateway. Listens for messages in configured channels, writes them to group-isolated inbox files, auto-downloads attachments. Scans `outbox/` every 1s and sends replies. Shows 🟢 online presence + typing indicator.
- **read_inbox.py** — CLI helper for the ColaOS cron. Commands: `has_pending`, `slim`, `reply`, `mark`. Handles routing so the cron never sees Discord IDs.
- **ColaOS cron** — Runs every 10s. Sees only `content` + `attachments`. Thinks, then calls `reply` to send responses. See [CRON.md](CRON.md).

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. New Application → name it
3. **Bot** tab → Reset Token → copy it
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. **OAuth2 → URL Generator** → `bot` + `Send Messages` + `Read Message History` → invite to server

### 2. Configure

```bash
cp .env.example .env
```

```
DISCORD_TOKEN=your_token
ALLOWED_CHANNEL_IDS=123456789,987654321
```

Optional — isolate or share channel histories:

```
SHARE_HISTORY_1=123456789,987654321   # these two channels share one conversation
SHARE_HISTORY_2=111222333             # this channel is isolated
```

Channels not listed in any `SHARE_HISTORY` each get their own isolated inbox automatically.

### 3. Run the bot

```bash
pip install -r requirements.txt
python bot.py
```

Or double-click `run_bot.bat` (activates venv automatically).

### 4. Set up the ColaOS cron

See [CRON.md](CRON.md). Without the cron, the bot just logs messages to disk.

## How the cron sees messages

The cron input is **intentionally minimal** — Cola doesn't need Discord IDs:

```json
[
  {
    "group": "history_1",
    "id": 456,
    "content": "Hey Cola, what's up?",
    "attachments": [
      {"filename": "img.png", "local_path": "C:/.../inbox/attachments/456/img.png"}
    ]
  }
]
```

Routing (`channel_id`, reply threading) is handled by `read_inbox.py reply`.

## Inbox storage (on disk)

Full message data is stored in group-isolated JSONL files for debugging:

```
inbox/
├── history_1/messages.jsonl    ← channels in SHARE_HISTORY_1
├── history_2/messages.jsonl    ← channels in SHARE_HISTORY_2
├── ch_999888777/messages.jsonl ← auto-isolated channel
└── attachments/<msg_id>/       ← downloaded files
```

Each line in a `messages.jsonl`:

```json
{
  "message_id": 123456789,
  "channel_id": 987654321,
  "channel_name": "general",
  "guild_id": 111,
  "guild_name": "My Server",
  "author_id": 222,
  "author_name": "User#1234",
  "author_display_name": "Cherrie",
  "content": "Hey Cola!",
  "timestamp": "2026-06-25T14:30:00+00:00",
  "received_at": "2026-06-25T14:30:01+00:00",
  "attachments": [
    {
      "filename": "img.png",
      "url": "https://cdn.discord.com/...",
      "size": 12345,
      "local_path": "C:/.../inbox/attachments/123456789/img.png"
    }
  ],
  "referenced_message_id": null
}
```

## Outbox format

Normally handled by `read_inbox.py reply`. For manual use:

```json
{
    "channel_id": 123456789,
    "content": "Hello!",
    "reply_to_message_id": null,
    "files": ["C:/path/to/image.png"]
}
```

- `channel_id` — Discord channel ID (required)
- `content` — Message text, max 2000 chars (optional if `files` provided)
- `reply_to_message_id` — Optional, replies to a specific message
- `files` — Optional array of local file paths to attach

## License

MIT
