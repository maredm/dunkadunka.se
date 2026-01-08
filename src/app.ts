import { computeFFT, computeFFTFromIR, db, FarinaImpulseResponse, rms, smoothFFT, twoChannelImpulseResponse } from "./audio";
import { nextPow2 } from "./math";
import { storage } from "./storage";
import "./device-settings";

console.debug("App module loaded");

const root = document.documentElement;
const uiColor = "#0366d6";
root.style.setProperty('--color', uiColor);

let tabCounter = 0;
const tabsContainer = document.getElementById('tabs') as HTMLElement;
const tabContents = document.getElementById('tab-contents') as HTMLElement;
const responseFileInput = document.getElementById('responseFile') as HTMLInputElement;
const referenceFileInput = document.getElementById('referenceFile') as HTMLInputElement;
const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;

interface Audio {
    sampleRate: number;
    data: Array<number>;
    duration: number;
    metadata?: {[Key: string]: string | number | null};
}

// Enable analyze button when response file is selected
responseFileInput.addEventListener('change', () => {
    analyzeBtn.disabled = !responseFileInput.files?.length;
});

// Save state when the user attempts to close or reload the window
window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    try {
        saveState();
    } catch (err) {
        console.error('Failed to save state on beforeunload:', err);
    }
    // If you want to prompt the user to confirm leaving (browser-dependent), uncomment:
    // e.preventDefault();
    // e.returnValue = '';
});

// Tab switching
tabsContainer.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    
    if (target.classList.contains('tab-close')) {
        const tab = target.parentElement as HTMLElement;
        const tabId = tab.dataset.tab;
        if (tabId == 'upload') return;

        console.debug('Closing tab', tabId);
        tab.remove();
        document.querySelector(`[data-content="${tabId}"]`)?.remove();
        storage.removeItem(`analysis-${tabId}`).catch(err => console.error('Failed to remove analysis from storage:', err));
        
        // Activate upload tab if current was closed
        if (tab.classList.contains('active')) {
            switchTab('upload');
        }
        saveState();
        e.stopPropagation();
    } else if (target.classList.contains('tab')) {
        const tabId = target.dataset.tab;
        if (tabId) {
            switchTab(tabId);
        }
    }
});

function switchTab(tabId: string): void {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelector(`[data-content="${tabId}"]`)?.classList.add('active');
}

analyzeBtn.addEventListener('click', async () => {
    const responseFile = responseFileInput.files?.[0];
    const referenceFile = referenceFileInput.files?.[0];

    if (!responseFile) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';

    try {
        const responseData = await loadAudioFile(responseFile);
        const referenceData = referenceFile ? await loadAudioFile(referenceFile) : null;

        createAnalysisTab(responseData, referenceData, responseFile.name, referenceFile?.name || null);
    } catch (error) {
        alert('Error analyzing files: ' + (error as Error).message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Frequency Response';
    }
});

async function loadAudioFile(file: File): Promise<Audio> {
    const headerBuffer = await file.slice(0, 256 * 1024).arrayBuffer();

    function getExt(name: string) {
        return (name.split('.').pop() || '').toLowerCase();
    }

    function parseWav(buf: ArrayBuffer) {
        const dv = new DataView(buf);
        function readStr(off: number, len: number) {
            let s = '';
            for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
            return s;
        }

        if (readStr(0, 4) !== 'RIFF' || readStr(8, 4) !== 'WAVE') return null;

        let offset = 12;
        const info: any = {};
        while (offset + 8 <= dv.byteLength) {
            const id = readStr(offset, 4);
            const size = dv.getUint32(offset + 4, true);
            if (id === 'fmt ') {
                info.audioFormat = dv.getUint16(offset + 8, true);
                info.numChannels = dv.getUint16(offset + 10, true);
                info.sampleRate = dv.getUint32(offset + 12, true);
                info.byteRate = dv.getUint32(offset + 16, true);
                info.blockAlign = dv.getUint16(offset + 20, true);
                info.bitsPerSample = dv.getUint16(offset + 22, true);
            } else if (id === 'data') {
                info.dataChunkSize = size;
            }
            offset += 8 + size + (size % 2);
        }
        if (info.sampleRate && info.byteRate && info.dataChunkSize) {
            info.duration = info.dataChunkSize / info.byteRate;
        }
        return info;
    }

    function parseMp3(buf: ArrayBuffer) {
        const bytes = new Uint8Array(buf);
        let offset = 0;
        // Skip ID3v2 tag if present
        if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
            const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
            offset = 10 + size;
        }
        // find first frame header
        let headerIndex = -1;
        for (let i = offset; i < bytes.length - 4; i++) {
            if (bytes[i] === 0xFF && (bytes[i + 1] & 0xE0) === 0xE0) {
                headerIndex = i;
                break;
            }
        }
        if (headerIndex < 0) return null;
        const b1 = bytes[headerIndex + 1];
        const b2 = bytes[headerIndex + 2];
        const b3 = bytes[headerIndex + 3];

        const versionBits = (b1 >> 3) & 0x03;
        const layerBits = (b1 >> 1) & 0x03;
        const bitrateBits = (b2 >> 4) & 0x0f;
        const sampleRateBits = (b2 >> 2) & 0x03;
        const channelMode = (b3 >> 6) & 0x03;

        const versions: any = {
            0: 'MPEG Version 2.5',
            1: 'reserved',
            2: 'MPEG Version 2 (ISO/IEC 13818-3)',
            3: 'MPEG Version 1 (ISO/IEC 11172-3)'
        };
        const layers: any = {
            0: 'reserved',
            1: 'Layer III',
            2: 'Layer II',
            3: 'Layer I'
        };

        const sampleRates: any = {
            3: [44100, 48000, 32000],
            2: [22050, 24000, 16000],
            0: [11025, 12000, 8000]
        };
        const versionKey = versionBits;
        const layerKey = layerBits;

        // bitrate tables (kbps)
        const bitrateTable: any = {
            // MPEG1 Layer III
            '3_1': [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],
            // MPEG2/2.5 Layer III
            '0_1': [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
            '2_1': [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],
            // fallback generic table for other layers/versions (best-effort)
            '3_2': [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0],
            '3_3': [0,32,64,96,128,160,192,224,256,320,384,448,512,576,640,0]
        };

        const versionStr = versions[versionKey] || 'unknown';
        const layerStr = layers[layerKey] || 'unknown';
        let sampleRate = sampleRates[versionKey]?.[sampleRateBits] || null;

        let bitrateKbps = 0;
        const tbKey = `${versionKey}_${layerKey}`;
        if (bitrateTable[tbKey]) {
            bitrateKbps = bitrateTable[tbKey][bitrateBits] || 0;
        } else if (bitrateTable['3_1'] && versionKey === 3 && layerKey === 1) {
            bitrateKbps = bitrateTable['3_1'][bitrateBits] || 0;
        }

        const channels = channelMode === 3 ? 1 : 2;
        let duration = null;
        if (bitrateKbps > 0) {
            duration = (bytes.length * 8) / (bitrateKbps * 1000);
        }

        return {
            version: versionStr,
            layer: layerStr,
            bitrateKbps: bitrateKbps || null,
            sampleRate,
            channels,
            duration
        };
    }

    const ext = getExt(file.name);
    const mime = file.type || 'unknown';
    let metadata: {[Key: string]: string | number | null} = {};

    const wavInfo = parseWav(headerBuffer);
    if (wavInfo) {
        metadata.format = 'wav';
        metadata = Object.assign(metadata, wavInfo || {});
    } else if (mime === 'audio/mpeg' || ext === 'mp3') {
        const mp3Info = parseMp3(headerBuffer);
        metadata.format = 'mp3';
        metadata = Object.assign(metadata, mp3Info || {});
    } else {
        // best-effort: report file.type and extension and later rely on AudioContext decode
        metadata.format = mime || ext || 'unknown';
    }

    console.log('Extracted file metadata:', metadata);
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('Metadata:', metadata);
    console.log('Loaded audio file with RMS of', db(rms(Array.from(audioBuffer.getChannelData(0)))));
    return {
        sampleRate: audioBuffer.sampleRate,
        data: Array.from(audioBuffer.getChannelData(0)).map(x => x / 16384), // normalize 16-bit PCM
        duration: audioBuffer.duration,
        metadata
    };
}

/**
 * Creates a new analysis tab in the UI and renders magnitude, phase and impulse-response plots for the provided audio.
 *
 * Description:
 * - Performs spectral and time-domain analysis: computes the FFT of the response, computes an impulse response (two-channel) and derives an FFT from that IR for reference comparison.
 * - Plots: Magnitude (dB) with raw and smoothed reference traces, Phase (degrees) with raw and smoothed traces, and the time-domain impulse response.
 * - Smoothing: applies smoothFFT to the reference frequency response using the smoothing parameters 1/6 and 1/48 (producing "Magnitude (Smoothed)" and "Phase (Smoothed)").
 *
 * Side effects:
 * - Mutates DOM by adding a closable tab button and corresponding tab content elements.
 * - Renders plots using Plotly into the created tab content.
 * - Persists analysis state to storage (IndexedDB/sessionStorage mirror).
 *
 * @param responseData - Audio buffer for the response file to analyze (Float32Array samples in Audio.data).
 * @param referenceData - Optional Audio buffer for the reference file; when provided, reference magnitude/phase and smoothed curves are computed and plotted.
 * @param filename - Display name for the response file (used in tab title and header).
 * @param referenceFilename - Optional display name for the reference file (appended to tab title when present).
 * @returns void
 */
function createAnalysisTab(responseData: Audio, referenceData: Audio | null, filename: string, referenceFilename: string | null): void {
    tabCounter++;
    const tabId = `analysis-${tabCounter}`;
    let shortName = filename.length > 20 ? filename.substring(0, 17) + '...' : filename;
    if (referenceFilename != null) {
        const shortReferenceName = referenceFilename?.length > 20 ? referenceFilename.substring(0, 17) + '...' : referenceFilename;
        shortName += ' / ' + shortReferenceName;
    }
    // Create tab button
    const tab = document.createElement('button');
    tab.className = 'tab tab-closable';
    tab.dataset.tab = tabId;
    tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">✕</span>`;
    tabsContainer.appendChild(tab);

    // Create tab content
    const content = document.createElement('div');
    content.className = 'tab-content';
    content.dataset.content = tabId;
    content.innerHTML = `
        <div class="loose-container">
            <div id="plot-${tabId}-magnitude" class="plot-medium"></div>
            <div id="plot-${tabId}-phase" class="plot-medium"></div>
            <div id="plot-${tabId}-ir" class="plot-medium"></div>
            <div class="analysis-description" style="margin-bottom:12px; font-size:0.95rem; color:#24292e;">
                <p><strong>Analysis:</strong> Magnitude, phase and impulse‑response computed from the uploaded response (and optional reference) via FFT and a two‑channel impulse response.</p>
                <p><strong>Smoothing:</strong> Fractional‑octave smoothing applied to the reference response (1/6 octave).</p>
            </div>
        </div>
    `;
    tabContents.appendChild(content);

    // Switch to new tab
    switchTab(tabId);


    // Compute and plot FFTs
    console.log('Analyzing response file:', filename);
    const data = new Float32Array(responseData.data);
    
    const responseFFT = computeFFT(data);
    const tracesMagnitude: any[] = [{
        x: responseFFT.frequency,
        y: db(responseFFT.magnitude),
        type: 'scatter',
        mode: 'lines',
        name: 'Measurement signal',
        line: { color: '#0366d6', width: 2 }
    }];
    const tracesPhase: any[] = [];
    const tracesIR: any[] = [];

    let irPeakAt = 0;

    if (referenceData) {
        const referenceFFT = computeFFT(referenceData.data);
        tracesMagnitude.push({
            x: referenceFFT.frequency,
            y: db(referenceFFT.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: 'Reference signal',
            line: { color: '#0366d6', width: 2 }
        });
        const ir = twoChannelImpulseResponse(responseData.data, Array.from(referenceData ? referenceData.data : new Float32Array(responseData.data.length)));
        const farina_ir = FarinaImpulseResponse(responseData.data, Array.from(referenceData ? referenceData.data : new Float32Array(responseData.data.length)));

        console.log('Impulse response peak at', ir.peakAt);
        irPeakAt = ir.peakAt;

        tracesIR.push({
            x: ir.t,
            y:ir.ir,        
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Impulse Response',
            line: { color: '#d73a49', width: 1 }
        });
        /* tracesIR.push({
            x: farina_ir.t,
            y: db(farina_ir.ir.map(v => Math.abs(v))),        
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Impulse Response',
            line: { color: '#d73a49', width: 1 }
        }); */
        const transferFunction = computeFFTFromIR(ir, 100);
        const transferFunctionFarina = computeFFTFromIR(farina_ir, 100);
        // const dreferenceFFT = twoChannelFFT(responseData.data, referenceData.data, nextPow2(referenceData.data.length), -5627);
        const smoothedFreqResponse = smoothFFT(transferFunction, 1/6, 1/48);
        const smoothedFreqResponseFarina = smoothFFT(transferFunctionFarina, 1/6, 1/48);
        
        const rmsValue = 1;  // rms(referenceData.data);
        console.log('Reference RMS:', db(rmsValue));

        tracesMagnitude.push({
            x: transferFunction.frequency,
            y: db(transferFunction.magnitude.map(v => v * rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Raw)',
            line: { color: '#d73a4933', width: 1 }
        });
        tracesMagnitude.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.magnitude.map(v => v + db(rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Smoothed)',
            line: { color: '#d73a49', width: 2 }
        });
        /* tracesMagnitude.push({
            x: transferFunctionFarina.frequency,
            y: db(transferFunctionFarina.magnitude.map(v => v * rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function',
            line: { color: '#341fad33', width: 1 }
        });
        tracesMagnitude.push({
            x: smoothedFreqResponseFarina.frequency,
            y: smoothedFreqResponseFarina.magnitude.map(v => v + db(rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function (Smoothed)',
            line: { color: '#341fadff', width: 2 }
        }); */


        tracesPhase.push({
            x: transferFunction.frequency,
            y: transferFunction.phase,
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Raw)',
            line: { color: '#d73a4933', width: 1 }
        });
        tracesPhase.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.phase,
            type: 'scatter',
            mode: 'lines',
            name: 'Dual-FFT Transfer Function (Smoothed)',
            line: { color: '#d73a49', width: 2 }
        });
    }

    const plotSettings: {[key: string]: any} = {
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        legend: { x: 0.98, y: 0.02, xanchor: 'right', yanchor: 'bottom' },
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff',
        staticPlot: false, // Enable interactivity
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
        tightenLats: true,
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
        },
    };

    const layoutMagnitude = {
        title: 'Magnitude Analysis',    
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(20000)],
            tickformat: '.0f',

        },
        yaxis: { 
            title: 'Magnitude (dB)',
            gridcolor: '#e1e4e8',
            rangemode: 'tozero',
            range: [-90, 0],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-magnitude`, tracesMagnitude, layoutMagnitude, { responsive: true });

    const layoutPhase = {
        title: 'Phase Analysis',
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(20000)],
            tickformat: '.0f',
        },
        yaxis: { 
            title: 'Phase (degrees)',
            gridcolor: '#e1e4e8',
            automargin: true,
            range: [-720, 720],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-phase`, tracesPhase, layoutPhase, { responsive: true });

    const layoutIR = {
        title: 'Impulse response',
        xaxis: { 
            title: 'Amplitude', 
            gridcolor: '#e1e4e8',
            range: [-0.05 + irPeakAt / responseData.sampleRate, 0.05 + irPeakAt / responseData.sampleRate],
        },
        yaxis: { 
            title: 'Amplitude (gain)',
            gridcolor: '#e1e4e8',
            automargin: true,
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-ir`, tracesIR, layoutIR, { responsive: true });
    saveState();

    // Persist analysis using IndexedDB (mirrored to sessionStorage for compatibility)
    storage.setItem(`${tabId}`, JSON.stringify({
        filename,
        referenceFilename,
        responseData,
        referenceData,
    })).catch(err => console.error('Failed to persist analysis:', err));
}

// Save and load state from sessionStorage
function saveState(): void {
    const tabs = Array.from(document.querySelectorAll('.tab[data-tab]')).map(tab => ({
        id: (tab as HTMLElement).dataset.tab,
        name: (tab as HTMLElement).textContent?.replace('×', '').trim()
    }));
    
    storage.setItem('tabs', JSON.stringify(tabs));
    console.log('Saved state with tabs:', tabs);
}

async function loadState(): Promise<void> {
    try {
        const savedTabs = await storage.getItem('tabs');
        if (!savedTabs) return;
        const tabs = JSON.parse(savedTabs);
        console.log('Loading saved tabs:', tabs);

        for (const tab of tabs as { id: string; name: string }[]) {
            // Call createAnalysisTab for each tab
            const raw = await storage.getItem(`${tab.id}`);
            const analysisData = raw ? JSON.parse(raw) : null;
            if (analysisData) {
                createAnalysisTab(analysisData.responseData, analysisData.referenceData, analysisData.filename, analysisData.referenceFilename);
            }
        }
        // Tabs will be recreated when user analyzes files again
    } catch (e) {
        console.error('Failed to load saved state:', e);
    }
}

// Load state on page load
loadState();

function max(arg0: Float32Array<ArrayBuffer>): any {
    throw new Error("Function not implemented.");
}
