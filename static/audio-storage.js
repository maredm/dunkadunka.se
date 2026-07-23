"use strict";
// Helper functions for audio storage management using IndexedDB for waveforms.
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
exports.addWaveform = addWaveform;
exports.loadAllWaveforms = loadAllWaveforms;
exports.deleteWaveform = deleteWaveform;
exports.clearAllWaveforms = clearAllWaveforms;
function openAudioDB() {
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
function addWaveform(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield openAudioDB();
        return new Promise((resolve, reject) => {
            var _a;
            const tx = db.transaction('waveforms', 'readwrite');
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => db.close();
            const store = tx.objectStore('waveforms');
            const id = (_a = params.id) !== null && _a !== void 0 ? _a : (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
            const row = {
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
    });
}
// Load all waveforms from the "waveforms" object store.
function loadAllWaveforms() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('waveforms', 'readonly');
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => db.close();
            const store = tx.objectStore('waveforms');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    });
}
// Delete a waveform by id from the "waveforms" object store.
function deleteWaveform(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('waveforms', 'readwrite');
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => db.close();
            const store = tx.objectStore('waveforms');
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}
// Clear all waveforms from the "waveforms" object store.
function clearAllWaveforms() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield openAudioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('waveforms', 'readwrite');
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => db.close();
            const store = tx.objectStore('waveforms');
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}
