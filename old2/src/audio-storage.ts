// Helper functions for audio storage management using IndexedDB for waveforms.

export interface WaveformRow {
    id: string;
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    metadata: string;
    data: Blob;
}

function openAudioDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('audio-storage', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('waveforms')) {
                const store = db.createObjectStore('waveforms', { keyPath: 'id' });
                store.createIndex('sampleRate', 'sampleRate', { unique: false });
                store.createIndex('length', 'length', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
}

/**
 * Adds a waveform row to the "waveforms" object store.
 * If id is not provided one will be generated.
 * Returns the id of the stored row.
 */
export async function addWaveform(params: {
    id?: string;
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    metadata: string;
    data: Blob;
}): Promise<string> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('waveforms', 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => db.close();

        const store = tx.objectStore('waveforms');
        const id =
            params.id ??
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

        const row: WaveformRow = {
            id,
            numberOfChannels: params.numberOfChannels,
            length: params.length,
            sampleRate: params.sampleRate,
            metadata: params.metadata,
            data: params.data,
        };

        const req = store.add(row);
        req.onsuccess = () => resolve(id);
        req.onerror = () => reject(req.error);
    });
}

// Load all waveforms from the "waveforms" object store.
export async function loadAllWaveforms(): Promise<WaveformRow[]> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('waveforms', 'readonly');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => db.close();

        const store = tx.objectStore('waveforms');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as WaveformRow[]);
        req.onerror = () => reject(req.error);
    });
}

// Delete a waveform by id from the "waveforms" object store.
export async function deleteWaveform(id: string): Promise<void> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('waveforms', 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => db.close();

        const store = tx.objectStore('waveforms');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Clear all waveforms from the "waveforms" object store.
export async function clearAllWaveforms(): Promise<void> {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('waveforms', 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => db.close();

        const store = tx.objectStore('waveforms');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}