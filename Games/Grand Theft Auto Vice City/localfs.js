"use strict";

// Local-file runtime for the GTA: Vice City WASM port.
//
// The original build needs a web server: a service worker serves the game
// data out of OPFS (which file:// pages are denied), the engine is fetch()ed, and the importer is an ES-module
// worker. None of that works for a page opened straight from disk (file://):
// browsers block fetch/XHR of local files, service workers and module scripts.
//
// This script (loaded first, as a classic script) replaces those pieces:
//   - game data is kept in IndexedDB and read directly, addressed as vcfs://<path>
//   - the engine .wasm and a few small reVC files ship as base64 in .js files
//     (script tags are allowed on file://) and are decoded on demand
//   - the importer worker is started from a Blob
//   - a small XMLHttpRequest stand-in answers the engine's own vcfs:// requests
(function () {
        const SCHEME = "vcfs://";

    // ─── storage (IndexedDB, see src/local/store.js) ────────────────

    const store = window.vcStore;

    // File-like object for a path like "vcbr/vc-sky-en-v6.data", or null.
    async function openGameFile(path) {
        try {
            return await store.open(path.split("/").filter(Boolean).map(decodeURIComponent).join("/"));
        } catch {
            return null;
        }
    }

    // Throws if the browser will not give this page a database.
    async function checkStorage() {
        await store.openDb();
    }

    // ─── bundled data (loaded on demand through <script>) ───────────

    const scriptPromises = new Map();
    function loadScriptOnce(src) {
        if (!scriptPromises.has(src)) {
            scriptPromises.set(
                src,
                new Promise((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = src;
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error("Could not load " + src + ". Keep the whole folder together."));
                    document.head.appendChild(script);
                }),
            );
        }
        return scriptPromises.get(src);
    }

    function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    let wasmBytes = null;
    async function getWasmBytes() {
        if (!wasmBytes) {
            await loadScriptOnce("assets/engine-wasm.js");
            wasmBytes = b64ToBytes(window.__VC_WASM_B64);
            delete window.__VC_WASM_B64; // free the ~10 MB string
        }
        return wasmBytes;
    }

    let revc = null;
    async function loadRevc() {
        if (!revc) {
            await loadScriptOnce("assets/revc-data.js");
            revc = {};
            for (const [path, b64] of Object.entries(window.__VC_REVC)) revc[path] = b64ToBytes(b64);
            delete window.__VC_REVC;
        }
        return revc;
    }

    // Everything the importer needs before its worker starts.
    async function prepareImport() {
        await Promise.all([loadScriptOnce("assets/worker-src.js"), loadRevc()]);
    }

    function revcFiles() {
        return revc || {};
    }

    function createImportWorker() {
        const url = URL.createObjectURL(new Blob([window.__VC_WORKER_SRC], { type: "text/javascript" }));
        const worker = new Worker(url);
        // The worker has already read its source by the time it can run.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return worker;
    }

    // ─── vcfs:// requests ───────────────────────────────────────────

    // Resolves a vcfs:// URL to a Blob (or File), or null when it is missing.
    async function resolve(url) {
        const path = url.slice(SCHEME.length).split(/[?#]/)[0];
        if (path === "engine/vc-sky-en-v6.wasm") {
            return new Blob([await getWasmBytes()], { type: "application/wasm" });
        }
        if (path.startsWith("revc/")) {
            const bytes = (await loadRevc())[path.slice(5)];
            return bytes ? new Blob([bytes]) : null;
        }
        return openGameFile(path);
    }

    function parseRange(header, size) {
        const m = /^bytes=(\d*)-(\d*)$/i.exec(header || "");
        if (!m) return null;
        let start = m[1] === "" ? null : Number(m[1]);
        let end = m[2] === "" ? null : Number(m[2]);
        if (start === null && end === null) return null;
        if (start === null) {
            start = Math.max(0, size - end);
            end = size - 1;
        } else if (end === null || end >= size) {
            end = size - 1;
        }
        if (start > end || end >= size) return null;
        return { start, end };
    }

    // Just enough of XMLHttpRequest for emscripten's async fetch (fetch.js).
    class VirtualXHR {
        constructor() {
            this.readyState = 0;
            this.status = 0;
            this.statusText = "";
            this.response = null;
            this.responseType = "";
            this.responseURL = "";
            this.timeout = 0;
            this.withCredentials = false;
            this.onload = this.onerror = this.onprogress = null;
            this.onreadystatechange = this.ontimeout = this.onabort = this.onloadend = null;
            this._headers = {};
            this._responseHeaders = {};
            this._aborted = false;
        }
        open(method, url) {
            this._method = (method || "GET").toUpperCase();
            this._url = url;
            this.readyState = 1;
        }
        setRequestHeader(name, value) {
            this._headers[String(name).toLowerCase()] = value;
        }
        overrideMimeType() {}
        getResponseHeader(name) {
            const v = this._responseHeaders[String(name).toLowerCase()];
            return v === undefined ? null : v;
        }
        getAllResponseHeaders() {
            return Object.entries(this._responseHeaders).map(([k, v]) => `${k}: ${v}\r\n`).join("");
        }
        abort() {
            if (this._aborted) return;
            this._aborted = true;
            this.readyState = 0;
            this.onabort && this.onabort({ type: "abort", target: this });
        }
        _emit(handler, extra) {
            if (this._aborted || !handler) return;
            handler.call(this, { type: "event", target: this, ...extra });
        }
        send() {
            (async () => {
                let blob = null;
                try {
                    blob = await resolve(this._url);
                } catch (err) {
                    console.error("[vcfs]", this._url, err);
                }
                if (this._aborted) return;
                if (!blob) {
                    this.status = 404;
                    this.statusText = "Not Found";
                    this.readyState = 4;
                    this.response = new ArrayBuffer(0);
                    this._emit(this.onreadystatechange);
                    this._emit(this.onload);
                    this._emit(this.onloadend);
                    return;
                }
                let body = blob;
                this.status = 200;
                this.statusText = "OK";
                const range = parseRange(this._headers["range"], blob.size);
                if (range) {
                    body = blob.slice(range.start, range.end + 1);
                    this.status = 206;
                    this.statusText = "Partial Content";
                    this._responseHeaders["content-range"] = `bytes ${range.start}-${range.end}/${blob.size}`;
                }
                this._responseHeaders["content-length"] = String(body.size);
                this._responseHeaders["accept-ranges"] = "bytes";
                this.responseURL = this._url;
                this.readyState = 2;
                this._emit(this.onreadystatechange);
                if (this._method !== "HEAD") {
                    this.response = await body.arrayBuffer();
                    if (this._aborted) return;
                }
                this.readyState = 4;
                const size = this.response ? this.response.byteLength : 0;
                this._emit(this.onprogress, { loaded: size, total: size, lengthComputable: true });
                this._emit(this.onreadystatechange);
                this._emit(this.onload, { loaded: size, total: size });
                this._emit(this.onloadend);
            })();
        }
    }

    function createXHR(url) {
        return String(url).startsWith(SCHEME) ? new VirtualXHR() : new XMLHttpRequest();
    }

    // Safety net: anything that fetch()es a vcfs:// URL gets a normal Response.
    const realFetch = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
        if (!url.startsWith(SCHEME)) {
            if (!realFetch) throw new TypeError("fetch is not available");
            return realFetch(input, init);
        }
        const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        const blob = await resolve(url);
        if (!blob) return new Response("Not found", { status: 404 });
        const headers = new Headers({ "Content-Length": String(blob.size), "Accept-Ranges": "bytes" });
        return new Response(method === "HEAD" ? null : await blob.arrayBuffer(), { status: 200, headers });
    };

    window.vcLocal = {
        checkStorage,
        openGameFile,
        removeTree: (name) => store.removeTree(name),
        getWasmBytes,
        prepareImport,
        revcFiles,
        createImportWorker,
        createXHR,
    };
})();
