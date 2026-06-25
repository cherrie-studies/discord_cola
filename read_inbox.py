"""
Discord Cola — Inbox reader helper
==================================
Called by Cola's cron to fetch new unprocessed messages from the inbox.
Uses a cursor file (last processed message_id) to track position.

Commands:
  read        — Full JSON (all fields, for debugging)
  slim        — Minimal JSON (only fields Cola needs to respond)
  has_pending — Exit 0 if new messages, exit 1 if none
  mark <id>   — Update cursor to mark message as processed
"""

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INBOX_FILE = BASE_DIR / "inbox" / "messages.jsonl"
CURSOR_FILE = BASE_DIR / "inbox" / "cursor.txt"

# Fields the cron actually needs to respond
SLIM_FIELDS = (
    "message_id",
    "channel_id",
    "author_display_name",
    "content",
    "attachments",
    "referenced_message_id",
)


def _get_last_id() -> int | None:
    if CURSOR_FILE.exists():
        try:
            return int(CURSOR_FILE.read_text().strip())
        except ValueError:
            pass
    return None


def _read_new_messages() -> list[dict]:
    """Read all unprocessed messages from inbox."""
    last_id = _get_last_id()
    messages = []
    if INBOX_FILE.exists():
        raw = INBOX_FILE.read_text(encoding="utf-8-sig")
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if last_id is None or msg["message_id"] > last_id:
                messages.append(msg)
    return messages


def _slim_message(msg: dict) -> dict:
    """Reduce a full message to only the fields Cola needs."""
    slim = {}
    for key in SLIM_FIELDS:
        if key in msg:
            slim[key] = msg[key]
    # Slim attachments further — only keep filename and local_path
    if "attachments" in slim and slim["attachments"]:
        slim["attachments"] = [
            {"filename": a.get("filename"), "local_path": a.get("local_path")}
            for a in slim["attachments"]
        ]
    return slim


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "slim"

    if cmd in ("read", "slim"):
        messages = _read_new_messages()
        if cmd == "slim":
            messages = [_slim_message(m) for m in messages]
        print(json.dumps(messages, ensure_ascii=False, indent=2))

    elif cmd == "mark":
        msg_id = sys.argv[2] if len(sys.argv) > 2 else None
        if msg_id:
            CURSOR_FILE.write_text(str(msg_id))

    elif cmd == "has_pending":
        messages = _read_new_messages()
        sys.exit(0 if messages else 1)

    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
