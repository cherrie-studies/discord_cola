# CRON Setup

Creates the ColaOS cron that reads Discord messages and responds.

## What the cron does

1. Runs `read_inbox.py has_pending` — exits immediately if nothing new
2. If messages: reads slim JSON (only `content` + `attachments` — no IDs or routing)
3. Thinks, replies via `read_inbox.py reply <group> <id> "<text>"` (script handles routing)
4. Marks done: `read_inbox.py mark <group> <id>`

## How to create it

Ask Cola to create a cron with these parameters:

- **ID:** `discord-inbox`
- **Schedule:** `*/10 * * * * *` (every 10s)
- **Catch-up:** `latest`
- **Delivery mode:** `none`

**Prompt:**

```
Discord inbox processor. Runs every 10s.

## Quick exit (FIRST)
Run: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py has_pending`
exit 0 = pending. exit non-zero = nothing → stop silently.

## Process (exit 0 only)
1. `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py slim`
   Returns: [{"group":"history_1","id":456,"content":"hey","attachments":[...]}]

2. These are Cherrie messaging from Discord (AFK). Use memory bank. Respond in their
   language, concise, <1800 chars. Split to multiple replies if needed.

3. For each message, think then send reply:
   `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py reply <group> <id> "<your response>"`
   This handles routing automatically (channel_id, reply threading).

4. After replying: `python C:/PERSONAL_DATA/Coding/discord_cola/read_inbox.py mark <group> <id>`

5. Update memory bank for anything important.

## Rules
- Only respond to Cherrie. Skip others.
- Read files from local_path in attachments.
```

## Update the paths

Replace `C:/PERSONAL_DATA/Coding/discord_cola/` with wherever you cloned the repo.

## History isolation

Configure in `.env`:

```
SHARE_HISTORY_1=111222333,444555666   # channels share one conversation
SHARE_HISTORY_2=777888999             # isolated channel
```

Channels not in any `SHARE_HISTORY` group each get their own isolated inbox automatically.
