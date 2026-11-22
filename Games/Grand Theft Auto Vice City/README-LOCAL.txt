GTA: Vice City — automatic local launcher
===========================================

1. Keep this entire folder together and open index.html directly in Chrome or Edge.
2. The page immediately contacts the public GitHub repository:
   https://github.com/AMoldyWaffle/GTA-VC
3. It downloads the game assets in parallel, imports/converts them into browser
   storage (IndexedDB), and launches the game automatically when ready.
4. No Start button, file picker, localhost server, Python server, or local web
   server is used.

Local/offline behavior
----------------------
- The downloaded game data is stored in this browser's IndexedDB (allow roughly 1.2 GB of free browser storage).
- On later opens, the launcher checks for the completed local package and skips
  the GitHub download when it is already present.
- After the first successful download/import, the game data can be read locally.
  Internet is required for the first download and for any missing/replaced files.
- Clearing browser site data or deleting IndexedDB removes the stored game.
- The browser must allow IndexedDB, Web Workers, WebAssembly, and WebGL.

Downloads and troubleshooting
-----------------------------
- The downloader requests the GitHub repository tree once, then downloads
  supported asset folders with up to 8 concurrent requests.
- Press "Show console" on the startup screen to see detailed download, import,
  storage, and launch errors. The console also captures uncaught errors.
- If a download fails, check that raw.githubusercontent.com and api.github.com
  are reachable and that the browser allows cross-origin requests from local
  file pages.
- The downloaded repository must contain the expected original PC game assets.
  The launcher does not provide a copy of the game itself.

Saves
-----
The existing save backup/import tools remain available in the game UI where
supported. Game data and saves are stored locally by the browser.
