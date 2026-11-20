# Talking to emulator.html from your own files

emulator.html listens for `window.postMessage` messages shaped `{wi:1, cmd:"...", ...}` from ANY window
(opener, parent iframe, or a window you opened). Replies go to the window that last messaged it
(and to its opener/parent) as `{wi:1, evt:"...", ...}`.

Open it from your page:   `const w = window.open("emulator.html","emu");`
or embed it:              `<iframe src="emulator.html" allow="autoplay; fullscreen">`
Wait for `{evt:"hello"}` (or send `{cmd:"ping"}`) before sending commands.

## Commands (you -> emulator)
| cmd | fields | notes |
|---|---|---|
| ping | | replies `hello` |
| load | `data` (ArrayBuffer/Uint8Array/Blob/File), `name` (file name w/ extension), `system?`, `core?`, `bios?` | `core` forces e.g. `"nestopia"`; `system` e.g. `"snes"`; both optional if extension is recognisable. Only one game per page load - send `reload` first to swap games |
| reload | | reloads the emulator page; it sends `hello` again |
| pause / play / reset | | |
| volume | `value` 0..1 | |
| fullscreen | `on` | browsers may require a click inside the emulator window |
| ff | `on`, `ratio` | fast-forward |
| input | `player` 0-3, `index`, `value` 1/0 | libretro joypad index: B0 Y1 Select2 Start3 Up4 Down5 Left6 Right7 A8 X9 L10 R11 L2 12 R2 13 L3 14 R3 15 |
| cheat | `index`, `on`, `code` | |
| saveState | | replies `state` |
| loadState | `data` | |
| saveFile / loadFile | `data` for loadFile | battery save (.sav); replies `savefile` |
| screenshot | | replies `screenshot` (PNG bytes) |

## Events (emulator -> you)
`hello {systems, cores, running}`, `loading {name,system}`, `started`, `paused`, `playing`, `exit`,
`error {msg}`, `state {data,name}`, `savefile {data,name}`, `screenshot {data,format,name}`.

## Hosting notes (GitHub)
- Keep `emulator.html` and the `packs/` folder together. `packs/pack-*.js` are loaded on demand.
- Clone/download the repo and open the files locally, or serve them with GitHub Pages / any static host.
- raw.githubusercontent.com will NOT work: it serves files as text/plain and browsers refuse to run them.
