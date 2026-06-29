"""
find_coords.py — Real-time mouse coordinate tracker

Shows live (x, y) as you move your mouse. Press number keys to capture
positions for different UI elements. Press 's' to save all to config.

Usage: py find_coords.py
"""

import sys, json, time
from pathlib import Path

try:
    import pyautogui
except ImportError:
    print("Missing pyautogui. Run: pip install pyautogui keyboard")
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
    "0": ("modSelector",         "Mod selector button (top-left, shows current mod)"),
    "m": ("mod_cola",            "Switch Mod modal: Cola (orange circle)"),
    "n": ("mod_vibe",            "Switch Mod modal: Vibe Cola (anime avatar)"),
}

try:
    import keyboard
    has_keyboard = True
except ImportError:
    has_keyboard = False

print("Mouse Coordinate Finder — Press keys to capture positions")
print("==========================================================")
print()
print("  Move mouse over element, press key:")
for key, (_, desc) in sorted(labels.items()):
    print(f"    {key:>3} = {desc}")
print()
print("    s  = Save all to trigger_config.json")
print("    q  = Quit")
print()

if not has_keyboard:
    print("⚠ pip install keyboard for hotkey capture")
    print("  Fallback: run again after installing, or add coords manually.")
    print()

print("Tracking... (hover + press key)")
print()

try:
    while True:
        x, y = pyautogui.position()
        if (x, y) != (last_x, last_y):
            print(f"\r({x:4d}, {y:4d})  ", end="", flush=True)
            last_x, last_y = x, y

        if not has_keyboard:
            time.sleep(0.1)
            continue

        for key in labels:
            if keyboard.is_pressed(key):
                name, desc = labels[key]
                captured[name] = {"x": x, "y": y, "description": desc}
                print(f"\n  ✅ {key}: {desc} → ({x}, {y})")
                time.sleep(0.3)

        if keyboard.is_pressed("s") and captured:
            config = {}
            if CONFIG_FILE.exists():
                config = json.loads(CONFIG_FILE.read_text())
            nav = config.get("navigation", {})

            if "selectChat" in captured:
                nav["selectChat"] = {"coordinates": captured["selectChat"]}
            if "focusInput" in captured:
                nav["focusInput"] = {"coordinates": captured["focusInput"]}
            if "modelSelector" in captured:
                nav["modelSelector"] = {"coordinates": captured["modelSelector"]}
            if "modSelector" in captured:
                nav["modSelector"] = {"coordinates": captured["modSelector"]}

            config["navigation"] = nav

            # Model positions
            models = config.get("modelPositions", {})
            for key, (name, desc) in labels.items():
                if key in captured and name.startswith("model_"):
                    mk = desc.replace("Model panel: ", "").lower().replace(" ", "_").replace(".", "")
                    models[mk] = captured[name]
            if models:
                config["modelPositions"] = models

            # Mod positions (for switch mod)
            mods = config.get("switchMod", {})
            if "mod_cola" in captured:
                mods["cola"] = captured["mod_cola"]
            if "mod_vibe" in captured:
                mods["vibe_cola"] = captured["mod_vibe"]
            if mods:
                config["switchMod"] = mods

            CONFIG_FILE.write_text(json.dumps(config, indent=2))
            print(f"\n  💾 Saved {len(captured)} positions → trigger_config.json")
            time.sleep(0.3)

        if keyboard.is_pressed("q"):
            print("\nDone.")
            break

except KeyboardInterrupt:
    pass

print()
if captured:
    print("Captured:")
    for key in sorted(captured):
        info = captured[key]
        print(f"  {info['description']}: ({info['x']}, {info['y']})")
    print()
    print("Press 's' to save, or add manually to trigger_config.json")
