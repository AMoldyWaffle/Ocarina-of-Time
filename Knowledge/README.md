# Ocarina of Time — Game Launcher

A browser-based launcher for the games stored in this repository's `Games/` directory.

## Current status

The current launcher is the working direct-iframe version. Games are opened as real pages from GitHub Pages inside the launcher iframe. The launcher does **not** fetch a game's HTML and rewrite it into a Blob or `srcdoc`.

This distinction is important for emulator-based games: their workers and other browser resources need the correct document origin. Direct navigation lets the game page load from its own GitHub Pages URL.

## What works

- **Game library discovery:** the launcher reads the repository's `Games/` directory through the GitHub Contents API and creates a card for each subfolder.
- **Direct game launching:** selecting a game navigates the player iframe to that game's GitHub Pages URL.
- **Emulator-based games:** the direct-loading version has been tested by the project owner and confirmed working, including games that previously failed during worker/emulator startup.
- **Non-emulator games:** Cuphead and the other tested non-emulator games launch.
- **Back button:** returns to the game library and unloads the current iframe.
- **Reload button:** reloads the selected game.
- **Launcher log:** the Log button shows launcher-side messages and errors.

## How game URLs are built

The launcher currently uses this base URL:

```
https://amoldywaffle.github.io/Ocarina-of-Time/
```

For each discovered folder, it expects the game page at:

```
Games/<folder name>/index.html
```

The iframe navigates directly to that URL. Relative scripts, data files, WASM files, and workers are therefore resolved by the game page rather than by a copied launcher document.

## Known limitations / not guaranteed

- **No automatic CDN or raw-GitHub fallback in the current launcher.** The current working version uses the GitHub Pages URL directly. Earlier mirror experiments were removed in favor of the simpler direct-loading approach.
- **A proxy can still block requests.** HTTP 403, 406, ad-blocker failures, or blocked domains are controlled by the proxy/browser/server. The launcher cannot override those restrictions.
- **Game-specific browser requirements still apply.** A game may require features such as SharedWorker, WebAssembly, cross-origin isolation, gamepad access, or particular storage behavior. Direct loading fixes the origin mismatch caused by HTML injection, but it cannot make an unsupported browser feature available.
- **The launcher log is not a full DevTools console.** It records launcher messages and iframe load events. Errors inside a cross-origin game iframe may not be readable by the parent page; use the browser's developer console for those details.
- **Folder discovery assumes `index.html`.** The launcher builds that filename for every game folder. A folder whose entry point has another name (for example, a standalone Flash launcher HTML file) needs a compatible `index.html` entry point or a launcher-specific mapping before it can be started by the generic card.
- **The GitHub Contents API is used for discovery.** If the API is rate-limited, blocked, or unavailable, the game list may fail to populate even if the game pages themselves are reachable.

## Important implementation rule

Keep the working launch method:

1. Keep the library page as the parent document.
2. Launch each game by setting the iframe's `src` to its original GitHub Pages URL.
3. Do not replace this with `srcdoc`, fetched-and-rewritten HTML, or Blob navigation for emulator pages. Those approaches caused origin/worker problems in the proxy setup.

## Adding a game

1. Add a new folder under `Games/`.
2. Put the game's web build in that folder.
3. Make sure its entry page is named `index.html`.
4. Ensure its assets are referenced with paths that work from that folder.
5. Wait for GitHub Pages to publish, then refresh the launcher.

## Project files

- `index.html` — the launcher.
- `Games/` — individual game folders and their assets.
- `Knowledge/README.md` — this project and compatibility guide.

The launcher itself does not modify game files or download/install software on the user's device.
