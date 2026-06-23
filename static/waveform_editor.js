"use strict";
/**
 * Waveform Editor
 *
 * A waveform visualization tool based on the old waveform.js implementation
 * Displays audio waveforms with zoom, pan, and playback capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaveformEditor = void 0;
exports.createWaveformEditor = createWaveformEditor;
const AGGREGATED_DATA_MULTIPLIER = 256;
const AGGREGATED_WAVEFORM_THRESHOLD = 60 * 48000;
class WaveformEditor {
    constructor(containerElement) {
        this.audioData = null;
        this.svgContainer = null;
        this.containerEl = null;
        this.audioContext = null;
        this.playbackSource = null;
        this.zoomState = {
            start: 0,
            end: 0,
            inited: false
        };
        this.viewState = {
            start: 0,
            end: 0,
            zoom: 1,
            amplitude_scaling: 1,
            followPlayhead: true
        };
        this.playheadPosition = null;
        this.isPlaying = false;
        this.animationFrameId = null;
        this.aggregatedData = [];
        this.containerEl = containerElement;
        this.setupAudioContext();
        this.setupSVG();
    }
    setupAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    setupSVG() {
        if (!this.containerEl)
            return;
        // Clear container
        this.containerEl.innerHTML = '';
        // Create SVG element
        this.svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svgContainer.style.width = '100%';
        this.svgContainer.style.height = '100%';
        this.svgContainer.style.display = 'block';
        this.svgContainer.style.background = '#fff';
        this.containerEl.appendChild(this.svgContainer);
        // Set up wheel event for zoom/pan
        this.svgContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.svgContainer.addEventListener('click', (e) => this.handleClick(e));
    }
    handleWheel(e) {
        e.preventDefault();
        const rect = this.svgContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const normX = mouseX / rect.width;
        const visible = this.zoomState.end - this.zoomState.start;
        const factor = Math.pow(1.003, e.deltaY);
        const minWindow = 20;
        const maxWindow = this.getDuration();
        let newWindow = Math.round(visible * factor);
        newWindow = Math.min(Math.max(newWindow, minWindow), maxWindow);
        const focalSample = this.zoomState.start + Math.round(normX * visible);
        let newStart = Math.round(focalSample - normX * newWindow);
        // Handle horizontal pan
        const PAN_SENSITIVITY = 0.5;
        if (Math.abs(e.deltaX) > 0) {
            const panFraction = (e.deltaX * PAN_SENSITIVITY) / rect.width;
            const panSamples = Math.round(panFraction * visible);
            newStart += panSamples;
        }
        newStart = Math.min(Math.max(0, newStart), this.getDuration() - newWindow);
        const newEnd = newStart + newWindow;
        this.zoomState.start = newStart;
        this.zoomState.end = newEnd;
        this.viewState.start = newStart;
        this.viewState.end = newEnd;
        this.render();
    }
    handleClick(e) {
        const rect = this.svgContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        const duration = this.getDuration();
        const samplePosition = this.zoomState.start + ratio * (this.zoomState.end - this.zoomState.start);
        this.seek(Math.max(0, Math.min(samplePosition, duration)));
    }
    loadAudio(audio) {
        this.audioData = audio;
        const duration = audio.length;
        this.zoomState = { start: 0, end: duration, inited: false };
        this.viewState.start = 0;
        this.viewState.end = duration;
        this.viewState.amplitude_scaling = 1;
        this.processWaveformData();
        this.render();
    }
    processWaveformData() {
        if (!this.audioData)
            return;
        this.aggregatedData = [];
        for (let ch = 0; ch < this.audioData.numberOfChannels; ch++) {
            const samples = this.audioData.getChannelData(ch);
            const aggregatedLength = Math.ceil(samples.length / AGGREGATED_DATA_MULTIPLIER);
            const { max, min } = this.computeWaveformEnvelope(aggregatedLength, samples);
            this.aggregatedData[ch] = { max, min };
        }
    }
    computeWaveformEnvelope(bins, samples) {
        const step = Math.max(1, samples.length / bins);
        const max = new Float32Array(bins).fill(-Infinity);
        const min = new Float32Array(bins).fill(Infinity);
        for (let i = 0; i < samples.length; i++) {
            const idx = Math.floor(i / step);
            if (idx >= bins)
                break;
            max[idx] = Math.max(max[idx], samples[i]);
            min[idx] = Math.min(min[idx], samples[i]);
        }
        return { max, min };
    }
    render() {
        if (!this.svgContainer || !this.audioData)
            return;
        const rect = this.containerEl.getBoundingClientRect();
        const displayWidth = Math.max(1, Math.floor(rect.width));
        const displayHeight = Math.max(1, Math.floor(rect.height));
        this.svgContainer.setAttribute('viewBox', `0 0 ${displayWidth} ${displayHeight}`);
        this.svgContainer.innerHTML = '';
        const centerY = displayHeight / 2;
        const maxAmplitude = 0.90 * centerY;
        // Draw background
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', displayWidth.toString());
        bg.setAttribute('height', displayHeight.toString());
        bg.setAttribute('fill', '#fff');
        this.svgContainer.appendChild(bg);
        // Draw grid lines
        this.drawGrid(displayWidth, displayHeight);
        // Draw center line
        const centerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        centerLine.setAttribute('x1', '0');
        centerLine.setAttribute('y1', centerY.toString());
        centerLine.setAttribute('x2', displayWidth.toString());
        centerLine.setAttribute('y2', centerY.toString());
        centerLine.setAttribute('stroke', 'rgba(0,0,0,0.1)');
        centerLine.setAttribute('stroke-width', '1');
        this.svgContainer.appendChild(centerLine);
        // Draw waveform
        const channel = 0;
        this.drawWaveform(channel, displayWidth, displayHeight, centerY, maxAmplitude);
        // Draw playhead
        if (this.playheadPosition !== null) {
            this.drawPlayhead(displayWidth, displayHeight);
        }
    }
    drawGrid(width, height) {
        const lineCount = 5;
        for (let i = 1; i < lineCount; i++) {
            const y = (height / lineCount) * i;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '0');
            line.setAttribute('y1', y.toString());
            line.setAttribute('x2', width.toString());
            line.setAttribute('y2', y.toString());
            line.setAttribute('stroke', '#e1e4e8');
            line.setAttribute('stroke-width', '1');
            this.svgContainer.appendChild(line);
        }
    }
    drawWaveform(channel, width, height, centerY, maxAmplitude) {
        if (!this.audioData || !this.aggregatedData[channel])
            return;
        const { max, min } = this.aggregatedData[channel];
        const visibleSamples = this.zoomState.end - this.zoomState.start;
        // Build path for top envelope
        let pathTop = `M 0 ${centerY}`;
        let pathBottom = `M 0 ${centerY}`;
        for (let x = 0; x < width; x++) {
            const sampleIdx = this.zoomState.start + (x / width) * visibleSamples;
            const binIdx = Math.floor(sampleIdx / AGGREGATED_DATA_MULTIPLIER);
            if (binIdx >= max.length)
                break;
            const maxVal = Math.max(max[binIdx], 0) * maxAmplitude;
            const minVal = Math.min(min[binIdx], 0) * maxAmplitude;
            const yTop = centerY - maxVal;
            const yBottom = centerY - minVal;
            pathTop += ` L ${x} ${yTop}`;
            pathBottom += ` L ${x} ${yBottom}`;
        }
        pathBottom += ` L ${width} ${centerY} Z`;
        // Draw filled waveform
        const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        fill.setAttribute('d', pathTop + ` L ${width} ${centerY}` + pathBottom.slice(pathBottom.indexOf('L')));
        fill.setAttribute('fill', 'rgba(3, 102, 214, 0.15)');
        fill.setAttribute('stroke', 'none');
        this.svgContainer.appendChild(fill);
        // Draw top envelope
        const topLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        topLine.setAttribute('d', pathTop);
        topLine.setAttribute('stroke', '#0366d6');
        topLine.setAttribute('stroke-width', '1');
        topLine.setAttribute('fill', 'none');
        this.svgContainer.appendChild(topLine);
        // Draw bottom envelope
        const bottomLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bottomLine.setAttribute('d', pathBottom.split('Z')[0]);
        bottomLine.setAttribute('stroke', '#0366d6');
        bottomLine.setAttribute('stroke-width', '1');
        bottomLine.setAttribute('fill', 'none');
        this.svgContainer.appendChild(bottomLine);
    }
    drawPlayhead(width, height) {
        if (this.playheadPosition === null)
            return;
        const visibleSamples = this.zoomState.end - this.zoomState.start;
        const position = this.playheadPosition - this.zoomState.start;
        const x = (position / visibleSamples) * width;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x.toString());
        line.setAttribute('y1', '0');
        line.setAttribute('x2', x.toString());
        line.setAttribute('y2', height.toString());
        line.setAttribute('stroke', '#d73a49');
        line.setAttribute('stroke-width', '2');
        this.svgContainer.appendChild(line);
    }
    play() {
        if (!this.audioContext || !this.audioData)
            return;
        this.stop();
        const sourceBuffer = this.audioContext.createBuffer(this.audioData.numberOfChannels, this.audioData.length, this.audioContext.sampleRate);
        for (let ch = 0; ch < this.audioData.numberOfChannels; ch++) {
            sourceBuffer.getChannelData(ch).set(this.audioData.getChannelData(ch));
        }
        this.playbackSource = this.audioContext.createBufferSource();
        this.playbackSource.buffer = sourceBuffer;
        this.playbackSource.connect(this.audioContext.destination);
        const startPosition = (this.playheadPosition || 0) / this.audioContext.sampleRate;
        this.playbackSource.start(0, startPosition);
        this.isPlaying = true;
        this.animatePlayhead();
    }
    stop() {
        if (this.playbackSource) {
            try {
                this.playbackSource.stop();
            }
            catch (e) {
                // Already stopped
            }
        }
        this.isPlaying = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    seek(samplePosition) {
        this.stop();
        this.playheadPosition = Math.max(0, Math.min(samplePosition, this.getDuration()));
        this.render();
    }
    animatePlayhead() {
        if (!this.audioContext || !this.isPlaying)
            return;
        const startTime = this.audioContext.currentTime;
        const startPosition = this.playheadPosition || 0;
        const animate = () => {
            if (!this.isPlaying)
                return;
            const elapsed = (this.audioContext.currentTime - startTime) * this.audioContext.sampleRate;
            const newPosition = startPosition + elapsed;
            if (newPosition >= this.getDuration()) {
                this.stop();
                this.render();
                return;
            }
            this.playheadPosition = newPosition;
            this.render();
            this.animationFrameId = requestAnimationFrame(animate);
        };
        this.animationFrameId = requestAnimationFrame(animate);
    }
    getDuration() {
        return this.audioData ? this.audioData.length : 0;
    }
    destroy() {
        this.stop();
        if (this.svgContainer) {
            this.svgContainer.removeEventListener('wheel', (e) => this.handleWheel(e));
            this.svgContainer.removeEventListener('click', (e) => this.handleClick(e));
        }
    }
}
exports.WaveformEditor = WaveformEditor;
function createWaveformEditor(containerElement, audio) {
    const editor = new WaveformEditor(containerElement);
    editor.loadAudio(audio);
    return editor;
}
