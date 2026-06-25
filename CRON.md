# CRON Setup

This file tells ColaOS how to create the cron job that reads Discord messages and responds.

## What the cron does

1. Checks `inbox/messages.jsonl` for new messages via `read_inbox.py has_pending`
2. If none → exits immediately (no reasoning, no cost)
3. If new messages → reads slim JSON (only essential fields), thinks, writes replies to `outbox/`
4. Updates `inbox/cursor.txt` so messages aren't re-processed

## How to create it

Ask Cola to create a cron with these exact parameters:

---

**Cron ID:** `discord-inbox`
**Name:** `Discord inbox reader`
**Schedule:** `*/10 * * * * *` (every 10 seconds)
**Catch-up:** `latest`
**Delivery mode:** `none` (runs silently in background)
**One-shot:** `false`

**Prompt:**

```
You are Cola's Discord inbox processor. Runs every 10s.

## Quick exit (do FIRST)
Run: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py has_pending`
Exit 0 = pending, exit non-zero = nothing → exit silently NOW. No output, no thinking.

## Process messages (exit 0 only)
1. `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py slim` → minimal JSON per message:
   message_id, channel_id, author_display_name, content,
   attachments (filename+local_path only), referenced_message_id.

2. These are Cherrie messaging from Discord (AFK). Use memory bank at
   C:\Users\Cherrie\.cola\memory-bank\. Respond in their language, concise
   (<1800 chars), split to multiple outbox files if needed.

3. Write response:
   File: C:/PERSONAL_DATA/Coding/discord_cola/outbox/{datetime}_{msg_id}.json
   Content: {"channel_id": <id>, "content": "<reply>", "reply_to_message_id": <msg_id>}

4. Mark done: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py mark <message_id>`

5. Update memory bank for anything important learned.

## Rules
- Only respond to Cherrie. Skip other users.
- Read files from local_path in attachments if shared.
- Keep replies under 1800 chars.
```

---

## Important: update the paths

The prompt above uses `C:/PERSONAL_DATA/Coding/discord_cola/` — change this to wherever you cloned the repo on your machine. All instances of this path need to match your clone location.

Same for `C:\Users\Cherrie\.cola\memory-bank\` — update to your ColaOS memory bank path.

## Verifying it works

1. Start `bot.py` (double-click `run_bot.bat`)
2. Send yourself a message in Discord
3. You should get a reply within ~15 seconds (10s cron interval + processing time)

## Troubleshooting

| Problem | Check |
|---------|-------|
| No responses | Is the cron running? Ask Cola "list my reminders" — look for `discord-inbox` |
| BOM / encoding errors | Make sure `read_inbox.py` uses `utf-8-sig` encoding (already fixed in this repo) |
| Path errors | Verify all paths in the cron prompt match your file system |
| Bot crashes on start | Check `.env` has valid `DISCORD_TOKEN` |
