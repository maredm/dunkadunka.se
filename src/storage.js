// /c:/Users/edmark/Documents/projekt_dunka_dunka/static/modules/storage.js
// Module for saving, getting and listing "sources" (recordings with waveform + metadata).
// Usage (ES module):
//   import { saveSource, getSource, listSources } from './modules/storage.js'

const DB_NAME = 'dunka-dunka-storage';
const DB_VERSION = 1;
const STORE_NAME = 'sources';

function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    // simple fallback (not cryptographically strong)
    return 'id-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                store.createIndex('name', 'name', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function _bufferFromWaveform(waveform) {
    // Accept Float32Array, ArrayBuffer, or regular Array of numbers
    if (waveform instanceof ArrayBuffer) return waveform;
    if (ArrayBuffer.isView(waveform)) return waveform.buffer;
    if (Array.isArray(waveform)) {
        const fa = new Float32Array(waveform);
        return fa.buffer;
    }
    throw new TypeError('waveform must be ArrayBuffer, TypedArray, or number[]');
}

function _waveformFromBuffer(buffer) {
    if (!buffer) return null;
    return new Float32Array(buffer);
}

/**
 * Save a source.
 * input: {
 *   id? (string) - optional, generated if missing
 *   name? (string)
 *   waveform (Float32Array | ArrayBuffer | number[]) - required
 *   metadata? (object) - optional custom metadata (eg. sampleRate, channels, duration...)
 * }
 * Returns Promise<savedRecord> where savedRecord excludes large parts only if you stored them:
 * { id, name, metadata, createdAt }
 */
export async function saveSource(input) {
    if (!input || !input.waveform) throw new Error('saveSource requires an object with a waveform property');

    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const id = input.id || _uuid();
    const createdAt = input.createdAt || Date.now();
    const buffer = input.waveform ? _bufferFromWaveform(input.waveform) : null;

    const record = {
        id,
        name: input.name || null,
        metadata: input.metadata || {},
        waveform: buffer,       // store ArrayBuffer (IDB will clone it)
        createdAt,
    };

    return new Promise((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => {
            tx.oncomplete = () => {
                // return a lightweight summary (no waveform)
                resolve({ id, name: record.name, metadata: record.metadata, createdAt });
                db.close();
            };
        };
        req.onerror = () => {
            reject(req.error);
            db.close();
        };
    });
}

/**
 * Get a source by id.
 * Returns Promise<{ id, name, metadata, createdAt, waveform: Float32Array }>
 */
export async function getSource(id) {
    if (!id) throw new Error('getSource requires id');

    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const val = req.result;
            if (!val) {
                resolve(null);
                db.close();
                return;
            }
            // Convert stored ArrayBuffer to Float32Array
            const waveform = val.waveform;
            resolve({
                id: val.id,
                name: val.name,
                metadata: val.metadata,
                createdAt: val.createdAt,
                waveform: waveform,
            });
            db.close();
        };
        req.onerror = () => {
            reject(req.error);
            db.close();
        };
    });
}

/**
 * List all sources (without waveform data).
 * Returns Promise<Array<{ id, name, metadata, createdAt }>>
 * Optionally pass an options object: { limit, offset, reverse }
 */
export async function listSources(options = {}) {
    const { limit = Infinity, offset = 0, reverse = false } = options;
    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index ? store.index('createdAt') : null;

    const sourceForCursor = idx ? idx : store;
    const direction = reverse ? 'prev' : 'next';

    return new Promise((resolve, reject) => {
        const results = [];
        let skipped = 0;
        const req = sourceForCursor.openCursor(null, direction);
        req.onsuccess = (ev) => {
            const cur = ev.target.result;
            if (!cur || results.length >= limit) {
                resolve(results);
                db.close();
                return;
            }
            if (skipped < offset) {
                skipped++;
                cur.continue();
                return;
            }
            const v = cur.value;
            results.push({
                id: v.id,
                name: v.name,
                metadata: v.metadata,
                createdAt: v.createdAt,
                waveform: _waveformFromBuffer(v.waveform), // include waveform for size info but not as Float32Array
            });
            cur.continue();
        };
        req.onerror = () => {
            reject(req.error);
            db.close();
        };
    });
}

export async function removeSource(id) {
    if (!id) throw new Error('removeSource requires id');

    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const val = getReq.result;
            if (!val) {
                resolve(false); // nothing to remove
                db.close();
                return;
            }
            const delReq = store.delete(id);
            delReq.onsuccess = () => {
                tx.oncomplete = () => {
                    resolve(true);
                    db.close();
                };
            };
            delReq.onerror = () => {
                reject(delReq.error);
                db.close();
            };
        };
        getReq.onerror = () => {
            reject(getReq.error);
            db.close();
        };
    });
}

export async function renameSource(id, newName) {
    if (!id) throw new Error('renameSource requires id');
    if (typeof newName !== 'string') throw new Error('renameSource requires newName string');

    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const val = getReq.result;
            if (!val) {
                resolve(null); // not found
                db.close();
                return;
            }
            val.name = newName;
            const putReq = store.put(val);
            putReq.onsuccess = () => {
                tx.oncomplete = () => {
                    resolve({
                        id: val.id,
                        name: val.name,
                        metadata: val.metadata,
                        createdAt: val.createdAt,
                    });
                    db.close();
                };
            };
            putReq.onerror = () => {
                reject(putReq.error);
                db.close();
            };
        };
        getReq.onerror = () => {
            reject(getReq.error);
            db.close();
        };
    });
}

/**
 * Download the raw waveform ArrayBuffer as a local file.
 * options:
 *   filename? (string) - default: "<name||id>.raw"
 *   autoDownload? (boolean) - default true. If false, function resolves with the Blob instead of triggering download.
 * Returns Promise<Blob|null> (null if not found)
 */
export async function downloadSource(id, options = {}) {
    if (!id) throw new Error('downloadSource requires id');

    const { filename: optFilename, autoDownload = true } = options;

    const db = await _openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const val = req.result;
            if (!val) {
                resolve(null);
                db.close();
                return;
            }
            const buffer = val.waveform;
            if (!buffer) {
                reject(new Error('No waveform data to download'));
                db.close();
                return;
            }
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            const filename = optFilename || `${(val.name || val.id)}.raw`;

            if (!autoDownload) {
                resolve(blob);
                db.close();
                return;
            }

            // trigger browser download
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                // Append to DOM to support Firefox
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                resolve(blob);
            } catch (err) {
                reject(err);
            } finally {
                db.close();
            }
        };
        req.onerror = () => {
            reject(req.error);
            db.close();
        };
    });
}

// Optionally export a default object
export default {
    saveSource,
    getSource,
    listSources,
};