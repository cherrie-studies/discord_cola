# Discord Cola Bridge

Push-based Discord ↔ Cola message bridge using Discord's gateway (WebSocket). No polling.

## How it works

```
Discord Gateway (push)
       │
       ▼
   ┌───────┐     inbox/messages.jsonl     ┌──────────┐
   │ bot.py │ ──────────────────────────► │ Cola cron │
   └───────┘                              └──────────┘
       ▲                                       │
       │       outbox/*.json (reply files)     │
       └───────────────────────────────────────┘
```

- **Inbound:** Bot listens via Discord gateway. Messages in allowed channels are appended as JSON lines to `inbox/messages.jsonl`. Attachments are auto-downloaded to `inbox/attachments/<msg_id>/`.
- **Outbound:** Cola drops `.json` reply files into `outbox/`. The bot scans every second, sends them (text + optional file attachments) via the Discord API, and archives to `outbox/sent/`.

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. New Application → name it `Cola Bridge` (or anything)
3. **Bot** tab → Reset Token → copy it
4. Enable these **Privileged Gateway Intents:**
   - Message Content Intent **(required)**
5. **OAuth2 → URL Generator** → select `bot` scope + `Send Messages` + `Read Message History` → use the generated URL to invite the bot to your server

### 2. Configure the bridge

```bash
cp .env.example .env
# Edit .env and fill in your token + channel IDs
```

```
DISCORD_TOKEN=your_bot_token_here
ALLOWED_CHANNEL_IDS=123456789,987654321
```

Leave `ALLOWED_CHANNEL_IDS` empty to listen to **all** channels the bot can see.

### 3. Run the bot

```bash
pip install -r requirements.txt
python bot.py
```

Or double-click `run_bot.bat` (activates venv automatically).

### 4. Set up the Cola cron

See [CRON.md](CRON.md) for instructions. The cron is what makes Cola read and respond to Discord messages. Without it, the bot just logs messages to disk.

## Outbox format (Cola → Discord)

Drop a `.json` file into `outbox/`:

```json
{
    "channel_id": 123456789,
    "content": "Hello from Cola!",
    "reply_to_message_id": null,
    "files": ["C:/path/to/image.png", "C:/path/to/report.pdf"]
}
```

- `channel_id` — Discord channel ID (required)
- `content` — Message text, max 2000 chars (optional if `files` is provided)
- `reply_to_message_id` — Optional, replies to a specific message
- `files` — Optional array of absolute local file paths to attach (images, PDFs, etc.)

The file is deleted after sending (archived to `outbox/sent/`).

## Inbox format (Discord → Cola)

Each line in `inbox/messages.jsonl`:

```json
{
    "message_id": 123456789,
    "channel_id": 987654321,
    "channel_name": "general",
    "guild_id": 111,
    "guild_name": "My Server",
    "author_id": 222,
    "author_name": "User#1234",
    "author_display_name": "User",
    "content": "Hey Cola, what's up?",
    "timestamp": "2026-06-25T14:30:00+00:00",
    "received_at": "2026-06-25T14:30:01.123456+00:00",
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

## License

MIT
