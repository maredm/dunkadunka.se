// IndexedDB-backed storage helpers
function openIDB(): Promise<IDBDatabase> {
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

async function setItem(key: string, value: string): Promise<void> {
    try {
        const db = await openIDB();
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        store.put({ key, value });
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        // mirror to sessionStorage for synchronous reads elsewhere
        try { setItem(key, value); } catch { /* ignore */ }
    } catch (e) {
        console.error('setItem(idb) failed', e);
    }
}

async function getItem(key: string): Promise<string | null> {
    try {
        const db = await openIDB();
        const tx = db.transaction('kv', 'readonly');
        const store = tx.objectStore('kv');
        const req = store.get(key);
        const res = await new Promise<any>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return res?.value ?? null;
    } catch (e) {
        console.error('getItem(idb) failed', e);
        return null;
    }
}

async function removeItem(key: string): Promise<void> {
    try {
        const db = await openIDB();
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        store.delete(key);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch (e) {
        console.error('removeItem(idb) failed', e);
    }
}

async function clearStorage(): Promise<void> {
    try {
        const db = await openIDB();
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        store.clear();
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        // also clear sessionStorage
        try { sessionStorage.clear(); } catch { /* ignore */ }
    } catch (e) {
        console.error('clearStorage(idb) failed', e);
    }
}

async function dumpStorage(): Promise<void> {
    try {
        const db = await openIDB();
        const tx = db.transaction('kv', 'readonly');
        const store = tx.objectStore('kv');
        const req = store.openCursor();
        req.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
                console.log(`Key: ${cursor.key}, Value: ${cursor.value.value}`);
                cursor.continue();
            }
        };
        req.onerror = () => {
            console.error('dumpStorage(idb) failed', req.error);
        };
    } catch (e) {
        console.error('dumpStorage(idb) failed', e);
    }
}

export const storage = {
    setItem,
    getItem,
    removeItem,
    clearStorage,
    dumpStorage
};