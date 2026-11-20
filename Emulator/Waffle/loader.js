/* WafflesEmu loader — lets ANY page run the emulator straight from raw.githubusercontent.com links.
   raw.githubusercontent.com refuses to render HTML / run <script src>, so this fetches the files as text instead.

   const emu = await WafflesEmu.open("https://raw.githubusercontent.com/USER/REPO/main/", {container: someDiv});
   //  or popup:  await WafflesEmu.open(base)   (call from a click handler)
   await emu.ready;                       // emulator said "hello"
   await emu.load(romFile);               // File/Blob; optional 2nd arg {system:"snes", core:"snes9x", bios:ArrayBuffer}
   emu.on(m => console.log(m));           // events: started, state, screenshot, error ...
   emu.send("pause"); emu.send("input",{player:0,index:8,value:1});   // see PROTOCOL.md
*/
(function (g) {
  const norm = b => b.replace(/emulator\.html.*$/, "").replace(/\/?$/, "/");
  async function prepare(base) {
    base = norm(base);
    const r = await fetch(base + "emulator.html");
    if (!r.ok) throw new Error("HTTP " + r.status + " fetching emulator.html");
    const html = await r.text();
    return html.replace("<head>", "<head><script>window.WI_PACK_BASE=" + JSON.stringify(base + "packs/") + "<\/script>");
  }
  async function open(base, opts = {}) {
    let win, frame;
    if (!opts.container) {                              // open popup synchronously (keeps the click's permission)
      win = g.open("about:blank", opts.name || "wi_emulator", opts.features || "width=980,height=760");
      if (!win) throw new Error("Popup blocked");
    }
    const html = await prepare(base);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (opts.container) {
      frame = document.createElement("iframe");
      frame.allow = "autoplay; fullscreen; gamepad";
      frame.style.cssText = "border:0;width:100%;height:100%";
      frame.src = url; opts.container.appendChild(frame); win = frame.contentWindow;
    } else win.location.href = url;
    const listeners = []; let ready; const readyP = new Promise(r => (ready = r));
    g.addEventListener("message", e => {
      const m = e.data; if (!m || m.wi !== 1 || e.source !== win) return;
      if (m.evt === "hello") ready(m);
      listeners.forEach(f => f(m));
    });
    const post = (o, tr) => win.postMessage(Object.assign({ wi: 1 }, o), "*", tr || []);
    return {
      win, frame, ready: readyP, on: f => listeners.push(f),
      send: (cmd, extra, tr) => post(Object.assign({ cmd }, extra), tr),
      load: async (file, o = {}) => { const data = await file.arrayBuffer(); post(Object.assign({ cmd: "load", name: file.name, data }, o), [data]); },
    };
  }
  g.WafflesEmu = { open, prepare };
})(window);
