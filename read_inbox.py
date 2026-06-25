"""
Discord Cola — Inbox reader helper
==================================
Called by Cola's cron to fetch new unprocessed messages from the inbox.
Uses a cursor file (last processed message_id) to track position.
Outputs JSON array of new messages to stdout.
"""

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INBOX_FILE = BASE_DIR / "inbox" / "messages.jsonl"
CURSOR_FILE = BASE_DIR / "inbox" / "cursor.txt"
OUTBOX_DIR = BASE_DIR / "outbox"


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "read"

    if cmd == "read":
        # Read cursor (last processed message_id)
        last_id = None
        if CURSOR_FILE.exists():
            try:
                last_id = int(CURSOR_FILE.read_text().strip())
            except ValueError:
                last_id = None

        # Read inbox, collect new messages
        new_messages = []
        if INBOX_FILE.exists():
            raw = INBOX_FILE.read_text(encoding="utf-8-sig")  # utf-8-sig strips BOM
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if last_id is None or msg["message_id"] > last_id:
                    new_messages.append(msg)

        print(json.dumps(new_messages, ensure_ascii=False, indent=2))

    elif cmd == "mark":
        # Mark a message_id as processed
        msg_id = sys.argv[2] if len(sys.argv) > 2 else None
        if msg_id:
            CURSOR_FILE.write_text(str(msg_id))

    elif cmd == "has_pending":
        # Quick check: are there unprocessed messages? Exit code 0 = yes.
        last_id = None
        if CURSOR_FILE.exists():
            try:
                last_id = int(CURSOR_FILE.read_text().strip())
            except ValueError:
                last_id = None

        if not INBOX_FILE.exists():
            sys.exit(1)  # No inbox yet

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
                sys.exit(0)  # Has pending

        sys.exit(1)  # No pending

    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
