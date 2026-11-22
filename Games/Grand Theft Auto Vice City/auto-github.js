(() => {
  "use strict";

  const OWNER = "AMoldyWaffle";
  const REPO = "Ocarina-of-Time";
  const BRANCH = "main";
  const SOURCE_FOLDER = "Games/Grand Theft Auto Vice City";
  const JSDELIVR_LIST = `https://data.jsdelivr.com/v1/package/gh/${OWNER}/${REPO}@${BRANCH}/flat`;
  const API_TREE = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const ALLOWED_ROOTS = new Set([
    "audio", "icons", "text", "anim", "data", "models", "movies", "mp3", "mss", "skins", "txd"
  ]);
  const CONCURRENCY = 16;

  const panel = document.getElementById("auto-download-panel");
  const status = document.getElementById("auto-status");
  const detail = document.getElementById("auto-progress-detail");
  const bar = document.getElementById("auto-progress-bar");
  const consoleBox = document.getElementById("auto-console");
  const toggle = document.getElementById("auto-log-toggle");
  const logLines = [];
  let failed = false;

  document.body.classList.add("auto-downloading");

  function toggleConsole() {
    const show = consoleBox.hidden;
    consoleBox.hidden = !show;
    consoleBox.style.display = show ? "block" : "none";
    toggle.textContent = show ? "Hide console" : "Show console";
    toggle.setAttribute("aria-expanded", String(show));
  }
  window.__toggleGtaDebugConsole = toggleConsole;

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

  function encodedPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function assetUrls(path) {
    const p = encodedPath(path);
    return [
      `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${p}`,
      `https://fastly.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${p}`,
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${p}`
    ];
  }

  function relativeGameAssetPath(sourcePath) {
    const normalized = String(sourcePath || "").replace(/^\/+/, "").replace(/\\/g, "/");
    const prefix = `${SOURCE_FOLDER}/`;
    if (!normalized.startsWith(prefix)) return null;
    const relativePath = normalized.slice(prefix.length);
    const parts = relativePath.split("/");
    const root = (parts[0] || "").toLowerCase();
    const name = (parts[parts.length - 1] || "").toLowerCase();
    if (!ALLOWED_ROOTS.has(root) || /\.(exe|dll|pdb|asi|bat|cmd)$/i.test(name)) return null;
    return relativePath;
  }

  async function getRepositoryFiles() {
    setStatus("Finding GTA-VC game files…");
    let files = [];
    let listError = null;
    try {
      const response = await fetch(JSDELIVR_LIST, { cache: "no-store" });
      if (!response.ok) throw new Error(`File list request: HTTP ${response.status}`);
      const manifest = await response.json();
      if (!Array.isArray(manifest.files)) throw new Error("The file list was invalid.");
      files = manifest.files
        .filter(item => item && typeof item.name === "string")
        .map(item => {
          const sourcePath = item.name.replace(/^\/+/, "");
          const path = relativeGameAssetPath(sourcePath);
          return path ? { path, urls: assetUrls(sourcePath), size: Number(item.size) || 0, name: path.split("/").pop() } : null;
        })
        .filter(Boolean);
      log(`Found ${files.length} eligible game asset files.`);
    } catch (error) {
      listError = error;
      log(`Primary file list unavailable: ${error.message}; trying an alternate file list.`, "warn");
    }

    if (!files.length) {
      const response = await fetch(API_TREE, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Could not list game files. Primary list: ${listError?.message || "no files"}. Alternate list: HTTP ${response.status} ${response.statusText}. ${body.slice(0, 180)}`);
      }
      const tree = await response.json();
      if (!Array.isArray(tree.tree)) throw new Error("The alternate file list was invalid.");
      if (tree.truncated) throw new Error("The file list was incomplete; automatic import cannot safely continue.");
      files = tree.tree.filter(item => item.type === "blob")
        .map(item => {
          const sourcePath = item.path;
          const path = relativeGameAssetPath(sourcePath);
          return path ? { path, urls: assetUrls(sourcePath), size: Number(item.size) || 0, name: path.split("/").pop() } : null;
        })
        .filter(Boolean);
    }

    if (!files.length) throw new Error("No game asset files were found in the expected GTA-VC folders.");
    const roots = [...new Set(files.map(f => f.path.split("/")[0]))];
    log(`Using ${files.length} files from folders: ${roots.join(", ")}.`);
    return files;
  }

  async function fetchOne(item) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      for (const url of item.urls) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} from ${new URL(url).hostname}`);
          const blob = await response.blob();
          if (item.size && blob.size !== item.size) {
            throw new Error(`Size mismatch from ${new URL(url).hostname}: expected ${item.size}, received ${blob.size}`);
          }
          log(`Fetched ${item.path} via ${new URL(url).hostname}.`);
          return new File([blob], item.name, { type: "application/octet-stream", lastModified: Date.now() });
        } catch (error) {
          lastError = error;
          log(`${item.path}: ${error.message}`, "warn");
        }
      }
      if (attempt < 3) await sleep(350 * attempt);
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

    setStatus(`Downloading ${files.length.toLocaleString()} game files…`);
    detail.textContent = `0 / ${files.length} files · ${formatBytes(totalBytes)} total`;
    log(`Download plan: ${files.length} files, approximately ${formatBytes(totalBytes)}, up to ${CONCURRENCY} parallel connections.`);

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

  log(`Automatic local game downloader initialized.`);
  log("The game files are retrieved automatically by this local launcher.");
  run();
})();
