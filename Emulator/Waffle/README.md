# WafflesIsolationism — Offline EmulatorJS (detailed guide)

A self-contained build of **EmulatorJS 4.2.3** that runs without the internet. No CDN, no update checks, no analytics. All emulator
engines ("cores") live in this folder as small script files. Other web pages can control it with simple messages, and the whole thing can be
hosted from plain GitHub files (raw links), not just GitHub Pages.

> **Honest status:** I verified that every script parses, that all 98 core files load and are byte-for-byte identical to your original `data/`
> folder, and that loading works when files are served as `text/plain` like raw.githubusercontent.com does. I have **not** been able to run it in a real
> browser with a real game. Treat your first launch as a test.

## Contents
1. [What's in the folder](#1-whats-in-the-folder)
2. [Quick start (local)](#2-quick-start-local)
3. [Hosting on GitHub (raw links)](#3-hosting-on-github-raw-links)
4. [Controlling the emulator from your own pages](#4-controlling-the-emulator-from-your-own-pages)
5. [Using controller.html](#5-using-controllerhtml)
6. [Supported systems](#6-supported-systems-and-file-types)
7. [All 49 cores](#7-all-49-cores)
8. [BIOS files and ROMs](#8-bios-files-and-roms)
9. [What gets stored in the browser](#9-what-gets-stored-in-the-browser)
10. [How the offline part works](#10-how-the-offline-part-works)
11. [Security notes](#11-security-notes)
12. [Troubleshooting](#12-troubleshooting)
13. [FAQ](#13-faq)
14. [Rebuilding](#14-rebuilding-from-the-original-data-folder)
15. [Legal](#15-legal)

---

## 1. What's in the folder

```
WafflesOffline/
├── emulator.html        the emulator (about 1.5 MB)
├── loader.js            helper that lets any page run it from raw GitHub links
├── controller.html      example remote control
├── README.md            this file
├── PROTOCOL.md          short message reference
├── packs/               98 core files, about 170 MB total
│   ├── fceumm-wasm.js
│   ├── fceumm-legacy-wasm.js
│   └── ... (one pair per core)
└── build-tools/         build.py + template to regenerate everything
```

- **`emulator.html`** contains the emulator program, its styles, and the small helper files needed to unpack cores and archives. It does not contain the cores.
- **`packs/<core>-wasm.js`** is the normal build of a core. **`packs/<core>-legacy-wasm.js`** is the legacy build used by browsers without WebGL2.
  Each file is the original core data encoded as text, so it can be fetched like any script. The biggest is about 10 MB, far below GitHub's 100 MB limit.
- Only the core for the game you launch is ever downloaded or read.
- **Keep `emulator.html` and `packs/` together.**

---

## 2. Quick start (local)

1. Download or clone the folder.
2. Open **`emulator.html`** in Chrome or Edge (Firefox usually works too).
3. Drop a ROM on the page, or click **Choose ROM…**. Optionally choose a system, then click **Start**.
   The system is guessed from the file extension when possible (see [section 6](#6-supported-systems-and-file-types)).

Or use the remote control:
1. Open **`controller.html`**, click **Open emulator** (allow the popup).
2. Drop a ROM into the *Game* box, optionally set system/core/BIOS, click **Launch game**.

Tips:
- Click inside the emulator window once if you hear no sound (browser autoplay rules).
- To play another game, launch it from the controller (it reloads the emulator page for you), or just reload the emulator page yourself.
  The emulator runs **one game per page load**.

---

## 3. Hosting on GitHub (raw links)

### Why you can't just open a raw link
`raw.githubusercontent.com` serves every file as `text/plain` and tells the browser not to guess otherwise. If you open the raw link to `emulator.html` you
see its source code, and `<script src="...">` pointing at raw links is refused. Raw links do, however, allow `fetch()` from any website. `loader.js` uses that:
it downloads `emulator.html`, tells it where `packs/` lives, and runs it from a temporary `blob:` page. The emulator then fetches only the core it needs
as text and runs it.

### Step by step
1. Create a repo and add the whole folder (all files are well under 100 MB; Git LFS is **not** needed):
   ```bash
   git init && git add . && git commit -m "offline emulator"
   git branch -M main
   git remote add origin https://github.com/USER/REPO.git
   git push -u origin main
   ```
   (The upload is about 170 MB. If the web uploader complains, use git on the command line, or push in several commits.)
2. Your **base URL** is the folder that contains `emulator.html` and `packs/`, with a trailing slash:
   ```
   https://raw.githubusercontent.com/USER/REPO/main/
   https://raw.githubusercontent.com/USER/REPO/main/emulator/     (if it's in a subfolder)
   ```
3. Check it: open `BASE + "packs/fceumm-wasm.js"` in a browser. You should see a long line of text starting with `(window.__VFP=`.
4. Use it from your own page ([section 4](#4-controlling-the-emulator-from-your-own-pages)) or from `controller.html` ([section 5](#5-using-controllerhtml)).

### What to expect
- First launch of a system downloads that core only (about 1–5 MB typical, up to about 10 MB).
- Raw files are cached by GitHub for a few minutes after a push, and GitHub may rate-limit heavy use.
- Popups must be allowed, or use `container` (embedded iframe) mode.
- Your own page must be able to `fetch()` raw links. Normal websites can. Pages opened from `file://` in Chrome can too.
- If you later change the files, hard-refresh your page; the emulator also keeps a browser-side core cache (see [section 9](#9-what-gets-stored-in-the-browser)).

---

## 4. Controlling the emulator from your own pages

There are two parts: **getting the emulator open**, and **sending it messages**.

### 4.1 Opening it

**A. With `loader.js` (works for raw links and everything else)**

```html
<script src="loader.js"></script>
<div id="box" style="width:960px;height:720px"></div>
<input type="file" id="rom">
<!-- If you create your own iframe instead of using loader.js, give it: allow="autoplay; fullscreen; gamepad" -->

<script type="module">
  const BASE = "https://raw.githubusercontent.com/USER/REPO/main/";

  const emu = await WafflesEmu.open(BASE, { container: document.getElementById("box") });
  const hello = await emu.ready;          // { systems:[...], cores:[...], running:false }
  emu.on(m => console.log("emulator says:", m));

  document.getElementById("rom").onchange = e =>
    emu.load(e.target.files[0], { system: "snes" });   // system/core/bios are all optional
</script>
```

`WafflesEmu.open(base, options)`:

| Option | Meaning |
|---|---|
| `container` | A DOM element. If given, the emulator is embedded as an iframe in it. If omitted, a popup window opens (call it from a click). |
| `name` | Popup window name (default `wi_emulator`). |
| `features` | Popup window features string (default `width=980,height=760`). |

It returns an object:

| Member | Meaning |
|---|---|
| `ready` | Promise that resolves with the `hello` message once the emulator page is up. |
| `on(fn)` | Register a listener for every message from the emulator. |
| `send(cmd, fields, transferList)` | Send a command (see 4.2). |
| `load(file, extra)` | Read a `File`/`Blob`, send it as `load` with `name` filled in. `extra` can contain `system`, `core`, `bios`. |
| `win`, `frame` | The emulator's window, and the iframe (if embedded). |

`WafflesEmu.prepare(base)` just returns the patched emulator HTML text, if you want to build the page yourself.

**B. Local files / normal static hosting (no loader needed)**

```js
const w = window.open("emulator.html", "emu");          // or <iframe src="emulator.html">
```
`packs/` sits next to `emulator.html`, so cores load automatically. To use a different location for the packs, define
`window.WI_PACK_BASE = "https://…/packs/"` before the emulator runs.

### 4.2 Messages

Everything is a plain `postMessage` object marked `wi: 1`. Wait for the emulator's **`hello`** (or send `ping`) before anything else.

```js
win.postMessage({ wi: 1, cmd: "pause" }, "*");
```

#### Commands (your page to the emulator)

| `cmd` | Fields | What it does |
|---|---|---|
| `ping` | | Emulator answers with `hello`. |
| `load` | `data`, `name`, `system?`, `core?`, `bios?` | Starts a game. `data` = ArrayBuffer, Uint8Array, Blob or File. `name` = file name **with extension** (used for auto-detect and save names). `system` = key from section 6. `core` = exact core name from section 7 (overrides the default). `bios` = optional ArrayBuffer/Blob. |
| `reload` | | Reloads the emulator page (the only way to switch games). It sends `hello` again. |
| `pause` / `play` | | Pause or resume. |
| `reset` | | Restart the game. |
| `volume` | `value` 0 to 1 | Master volume. |
| `fullscreen` | `on` | Toggle fullscreen. Browsers may require a click inside the emulator window. |
| `ff` | `on`, `ratio` | Fast-forward on/off with a speed multiplier. |
| `input` | `player` 0–3, `index`, `value` 1 or 0 | Press (1) or release (0) a button. Indexes below. |
| `cheat` | `index`, `on`, `code` | Enable or disable a cheat code. |
| `saveState` | | Emulator replies with `state` (bytes). |
| `loadState` | `data` | Load a state previously returned by `saveState`. |
| `saveFile` | | Replies with `savefile` (the battery/SRAM save), or `error` if none exists yet. |
| `loadFile` | `data` | Write a battery save into the running game. |
| `screenshot` | | Replies with `screenshot` (PNG bytes). |

**Button indexes for `input`:**
`B 0` · `Y 1` · `Select 2` · `Start 3` · `Up 4` · `Down 5` · `Left 6` · `Right 7` · `A 8` · `X 9` · `L 10` · `R 11` · `L2 12` · `R2 13` · `L3 14` · `R3 15`

#### Events (emulator to your page)

| `evt` | Fields | Meaning |
|---|---|---|
| `hello` | `systems`, `cores`, `running` | Emulator page is ready. Lists what this build contains. |
| `loading` | `name`, `system` | A game is being loaded. |
| `started` | `name`, `system` | The game is running. |
| `paused` / `playing` | | Result of `pause` / `play`. |
| `exit` | | The game exited. |
| `error` | `msg` | Something failed (unknown system, no save file, a download problem...). |
| `state` | `data`, `name` | Result of `saveState`. |
| `savefile` | `data`, `name` | Result of `saveFile`. |
| `screenshot` | `data`, `format`, `name` | Result of `screenshot`. |

Replies go to the window that messaged the emulator most recently, plus its opener and parent.

#### Recipes

```js
// Load a ROM and a BIOS, forcing a particular core
emu.load(romFile, { core: "pcsx_rearmed", bios: await biosFile.arrayBuffer() });

// Tap A for a fifth of a second
emu.send("input", { player: 0, index: 8, value: 1 });
setTimeout(() => emu.send("input", { player: 0, index: 8, value: 0 }), 200);

// Save a state and download it
emu.on(m => { if (m.evt === "state") download(new Blob([m.data]), "my.state"); });
emu.send("saveState");

// Restore it later
emu.send("loadState", { data: await stateFile.arrayBuffer() });

// Switch games
emu.send("reload");
emu.on(async m => { if (m.evt === "hello") emu.load(otherRom); });
```

Large disc images: `loader.js` already passes the ROM in the transfer list, so it isn't copied. With raw `postMessage`, add the buffer to the third argument.

---

## 5. Using controller.html

`controller.html` is a ready-made remote that talks to the emulator with the messages above. It works as a template for your own pages.

| Area | What it does |
|---|---|
| **Emulator window** | Path box (default `emulator.html`; or a raw folder URL such as `https://raw.githubusercontent.com/USER/REPO/main/`) and **Open emulator**. A dot shows red = not connected, green = connected, orange = game running. |
| **Game** | Drop or choose a ROM. Dropdowns: **system** (auto-detect by default) and **core** (default core by default). **BIOS** is optional. **Launch game** sends it (reloading the emulator first if a game is already running). |
| **Controls** | Pause/Resume, Reset, Save state (downloads a `.state` file and keeps the last one for **Load state**; right-click **Load state** to choose a file), Screenshot (PNG), Download save (`.sav`), Load save, Fullscreen, Volume, Fast-forward with a speed selector. |
| **Virtual gamepad** | On-screen D-pad, A/B/X/Y, L/R, Start, Select, with a **Player 1–4** selector. Tick **Send my keyboard from this window** to use the keyboard: arrows, Z/X/A/S = B/A/Y/X, Q/W = L/R, Enter = Start, Shift = Select. |
| **Log** | Shows errors and loading messages. |

---

## 6. Supported systems and file types

The **system key** is what you pass as `system`. If you omit it the emulator guesses from the extension. Extensions that don't identify a system
(`.zip`, `.bin`, `.iso`, `.img`) need you to choose it.

| System key | System | Default core | Other cores for it | Auto-detected extensions |
|---|---|---|---|---|
| `atari5200` | Atari 5200 | `a5200` | — | .a52 |
| `vb` | Virtual Boy | `beetle_vb` | — | .vb, .vboy |
| `nds` | Nintendo DS | `melonds` | `desmume`, `desmume2015` | .nds |
| `arcade` | Arcade (FinalBurn Neo) | `fbneo` | `fbalpha2012_cps1`, `fbalpha2012_cps2`, `same_cdi` | pick system manually |
| `nes` | NES / Famicom | `fceumm` | `nestopia` | .nes, .fds, .unf, .unif |
| `gb` | Game Boy / Color | `gambatte` | — | .gb, .gbc, .sgb |
| `coleco` | ColecoVision | `gearcoleco` | — | .col |
| `segaMS` | Sega Master System | `smsplus` | `genesis_plus_gx`, `genesis_plus_gx_wide`, `picodrive` | .sms |
| `segaMD` | Sega Genesis / Mega Drive | `genesis_plus_gx` | `genesis_plus_gx_wide`, `picodrive` | .md, .gen, .smd |
| `segaGG` | Sega Game Gear | `genesis_plus_gx` | `genesis_plus_gx_wide` | .gg |
| `segaCD` | Sega CD | `genesis_plus_gx` | `genesis_plus_gx_wide`, `picodrive` | pick system manually |
| `sega32x` | Sega 32X | `picodrive` | — | .32x |
| `lynx` | Atari Lynx | `handy` | — | .lnx |
| `mame` | Arcade (MAME 2003+) | `mame2003_plus` | `mame2003` | pick system manually |
| `ngp` | Neo Geo Pocket | `mednafen_ngp` | — | .ngp, .ngc |
| `pce` | PC Engine / TurboGrafx | `mednafen_pce` | — | .pce, .sgx |
| `pcfx` | PC-FX | `mednafen_pcfx` | — | pick system manually |
| `psx` | PlayStation | `pcsx_rearmed` | `mednafen_psx_hw` | .pbp, .chd, .cue, .m3u, .ccd |
| `ws` | WonderSwan | `mednafen_wswan` | — | .ws, .wsc |
| `gba` | Game Boy Advance | `mgba` | — | .gba |
| `n64` | Nintendo 64 | `mupen64plus_next` | `parallel_n64` | .n64, .z64, .v64 |
| `3do` | 3DO | `opera` | — | pick system manually |
| `atari7800` | Atari 7800 | `prosystem` | — | .a78 |
| `snes` | Super Nintendo | `snes9x` | `bsnes` | .smc, .sfc, .fig, .swc |
| `atari2600` | Atari 2600 | `stella2014` | — | .a26 |
| `jaguar` | Atari Jaguar | `virtualjaguar` | — | .j64, .jag |
| `segaSaturn` | Sega Saturn | `yabause` | — | pick system manually |
| `amiga` | Amiga | `puae` | — | .adf, .adz, .dms, .ipf, .lha, .hdf |
| `c64` | Commodore 64 | `vice_x64sc` | — | .d64, .t64, .prg, .crt, .tap, .d71 |
| `c128` | Commodore 128 | `vice_x128` | — | pick system manually |
| `pet` | Commodore PET | `vice_xpet` | — | pick system manually |
| `plus4` | Commodore Plus/4 | `vice_xplus4` | — | pick system manually |
| `vic20` | Commodore VIC-20 | `vice_xvic` | — | pick system manually |
| `intv` | Intellivision | `freeintv` | — | .int |

Disc systems (Sega CD, Saturn, 3DO, PC-FX) usually use `.cue/.bin/.iso/.chd`, so pick the system manually.
Arcade systems must keep ROMs as `.zip` (the emulator does not unzip them). Other systems unzip automatically.

---

## 7. All 49 cores

Sizes are the download size of each file. The normal build is used by default. The legacy build is used automatically on browsers without WebGL2.

| Core name | Emulates | Normal build | Legacy build |
|---|---|---|---|
| `81` | Sinclair ZX81 | 1.0 MB | 1.0 MB |
| `a5200` | Atari 5200 | 1.0 MB | 1.0 MB |
| `beetle_vb` | Virtual Boy | 1.0 MB | 1.0 MB |
| `bsnes` | SNES (accuracy-focused, heavy) | 1.3 MB | 1.3 MB |
| `cap32` | Amstrad CPC | 1.2 MB | 1.2 MB |
| `crocods` | Amstrad CPC | 1.1 MB | 1.1 MB |
| `desmume` | Nintendo DS | 1.3 MB | 1.3 MB |
| `desmume2015` | Nintendo DS (older, lighter) | 1.1 MB | 1.1 MB |
| `fbalpha2012_cps1` | Capcom CPS-1 arcade | 1.1 MB | 1.1 MB |
| `fbalpha2012_cps2` | Capcom CPS-2 arcade | 1.1 MB | 1.1 MB |
| `fbneo` | FinalBurn Neo arcade (Neo Geo, CPS, etc.) | 10.2 MB | 10.2 MB |
| `fceumm` | NES / Famicom / FDS | 1.2 MB | 1.2 MB |
| `freeintv` | Intellivision | 1.5 MB | 1.5 MB |
| `fuse` | ZX Spectrum | 1.4 MB | 1.4 MB |
| `gambatte` | Game Boy / Game Boy Color | 1.1 MB | 1.1 MB |
| `gearcoleco` | ColecoVision | 1.0 MB | 1.0 MB |
| `genesis_plus_gx` | Genesis, Master System, Game Gear, Sega CD | 1.4 MB | 1.4 MB |
| `genesis_plus_gx_wide` | Genesis, widescreen variant | 1.3 MB | 1.3 MB |
| `handy` | Atari Lynx | 1.0 MB | 1.0 MB |
| `mame2003` | Arcade (MAME 2003) | 5.9 MB | 6.0 MB |
| `mame2003_plus` | Arcade (MAME 2003-Plus) | 6.4 MB | 6.4 MB |
| `mednafen_ngp` | Neo Geo Pocket / Color | 1.0 MB | 1.0 MB |
| `mednafen_pce` | PC Engine / TurboGrafx-16 | 1.1 MB | 1.1 MB |
| `mednafen_pcfx` | PC-FX | 1.1 MB | 1.1 MB |
| `mednafen_psx_hw` | PlayStation (hardware-rendered) | 1.3 MB | 1.3 MB |
| `mednafen_wswan` | WonderSwan / Color | 1.0 MB | 1.0 MB |
| `melonds` | Nintendo DS | 1.4 MB | 1.4 MB |
| `mgba` | Game Boy Advance (also GB/GBC) | 1.2 MB | 1.2 MB |
| `mupen64plus_next` | Nintendo 64 | 2.0 MB | 2.0 MB |
| `nestopia` | NES / Famicom (accuracy-focused) | 1.4 MB | 1.4 MB |
| `opera` | 3DO | 1.0 MB | 0.9 MB |
| `parallel_n64` | Nintendo 64 (alternate) | 1.2 MB | 1.2 MB |
| `pcsx_rearmed` | PlayStation | 1.2 MB | 1.2 MB |
| `picodrive` | Sega 32X, Genesis, Master System | 1.2 MB | 1.2 MB |
| `prboom` | Doom engine | 1.2 MB | 1.2 MB |
| `prosystem` | Atari 7800 | 1.0 MB | 1.0 MB |
| `puae` | Amiga | 4.6 MB | 4.6 MB |
| `same_cdi` | Philips CD-i | 3.4 MB | 3.4 MB |
| `smsplus` | Master System / Game Gear | 1.0 MB | 1.0 MB |
| `snes9x` | Super Nintendo | 1.2 MB | 1.2 MB |
| `stella2014` | Atari 2600 | 1.2 MB | 1.2 MB |
| `vice_x128` | Commodore 128 | 1.7 MB | 1.7 MB |
| `vice_x64` | Commodore 64 | 1.6 MB | 1.6 MB |
| `vice_x64sc` | Commodore 64 (cycle-accurate) | 1.6 MB | 1.6 MB |
| `vice_xpet` | Commodore PET | 1.5 MB | 1.5 MB |
| `vice_xplus4` | Commodore Plus/4 | 1.6 MB | 1.6 MB |
| `vice_xvic` | Commodore VIC-20 | 1.5 MB | 1.5 MB |
| `virtualjaguar` | Atari Jaguar | 1.1 MB | 1.1 MB |
| `yabause` | Sega Saturn | 1.1 MB | 1.1 MB |

### Choosing a specific core
- **In code:** `{ cmd:"load", name, data, core:"nestopia" }` or `emu.load(file, { core: "bsnes" })`.
- **In `controller.html`:** the *Default core* dropdown (filled from the emulator's `hello` message).
- **In the emulator's own menu:** systems with alternates offer a core option.

`core` overrides `system`. If you set a core, you rarely need the system as well.

### Cores EmulatorJS doesn't link to any system
`81`, `cap32`, `crocods`, `fuse`, `prboom` and `vice_x64` are in your data folder but EmulatorJS 4.2.3 doesn't map any system to them. They can be forced
with `core`. I haven't tested them, and some EmulatorJS options may not apply.

### Not included
**PSP (`ppsspp`), 3DS (`azahar`) and DOS (`dosbox_pure`)** need multi-threading (`SharedArrayBuffer`), which browsers only allow on pages served
with special security headers. That is not possible for local files or raw GitHub links. If a threaded core is requested, the emulator falls back to the
normal one when it exists.

---

## 8. BIOS files and ROMs

- **No ROMs or BIOS files are included.** Bring your own legally obtained ones.
- Many disc and computer systems need or work better with a BIOS: commonly Sega CD, Saturn, 3DO, PC-FX, Amiga, Atari 5200/7800, and sometimes PlayStation.
  Supply it via the controller's **BIOS (optional)** button or the `bios` field. Which file and name each core expects depends on the core.
- Zipped ROMs are unzipped automatically except for arcade systems (`arcade`, `mame`, and the arcade cores), which need the original zip.
- Arcade zips must match the version the core expects: try `fbneo`, then `mame2003_plus` if a game doesn't start.

---

## 9. What gets stored in the browser

- **localStorage: not used.** It is disabled in the emulator and replaced by a temporary in-memory stand-in, so menu settings and custom key bindings are not remembered
  between sessions.
- **IndexedDB: used when the browser allows it** for (1) a cache of decompressed cores, which makes relaunching a system faster, and (2) save files and states created through the emulator's own menu.
  At startup the emulator probes IndexedDB. If it is blocked, which happens inside a `blob:` page created by a launcher that was itself opened from a local `file://`
  (the page's origin is "null"), it **automatically runs without the cache and in-menu save storage** instead of failing. In that mode cores are downloaded each launch.
  You can also force this with `window.WI_DISABLE_DB = true` before the emulator starts. The `loading` event reports `db: true/false`.
  Saves and states made through `saveState` / `saveFile` messages come to your page as bytes, and your page decides where to keep them.
- To clear everything the emulator stored, clear the site data for the page that hosts it (for blob/iframe mode, that is the site of your own page).

---

## 10. How the offline part works

1. `emulator.html` replaces `window.fetch` with a guard. It serves the emulator's own files (cores, report files, unpacking helpers) from bundled data, lets
   `blob:`/`data:` URLs through (your ROM), and answers everything else, including EmulatorJS's CDN and update checks, with a 404. Nothing leaves the page.
2. A core is requested under a made-up address. The guard maps it to the right file in `packs/`, loads that file (by `<script>` locally, by `fetch()` for
   raw links), decodes it, and hands the bytes to EmulatorJS exactly as if it came from a server.
3. The core is then unpacked and started by EmulatorJS as usual.

---

## 11. Security notes

- The emulator accepts `wi` messages from **any** window and replies to the sender. A hostile page that gets a reference to the emulator window could send it
  commands. Messages can control the emulator only (play, pause, load a ROM, send inputs). They can't run arbitrary code.
- If you embed it on a sensitive site, check `event.origin`/`event.source` in your own listener, and consider restricting the emulator's listener the same way.
- The emulator never sends your ROMs or saves anywhere on its own.

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Raw link shows source code instead of the emulator | Expected. Use `loader.js` ([section 3](#3-hosting-on-github-raw-links)). |
| "Popup blocked" | Allow popups, or use `container` mode. |
| "Can't tell which system … is for" | Extension is ambiguous. Send/choose `system` (or `core`). |
| "System not included in this build" | Typo in the key, or a threaded system (PSP, 3DS, DOS). |
| Core fails to download / 404 | `packs/` missing or not next to `emulator.html`; wrong base URL (needs the trailing slash and the folder that contains `emulator.html`). |
| Works locally, not from raw links | Open `BASE + "packs/fceumm-wasm.js"` in a browser to confirm the file exists; check the repo branch name in the URL. |
| `HTTP 404 for …/packs/snes9x-legacy-wasm.js` (or any `<core>-wasm.js`) | Your repo doesn't have the per-core files. This happens if `packs/` still holds the older `pack-1.js` … `pack-5.js` files, or a mix of old and new. Delete everything in `packs/` and upload all 98 `<core>-wasm.js` / `<core>-legacy-wasm.js` files, together with the matching `emulator.html` (they must come from the same build). Check by opening `BASE + "packs/snes9x-legacy-wasm.js"` in a browser. |
| IndexedDB / cache error inside a `blob:` page | Handled automatically in the latest `emulator.html` (see [section 9](#9-what-gets-stored-in-the-browser)). If you still see it, you are using an older `emulator.html`. |
| Black screen with a disc game | Needs a BIOS, or try another core. |
| No sound | Click inside the emulator window once. |
| `getGamepads … disallowed by permissions policy` | Your page embedded the emulator in an iframe without the gamepad permission. The emulator now ignores this error and runs without gamepad support. To enable gamepads, add `allow="autoplay; fullscreen; gamepad"` to your iframe (`loader.js` already does). |
| Settings don't stick | By design; localStorage is disabled ([section 9](#9-what-gets-stored-in-the-browser)). |
| Arcade game won't start | Wrong ROM set version for that core. Try another arcade core. |
| Pushed changes don't show | Raw links are cached for a few minutes; hard-refresh. |
| A game won't switch | One game per page load: send `reload`, wait for `hello`, then `load`. |

---

## 13. FAQ

**Can I use it without GitHub?** Yes. Any folder works: local files, a USB stick, a web server. Keep `emulator.html` and `packs/` together.

**Do I need the internet?** Not when run locally. For raw links, your page needs to fetch the emulator and the one core you launch from GitHub.

**Why is there a legacy build of every core?** Some browsers lack WebGL2. The emulator asks for the legacy build in that case.

**Why one file per core?** So a raw-link user downloads 1–10 MB per game instead of hundreds of MB, and every file stays far below GitHub's size limit.

**Can I add more cores?** Rebuild with `build.py` from a data folder that contains them ([section 14](#14-rebuilding-from-the-original-data-folder)).

**Does it support gamepads?** The emulator's own menu has gamepad mapping (browser Gamepad API); remote input can be sent with `input` messages.

---

## 14. Rebuilding from the original data folder

```bash
python3 build-tools/build.py PATH/TO/data --out dist
```

| Option | Meaning |
|---|---|
| `--profile full` (default) | All 49 non-threaded cores. |
| `--profile standard` | One core per system. |
| `--profile lite` | Popular consoles only. |
| `--packsize 0` (default) | One file per core build (best for raw links). A number such as `40` groups cores into files up to that many MB. |
| `--out DIR` | Output folder (default `dist`). |

`build.py` reads `emulator.min.js`, `emulator.min.css`, `src/consts.js`, and the `cores/` and `compression/` folders from `PATH/TO/data`, plus `emulator.tpl.html` and
`controller.html` from `build-tools/`. Copy `loader.js` into the output folder yourself.

---

## 15. Legal

- No ROMs or BIOS files are included. Use only games you have the right to use.
- EmulatorJS is licensed under GPL-3.0, and each core has its own license (mostly GPL/LGPL-style, some restricting commercial use). If you publish this, keep the license and notice
  files from the original `data/` folder and check each core's terms, especially if you charge money.
