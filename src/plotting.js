import { getSelectedWindow } from './windows.js';
import { computeFFT } from './audio.js';
import { linspace } from './math.js';
import { rms } from './audio.js';
import { getFractionalOctaveFrequencies, fractionalOctaveSmoothing } from './fractional_octave_smoothing.js';

export function plotFFT(div, dataArray, fftSize, windowType, smoothingFactor = null, range = null, unit = undefined, traces = []) {
    const window = getSelectedWindow(windowType, fftSize);
    const windowed = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        windowed[i] = dataArray[dataArray.length - fftSize + i] * window[i] / fftSize * 2;
    }
    const asd = computeFFT(windowed);
    const mags = asd.mag.map(v => 20 * Math.log10(v));
    const frequencies = linspace(0, 48000 / 2, mags.length);
    traces.push({
        x: [0, 48000 / 2],
        y: [-200, -200],
        showlegend: false, // dB scale,
    });
    if (smoothingFactor) {
        const sf = getFractionalOctaveFrequencies(1/48, 20, 24000, fftSize);
        const mags_s = fractionalOctaveSmoothing(mags, smoothingFactor, sf);
        traces.push({
            x: sf,
            y: mags_s, // dB scale
            mode: "lines",
            name: 'Smoothed',
            line: { width: 2, color: '#2563eb' },
            fill: 'tonexty',
        });
        traces.push({
        x: frequencies,
        y: mags, // dB scale
        mode: "lines",
        name: 'Raw',
        line: { width: 2, color: '#2563eb33' },
    });
    } else {
        traces.push({
        x: frequencies,
        y: mags, // dB scale
        mode: "lines",
        name: 'Raw',
        line: { width: 2, color: '#2563eb' },
        fill: 'tonexty',
    });
    }
    
    Plotly.react(div, traces, {
        margin: { l: 40, r: 10, t: 10, b: 40 },
        xaxis: {
            title: 'Frequency (Hz)',
            type: 'log',
            dtick: 1,
            gridcolor: '#d1d2d4',
            range: [Math.log10(20), Math.log10(24000)],
            autorange: false
        },
        yaxis: {
            title: 'Level (' + (typeof unit !== 'undefined' ? unit : 'dB') + ')',
            gridcolor: '#d1d2d4',
            range: range ? range : [-100, 0],
            dtick: 20,
            autorange: false
        },
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fafbfd',
        legend: { orientation: 'h', y: -0.2 }
    }, {
        staticPlot: false, // Enable interactivity
        scrollZoom: false,  // Allow zoom with mouse wheel
        displayModeBar: true, // Show mode bar with zoom/pan tools
        displaylogo: false, // Hide Plotly logo
        responsive: true,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'resetScale2d', 'zoomIn2d', 'zoomOut2d', 'pan2d', 'Zoom', 'Pan', 'ResetScale2d'],
        toImageButtonOptions: { format: 'png', filename: 'frequency_response', scale: 4 },
        showTips: true,
        doubleClick: 'reset',
        doubleClickDelay: 300,
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
    });
    return traces;
}


export function plotResponse(div, frequencies, h, smoothingFactor = null, range = null, unit = undefined, color = '#60a5fa', traces = []) {    
    if (!frequencies || !h) return traces;
    const fftSize = (h.length - 1) * 2;
    if (smoothingFactor) {
        const sf = getFractionalOctaveFrequencies(1/48, 20, 24000, fftSize);
        const h_smooth = fractionalOctaveSmoothing(h, smoothingFactor, sf);
        traces.push({
            x: sf,
            y: h_smooth, // dB scale
            mode: "lines",
            name: 'Smoothed',
            line: { width: 2, color: color },
            showlegend: false,
        });
        traces.push({
        x: frequencies,
        y: h, // dB scale
        mode: "lines",
        name: 'Raw',
        line: { width: 1.5, color: color + '33' },
            showlegend: false,
    });
    } else {
        traces.push({
        x: frequencies,
        y: h, // dB scale
        mode: "lines",
        name: 'Raw',
        line: { width: 1.5, color: color },
        showlegend: false,
    });
    }
    
    Plotly.react(div, traces, {
        margin: { l: 40, r: 10, t: 10, b: 40 },
        xaxis: {
            title: 'Frequency (Hz)',
            type: 'log',
            dtick: 1,
            gridcolor: '#d1d2d4',
            range: [Math.log10(20), Math.log10(22400)],
            autorange: false
        },
        yaxis: {
            title: 'Level (' + (typeof unit !== 'undefined' ? unit : 'dB') + ')',
            gridcolor: '#d1d2d4',
            range: range ? range : [-100, 0],
            //dtick: 20,
            autorange: false
        },
        paper_bgcolor: '#fff',
        plot_bgcolor: '#fafbfd',
        legend: false,
    }, {
        staticPlot: false, // Enable interactivity
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
    });
    return traces;
}