"use strict";

// Save-game manager (requires shared.js).
//
// The engine mounts IDBFS at SAVE_DIR and populates it from IndexedDB when it
// starts (asm_consts/en.js: FS.mount(IDBFS) + FS.syncfs(true)). IDBFS keeps
// one database per mount point, named after the mount path, with every file
// stored in FILE_DATA as { timestamp, mode, contents } keyed by its full path
// (modules/fs.js). Writing a record in that format before the game starts is
// therefore enough for the engine to see it as a normal save.
(function () {
    const U = window.vcUserData;
    const {
        reqToPromise, txDone, openDB, withDB, expandZips,
        equalBytes, formatSize, formatDate, download, readFile, el, ready,
        createPanel,
    } = U;
    const { t } = window.vcI18n;
    const { setStatus, run } = createPanel("saves-status");

    const SAVE_DIR = "/vc-assets/local/userfiles";
    const SAVE_SLOTS = 8;
    const saveKey = (slot) => `${SAVE_DIR}/GTAVCsf${slot}.b`;

    // Must match IDBFS in modules/fs.js, otherwise opening the database
    // would trigger a version change the engine does not expect.
    const IDBFS_VERSION = 21;
    const IDBFS_STORE = "FILE_DATA";
    const FILE_MODE = 0o100666; // S_IFREG | rw-rw-rw-

    const SAVE_MIN_SIZE = 1024;
    const SAVE_MAX_SIZE = 4 * 1024 * 1024;

    // ─── Data ───────────────────────────────────────────────────────

    // Same schema IDBFS.getDB creates, so it is safe if the game never ran.
    function openSaveDB() {
        return openDB(SAVE_DIR, IDBFS_VERSION, (db, tx) => {
            const store = db.objectStoreNames.contains(IDBFS_STORE)
                ? tx.objectStore(IDBFS_STORE)
                : db.createObjectStore(IDBFS_STORE);
            if (!store.indexNames.contains("timestamp")) {
                store.createIndex("timestamp", "timestamp", { unique: false });
            }
        });
    }

    // GTA VC PC saves end with a 32-bit little-endian sum of every
    // preceding byte; the engine rejects the file if it does not match.
    function validateSave(bytes) {
        if (bytes.length < SAVE_MIN_SIZE) {
            return t("saves.tooSmall", { size: bytes.length });
        }
        if (bytes.length > SAVE_MAX_SIZE) {
            return t("saves.tooLarge", { size: formatSize(bytes.length) });
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const firstBlock = view.getUint32(0, true);
        if (firstBlock === 0 || firstBlock >= bytes.length) {
            return t("saves.invalidBlock");
        }
        let sum = 0;
        const end = bytes.length - 4;
        for (let i = 0; i < end; i++) sum = (sum + bytes[i]) >>> 0;
        const stored = view.getUint32(end, true);
        if (sum !== stored) {
            return t("saves.checksum");
        }
        return null;
    }

    // The first block starts with the save's display name as 24 UTF-16 chars.
    function saveName(bytes) {
        if (!bytes || bytes.length < 52) return "";
        const chars = new Uint16Array(bytes.slice(4, 52).buffer);
        const end = chars.indexOf(0);
        return String.fromCharCode(...(end < 0 ? chars : chars.subarray(0, end))).trim();
    }

    async function readSlots() {
        return withDB(openSaveDB, async (db) => {
            const store = db.transaction(IDBFS_STORE, "readonly").objectStore(IDBFS_STORE);
            const slots = [];
            for (let slot = 1; slot <= SAVE_SLOTS; slot++) {
                slots.push({ slot, entry: await reqToPromise(store.get(saveKey(slot))) });
            }
            return slots;
        });
    }

    // Writes the save and reads it back to confirm the write.
    async function writeSlot(slot, bytes) {
        const key = saveKey(slot);
        await withDB(openSaveDB, async (db) => {
            const tx = db.transaction(IDBFS_STORE, "readwrite");
            tx.objectStore(IDBFS_STORE).put({
                timestamp: new Date(),
                mode: FILE_MODE,
                contents: new Uint8Array(bytes),
            }, key);
            await txDone(tx);
        });
        const written = await withDB(openSaveDB, (db) =>
            reqToPromise(db.transaction(IDBFS_STORE, "readonly").objectStore(IDBFS_STORE).get(key)));
        if (!written || !equalBytes(written.contents, bytes)) {
            throw new Error(t("saves.readBack"));
        }
    }

    async function removeSlot(slot) {
        await withDB(openSaveDB, async (db) => {
            const tx = db.transaction(IDBFS_STORE, "readwrite");
            tx.objectStore(IDBFS_STORE).delete(saveKey(slot));
            await txDone(tx);
        });
    }

    // ─── Backup file (all slots in one .zip) ────────────────────────

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    // Plain (stored) ZIP: [{ name, bytes }] -> Uint8Array. Opens in any zip tool
    // and is read back by expandZips().
    function makeZip(files) {
        const enc = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;
        for (const { name, bytes } of files) {
            const nameBytes = enc.encode(name);
            const crc = crc32(bytes);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);
            local.setUint16(10, 0, true);
            local.setUint16(12, 0x21, true); // 1980-01-01
            local.setUint32(14, crc, true);
            local.setUint32(18, bytes.length, true);
            local.setUint32(22, bytes.length, true);
            local.setUint16(26, nameBytes.length, true);
            chunks.push(new Uint8Array(local.buffer), nameBytes, bytes);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(14, 0x21, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, bytes.length, true);
            entry.setUint32(24, bytes.length, true);
            entry.setUint16(28, nameBytes.length, true);
            entry.setUint32(42, offset, true);
            central.push(new Uint8Array(entry.buffer), nameBytes);
            offset += 30 + nameBytes.length + bytes.length;
        }
        const centralSize = central.reduce((n, c) => n + c.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);
        const all = [...chunks, ...central, new Uint8Array(end.buffer)];
        const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of all) {
            out.set(c, at);
            at += c.length;
        }
        return out;
    }

    // Every filled slot as [{ slot, bytes }]. While the game runs its in-memory
    // copy is the freshest; otherwise (or if a slot is not there) the database.
    async function collectSaves() {
        const stored = new Map((await readSlots()).map(({ slot, entry }) => [slot, entry]));
        const FS = window.Module && window.Module.FS;
        const saves = [];
        for (let slot = 1; slot <= SAVE_SLOTS; slot++) {
            let bytes = null;
            if (FS) {
                try {
                    bytes = new Uint8Array(FS.readFile(saveKey(slot)));
                } catch {
                    bytes = null;
                }
            }
            const entry = stored.get(slot);
            if (!bytes && entry && entry.contents) bytes = new Uint8Array(entry.contents);
            if (bytes && bytes.length) saves.push({ slot, bytes });
        }
        return saves;
    }

    async function exportAllSaves() {
        const saves = await collectSaves();
        if (!saves.length) throw new Error(t("saves.backupNone"));
        const stamp = new Date().toISOString().slice(0, 10);
        const file = `vice-city-saves-${stamp}.zip`;
        download(makeZip(saves.map(({ slot, bytes }) => ({ name: `GTAVCsf${slot}.b`, bytes }))), file);
        return { count: saves.length, file };
    }

    // ─── UI ─────────────────────────────────────────────────────────

    function initSaves() {
        const slotList = document.getElementById("save-slot-list");
        if (!slotList) return;

        const saveInput = document.getElementById("save-file-input");

        let slots = [];
        let targetSlot = 0; // slot chosen by the Import button that opened the picker

        async function refreshSlots() {
            slots = await readSlots();
            slotList.replaceChildren(...slots.map(({ slot, entry }) => {
                const filled = Boolean(entry && entry.contents);
                const info = filled
                    ? `${saveName(entry.contents) || t("saves.unnamed")} · ${formatDate(entry.timestamp)}`
                    : t("saves.empty");
                const button = (label, handler, className = "") =>
                    el("button", { type: "button", className: `userdata-btn ${className}`.trim(), onclick: run(handler) }, label);
                return el("li", { className: "userdata-row" },
                    el("span", { className: "userdata-row-title" }, t("saves.slot", { slot })),
                    el("span", { className: "userdata-row-info" }, info),
                    el("span", { className: "userdata-row-actions" },
                        ...(filled
                            ? [button(t("saves.export"), () => exportSlot(slot)), button(t("saves.remove"), () => removeSave(slot), "userdata-btn-danger")]
                            : [button(t("saves.import"), () => pickSaveFor(slot))])));
            }));
        }

        function pickSaveFor(slot) {
            targetSlot = slot;
            saveInput.click();
        }

        async function importSave(picked, slot) {
            const saves = await expandZips([picked], /\.b$/i, SAVE_MAX_SIZE);
            if (saves.length !== 1) {
                throw new Error(t("saves.multiple", { file: picked.name, count: saves.length, names: saves.map((f) => f.name).join(", ") }));
            }
            const bytes = await readFile(saves[0]);
            const error = validateSave(bytes);
            if (error) throw new Error(`${saves[0].name}: ${error}`);
            await writeSlot(slot, bytes);
            setStatus(t("saves.imported", { name: saveName(bytes) || t("saves.unnamed"), slot }), "ok");
            await refreshSlots();
        }

        async function exportSlot(slot) {
            const entry = slots.find((s) => s.slot === slot)?.entry;
            if (!entry || !entry.contents) throw new Error(t("saves.slotEmpty", { slot }));
            download(entry.contents, `GTAVCsf${slot}.b`);
            setStatus(t("saves.exported", { slot, file: `GTAVCsf${slot}.b` }), "ok");
        }

        async function removeSave(slot) {
            const entry = slots.find((s) => s.slot === slot)?.entry;
            const name = (entry && saveName(entry.contents)) || t("saves.unnamed");
            if (!confirm(t("saves.removeConfirm", { name, slot }))) return;
            await removeSlot(slot);
            setStatus(t("saves.removed", { slot }), "ok");
            await refreshSlots();
        }

        // Backup: all slots to one file, and back.
        const backupInput = document.getElementById("saves-backup-input");
        const exportBtn = document.getElementById("saves-backup-export");
        const importBtn = document.getElementById("saves-backup-import");
        if (exportBtn && importBtn && backupInput) {
            exportBtn.addEventListener("click", run(async () => {
                const { count, file } = await exportAllSaves();
                setStatus(t("saves.backupDone", { count, file }), "ok");
            }));
            importBtn.addEventListener("click", () => backupInput.click());
            backupInput.addEventListener("change", run(async () => {
                const picked = backupInput.files[0];
                backupInput.value = "";
                if (!picked) return;
                const files = await expandZips([picked], /\.b$/i, SAVE_MAX_SIZE);
                const found = [];
                const skipped = [];
                for (const f of files) {
                    const m = /^GTAVCsf([1-8])\.b$/i.exec(f.name);
                    if (!m) {
                        skipped.push(f.name);
                        continue;
                    }
                    const bytes = await readFile(f);
                    if (validateSave(bytes)) skipped.push(f.name);
                    else found.push({ slot: Number(m[1]), bytes });
                }
                if (!found.length) throw new Error(t("saves.backupNoSlots", { file: picked.name }));
                const replacing = found.filter(({ slot }) => slots.find((s) => s.slot === slot)?.entry?.contents).length;
                if (replacing && !confirm(t("saves.backupConfirm", { count: replacing }))) return;
                for (const { slot, bytes } of found) await writeSlot(slot, bytes);
                await refreshSlots();
                setStatus(
                    t("saves.backupLoaded", { count: found.length }) +
                        (skipped.length ? " " + t("saves.backupSkipped", { names: skipped.join(", ") }) : ""),
                    "ok",
                );
            }));
        }

        // While playing: a small button to download all saves (read-only, so it
        // cannot disturb the running game).
        const floating = el("div", { className: "ingame-backup" },
            el("button", { type: "button", title: t("saves.backupInGameTip"), onclick: async () => {
                try {
                    const { count, file } = await exportAllSaves();
                    console.log(`[saves] downloaded ${count} save(s) as ${file}`);
                } catch (err) {
                    alert(err && err.message ? err.message : String(err));
                }
            } }, t("saves.backupInGame")));
        floating.querySelector("button").setAttribute("data-i18n-title", "saves.backupInGameTip");
        document.body.appendChild(floating);

        saveInput.addEventListener("change", run(async () => {
            const picked = saveInput.files[0];
            saveInput.value = "";
            if (picked) await importSave(picked, targetSlot);
        }));

        const showStorageError = (err) => {
            console.error("[userdata]", err);
            setStatus(t("userdata.storageError", { message: err && err.message ? err.message : err }), "error");
        };
        refreshSlots().catch(showStorageError);
        window.addEventListener("vc:languagechange", () => refreshSlots().catch(showStorageError));
    }

    Object.assign(U, { validateSave, saveName });
    ready(initSaves);
})();
