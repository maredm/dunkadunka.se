"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
// IndexedDB-backed storage helpers
function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('dunkadunka-storage', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('kv')) {
                db.createObjectStore('kv', { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function setItem(key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const db = yield openIDB();
            const tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            store.put({ key, value });
            yield new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            // mirror to sessionStorage for synchronous reads elsewhere
            try {
                setItem(key, value);
            }
            catch ( /* ignore */_a) { /* ignore */ }
        }
        catch (e) {
            console.error('setItem(idb) failed', e);
        }
    });
}
function getItem(key) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const db = yield openIDB();
            const tx = db.transaction('kv', 'readonly');
            const store = tx.objectStore('kv');
            const req = store.get(key);
            const res = yield new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            return (_a = res === null || res === void 0 ? void 0 : res.value) !== null && _a !== void 0 ? _a : null;
        }
        catch (e) {
            console.error('getItem(idb) failed', e);
            return null;
        }
    });
}
function removeItem(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const db = yield openIDB();
            const tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            store.delete(key);
            yield new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
        catch (e) {
            console.error('removeItem(idb) failed', e);
        }
    });
}
function clearStorage() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const db = yield openIDB();
            const tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            store.clear();
            yield new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            // also clear sessionStorage
            try {
                sessionStorage.clear();
            }
            catch ( /* ignore */_a) { /* ignore */ }
        }
        catch (e) {
            console.error('clearStorage(idb) failed', e);
        }
    });
}
function dumpStorage() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const db = yield openIDB();
            const tx = db.transaction('kv', 'readonly');
            const store = tx.objectStore('kv');
            const req = store.openCursor();
            req.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    console.log(`Key: ${cursor.key}, Value: ${cursor.value.value}`);
                    cursor.continue();
                }
            };
            req.onerror = () => {
                console.error('dumpStorage(idb) failed', req.error);
            };
        }
        catch (e) {
            console.error('dumpStorage(idb) failed', e);
        }
    });
}
exports.storage = {
    setItem,
    getItem,
    removeItem,
    clearStorage,
    dumpStorage
};
