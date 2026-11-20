# WafflesIsolationism — offline EmulatorJS

A fully self-contained build of EmulatorJS 4.2.3. The emulator has no dependency on the internet: no CDN, no update checks, no
analytics. Every core (the actual emulator engine for each console) is stored in this folder as a small `.js` file.

> **Status:** the scripts parse cleanly, and I verified that all 98 core files load correctly and byte-for-byte match your original
> data folder, including when served as `text/plain` the way raw.githubusercontent.com does. It has **not** been run in a real
> browser with a real game yet, so treat the first launch as a test and report anything odd.

---

## 1. What's in this folder

| Path | What it is |
|---|---|
| `emulator.html` | The emulator (about 1.5 MB). Runs standalone or is driven by other pages. |
| `packs/` | 98 files, one per core build (`<core>-wasm.js` and `<core>-legacy-wasm.js`). Largest is about 10 MB. |
| `loader.js` | Small helper so *any* page can run the emulator from raw.githubusercontent.com links. |
| `controller.html` | Example remote control: load ROMs, save states, gamepad, etc. |
| `PROTOCOL.md` | Every message your own pages can send to / receive from the emulator. |
| `build-tools/` | `build.py` + template to rebuild everything from the original `data/` folder. |

**Keep `emulator.html` and `packs/` together.** Cores are only fetched from `packs/` when a game needs them.

---

## 2. Quick start (local, no internet)

1. Download or clone the whole folder.
2. Open `emulator.html` in Chrome or Edge. Drop a ROM onto it (or click *Choose ROM…*), optionally pick the system, press **Start**.
   The system is auto-detected from the file extension where possible (see the table in section 5).
3. Or open `controller.html`, click **Open emulator**, drop a ROM in the *Game* box and press **Launch game**.

Notes:
- ROM files are **not included**. Bring your own legally obtained games.
- Some systems need BIOS files (typically Sega CD, Saturn, 3DO, PC-FX, Amiga, Atari 5200/7800, sometimes PlayStation). The controller has a
  *BIOS (optional)* button; your own pages can pass `bios`.
- Audio can stay silent until you click inside the emulator window (browser autoplay rules).
- Zipped ROMs: arcade systems keep the zip intact (required); for other systems the zip is unpacked automatically.

---

## 3. Using it from GitHub (raw links)

### Why you can't just open the raw link
`raw.githubusercontent.com` serves every file as `text/plain` with `nosniff`. A browser will show `emulator.html` as source code and will refuse
to run `<script src>` files from there. Raw links **do** allow other pages to `fetch()` them, so `loader.js` downloads the emulator as text and runs
it from a temporary page.

### Upload
Put the whole folder in a repo (all files are far below GitHub's 100 MB per-file limit; total about 164 MB; no Git LFS needed).
Your base URL is the folder containing `emulator.html` and `packs/`, with a trailing slash:

```
https://raw.githubusercontent.com/USER/REPO/BRANCH/
https://raw.githubusercontent.com/USER/REPO/BRANCH/some/subfolder/     (if you put it in a subfolder)
```

### From your own page
Copy `loader.js` next to your page (it's tiny) or paste it in, then:

```html
<script src="loader.js"></script>
<div id="box" style="width:960px;height:720px"></div>

<script type="module">
  const BASE = "https://raw.githubusercontent.com/USER/REPO/main/";

  // Embedded in a box on your page:
  const emu = await WafflesEmu.open(BASE, { container: document.getElementById("box") });
  // ...or as a popup (call this from a click handler so it isn't blocked):
  // const emu = await WafflesEmu.open(BASE);

  await emu.ready;                           // emulator says hello
  emu.on(m => console.log("emulator:", m));  // started, error, state, screenshot, ...

  // Load a ROM chosen by the user (File or Blob):
  document.querySelector("input[type=file]").onchange = e =>
    emu.load(e.target.files[0], { /* system: "snes", core: "snes9x", bios: arrayBuffer */ });

  // Control it:
  emu.send("pause"); emu.send("play"); emu.send("reset");
  emu.send("volume", { value: 0.5 });
  emu.send("input", { player: 0, index: 8, value: 1 });   // press A (send value:0 to release)
  emu.send("saveState");                                  // replies {evt:"state", data}
</script>
```

### From `controller.html`
Open `controller.html` anywhere (locally or hosted), paste your base URL into the box next to **Open emulator**
(e.g. `https://raw.githubusercontent.com/USER/REPO/main/`) and click the button.

### What to expect from raw links
- Only the core you launch is downloaded (usually 1–5 MB, up to about 10 MB). The emulator keeps decompressed cores in browser storage, so launching the same
  system again should be fast. I couldn't verify browser-storage behaviour from the temporary page.
- GitHub caches raw files for a few minutes after you push changes, and may rate-limit heavy traffic.
- Popups must be allowed, or use the `container` (iframe) mode.
- Your *own* page must be served from somewhere that allows `fetch()` of raw links (any normal website, or `file://` pages in Chrome).

---

## 4. Using it from local files or any static host
`window.open("emulator.html")` or `<iframe src="emulator.html">` works directly because `packs/` sits next to it. Then talk to it with `postMessage`
exactly as in `PROTOCOL.md`. (To run from another location, set `window.WI_PACK_BASE = "https://…/packs/"` before the emulator script runs;
`loader.js` does this for you.)

---

## 5. Supported systems, default cores and file types

The **system key** is what you pass as `system`. If you omit it, the emulator guesses from the file extension. Where a system lists no extension
(`.zip`, `.bin`, `.iso` are ambiguous), choose the system yourself.

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

(Sega CD, Sega Saturn, 3DO, PC-FX, Neo Geo and similar disc systems are usually `.cue/.bin/.iso/.chd` files, so pick the system manually.)

---

## 6. Every included core (49)

Each core exists twice in `packs/`:
- `<core>-wasm.js` — the normal build (used by default).
- `<core>-legacy-wasm.js` — the legacy build for browsers without WebGL2. The emulator picks it automatically when needed.

```
81  a5200  beetle_vb  bsnes  cap32  crocods  desmume  desmume2015  fbalpha2012_cps1  fbalpha2012_cps2
fbneo  fceumm  freeintv  fuse  gambatte  gearcoleco  genesis_plus_gx  genesis_plus_gx_wide  handy
mame2003  mame2003_plus  mednafen_ngp  mednafen_pce  mednafen_pcfx  mednafen_psx_hw  mednafen_wswan
melonds  mgba  mupen64plus_next  nestopia  opera  parallel_n64  pcsx_rearmed  picodrive  prboom
prosystem  puae  same_cdi  smsplus  snes9x  stella2014  vice_x128  vice_x64  vice_x64sc  vice_xpet
vice_xplus4  vice_xvic  virtualjaguar  yabause
```

### How to choose a specific core
1. **From your code:** pass `core` when loading, e.g. `emu.load(file, { core: "nestopia" })` or `{cmd:"load", name, data, core:"bsnes"}`.
2. **From the controller:** use the *Default core* dropdown next to the system dropdown.
3. **From inside a running game:** EmulatorJS's own menu has a core option for systems with alternates (it only offers cores listed for that system).

Core names are exactly the names in the list above.

### Cores that EmulatorJS doesn't list as a system
`81`, `cap32`, `crocods`, `fuse`, `prboom` and `vice_x64` are in your data folder, but EmulatorJS 4.2.3 doesn't map any system to them (they're for ZX81,
Amstrad CPC, ZX Spectrum, Doom and an extra C64 build). They're included and can be forced with the `core` option, but I haven't tested them and
some EmulatorJS settings may not apply.

### Not included
`ppsspp` (PSP), `azahar` (3DS) and `dosbox_pure` (DOS) need multi-threading (`SharedArrayBuffer`), which browsers only allow on pages served with special
security headers. That's impossible for local files and for raw GitHub links, so they're omitted. If the emulator asks for a threaded core, it falls back
to the normal one if it exists.

---

## 7. Controls and the in-game menu
- Keyboard and gamepad mapping is set in the emulator's own menu (gear/settings icon, *Control Settings*). Settings are saved in the browser.
- The menu also has save/load state, cheats, shaders, screen recording and so on.
- `controller.html` can send input remotely: a virtual gamepad, plus *Send my keyboard from this window*
  (Arrows, Z/X/A/S for B/A/Y/X, Q/W for L/R, Enter for Start, Shift for Select).
- Button numbers for `input`: B 0, Y 1, Select 2, Start 3, Up 4, Down 5, Left 6, Right 7, A 8, X 9, L 10, R 11, L2 12, R2 13, L3 14, R3 15.

---

## 8. Messaging API (short version)

Messages are plain `postMessage` objects: `{ wi: 1, cmd: "...", ... }`. Replies come back as `{ wi: 1, evt: "...", ... }` to the last window that
messaged the emulator, plus its opener or parent.

Commands: `ping`, `load`, `reload`, `pause`, `play`, `reset`, `volume`, `fullscreen`, `ff`, `input`, `cheat`, `saveState`, `loadState`, `saveFile`, `loadFile`, `screenshot`.
Events: `hello`, `loading`, `started`, `paused`, `playing`, `exit`, `error`, `state`, `savefile`, `screenshot`.

Full field reference: **`PROTOCOL.md`**. Things worth knowing:
- Wait for `hello` before sending anything.
- One game per page load. To switch games, send `reload`, wait for the next `hello`, then `load` again (`controller.html` does this automatically).
- `data` can be an ArrayBuffer, Uint8Array, Blob or File. Pass it in the transfer list to avoid copying large disc images.
- `hello` tells you which `systems` and `cores` this build contains.

---

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Raw link shows source code instead of the emulator | Expected. Use `loader.js` (section 3). |
| "Popup blocked" | Allow popups, or use `container` mode. |
| "Can't tell which system … is for" | Extension is ambiguous. Pass/choose `system`. |
| "System not included in this build" | Typo in the key, or a threaded system (PSP, 3DS, DOS). |
| Core fails to download / 404 | `packs/` is missing or not next to `emulator.html`, or the base URL is wrong (needs trailing slash and the folder that contains `emulator.html`). |
| Black screen with a disc game | Needs a BIOS, or the wrong core. Try another core from section 5. |
| No sound | Click inside the emulator window once. |
| Changes you pushed don't show up | Raw links are cached for a few minutes; hard-refresh and wait. |
| Arcade game won't start | Arcade ROM sets must be the exact zip for that core's version (try `fbneo`, then `mame2003_plus`). |

---

## 10. Rebuilding from the original data folder

```
python3 build-tools/build.py PATH/TO/data --out dist
```
Options:
- `--profile full` (default): all 49 non-threaded cores. `standard`: one core per system. `lite`: popular consoles only.
- `--packsize 0` (default): one file per core, best for raw links. A number like `40` groups cores into packs of up to that many MB.

The build embeds the emulator and its helper scripts in `emulator.html` and writes each core as base64 inside a small `.js` file in `packs/`.

---

## 11. How the offline part works
- `emulator.html` replaces `window.fetch` with a guard. It answers requests for the emulator's own files (cores, decompression helpers) from the
  bundled data, lets `blob:`/`data:` URLs through (your ROM), and answers everything else, including EmulatorJS's CDN and update checks, with a 404.
- Cores are decoded from base64 only when needed.
- Cores load from `packs/` using a script tag (local/static hosting) or `fetch()` (raw links), picked automatically.

---

## 12. Legal
- No ROMs or BIOS files are included. Use only games you own the right to use.
- EmulatorJS is GPL-3.0, and each core has its own license (mostly GPL/LGPL-style, some non-commercial). If you publish this, keep the license and
  notice files from the original `data/` folder and check each core's terms, especially if you charge money.
