# Using the emulator from your own files

## A) Straight from raw GitHub links (recommended)
raw.githubusercontent.com serves everything as text/plain, so a browser will not render emulator.html
or run `<script src>` from it. `loader.js` works around that: it fetches the files as text (raw links allow
fetch from any site) and runs the emulator from a blob page.

```html
<script src="loader.js"></script>   <!-- copy loader.js next to your page, or paste it in -->
<div id="box" style="width:960px;height:720px"></div>
<script>
const BASE = "https://raw.githubusercontent.com/USER/REPO/main/";   // folder containing emulator.html + packs/
const emu = await WafflesEmu.open(BASE, {container: document.getElementById("box")});  // or omit container for a popup (call from a click)
await emu.ready;
await emu.load(romFile);                 // File/Blob; optional {system:"snes", core:"snes9x", bios:ArrayBuffer}
emu.on(m => console.log(m));
emu.send("pause");
</script>
```
Only the core you launch is downloaded (1-10 MB, one small file per core in `packs/`).
`controller.html` also accepts a raw folder URL in its path box.

## B) Local files / any static host
Keep emulator.html and packs/ together; `window.open("emulator.html")` or an iframe works directly.

## Messages
Plain `postMessage`, shaped `{wi:1, cmd:"...", ...}`, accepted from any window. Replies (`{wi:1, evt:"..."}`)
go to the last window that messaged it plus its opener/parent. Wait for `hello` (or send `ping`).

| cmd | fields | notes |
|---|---|---|
| ping | | replies `hello` |
| load | `data` (ArrayBuffer/Uint8Array/Blob/File), `name`, `system?`, `core?`, `bios?` | one game per page load; send `reload` to swap |
| reload | | reloads the emulator; it sends `hello` again |
| pause / play / reset | | |
| volume | `value` 0..1 | |
| fullscreen | `on` | may need a click in the emulator window |
| ff | `on`, `ratio` | fast-forward |
| input | `player` 0-3, `index`, `value` 1/0 | B0 Y1 Select2 Start3 Up4 Down5 Left6 Right7 A8 X9 L10 R11 L2 12 R2 13 L3 14 R3 15 |
| cheat | `index`, `on`, `code` | |
| saveState / loadState | `data` for loadState | replies `state` |
| saveFile / loadFile | `data` for loadFile | battery save; replies `savefile` |
| screenshot | | replies `screenshot` (PNG bytes) |

Events: `hello {systems,cores,running}`, `loading`, `started`, `paused`, `playing`, `exit`, `error {msg}`, `state`, `savefile`, `screenshot`.
