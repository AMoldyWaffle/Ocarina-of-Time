(() => {
  "use strict";

  const OWNER = "AMoldyWaffle";
  const REPO = "GTA-VC";
  const BRANCH = "main";
  const API_TREE = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;
  const ALLOWED_ROOTS = new Set([
    "audio", "text", "anim", "data", "models", "movies", "mp3", "mss", "skins", "txd"
  ]);
  const CONCURRENCY = 8;

  const panel = document.getElementById("auto-download-panel");
  const status = document.getElementById("auto-status");
  const detail = document.getElementById("auto-progress-detail");
  const bar = document.getElementById("auto-progress-bar");
  const consoleBox = document.getElementById("auto-console");
  const toggle = document.getElementById("auto-log-toggle");
  const logLines = [];
  let failed = false;

  document.body.classList.add("auto-downloading");

  toggle.addEventListener("click", () => {
    const show = consoleBox.hidden;
    consoleBox.hidden = !show;
    toggle.textContent = show ? "Hide console" : "Show console";
    toggle.setAttribute("aria-expanded", String(show));
  });

  function log(message, level = "info") {
    const line = `[${new Date().toLocaleTimeString()}] [${level}] ${String(message)}`;
    logLines.push(line);
    if (logLines.length > 500) logLines.shift();
    consoleBox.textContent = logLines.join("\n");
    consoleBox.scrollTop = consoleBox.scrollHeight;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  function setProgress(percent, message) {
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (message) detail.textContent = message;
  }

  function setStatus(message) {
    status.textContent = message;
    log(message);
  }

  window.addEventListener("error", e => log(`${e.message || "Script error"} (${e.filename || "unknown"}:${e.lineno || 0})`, "error"));
  window.addEventListener("unhandledrejection", e => log(`Unhandled promise rejection: ${e.reason?.stack || e.reason}`, "error"));

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const formatBytes = n => {
    if (!Number.isFinite(n)) return "unknown size";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  };

  async function waitFor(predicate, label, timeout = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (predicate()) return; } catch {}
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  async function cachedGameExists() {
    try {
      const [indexFile, dataFile] = await Promise.all([
        window.vcLocal.openGameFile("vcbr/vc-sky-en-v6.json"),
        window.vcLocal.openGameFile("vcbr/vc-sky-en-v6.data")
      ]);
      return !!indexFile && !!dataFile && dataFile.size > 100 * 1024 * 1024;
    } catch (e) {
      log(`Could not check existing local game data: ${e.message}`, "warn");
      return false;
    }
  }

  function rawUrl(path) {
    return RAW_BASE + path.split("/").map(encodeURIComponent).join("/");
  }

  async function getRepositoryFiles() {
    setStatus("Checking the GTA-VC GitHub repository…");
    const response = await fetch(API_TREE, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub repository index request failed: HTTP ${response.status} ${response.statusText}. ${body.slice(0, 240)}`);
    }
    const tree = await response.json();
    if (!Array.isArray(tree.tree)) throw new Error("GitHub returned an invalid repository file list.");
    if (tree.truncated) throw new Error("GitHub truncated the repository file list; automatic import cannot safely continue.");

    const files = tree.tree.filter(item => {
      if (item.type !== "blob") return false;
      const parts = item.path.split("/");
      const root = (parts[0] || "").toLowerCase();
      if (!ALLOWED_ROOTS.has(root)) return false;
      const name = parts[parts.length - 1].toLowerCase();
      if (name.endsWith(".exe") || name.endsWith(".dll") || name.endsWith(".pdb")) return false;
      return true;
    }).map(item => ({
      path: item.path.toLowerCase(),
      url: rawUrl(item.path),
      size: Number(item.size) || 0,
      name: item.path.split("/").pop()
    }));

    if (!files.some(f => f.path.endsWith("/models/gta3.img") || f.path === "models/gta3.img" ||
                         f.path.includes("/models/gta3img/"))) {
      log("Repository tree does not show the expected GTA III/Vice City model archive or split parts.", "warn");
    }
    if (!files.length) throw new Error("No game asset files were found in the expected repository folders.");
    return files;
  }

  async function fetchOne(item) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(item.url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const blob = await response.blob();
        if (item.size && blob.size !== item.size) {
          throw new Error(`Size mismatch for ${item.path}: expected ${item.size}, received ${blob.size}`);
        }
        return new File([blob], item.name, { type: "application/octet-stream", lastModified: Date.now() });
      } catch (error) {
        lastError = error;
        log(`Download attempt ${attempt}/3 failed for ${item.path}: ${error.message}`, "warn");
        if (attempt < 3) await sleep(500 * attempt);
      }
    }
    throw new Error(`Could not download ${item.path}: ${lastError?.message || "unknown error"}`);
  }

  async function downloadRepositoryFiles(files) {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completed = 0;
    let completedBytes = 0;
    let next = 0;
    const entries = new Array(files.length);
    const started = Date.now();

    setStatus(`Downloading ${files.length.toLocaleString()} game files from GitHub…`);
    detail.textContent = `0 / ${files.length} files · ${formatBytes(totalBytes)} total`;
    log(`Download plan: ${files.length} files, approximately ${formatBytes(totalBytes)}, ${CONCURRENCY} parallel connections.`);

    async function worker() {
      while (true) {
        const index = next++;
        if (index >= files.length) return;
        const item = files[index];
        const file = await fetchOne(item);
        entries[index] = { path: item.path, file };
        completed++;
        completedBytes += file.size;
        const pct = totalBytes ? completedBytes / totalBytes * 100 : completed / files.length * 100;
        setProgress(pct, `${completed.toLocaleString()} / ${files.length.toLocaleString()} files · ${formatBytes(completedBytes)} / ${formatBytes(totalBytes)}`);
        if (completed === 1 || completed % 20 === 0 || completed === files.length) {
          const seconds = Math.max(0.1, (Date.now() - started) / 1000);
          const rate = completedBytes / seconds;
          log(`Downloaded ${completed}/${files.length}: ${item.path} (${formatBytes(file.size)}); ${formatBytes(rate)}/s average.`);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    log(`All repository files downloaded in ${((Date.now() - started) / 1000).toFixed(1)} seconds.`);
    return entries;
  }

  async function importGame(entries) {
    setStatus("Preparing the local game importer…");
    await window.vcLocal.checkStorage();
    await window.vcLocal.prepareImport();

    return new Promise((resolve, reject) => {
      const worker = window.vcLocal.createImportWorker();
      let settled = false;
      const timeout = setTimeout(() => finish(new Error("The game importer stopped responding after 10 minutes.")), 10 * 60 * 1000);

      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.terminate();
        if (error) reject(error);
        else resolve();
      }

      worker.onerror = event => finish(new Error(`Importer worker error: ${event.message || "unknown worker error"}`));
      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === "progress") {
          if (message.phase === "checking") {
            setStatus("Checking game files and preparing the local package…");
          } else if (message.phase === "unpacking") {
            setStatus(`Unpacking ${message.file || "game files"}…`);
          } else if (message.phase === "converting") {
            const pct = message.total ? message.done / message.total * 100 : 0;
            setStatus("Converting and storing game data locally…");
            setProgress(pct, `${message.done.toLocaleString()} / ${message.total.toLocaleString()} conversion steps`);
          }
          return;
        }
        if (message.type === "warning") {
          log(`Importer warning: ${JSON.stringify(message.files || message)}`, "warn");
          return;
        }
        if (message.type === "error") {
          finish(new Error(`${message.code || "Import error"}: ${message.message || "The importer rejected the downloaded game files."}${message.files?.length ? " Missing: " + message.files.join(", ") : ""}`));
          return;
        }
        if (message.type === "done") {
          log("Importer reports that the game data has been written to local browser storage.");
          finish();
        }
      };

      worker.postMessage({
        kind: "folder",
        entries,
        revc: window.vcLocal.revcFiles(),
        encoderSrc: window.__VC_ENCODER_SRC
      });
    });
  }

  async function launchGame() {
    setStatus("Game data is ready. Starting Vice City…");
    setProgress(100, "Launching…");
    await waitFor(() => {
      const script = [...document.scripts].find(s => /(^|\/)game\.js(?:\?|$)/.test(s.src));
      return script && script.dataset.loaded === "true";
    }, "game startup code");
    const button = document.getElementById("click-to-play-button");
    if (!button) throw new Error("The game's launch control was not found.");
    window.__gtaGameReady = true;
    button.disabled = false;
    button.classList.remove("disabled");
    await sleep(150);
    panel.style.display = "none";
    document.body.classList.remove("auto-downloading");
    button.click();
    log("Automatic launch requested.");
  }

  async function fail(error) {
    failed = true;
    setStatus("Automatic setup failed.");
    detail.textContent = error?.message || String(error);
    bar.style.background = "#e45b5b";
    log(error?.stack || error, "error");
    console.error("GTA-VC automatic setup failed:", error);
    const button = document.getElementById("auto-log-toggle");
    if (button && consoleBox.hidden) {
      consoleBox.hidden = false;
      button.textContent = "Hide console";
      button.setAttribute("aria-expanded", "true");
    }
  }

  async function run() {
    try {
      await waitFor(() => window.vcLocal && window.vcStore, "local storage runtime");
      await waitFor(() => window.vcI18n, "game interface initialization");
      await window.vcLocal.checkStorage();

      if (await cachedGameExists()) {
        log("A complete local game package already exists; skipping the download.");
        await launchGame();
        return;
      }

      const files = await getRepositoryFiles();
      const entries = await downloadRepositoryFiles(files);
      setStatus("Downloading complete. Importing game assets…");
      setProgress(100, "Downloads complete; converting files for the browser engine.");
      await importGame(entries);
      await launchGame();
    } catch (error) {
      await fail(error);
    }
  }

  log(`Automatic local downloader initialized for ${OWNER}/${REPO}@${BRANCH}.`);
  log("No local server is used. GitHub is contacted directly from this local HTML page.");
  run();
})();
