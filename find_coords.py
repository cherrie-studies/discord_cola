"""
find_coords.py — Real-time mouse coordinate tracker with verbose logging

Shows live (x, y) as you move your mouse. Press number keys to capture
positions for different UI elements. Press 's' to save all to config.

Usage: py find_coords.py
"""

import sys, json, time
from pathlib import Path

try:
    import pyautogui
except ImportError:
    print("MISSING: pyautogui. Run: pip install pyautogui keyboard")
    sys.exit(1)

CONFIG_FILE = Path(__file__).parent / "trigger_config.json"
captured = {}
last_x, last_y = 0, 0

# Key → (configKey, description)
labels = {
    "1": ("selectChat",          "Sidebar: 'Discord Chat' entry"),
    "2": ("focusInput",          "Chat input area (bottom of Cola)"),
    "3": ("modelSelector",       "Model selector button (e.g. 'Lite')"),
    "4": ("model_max",           "Model panel: Max"),
    "5": ("model_pro",           "Model panel: Pro"),
    "6": ("model_lite",          "Model panel: Lite"),
    "7": ("model_code",          "Model panel: Code"),
    "8": ("model_glm",           "Model panel: GLM 5.2"),
    "9": ("model_doubao",        "Model panel: Doubao Seed"),
    "0": ("modSelector",         "Mod selector button (top-left of Cola)"),
    "m": ("mod_cola",            "Switch Mod modal: Cola (orange card)"),
    "n": ("mod_vibe",            "Switch Mod modal: Vibe Cola (anime card)"),
}

try:
    import keyboard
    has_keyboard = True
except ImportError:
    has_keyboard = False

print("=" * 60)
print("  Mouse Coordinate Finder — for discord_trigger.py")
print("=" * 60)
print()
print("  Hover your mouse over each UI element in Cola,")
print("  then press the corresponding key to capture.")
print()

if not has_keyboard:
    print("❌ 'keyboard' module not installed!")
    print("   Run: pip install keyboard")
    print("   Then restart this script.")
    print()
    sys.exit(1)

print("  Keys:")
for key in sorted(labels, key=lambda k: (k.isdigit(), k)):
    _, desc = labels[key]
    print(f"    [{key}] = {desc}")
print()
print(f"    [s] = SAVE all captured to {CONFIG_FILE.name}")
print(f"    [q] = QUIT")
print()
print(f"📡 Listening for key presses... (hover + press key)")
print(f"{'─' * 60}")
print()

# Show initial mouse position
x, y = pyautogui.position()
print(f"  🖱  Starting position: ({x}, {y})")
print()

capture_count = 0

try:
    while True:
        x, y = pyautogui.position()
        if (x, y) != (last_x, last_y):
            print(f"\r  📍 ({x:4d}, {y:4d})", end="", flush=True)
            last_x, last_y = x, y

        for key in labels:
            if keyboard.is_pressed(key):
                name, desc = labels[key]
                captured[name] = {"x": x, "y": y, "description": desc}
                capture_count += 1
                print(f"\n  ✅ [{key}] CAPTURED #{capture_count}: {desc}")
                print(f"       Position: ({x}, {y})")
                # Visual feedback: tiny mouse jiggle
                pyautogui.moveRel(2, 0, duration=0.05)
                pyautogui.moveRel(-2, 0, duration=0.05)
                print(f"  📡 Listening...")
                print()
                time.sleep(0.3)  # debounce

        if keyboard.is_pressed("s"):
            if not captured:
                print(f"\n  ⚠ Nothing captured yet! Press 1-9, 0, m, n first.")
                print(f"  📡 Listening...")
                time.sleep(0.3)
                continue

            # Build config
            config = {}
            if CONFIG_FILE.exists():
                config = json.loads(CONFIG_FILE.read_text())
            nav = config.get("navigation", {})

            updates = []
            if "selectChat" in captured:
                nav["selectChat"] = {"coordinates": captured["selectChat"],
                                     "description": captured["selectChat"]["description"]}
                updates.append("selectChat")
            if "focusInput" in captured:
                nav["focusInput"] = {"coordinates": captured["focusInput"],
                                     "description": captured["focusInput"]["description"]}
                updates.append("focusInput")
            if "modelSelector" in captured:
                nav["modelSelector"] = {"coordinates": captured["modelSelector"],
                                        "description": captured["modelSelector"]["description"]}
                updates.append("modelSelector")
            if "modSelector" in captured:
                nav["modSelector"] = {"coordinates": captured["modSelector"],
                                      "description": captured["modSelector"]["description"]}
                updates.append("modSelector")

            config["navigation"] = nav

            # Model positions
            models = {}
            for key, (name, desc) in labels.items():
                if key in captured and name.startswith("model_"):
                    mk = desc.replace("Model panel: ", "").lower().replace(" ", "_").replace(".", "")
                    models[mk] = captured[name]
                    updates.append(desc)
            if models:
                config["modelPositions"] = models

            # Switch mod positions
            mods = config.get("switchMod", {})
            if "mod_cola" in captured:
                mods["cola"] = captured["mod_cola"]
                updates.append("Switch: Cola")
            if "mod_vibe" in captured:
                mods["vibe_cola"] = captured["mod_vibe"]
                updates.append("Switch: Vibe Cola")
            if "mod_cola" in captured or "mod_vibe" in captured:
                config["switchMod"] = mods

            CONFIG_FILE.write_text(json.dumps(config, indent=2))

            print(f"\n{'─' * 60}")
            print(f"  💾 SAVED to {CONFIG_FILE}")
            print(f"     {capture_count} positions captured")
            print(f"     Updated sections: {', '.join(updates)}")
            print(f"{'─' * 60}")
            print()

            # Show summary of what was saved
            print("  Summary:")
            for key in sorted(captured):
                info = captured[key]
                print(f"    {info['description']:50s} → ({info['x']:4d}, {info['y']:4d})")
            print()
            print(f"  📡 Listening... (press q to quit)")
            print()
            time.sleep(0.3)

        if keyboard.is_pressed("q"):
            print(f"\n{'─' * 60}")
            if captured:
                print(f"  Exiting. {capture_count} positions captured.")
                print(f"  (They ARE saved if you pressed 's' earlier)")
                print(f"  If you forgot to save: re-run and press 's' after capturing)")
            else:
                print(f"  Exiting. No positions captured.")
            print(f"{'─' * 60}")
            break

except KeyboardInterrupt:
    print(f"\n\n{'─' * 60}")
    if captured:
        print(f"  Interrupted. {capture_count} positions IN MEMORY (not saved to file).")
        print(f"  Re-run and press 's' to save them.")
    else:
        print(f"  Interrupted. Nothing captured.")
    print(f"{'─' * 60}")
