#!/usr/bin/env python3
"""Generate games-index.js by discovering game folders under Games/."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
GAMES_DIR = ROOT / "Games"
OUTPUT = ROOT / "games-index.js"

# Keep any existing display names and cover choices when a game is already known.
existing = {}
if OUTPUT.exists():
    text = OUTPUT.read_text(encoding="utf-8")
    match = re.search(r"window\.GAME_CATALOG\s*=\s*(\[.*?\])\s*;", text, re.S)
    if match:
        try:
            for game in json.loads(match.group(1)):
                existing[game.get("path", "")] = game
        except json.JSONDecodeError:
            pass

image_suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
games = []

for folder in sorted((p for p in GAMES_DIR.iterdir() if p.is_dir()), key=lambda p: p.name.casefold()):
    html_files = sorted(
        (p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in {".html", ".htm"}),
        key=lambda p: (p.name.casefold() != "index.html", str(p).casefold())
    )
    if not html_files:
        continue

    entry = next((p for p in html_files if p.name.casefold() == "index.html"), html_files[0])
    relative_entry = entry.relative_to(ROOT).as_posix()
    previous = existing.get(relative_entry, {})

    cover = previous.get("cover", "")
    if cover and not (ROOT / cover).is_file():
        cover = ""
    if not cover:
        cover_dir = folder / "Cover"
        if cover_dir.is_dir():
            images = sorted(
                (p for p in cover_dir.rglob("*") if p.is_file() and p.suffix.lower() in image_suffixes),
                key=lambda p: str(p).casefold()
            )
            if images:
                cover = images[0].relative_to(ROOT).as_posix()

    name = previous.get("name") or folder.name
    title = previous.get("title") or folder.name
    game = {"name": name, "title": title, "path": relative_entry}
    if cover:
        game["cover"] = cover
    games.append(game)

OUTPUT.write_text(
    "/* Automatically generated game catalog. Do not edit by hand. */\n"
    "window.GAME_CATALOG = " + json.dumps(games, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8"
)
print(f"Generated catalog for {len(games)} games.")
