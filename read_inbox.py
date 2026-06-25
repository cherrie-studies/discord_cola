"""
Discord Cola — Inbox reader helper
==================================
Commands:
  has_pending          — Exit 0 if any history group has new messages
  slim                 — Minimal JSON: [{group, id, content, attachments}]
  mark <group> <id>    — Update cursor for this group
  reply <group> <id> "<text>" — Write outbox file (looks up channel_id internally)
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

INBOX_DIR = BASE_DIR / "inbox"
OUTBOX_DIR = BASE_DIR / "outbox"

# ── History groups from .env ───────────────────────────────────────────────
# SHARE_HISTORY_1=111,222  → channels 111 and 222 share inbox/history_1/
# SHARE_HISTORY_2=333      → channel 333 isolated in inbox/history_2/
# Channels not in any group get their own auto-group: inbox/ch_<id>/
def _build_group_map() -> dict[int, str]:
    """Returns {channel_id: group_name}."""
    groups: dict[int, str] = {}
    for key, val in os.environ.items():
        if key.startswith("SHARE_HISTORY_"):
            group = key[len("SHARE_HISTORY_"):]  # "1", "2", etc.
            for cid in val.split(","):
                cid = cid.strip()
                if cid:
                    groups[int(cid)] = f"history_{group}"
    return groups

GROUP_MAP = _build_group_map()


def _group_for_channel(channel_id: int) -> str:
    """Get or create group name for a channel."""
    if channel_id in GROUP_MAP:
        return GROUP_MAP[channel_id]
    return f"ch_{channel_id}"


def _group_dir(group: str) -> Path:
    d = INBOX_DIR / group
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cursor_file(group: str) -> Path:
    return _group_dir(group) / "cursor.txt"


def _inbox_file(group: str) -> Path:
    return _group_dir(group) / "messages.jsonl"


def _get_last_id(group: str) -> int | None:
    cf = _cursor_file(group)
    if cf.exists():
        try:
            return int(cf.read_text().strip())
        except ValueError:
            pass
    return None


def _read_group_messages(group: str) -> list[dict]:
    """Read unprocessed messages from one group's inbox."""
    last_id = _get_last_id(group)
    messages = []
    inf = _inbox_file(group)
    if inf.exists():
        raw = inf.read_text(encoding="utf-8-sig")
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


def _find_message(group: str, message_id: int) -> dict | None:
    """Find a specific message in a group's inbox (for reply lookup)."""
    inf = _inbox_file(group)
    if inf.exists():
        raw = inf.read_text(encoding="utf-8-sig")
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg["message_id"] == message_id:
                return msg
    return None


def _all_pending() -> list[dict]:
    """All unprocessed messages across all groups, tagged with group and slimmed."""
    results = []
    for d in sorted(INBOX_DIR.iterdir()) if INBOX_DIR.exists() else []:
        if not d.is_dir():
            continue
        group = d.name
        for msg in _read_group_messages(group):
            slim = {
                "group": group,
                "id": msg["message_id"],
                "content": msg.get("content", ""),
                "attachments": [
                    {"filename": a.get("filename"), "local_path": a.get("local_path")}
                    for a in msg.get("attachments", [])
                ],
            }
            results.append(slim)
    return results


# ── CLI ────────────────────────────────────────────────────────────────────
def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "has_pending"

    if cmd == "has_pending":
        pending = _all_pending()
        sys.exit(0 if pending else 1)

    elif cmd == "slim":
        print(json.dumps(_all_pending(), ensure_ascii=False, indent=2))

    elif cmd == "mark":
        if len(sys.argv) < 4:
            print("Usage: read_inbox.py mark <group> <message_id>", file=sys.stderr)
            sys.exit(2)
        group, msg_id = sys.argv[2], sys.argv[3]
        _cursor_file(group).write_text(str(msg_id))

    elif cmd == "reply":
        if len(sys.argv) < 5:
            print('Usage: read_inbox.py reply <group> <message_id> "<text>"', file=sys.stderr)
            sys.exit(2)
        group, msg_id, text = sys.argv[2], sys.argv[3], sys.argv[4]
        msg = _find_message(group, int(msg_id))
        if msg is None:
            print(f"Message {msg_id} not found in group {group}", file=sys.stderr)
            sys.exit(1)
        channel_id = msg["channel_id"]
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        outbox_file = OUTBOX_DIR / f"{ts}_{msg_id}.json"
        outbox_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "channel_id": channel_id,
            "content": text,
            "reply_to_message_id": int(msg_id),
        }
        outbox_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"OK: reply queued for channel {channel_id}")

    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
