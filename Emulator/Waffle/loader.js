(function (g) {
  const RAW_ROOT =
    "https://raw.githubusercontent.com/AMoldyWaffle/Ocarina-of-Time/main/";
  const PAGES_ROOT =
    "https://amoldywaffle.github.io/Ocarina-of-Time/";

  const norm = value =>
    String(value).replace(/emulator\.html.*$/, "").replace(/\/?$/, "/");

  function toPagesBase(base) {
    base = norm(base);

    if (base.startsWith(RAW_ROOT)) {
      return PAGES_ROOT + base.slice(RAW_ROOT.length);
    }

    if (base.startsWith(PAGES_ROOT)) {
      return base;
    }

    throw new Error("Unsupported Waffle emulator base URL: " + base);
  }

  async function prepare(base, opts = {}) {
    base = norm(base);
    const response = await fetch(base + "emulator.html");
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " fetching emulator.html");
    }

    const html = await response.text();
    const dataBase = opts.dataBase ? norm(opts.dataBase) : base;
    const pagesBase = toPagesBase(base);
    const setup =
      '<base href="' + pagesBase + '">' +
      '<script>window.WI_PACK_BASE=' + JSON.stringify(base + "packs/") +
      ';window.WI_DATA_BASE=' + JSON.stringify(dataBase) +
      ';<\\/script>';

    if (/<head\b[^>]*>/i.test(html)) {
      return html.replace(/<head\b[^>]*>/i, match => match + setup);
    }

    return setup + html;
  }

  async function open(base, opts = {}) {
    base = norm(base);
    const pagesBase = toPagesBase(base);
    const dataBase = opts.dataBase ? norm(opts.dataBase) : base;

    let win;
    let frame;

    if (!opts.container) {
      win = g.open(
        "about:blank",
        opts.name || "wi_emulator",
        opts.features || "width=980,height=760"
      );

      if (!win) throw new Error("Popup blocked");
    }

    // IMPORTANT: Do not create a Blob document here. A Blob document
    // inherits the proxy page's origin (news.thoth.wiki), while the
    // Fuze SharedWorker used by the emulator is hosted on
    // amoldywaffle.github.io. The browser rejects that cross-origin worker.
    //
    // hosted.html is a real GitHub Pages document, so the emulator and
    // the worker share https://amoldywaffle.github.io as their origin.
    const hostedURL = new URL("hosted.html", pagesBase);
    hostedURL.searchParams.set("packs", base + "packs/");
    hostedURL.searchParams.set("data", dataBase);

    if (opts.container) {
      frame = document.createElement("iframe");
      frame.allow = "autoplay; fullscreen; gamepad; clipboard-write";
      frame.style.cssText = "border:0;width:100%;height:100%";
      frame.src = hostedURL.href;
      opts.container.appendChild(frame);
      win = frame.contentWindow;
    } else {
      win.location.href = hostedURL.href;
    }

    const listeners = [];
    let ready;
    const readyP = new Promise(resolve => { ready = resolve; });

    g.addEventListener("message", event => {
      const message = event.data;
      if (!message || message.wi !== 1 || event.source !== win) return;
      if (message.evt === "hello") ready(message);
      listeners.forEach(listener => listener(message));
    });

    const post = (object, transfer) =>
      win.postMessage(Object.assign({ wi: 1 }, object), "*", transfer || []);

    return {
      win,
      frame,
      ready: readyP,
      on: listener => listeners.push(listener),
      send: (command, extra, transfer) =>
        post(Object.assign({ cmd: command }, extra), transfer),
      load: async (file, options = {}) => {
        const data = await file.arrayBuffer();
        post(
          Object.assign({ cmd: "load", name: file.name, data }, options),
          [data]
        );
      }
    };
  }

  g.WafflesEmu = { open, prepare };
})(window);
