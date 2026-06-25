# CRON Setup

This file tells ColaOS how to create the cron job that reads Discord messages and responds.

## What the cron does

1. Checks `inbox/messages.jsonl` for new messages (cursor-based, no duplicates)
2. If none → exits immediately (no reasoning, no cost)
3. If new messages → reads them, thinks, writes replies to `outbox/`
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
You are Cola's Discord inbox processor. This cron runs every 10 seconds to check for new Discord messages from Cherrie and respond.

## CRITICAL: Quick exit path — do this FIRST
Run: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py has_pending`

- If exit code is non-zero → no pending messages. Exit silently NOW. Do NOT output anything, do NOT reason, do NOT read memory bank.
- If exit code is 0 → there ARE pending messages. Continue to the next step.

## Processing new messages
1. Run: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py read`
   Returns a JSON array of new messages. Each has: message_id, channel_id, channel_name, guild_name, author_id, author_name, author_display_name, content, timestamp, attachments (with local_path for downloaded files), referenced_message_id.

2. These messages are from Cherrie (the Discord user). They are messaging you because they are AFK. Respond in their language as you normally would. Use their memory bank at C:\Users\Cherrie\.cola\memory-bank\ for context.

3. For each message, write a response to:
   File: C:/PERSONAL_DATA/Coding/discord_cola/outbox/{datetime}_{msg_id}.json
   Content: {"channel_id": <channel_id>, "content": "<your reply, max 1800 chars>", "reply_to_message_id": <message_id>}
   The bot scans outbox/ every 1s and sends to Discord.

4. After each processed message: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py mark <message_id>`

5. After ALL messages: update MEMORY.md active context at C:\Users\Cherrie\.cola\memory-bank\ if anything was discussed, and create/update note files for any new facts or tasks.

## Rules
- Only respond to messages from Cherrie (their Discord username). Skip messages from other users.
- If you're unsure who Cherrie is on Discord, process all messages but note the uncertainty.
- Keep replies concise — they're on mobile. Under 1800 chars. Split into multiple outbox files if needed.
- If they shared files, read them from the local_path in attachments.
- Update memory bank for anything important learned (preferences, tasks, facts).
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
