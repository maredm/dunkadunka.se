import { Audio, computeFFT, computeFFTFromIR, db, FFTResult, groupDelays, ImpulseResponseResult, rms, smoothFFT, twoChannelImpulseResponse } from "./audio";
import { FarinaImpulseResponse } from "./farina";
import { storage } from "./storage";
import { audio } from "./audio";
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
        const responseData = await audio.loadAudioFile(responseFile);
        const referenceData = referenceFile ? await audio.loadAudioFile(referenceFile) : null;

       createAnalysisTab(responseData.applyGain(1 / 16384), referenceData ? referenceData.applyGain(1 / 16384) : null, responseFile.name, referenceFile?.name || null);
    } catch (error) {
        alert('Error analyzing files: ' + (error as Error).message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Frequency Response';
    }
});


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
        <nav class="menu-bar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <label for="smoothing-${tabId}" style="font-weight:600;color:#24292e;">Smoothing</label>
                <select id="smoothing-${tabId}" class="smoothing-select" aria-label="Smoothing factor">
                    <option value="0">None</option>
                    <option value="1/3">1/3 octave</option>
                    <option value="1/6" selected>1/6 octave</option>
                    <option value="1/12">1/12 octave</option>
                    <option value="1/24">1/24 octave</option>
                    <option value="1/48">1/48 octave</option>
                </select>
                <button id="apply-smoothing-${tabId}" class="btn" style="padding:6px 10px;border-radius:4px;border:1px solid #d1d5da;background:#0366d6;color:#fff;cursor:pointer;">Apply</button>
            </div>
            <div style="font-size:0.9rem;color:#586069;">Select smoothing factor for smoothed traces</div>
        </nav>
        <div class="loose-container">
            <h5 class="text-xs italic text-gray-600">Frequency Response Analysis of ${filename}${referenceFilename ? ' / ' + referenceFilename : ''}</h5>
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
    console.log('Response audio data:', responseData);
    const responseSamples = responseData.getChannelData(0);
    
    console.log(responseData.getChannelData(0));
    const responseFFT = computeFFT(responseSamples);
    const tracesMagnitude: any[] = [{
        x: responseFFT.frequency,
        y: db(responseFFT.magnitude),
        type: 'scatter',
        mode: 'lines',
        name: 'Measurement signal',
        line: { color: '#0366d6', width: 2 }
    }];
    const tracesPhase: any[] = [];
    const tracesPhaseSecondary: any[] = [];
    const tracesIR: any[] = [];

    let irPeakAt = 0;

    let referenceSamples = Float32Array.from([]);

    if (referenceData) {
        referenceSamples = referenceData.getChannelData(0);
        const referenceFFT: FFTResult = computeFFT(referenceSamples);
        tracesMagnitude.push({
            x: referenceFFT.frequency,
            y: db(referenceFFT.magnitude),
            type: 'scatter',
            mode: 'lines',
            name: 'Reference signal',
            line: { color: '#0366d6', width: 2 }
        });
        const ir: ImpulseResponseResult = twoChannelImpulseResponse(responseSamples, referenceSamples);
        const farina_ir: ImpulseResponseResult = FarinaImpulseResponse(responseSamples, referenceSamples);

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
        const transferFunction = computeFFTFromIR(ir);
        const transferFunctionFarina = computeFFTFromIR(farina_ir);
        // const dreferenceFFT = twoChannelFFT(responseData.data, referenceSamples, nextPow2(referenceSamples.length), -5627);
        const smoothedFreqResponse = smoothFFT(transferFunction, 1/6, 1/48);
        const smoothedFreqResponseFarina = smoothFFT(transferFunctionFarina, 1/6, 1/48);
        
        const rmsValue = 1;  // rms(referenceSamples);
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
        tracesMagnitude.push({
            x: transferFunctionFarina.frequency.map(v => v / 2),
            y: db(transferFunctionFarina.magnitude.map(v => v * rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function',
            line: { color: '#341fad33', width: 1 }
        });
        tracesMagnitude.push({
            x: smoothedFreqResponseFarina.frequency.map(v => v / 2),
            y: smoothedFreqResponseFarina.magnitude.map(v => v + db(rmsValue)),
            type: 'scatter',
            mode: 'lines',
            name: 'Farina Transfer Function (Smoothed)',
            line: { color: '#341fadff', width: 2 }
        });


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
        const gd = groupDelays(transferFunction, 1000);
        tracesPhase.push({
            x: transferFunction.frequency,
            y: gd,
            type: 'scatter',
            mode: 'lines',
            name: 'Group Delay (Calculated on a reduced set of points)',
            line: { color: '#d73a49', width: 2, dash: 'dot' },
            yaxis: 'y2'
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
        yaxis2: { 
            title: 'Group Delay (ms)',
            gridcolor: '#e1e4e8',
            automargin: true,
            anchor: 'x', 
            overlaying: 'y', 
            side: 'right',
            range: [-20, 20],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-phase`, tracesPhase, layoutPhase, { responsive: true });


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
            range: [-85, 5],
        },
        ...plotSettings
    };

    (window as any).Plotly.newPlot(`plot-${tabId}-magnitude`, tracesMagnitude, layoutMagnitude, { responsive: true });

    
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
        responseSamples: Array.from(responseSamples),
        referenceSamples: referenceSamples.length > 0 ? Array.from(referenceSamples) : null,
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
            console.log('Restoring analysis data for tab', tab.id, analysisData);
            if (analysisData) {
                createAnalysisTab(Audio.fromSamples(Float32Array.from(analysisData.responseSamples)), analysisData.referenceSamples ? Audio.fromSamples(Float32Array.from(analysisData.referenceSamples)) : null, analysisData.filename, analysisData.referenceFilename);
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
