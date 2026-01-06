import { FFT } from "./fft";
import { getFractionalOctaveFrequencies, fractionalOctaveSmoothing } from "./fractional_octave_smoothing";
import { abs } from "./math";
import { computeFFT, db, smoothFFT, twoChannelFFT } from "./audio";

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

// Tab switching
tabsContainer.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    
    if (target.classList.contains('tab-close')) {
        const tab = target.parentElement as HTMLElement;
        const tabId = tab.dataset.tab;
        
        if (tabId !== 'upload') {
            tab.remove();
            document.querySelector(`[data-content="${tabId}"]`)?.remove();
            
            // Activate upload tab if current was closed
            if (tab.classList.contains('active')) {
                switchTab('upload');
            }
        }
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
    return {
        sampleRate: audioBuffer.sampleRate,
        data: Array.from(audioBuffer.getChannelData(0)),
        duration: audioBuffer.duration,
        metadata
    };
}

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
    tab.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close">×</span>`;
    tabsContainer.appendChild(tab);

    // Create tab content
    const content = document.createElement('div');
    content.className = 'tab-content';
    content.dataset.content = tabId;
    content.innerHTML = `
        <h2>${filename}</h2>
        <div class="loose-container">
            <div id="plot-${tabId}"></div>
            <div id="plot-${tabId}1"></div>
        </div>
    `;
    tabContents.appendChild(content);

    // Switch to new tab
    switchTab(tabId);

    // Compute and plot FFTs
    console.log('Analyzing response file:', filename);
    console.log(responseData, 'response samples');
    const data = new Float32Array(responseData.data);
    console.log('Response data loaded', data, 'samples');
    
    const responseFFT = computeFFT(data);
    console.log('Response FFT computed', responseFFT);
    
    const traces: any[] = [{
        x: responseFFT.frequency,
        y: db(responseFFT.magnitude),
        type: 'scatter',
        mode: 'lines',
        name: 'Response',
        line: { color: '#0366d6', width: 2 }
    }];
    const trace1s: any[] = [];

    if (referenceData) {
        const referenceFFT = twoChannelFFT(responseData.data, referenceData.data, responseFFT.fftSize, null);
        
        /*traces.push({
            x: referenceFFT.frequency,
            y: db(referenceFFT.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: 'Reference',
            line: { color: '#28a745', width: 2 }
        });

        // Frequency response (difference)
        const freqResponse = responseFFT.magnitude.map((val, i) => 
            db(val) - db((referenceFFT.magnitude[i]))
        );
        
        traces.push({
            x: responseFFT.frequency,
            y: freqResponse,
            type: 'scatter',
            mode: 'lines',
            name: 'Frequency Response',
            line: { color: '#d73a4933', width: 1 }
        });
        
        const smoothedFreqResponse = smoothFFT({
            frequency: responseFFT.frequency,
            magnitude: freqResponse,
            phase: responseFFT.phase,
            fftSize: responseFFT.fftSize
        }, 1/3, 1/48);

        traces.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.magnitude,
            type: 'scatter',
            mode: 'lines',
            name: 'Frequency Response',
            line: { color: '#d73a49', width: 2 }
        });
        */
        const smoothedFreqResponse = smoothFFT(referenceFFT, 1/6, 1/48);
        traces.push({
            x: referenceFFT.frequency,
            y: referenceFFT.magnitude,
            type: 'scatter',
            mode: 'lines',
            name: 'Frequency Response (Raw)',
            line: { color: '#d73a4933', width: 1 }
        });
        traces.push({
            x: smoothedFreqResponse.frequency,
            y: smoothedFreqResponse.magnitude,
            type: 'scatter',
            mode: 'lines',
            name: 'Frequency Response (Smoothed)',
            line: { color: '#d73a49', width: 2 }
        });

        trace1s.push({
            x: referenceFFT.frequency,
            y: referenceFFT.phase,
            type: 'scatter',
            mode: 'lines',
            name: 'Reference Phase',
            line: { color: '#d73a49', width: 2 }
        });
    }

    const layout = {
        title: 'Frequency Analysis',
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(24000)],
        },
        yaxis: { 
            title: 'Magnitude (dB)',
            gridcolor: '#e1e4e8'
        },
        legend: { x: 0.02, y: 0.98 },
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff',
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
        },
    };

    (window as any).Plotly.newPlot(`plot-${tabId}`, traces, layout, { responsive: true });

    const layouta = {
        title: 'Phase Analysis',
        xaxis: { 
            title: 'Frequency (Hz)', 
            type: 'log',
            gridcolor: '#e1e4e8',
            range: [Math.log10(20), Math.log10(24000)],
        },
        yaxis: { 
            title: 'Phase (degrees)',
            gridcolor: '#e1e4e8'
        },
        legend: { x: 0.02, y: 0.98 },
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff',
        staticPlot: false, // Enable interactivity
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
        },
    };

    (window as any).Plotly.newPlot(`plot-${tabId}1`, trace1s, layouta, { responsive: true });

    saveState();

    sessionStorage.setItem(`analysis-${tabId}`, JSON.stringify({
        filename,
        referenceFilename,
        responseData,
        referenceData,
    }));
}

// Save and load state from sessionStorage
function saveState(): void {
    const tabs = Array.from(document.querySelectorAll('.tab[data-tab]')).map(tab => ({
        id: (tab as HTMLElement).dataset.tab,
        name: (tab as HTMLElement).textContent?.replace('×', '').trim()
    }));
    
    sessionStorage.setItem('tabs', JSON.stringify(tabs));
}

function loadState(): void {
    const savedTabs = sessionStorage.getItem('tabs');
    if (savedTabs) {
        try {
            const tabs = JSON.parse(savedTabs);
            console.log('Loaded saved tabs:', tabs);

            tabs.forEach((tab: { id: string; name: string }) => {
                // Call createAnalysisTab for each tab
                const analysisData = JSON.parse(sessionStorage.getItem(`analysis-${tab.id}`) || 'null');
                if (analysisData) {
                    console.log('Restoring analysis tab:', analysisData);
                    createAnalysisTab(analysisData.responseData, analysisData.referenceData, analysisData.filename, analysisData.referenceFilename);
                }
            });
            // Tabs will be recreated when user analyzes files again
        } catch (e) {
            console.error('Failed to load saved state:', e);
        }
    }
}

// Load state on page load
loadState();