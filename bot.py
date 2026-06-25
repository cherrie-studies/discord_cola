"""
Discord Cola Bridge
===================
Push-based Discord gateway client that bridges messages between Discord and Cola.

Inbound  (Discord → Cola):  Listens to configured channels via Discord gateway.
                             Writes incoming messages as JSONL to inbox/messages.jsonl.
Outbound (Cola → Discord):  Watches outbox/ for .json reply files, sends them via the
                             Discord API, then archives to outbox/sent/.
"""

import asyncio
import json
import os
import shutil
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

import discord
from discord.ext import tasks
from dotenv import load_dotenv

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
INBOX_FILE = BASE_DIR / "inbox" / "messages.jsonl"
OUTBOX_DIR = BASE_DIR / "outbox"
SENT_DIR = OUTBOX_DIR / "sent"

# ── Config ─────────────────────────────────────────────────────────────────
load_dotenv(BASE_DIR / ".env")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
ALLOWED_CHANNEL_IDS: set[int] = set()

_raw = os.getenv("ALLOWED_CHANNEL_IDS", "")
if _raw:
    for part in _raw.split(","):
        part = part.strip()
        if part:
            ALLOWED_CHANNEL_IDS.add(int(part))


# ── Discord client ─────────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True  # Required to read message content
intents.members = False
intents.presences = False

client = discord.Client(intents=intents)


# ── Inbox: Discord → Cola ──────────────────────────────────────────────────
def _append_to_inbox(entry: dict) -> None:
    """Atomically append a JSON line to the inbox file."""
    INBOX_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False) + "\n"
    with open(INBOX_FILE, "a", encoding="utf-8") as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())


@client.event
async def on_ready():
    print(f"[discord_cola] Logged in as {client.user} (ID: {client.user.id})")
    if not ALLOWED_CHANNEL_IDS:
        print("[discord_cola] WARNING: No ALLOWED_CHANNEL_IDS set — listening to ALL channels!")
    else:
        print(f"[discord_cola] Listening on channels: {ALLOWED_CHANNEL_IDS}")
    outbox_loop.start()


@client.event
async def on_message(message: discord.Message):
    # Ignore own messages and bots to avoid loops
    if message.author == client.user or message.author.bot:
        return

    # Filter to allowed channels (if configured)
    if ALLOWED_CHANNEL_IDS and message.channel.id not in ALLOWED_CHANNEL_IDS:
        return

    entry = {
        "message_id": message.id,
        "channel_id": message.channel.id,
        "channel_name": getattr(message.channel, "name", str(message.channel.id)),
        "guild_id": message.guild.id if message.guild else None,
        "guild_name": message.guild.name if message.guild else "DM",
        "author_id": message.author.id,
        "author_name": str(message.author),
        "author_display_name": message.author.display_name,
        "content": message.content,
        "timestamp": message.created_at.isoformat(),
        "received_at": datetime.now(timezone.utc).isoformat(),
        "attachments": [
            {"filename": a.filename, "url": a.url, "size": a.size}
            for a in message.attachments
        ],
        "referenced_message_id": (
            message.reference.message_id if message.reference else None
        ),
    }
    _append_to_inbox(entry)
    print(f"[discord_cola] ← {message.author.display_name}: {message.content[:80]}")


# ── Outbox: Cola → Discord ─────────────────────────────────────────────────
def _scan_outbox() -> list[Path]:
    """Return sorted list of .json files in outbox/ (excluding sent/)."""
    if not OUTBOX_DIR.exists():
        return []
    files = []
    for p in OUTBOX_DIR.iterdir():
        if p.suffix == ".json" and p.is_file():
            files.append(p)
    files.sort(key=lambda p: p.stat().st_mtime)
    return files


async def _process_outbox_file(filepath: Path) -> bool:
    """Read a single outbox .json, send the message, move to sent/.
    Returns True on success."""
    try:
        data = json.loads(filepath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"[discord_cola] ⚠ Bad outbox file {filepath.name}: {e}")
        _archive(filepath, success=False)
        return False

    channel_id = data.get("channel_id")
    content = data.get("content", "")
    reply_to = data.get("reply_to_message_id")

    if not channel_id or not content:
        print(f"[discord_cola] ⚠ Outbox entry missing channel_id or content: {filepath.name}")
        _archive(filepath, success=False)
        return False

    channel = client.get_channel(int(channel_id))
    if channel is None:
        try:
            channel = await client.fetch_channel(int(channel_id))
        except (discord.NotFound, discord.Forbidden, discord.HTTPException) as e:
            print(f"[discord_cola] ⚠ Cannot find channel {channel_id}: {e}")
            _archive(filepath, success=False)
            return False

    try:
        kwargs = {"content": str(content)[:2000]}  # Discord 2000-char limit
        if reply_to:
            try:
                ref_msg = await channel.fetch_message(int(reply_to))
                kwargs["reference"] = ref_msg
            except (discord.NotFound, discord.HTTPException):
                pass  # Send without reply if referenced message is gone

        sent_msg = await channel.send(**kwargs)
        print(f"[discord_cola] → #{getattr(channel, 'name', channel_id)}: {str(content)[:80]}")
        _archive(filepath, success=True, sent_message_id=sent_msg.id)
        return True

    except (discord.Forbidden, discord.HTTPException) as e:
        print(f"[discord_cola] ⚠ Failed to send to #{channel_id}: {e}")
        _archive(filepath, success=False)
        return False


def _archive(filepath: Path, *, success: bool, sent_message_id: int | None = None) -> None:
    """Move processed outbox file to sent/ (or sent/failed/)."""
    dest_dir = SENT_DIR if success else SENT_DIR / "failed"
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Append timestamp to avoid name collisions
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    dest = dest_dir / f"{ts}_{filepath.name}"
    try:
        shutil.move(str(filepath), str(dest))
    except OSError:
        pass  # Best-effort


@tasks.loop(seconds=1.0)
async def outbox_loop():
    """Periodically scan outbox/ for pending .json files and send them."""
    try:
        for filepath in _scan_outbox():
            await _process_outbox_file(filepath)
    except Exception as e:
        print(f"[discord_cola] ⚠ outbox_loop error: {e}")


@outbox_loop.before_loop
async def _before_outbox():
    await client.wait_until_ready()


# ── Shutdown ───────────────────────────────────────────────────────────────
_shutting_down = False


def _handle_shutdown_signal(signum, frame):
    global _shutting_down
    if not _shutting_down:
        _shutting_down = True
        print(f"\n[discord_cola] Received signal {signum}, shutting down...")
        asyncio.create_task(_graceful_shutdown())


async def _graceful_shutdown():
    outbox_loop.cancel()
    try:
        await client.close()
    except Exception:
        pass
    sys.exit(0)


# ── Entry point ────────────────────────────────────────────────────────────
def main():
    if not DISCORD_TOKEN:
        print("[discord_cola] FATAL: DISCORD_TOKEN not set in .env")
        sys.exit(1)

    signal.signal(signal.SIGINT, _handle_shutdown_signal)
    signal.signal(signal.SIGTERM, _handle_shutdown_signal)

    try:
        client.run(DISCORD_TOKEN, log_handler=None)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
