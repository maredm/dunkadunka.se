import "./styles.css";
import { createLiveMonitorController, type LiveMonitorController } from "./live_monitor";
import { mountWaveformTool, type WaveformToolHandle } from "./waveform";
import { createMeasurementController, type MeasurementController } from "./measurement";
import { readMultichannelWavFile } from "./wavfile";
import { fft } from "./fft";
import { nextPow2 } from "./math";
import { calculateTwoChannelImpulseResponse } from "./signal";

type LoadedAudioFile = {
	id: string;
	file: File;
};

type PlotSession = {
	tool: WaveformToolHandle;
	measurement: MeasurementController | null;
	rerenderDerivedPlots?: () => void;
};

type PhaseResponse = {
	frequencies: Float32Array;
	phasesDeg: Float32Array;
};

const tabsOuter = document.getElementById("tabs-outer") as HTMLElement | null;
const tabsInner = document.getElementById("tabs") as HTMLElement | null;
const tabContents = document.getElementById("tab-contents") as HTMLElement | null;
const uploadInput = document.getElementById("responseFileUpload") as HTMLInputElement | null;
const fileTableBody = document.getElementById("fileTableBody") as HTMLTableSectionElement | null;
const acquisitionStimulusSelect = document.getElementById("acquisitionStimulusSelect") as HTMLSelectElement | null;
const acquisitionInputDeviceSelect = document.getElementById("acquisitionInputDeviceSelect") as HTMLSelectElement | null;
const acquisitionInputChannelSelect = document.getElementById("acquisitionInputChannelSelect") as HTMLSelectElement | null;
const acquisitionOutputDeviceSelect = document.getElementById("acquisitionOutputDeviceSelect") as HTMLSelectElement | null;
const acquisitionOutputChannelSelect = document.getElementById("acquisitionOutputChannelSelect") as HTMLSelectElement | null;
const acquisitionCommentInput = document.getElementById("acquisitionCommentInput") as HTMLInputElement | null;
const acquisitionStatusText = document.getElementById("acquisitionStatusText") as HTMLParagraphElement | null;
const acquisitionRecordBtn = document.getElementById("acquisitionRecordBtn") as HTMLButtonElement | null;
const acquisitionStopBtn = document.getElementById("acquisitionStopBtn") as HTMLButtonElement | null;
const liveMicDeviceSelect = document.getElementById("liveMicDeviceSelect") as HTMLSelectElement | null;
const liveMicChannelSelect = document.getElementById("liveMicChannelSelect") as HTMLSelectElement | null;
const liveReferenceDeviceSelect = document.getElementById("liveReferenceDeviceSelect") as HTMLSelectElement | null;
const liveReferenceChannelSelect = document.getElementById("liveReferenceChannelSelect") as HTMLSelectElement | null;
const liveAverageTimeConstantSelect = document.getElementById("liveAverageTimeConstantSelect") as HTMLSelectElement | null;
const liveSmoothingSelect = document.getElementById("liveSmoothingSelect") as HTMLSelectElement | null;
const liveWeightingSelect = document.getElementById("liveWeightingSelect") as HTMLSelectElement | null;
const liveStatusText = document.getElementById("liveStatusText") as HTMLParagraphElement | null;
const liveStartBtn = document.getElementById("liveStartBtn") as HTMLButtonElement | null;
const liveStopBtn = document.getElementById("liveStopBtn") as HTMLButtonElement | null;
const liveMicSplValue = document.getElementById("liveMicSplValue") as HTMLElement | null;
const liveReferenceSplValue = document.getElementById("liveReferenceSplValue") as HTMLElement | null;
const liveDifferenceSplValue = document.getElementById("liveDifferenceSplValue") as HTMLElement | null;
const liveSplHistoryCanvas = document.getElementById("liveSplHistoryCanvas") as HTMLCanvasElement | null;
const liveSpectrumCanvas = document.getElementById("liveSpectrumCanvas") as HTMLCanvasElement | null;
const liveImpulseCanvas = document.getElementById("liveImpulseCanvas") as HTMLCanvasElement | null;
const livePhaseCanvas = document.getElementById("livePhaseCanvas") as HTMLCanvasElement | null;

if (!tabsOuter || !tabsInner || !tabContents || !uploadInput || !fileTableBody) {
	throw new Error("Missing required tab UI elements.");
}

if (
	!acquisitionStimulusSelect ||
	!acquisitionInputDeviceSelect ||
	!acquisitionInputChannelSelect ||
	!acquisitionOutputDeviceSelect ||
	!acquisitionOutputChannelSelect ||
	!acquisitionCommentInput ||
	!acquisitionStatusText ||
	!acquisitionRecordBtn ||
	!acquisitionStopBtn
) {
	throw new Error("Missing required acquisition toolbar elements.");
}

const tabsInnerEl: HTMLElement = tabsInner;
const tabContentsEl: HTMLElement = tabContents;
const fileTableBodyEl: HTMLTableSectionElement = fileTableBody;

const files = new Map<string, LoadedAudioFile>();
const plotSessions = new Map<string, PlotSession>();
let tabCounter = 0;
let acquisitionMeasurementController: MeasurementController | null = null;
let liveMonitorController: LiveMonitorController | null = null;

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / (1024 ** exponent);
	return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function switchTab(tabId: string): void {
	document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
	document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
	document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
	document.querySelector(`[data-content="${tabId}"]`)?.classList.add("active");

	requestAnimationFrame(() => {
		window.dispatchEvent(new Event("resize"));
	});
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function drawEmptyPlot(canvas: HTMLCanvasElement, title: string, message: string): void {
	const rect = canvas.getBoundingClientRect();
	const width = Math.max(1, Math.floor(rect.width || canvas.width || 1));
	const height = Math.max(1, Math.floor(rect.height || canvas.height || 1));
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = "rgba(181, 192, 224, 0.16)";
	ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

	ctx.fillStyle = "#f8fafc";
	ctx.font = "12px sans-serif";
	ctx.fillText(title, 10, 18);
	ctx.fillStyle = "#9aa4b2";
	ctx.fillText(message, 10, 40);
}

function drawLinePlot(
	canvas: HTMLCanvasElement,
	title: string,
	xLabel: string,
	yLabel: string,
	x: Float32Array,
	y: Float32Array,
	lineColor: string,
	options: { logX?: boolean; yMin?: number; yMax?: number } = {},
): void {
	const rect = canvas.getBoundingClientRect();
	const width = Math.max(1, Math.floor(rect.width || canvas.width || 1));
	const height = Math.max(1, Math.floor(rect.height || canvas.height || 1));
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = "rgba(181, 192, 224, 0.16)";
	ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

	const left = 48;
	const right = 12;
	const top = 24;
	const bottom = 28;
	const plotWidth = Math.max(1, width - left - right);
	const plotHeight = Math.max(1, height - top - bottom);

	let xMin = Number.POSITIVE_INFINITY;
	let xMax = Number.NEGATIVE_INFINITY;
	let yMin = Number.POSITIVE_INFINITY;
	let yMax = Number.NEGATIVE_INFINITY;

	for (let index = 0; index < x.length; index += 1) {
		const xv = x[index] ?? 0;
		const yv = y[index] ?? 0;
		if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
			continue;
		}
		xMin = Math.min(xMin, xv);
		xMax = Math.max(xMax, xv);
		yMin = Math.min(yMin, yv);
		yMax = Math.max(yMax, yv);
	}

	if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
		drawEmptyPlot(canvas, title, "No finite data points.");
		return;
	}

	if (options.yMin !== undefined) {
		yMin = options.yMin;
	}
	if (options.yMax !== undefined) {
		yMax = options.yMax;
	}
	if (yMax <= yMin) {
		yMax = yMin + 1;
	}

	const useLogX = options.logX === true;
	const xMinLog = Math.log10(Math.max(1e-9, xMin));
	const xMaxLog = Math.log10(Math.max(1e-9, xMax));

	const projectX = (value: number): number => {
		if (useLogX) {
			const lv = Math.log10(Math.max(1e-9, value));
			const frac = (lv - xMinLog) / Math.max(1e-9, xMaxLog - xMinLog);
			return left + clamp(frac, 0, 1) * plotWidth;
		}
		const frac = (value - xMin) / Math.max(1e-12, xMax - xMin);
		return left + clamp(frac, 0, 1) * plotWidth;
	};

	const projectY = (value: number): number => {
		const frac = (value - yMin) / Math.max(1e-12, yMax - yMin);
		return top + (1 - clamp(frac, 0, 1)) * plotHeight;
	};

	ctx.strokeStyle = "rgba(181, 192, 224, 0.12)";
	ctx.lineWidth = 1;
	for (let i = 0; i <= 5; i += 1) {
		const yv = yMin + ((yMax - yMin) * i) / 5;
		const py = projectY(yv);
		ctx.beginPath();
		ctx.moveTo(left, py + 0.5);
		ctx.lineTo(left + plotWidth, py + 0.5);
		ctx.stroke();
	}

	ctx.fillStyle = "#9aa4b2";
	ctx.font = "10px sans-serif";
	for (let i = 0; i <= 5; i += 1) {
		const yv = yMin + ((yMax - yMin) * i) / 5;
		const py = projectY(yv);
		ctx.fillText(yv.toFixed(1), 4, py + 3);
	}

	if (useLogX) {
		const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter((v) => v >= xMin && v <= xMax);
		for (const tick of ticks) {
			const px = projectX(tick);
			ctx.beginPath();
			ctx.moveTo(px + 0.5, top);
			ctx.lineTo(px + 0.5, top + plotHeight);
			ctx.stroke();
			ctx.fillText(tick >= 1000 ? `${Math.round(tick / 1000)}k` : `${tick}`, px - 8, height - 8);
		}
	} else {
		for (let i = 0; i <= 5; i += 1) {
			const xv = xMin + ((xMax - xMin) * i) / 5;
			const px = projectX(xv);
			ctx.beginPath();
			ctx.moveTo(px + 0.5, top);
			ctx.lineTo(px + 0.5, top + plotHeight);
			ctx.stroke();
			ctx.fillText(xv.toFixed(0), px - 8, height - 8);
		}
	}

	ctx.beginPath();
	let started = false;
	for (let i = 0; i < x.length; i += 1) {
		const xv = x[i] ?? 0;
		const yv = y[i] ?? 0;
		if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
			continue;
		}
		const px = projectX(xv);
		const py = projectY(yv);
		if (!started) {
			ctx.moveTo(px, py);
			started = true;
		} else {
			ctx.lineTo(px, py);
		}
	}
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	ctx.fillStyle = "#f8fafc";
	ctx.font = "12px sans-serif";
	ctx.fillText(title, left, 16);
	ctx.fillStyle = "#9aa4b2";
	ctx.fillText(xLabel, left + plotWidth - 80, height - 8);
	ctx.save();
	ctx.translate(10, top + plotHeight / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillText(yLabel, 0, 0);
	ctx.restore();
}

function computeTransferPhaseResponse(recorded: Float32Array, stimulus: Float32Array, sampleRate: number): PhaseResponse | null {
	const n = Math.min(recorded.length, stimulus.length);
	if (n < 8 || sampleRate <= 0) {
		return null;
	}

	const nfft = nextPow2(n);
	const rec = new Array<number>(nfft).fill(0);
	const stim = new Array<number>(nfft).fill(0);
	for (let i = 0; i < n; i += 1) {
		rec[i] = recorded[i] ?? 0;
		stim[i] = stimulus[i] ?? 0;
	}

	const [yRe, yIm] = fft(rec);
	const [xRe, xIm] = fft(stim);

	const nyquist = sampleRate / 2;
	const minHz = 20;
	const maxHz = Math.min(20000, nyquist);
	const freqs: number[] = [];
	const phases: number[] = [];

	let prev = 0;
	let first = true;
	for (let k = 1; k < nfft / 2; k += 1) {
		const freq = (k * sampleRate) / nfft;
		if (freq < minHz || freq > maxHz) {
			continue;
		}
		const denom = (xRe[k] * xRe[k]) + (xIm[k] * xIm[k]);
		if (denom <= 1e-20) {
			continue;
		}
		const hRe = ((yRe[k] * xRe[k]) + (yIm[k] * xIm[k])) / denom;
		const hIm = ((yIm[k] * xRe[k]) - (yRe[k] * xIm[k])) / denom;
		let phase = Math.atan2(hIm, hRe) * (180 / Math.PI);

		if (!first) {
			let delta = phase - prev;
			while (delta > 180) {
				phase -= 360;
				delta -= 360;
			}
			while (delta < -180) {
				phase += 360;
				delta += 360;
			}
		}
		first = false;
		prev = phase;

		freqs.push(freq);
		phases.push(phase);
	}

	if (freqs.length === 0) {
		return null;
	}

	return {
		frequencies: Float32Array.from(freqs),
		phasesDeg: Float32Array.from(phases),
	};
}

function normalizePhaseAtReference(
	frequencies: Float32Array,
	phasesDeg: Float32Array,
	referenceHz = 1000,
): Float32Array {
	if (frequencies.length === 0 || phasesDeg.length === 0) {
		return phasesDeg;
	}

	let bestIndex = 0;
	let bestDiff = Number.POSITIVE_INFINITY;
	for (let i = 0; i < frequencies.length; i += 1) {
		const diff = Math.abs((frequencies[i] ?? 0) - referenceHz);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestIndex = i;
		}
	}

	const refPhase = phasesDeg[bestIndex] ?? 0;
	const normalized = new Float32Array(phasesDeg.length);
	for (let i = 0; i < phasesDeg.length; i += 1) {
		normalized[i] = (phasesDeg[i] ?? 0) - refPhase;
	}
	return normalized;
}

function computeImpulseResponseWindowed(recorded: Float32Array, stimulus: Float32Array, sampleRate: number): { timeMs: Float32Array; amplitude: Float32Array } | null {
	const n = Math.min(recorded.length, stimulus.length);
	if (n < 8 || sampleRate <= 0) {
		return null;
	}

	const nfft = nextPow2(n);
	const rec = new Float32Array(nfft);
	const stim = new Float32Array(nfft);
	rec.set(recorded.subarray(0, n), 0);
	stim.set(stimulus.subarray(0, n), 0);

	const ir = calculateTwoChannelImpulseResponse(rec, stim) as Float32Array;
	if (!ir || ir.length === 0) {
		return null;
	}

	let peakIndex = 0;
	let peakValue = 0;
	for (let i = 0; i < ir.length; i += 1) {
		const v = Math.abs(ir[i] ?? 0);
		if (v > peakValue) {
			peakValue = v;
			peakIndex = i;
		}
	}

	const before = Math.round(0.05 * sampleRate);
	const after = Math.round(0.5 * sampleRate);
	const start = Math.max(0, peakIndex - before);
	const end = Math.min(ir.length, peakIndex + after);
	if (end <= start + 2) {
		return null;
	}

	const length = end - start;
	const timeMs = new Float32Array(length);
	const amplitude = new Float32Array(length);
	for (let i = 0; i < length; i += 1) {
		const idx = start + i;
		timeMs[i] = ((idx - peakIndex) / sampleRate) * 1000;
		amplitude[i] = ir[idx] ?? 0;
	}

	return { timeMs, amplitude };
}

function closeDynamicTab(tabId: string): void {
	if (tabId === "upload" || tabId === "acquisition" || tabId === "live") {
		return;
	}

	const session = plotSessions.get(tabId);
	session?.measurement?.destroy();
	session?.tool.destroy();

	document.querySelector(`[data-tab="${tabId}"]`)?.remove();
	document.querySelector(`[data-content="${tabId}"]`)?.remove();
	plotSessions.delete(tabId);
}

function createAnalysisMarkup(tabId: string, fileName: string, sampleRate: number, channelCount: number, frameCount: number): string {
	const durationSeconds = sampleRate > 0 ? frameCount / sampleRate : 0;
	return `
		<div class="acquisition-toolbar" role="toolbar" aria-label="Acquisition controls">
			<div class="acquisition-toolbar-group">
				<label for="analysisStimulusSelect-${tabId}" class="acquisition-toolbar-label">Stimulus</label>
				<select id="analysisStimulusSelect-${tabId}" class="toolbar-select" aria-label="Stimulus selection">
				<option value="swept-20-24000" selected>20-24000 Hz swept-sine</option>
				<option value="swept-20-20000">20-20000 Hz swept-sine</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisOutputDeviceSelect-${tabId}" class="acquisition-toolbar-label">Output</label>
				<select id="analysisOutputDeviceSelect-${tabId}" class="toolbar-select" aria-label="Output device selection"></select>
			</div>
			<div class="acquisition-toolbar-group acquisition-toolbar-group--compact">
				<label for="analysisOutputChannelSelect-${tabId}" class="acquisition-toolbar-label">Out ch</label>
				<select id="analysisOutputChannelSelect-${tabId}" class="toolbar-select" aria-label="Output channel selection">
					<option value="left" selected>L</option>
					<option value="right">R</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisInputDeviceSelect-${tabId}" class="acquisition-toolbar-label">Input</label>
				<select id="analysisInputDeviceSelect-${tabId}" class="toolbar-select" aria-label="Input device selection"></select>
			</div>
			<div class="acquisition-toolbar-group acquisition-toolbar-group--compact">
				<label for="analysisInputChannelSelect-${tabId}" class="acquisition-toolbar-label">In ch</label>
				<select id="analysisInputChannelSelect-${tabId}" class="toolbar-select" aria-label="Input channel selection">
					<option value="left" selected>L</option>
					<option value="right">R</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisCommentInput-${tabId}" class="acquisition-toolbar-label">Comment</label>
				<input id="analysisCommentInput-${tabId}" class="toolbar-select" type="text" maxlength="80" placeholder="optional" aria-label="Recording comment" />
			</div>
			<p id="analysisStatusText-${tabId}" class="acquisition-status" data-state="idle" aria-live="polite">Ready</p>
			<button id="analysisRecordBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button">Record</button>
			<button id="analysisStopBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button" disabled>Stop</button>
		</div>
		<div id="waveform-tool-${tabId}" class="waveform-tool-host"></div>
		<div class="analysis-extra-plots">
			<section class="live-plot-card">
				<h2>Impulse response</h2>
				<canvas id="analysisImpulseCanvas-${tabId}" class="analysis-plot-canvas"></canvas>
			</section>
			<section class="live-plot-card">
				<h2>Phase response</h2>
				<canvas id="analysisPhaseCanvas-${tabId}" class="analysis-plot-canvas"></canvas>
			</section>
		</div>
	`;
}

function registerRecordedFile(file: File): LoadedAudioFile {
	const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
	const entry: LoadedAudioFile = { id, file };
	files.set(id, entry);
	appendFileRow(entry);
	return entry;
}

function rerenderAllPlots(): void {
	plotSessions.forEach((session) => {
		session.tool.rerender();
		session.rerenderDerivedPlots?.();
	});
}

async function openAnalysisTab(file: File): Promise<void> {
	const tabId = `analysis-${++tabCounter}`;
	const shortName = file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;

	const tabButton = document.createElement("button");
	tabButton.className = "tab tab-closable tab-loading";
	tabButton.dataset.tab = tabId;
	tabButton.innerHTML = `<span class="tab-icon-waveform"></span>${shortName} <span class="tab-close" title="Close">x</span>`;
	tabsInnerEl.append(tabButton);

	const content = document.createElement("div");
	content.className = "tab-content";
	content.dataset.content = tabId;
	tabContentsEl.append(content);

	try {
		const parsed = await readMultichannelWavFile(file);
		const sampleRate = parsed.sampleRate;
		const frameCount = parsed.channels[0]?.length ?? 0;
		const channelCount = parsed.channels.length;

		content.innerHTML = createAnalysisMarkup(tabId, file.name, sampleRate, channelCount, frameCount);

		const mountHost = document.getElementById(`waveform-tool-${tabId}`) as HTMLElement | null;
		const stimulusSelect = document.getElementById(`analysisStimulusSelect-${tabId}`) as HTMLSelectElement | null;
		const outputDeviceSelect = document.getElementById(`analysisOutputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const outputChannelSelect = document.getElementById(`analysisOutputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const inputDeviceSelect = document.getElementById(`analysisInputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const inputChannelSelect = document.getElementById(`analysisInputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const commentInput = document.getElementById(`analysisCommentInput-${tabId}`) as HTMLInputElement | null;
		const statusText = document.getElementById(`analysisStatusText-${tabId}`) as HTMLParagraphElement | null;
		const recordButton = document.getElementById(`analysisRecordBtn-${tabId}`) as HTMLButtonElement | null;
		const stopButton = document.getElementById(`analysisStopBtn-${tabId}`) as HTMLButtonElement | null;
		const impulseCanvas = document.getElementById(`analysisImpulseCanvas-${tabId}`) as HTMLCanvasElement | null;
		const phaseCanvas = document.getElementById(`analysisPhaseCanvas-${tabId}`) as HTMLCanvasElement | null;

		if (!mountHost) {
			throw new Error("Failed to create waveform tool host.");
		}
		if (
			!stimulusSelect ||
			!outputDeviceSelect ||
			!outputChannelSelect ||
			!inputDeviceSelect ||
			!inputChannelSelect ||
			!commentInput ||
			!statusText ||
			!recordButton ||
			!stopButton ||
			!impulseCanvas ||
			!phaseCanvas
		) {
			throw new Error("Failed to create analysis acquisition toolbar.");
		}

		const renderDerivedPlots = (): void => {
			if (parsed.channels.length < 2) {
				drawEmptyPlot(impulseCanvas, "Impulse response", "Requires a two-channel file.");
				drawEmptyPlot(phaseCanvas, "Phase response", "Requires a two-channel file.");
				return;
			}

			const measured = parsed.channels[0] ?? new Float32Array(0);
			const reference = parsed.channels[1] ?? new Float32Array(0);

			const ir = computeImpulseResponseWindowed(measured, reference, sampleRate);
			if (!ir) {
				drawEmptyPlot(impulseCanvas, "Impulse response", "Could not compute impulse response.");
			} else {
				drawLinePlot(
					impulseCanvas,
					"Impulse response",
					"Time (ms)",
					"Amplitude",
					ir.timeMs,
					ir.amplitude,
					"#f97316",
				);
			}

			const phase = computeTransferPhaseResponse(measured, reference, sampleRate);
			if (!phase) {
				drawEmptyPlot(phaseCanvas, "Phase response", "Could not compute phase response.");
			} else {
				const phaseNormalized = normalizePhaseAtReference(phase.frequencies, phase.phasesDeg, 1000);
				let phaseMin = Number.POSITIVE_INFINITY;
				let phaseMax = Number.NEGATIVE_INFINITY;
				for (let i = 0; i < phaseNormalized.length; i += 1) {
					const v = phaseNormalized[i] ?? 0;
					phaseMin = Math.min(phaseMin, v);
					phaseMax = Math.max(phaseMax, v);
				}
				const padding = 15;
				drawLinePlot(
					phaseCanvas,
					"Phase response (1 kHz ref)",
					"Frequency (Hz)",
					"Phase (deg)",
					phase.frequencies,
					phaseNormalized,
					"#38bdf8",
					{ logX: true, yMin: phaseMin - padding, yMax: phaseMax + padding },
				);
			}
		};

		const tool = mountWaveformTool(mountHost);
		const measurement = createMeasurementController({
			stimulusSelect,
			inputDeviceSelect,
			inputChannelSelect,
			outputDeviceSelect,
			outputChannelSelect,
			commentInput,
			statusText,
			recordButton,
			stopButton,
			onRecordedFile: (recordedFile) => {
				registerRecordedFile(recordedFile);
				void openAnalysisTab(recordedFile);
			},
		});
		await tool.openFile(file);
		renderDerivedPlots();
		plotSessions.set(tabId, { tool, measurement, rerenderDerivedPlots: renderDerivedPlots });
		tabButton.classList.remove("tab-loading");
		switchTab(tabId);
		rerenderAllPlots();
	} catch (error) {
		content.innerHTML = `<div class="tab-inner-content"><div class="loose-container"><p class="info">Failed to open ${file.name}: ${error instanceof Error ? error.message : "unknown error"}</p></div></div>`;
		tabButton.classList.remove("tab-loading");
		tabButton.classList.add("tab-error");
		switchTab(tabId);
	}
}

function appendFileRow(entry: LoadedAudioFile): void {
	const row = document.createElement("tr");
	row.dataset.fileId = entry.id;

	const nameCell = document.createElement("td");
	nameCell.textContent = entry.file.name;
	row.append(nameCell);

	const sizeCell = document.createElement("td");
	sizeCell.textContent = formatBytes(entry.file.size);
	row.append(sizeCell);

	const actionCell = document.createElement("td");
	const openButton = document.createElement("button");
	openButton.type = "button";
	openButton.className = "button-custom button-custom-secondary file-open-btn";
	openButton.textContent = "Open tab";
	openButton.addEventListener("click", () => {
		void openAnalysisTab(entry.file);
	});
	actionCell.append(openButton);
	row.append(actionCell);

	fileTableBodyEl.append(row);
}

tabsOuter.addEventListener("click", (event: MouseEvent) => {
	const target = event.target as HTMLElement;
	const tab = target.closest(".tab") as HTMLElement | null;
	if (!tab) {
		return;
	}

	const tabId = tab.dataset.tab;
	if (!tabId) {
		return;
	}

	if (target.classList.contains("tab-close")) {
		const wasActive = tab.classList.contains("active");
		closeDynamicTab(tabId);
		if (wasActive) {
			switchTab("upload");
		}
		event.stopPropagation();
		return;
	}

	switchTab(tabId);
});

uploadInput.addEventListener("change", () => {
	const fileList = Array.from(uploadInput.files ?? []);
	for (const file of fileList) {
		registerRecordedFile(file);
	}
	uploadInput.value = "";
});

acquisitionMeasurementController = createMeasurementController({
	stimulusSelect: acquisitionStimulusSelect,
	inputDeviceSelect: acquisitionInputDeviceSelect,
	inputChannelSelect: acquisitionInputChannelSelect,
	outputDeviceSelect: acquisitionOutputDeviceSelect,
	outputChannelSelect: acquisitionOutputChannelSelect,
	commentInput: acquisitionCommentInput,
	statusText: acquisitionStatusText,
	recordButton: acquisitionRecordBtn,
	stopButton: acquisitionStopBtn,
	onRecordedFile: (file) => {
		registerRecordedFile(file);
		void openAnalysisTab(file);
	},
});

if (
	liveMicDeviceSelect &&
	liveMicChannelSelect &&
	liveReferenceDeviceSelect &&
	liveReferenceChannelSelect &&
	liveAverageTimeConstantSelect &&
	liveSmoothingSelect &&
	liveWeightingSelect &&
	liveStatusText &&
	liveStartBtn &&
	liveStopBtn &&
	liveMicSplValue &&
	liveReferenceSplValue &&
	liveDifferenceSplValue &&
	liveSplHistoryCanvas &&
	liveSpectrumCanvas &&
	liveImpulseCanvas &&
	livePhaseCanvas
) {
	liveMonitorController = createLiveMonitorController({
		micDeviceSelect: liveMicDeviceSelect,
		micChannelSelect: liveMicChannelSelect,
		referenceDeviceSelect: liveReferenceDeviceSelect,
		referenceChannelSelect: liveReferenceChannelSelect,
		averageTimeConstantSelect: liveAverageTimeConstantSelect,
		smoothingSelect: liveSmoothingSelect,
		weightingSelect: liveWeightingSelect,
		statusText: liveStatusText,
		startButton: liveStartBtn,
		stopButton: liveStopBtn,
		micSplValue: liveMicSplValue,
		referenceSplValue: liveReferenceSplValue,
		differenceSplValue: liveDifferenceSplValue,
		splHistoryCanvas: liveSplHistoryCanvas,
		spectrumCanvas: liveSpectrumCanvas,
		impulseCanvas: liveImpulseCanvas,
		phaseCanvas: livePhaseCanvas,
	});
}

window.addEventListener("resize", () => {
	rerenderAllPlots();
});

window.addEventListener("beforeunload", () => {
	acquisitionMeasurementController?.destroy();
	liveMonitorController?.destroy();
	plotSessions.forEach((session) => {
		session.measurement?.destroy();
		session.tool.destroy();
	});
});

switchTab("upload");