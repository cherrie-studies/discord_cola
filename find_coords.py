"""
find_coords.py — Real-time mouse coordinate tracker

Shows live (x, y) as you move your mouse. Press a key to freeze
and capture coordinates for trigger_config.json.

Usage: py find_coords.py
       py find_coords.py --click  (click at current position to test)
"""

import sys
import json
import time
from pathlib import Path

try:
    import pyautogui
except ImportError:
    print("Missing pyautogui. Run: pip install pyautogui")
    sys.exit(1)

CONFIG_FILE = Path(__file__).parent / "trigger_config.json"

print("Mouse Coordinate Finder")
print("=======================")
print()
print("Move your mouse over any UI element in Cola.")
print("Press a key to freeze the current position:")
print()
print("  1 = capture sidebar chat entry")
print("  2 = capture chat input area")
print("  3 = capture model selector (top of Cola)")
print("  4 = capture model: Max")
print("  5 = capture model: Pro")
print("  6 = capture model: Lite")
print("  7 = capture model: Code")
print("  8 = capture model: GLM 5.2")
print("  9 = capture model: Doubao Seed")
print("  s = save all captured to trigger_config.json")
print("  q = quit")
print()

captured = {}
last_x, last_y = 0, 0

try:
    import keyboard
    has_keyboard = True
except ImportError:
    has_keyboard = False
    print("(Tip: pip install keyboard for hotkey capture)")
    print("Using fallback: move mouse to position, switch to terminal, press key")
    print()

labels = {
    "1": ("selectChat", "Sidebar chat entry"),
    "2": ("focusInput", "Chat input area"),
    "3": ("modelSelector", "Model selector button"),
    "4": ("model_max", "Model: Max"),
    "5": ("model_pro", "Model: Pro"),
    "6": ("model_lite", "Model: Lite"),
    "7": ("model_code", "Model: Code"),
    "8": ("model_glm", "Model: GLM 5.2"),
    "9": ("model_doubao", "Model: Doubao Seed"),
}

print("Tracking... (move mouse, press 1-9 to capture)")
print()

try:
    while True:
        x, y = pyautogui.position()
        if (x, y) != (last_x, last_y):
            # Clear line and show position
            print(f"\r({x:4d}, {y:4d})  ", end="", flush=True)
            last_x, last_y = x, y

        if has_keyboard:
            for key in labels:
                if keyboard.is_pressed(key):
                    name, desc = labels[key]
                    captured[name] = {"x": x, "y": y, "label": desc}
                    pos_str = f"({x}, {y})"
                    print(f"\n  ✅ {key}: {desc} → {pos_str}")
                    time.sleep(0.3)  # debounce
            if keyboard.is_pressed("s"):
                # Save to config
                if not CONFIG_FILE.exists():
                    config = {}
                else:
                    config = json.loads(CONFIG_FILE.read_text())

                nav = config.get("navigation", {})
                if "selectChat" in captured:
                    nav["selectChat"] = {"coordinates": captured["selectChat"]}
                if "focusInput" in captured:
                    nav["focusInput"] = {"coordinates": captured["focusInput"]}
                if "modelSelector" in captured:
                    nav["modelSelector"] = {"coordinates": captured["modelSelector"]}
                config["navigation"] = nav

                # Model positions
                models_config = config.get("modelPositions", {})
                for key, (name, desc) in labels.items():
                    if key in captured and key not in ["1", "2", "3"]:
                        model_key = desc.replace("Model: ", "").lower().replace(" ", "_")
                        models_config[model_key] = captured[name]
                if models_config:
                    config["modelPositions"] = models_config

                CONFIG_FILE.write_text(json.dumps(config, indent=2))
                print(f"\n  💾 Saved {len(captured)} positions to trigger_config.json")
                time.sleep(0.3)
            if keyboard.is_pressed("q"):
                print("\nDone.")
                break
        else:
            # Fallback: read from stdin (user switches to terminal and presses key)
            # Non-blocking check every second
            time.sleep(0.05)

except KeyboardInterrupt:
    print("\n\nCaptured so far:")

for key, info in captured.items():
    print(f"  {labels.get(key, (key, key))[1]}: ({info['x']}, {info['y']})")

if captured:
    print()
    print("Add these to trigger_config.json manually, or press 's' to auto-save.")
