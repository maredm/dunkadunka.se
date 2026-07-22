import "./styles.css";
import { createLiveMonitorController, type LiveMonitorController } from "./live_monitor";
import { mountWaveformTool, type WaveformToolHandle } from "./waveform";
import { createMeasurementController, type MeasurementController } from "./measurement";
import Plotly from "plotly.js-dist-min";
import { readMultichannelWavFile } from "./wavfile";
import { fft } from "./fft";
import { nextPow2 } from "./math";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import { calculateTwoChannelImpulseResponse, estimateDelay } from "./signal";

type LoadedAudioFile = {
	id: string;
	file: File;
};

type AnalysisCurve = {
	label: string;
	raw: MagnitudeResponse;
	smoothed: MagnitudeResponse;
};

type HarmonicCurve = {
	label: string;
	order: number;
	smoothed: MagnitudeResponse;
};

type SeriesResponse = {
	frequencies: Float32Array;
	values: Float32Array;
};

type AlignedImpulseTrace = {
	label: string;
	timeMs: Float32Array;
	amplitude: Float32Array;
	delayMs: number;
	delaySamples: number;
};

type PlotSession = {
	tool?: WaveformToolHandle | null;
	measurement?: MeasurementController | null;
	rerenderDerivedPlots?: () => void;
};

type PhaseResponse = {
	frequencies: Float32Array;
	phasesDeg: Float32Array;
};

type MagnitudeResponse = {
	frequencies: Float32Array;
	valuesDb: Float32Array;
};

const DEFAULT_SMOOTHING_FRACTION = 1 / 6;
const PLOT_AXIS_FRACTION = 1 / 96;
const LOG_FREQUENCY_MIN = 20;
const ANALYSIS_PLOTLY_CONFIG = {
	responsive: true,
	displayModeBar: true,
	displaylogo: false,
};

const tabsOuter = document.getElementById("tabs-outer") as HTMLElement | null;
const tabsInner = document.getElementById("tabs") as HTMLElement | null;
const tabContents = document.getElementById("tab-contents") as HTMLElement | null;
const uploadInput = document.getElementById("responseFileUpload") as HTMLInputElement | null;
const fileTableBody = document.getElementById("fileTableBody") as HTMLTableSectionElement | null;
const acquisitionStimulusSelect = document.getElementById("acquisitionStimulusSelect") as HTMLSelectElement | null;
const acquisitionInputDeviceSelect = document.getElementById("acquisitionInputDeviceSelect") as HTMLSelectElement | null;
const acquisitionInputChannelSelect = document.getElementById("acquisitionInputChannelSelect") as HTMLSelectElement | null;
const acquisitionReferenceDeviceSelect = document.getElementById("acquisitionReferenceDeviceSelect") as HTMLSelectElement | null;
const acquisitionReferenceChannelSelect = document.getElementById("acquisitionReferenceChannelSelect") as HTMLSelectElement | null;
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
const liveAdaptBtn = document.getElementById("liveAdaptBtn") as HTMLButtonElement | null;
const liveMicSplValue = document.getElementById("liveMicSplValue") as HTMLElement | null;
const liveReferenceSplValue = document.getElementById("liveReferenceSplValue") as HTMLElement | null;
const liveDifferenceSplValue = document.getElementById("liveDifferenceSplValue") as HTMLElement | null;
const liveDelayValue = document.getElementById("liveDelayValue") as HTMLElement | null;
const liveSplHistoryCanvas = document.getElementById("liveSplHistoryCanvas") as HTMLElement | null;
const liveSpectrumCanvas = document.getElementById("liveSpectrumCanvas") as HTMLElement | null;

if (!tabsOuter || !tabsInner || !tabContents || !uploadInput || !fileTableBody) {
	throw new Error("Missing required tab UI elements.");
}

if (
	!acquisitionStimulusSelect ||
	!acquisitionInputDeviceSelect ||
	!acquisitionInputChannelSelect ||
	!acquisitionReferenceDeviceSelect ||
	!acquisitionReferenceChannelSelect ||
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
const openSelectedAnalysisBtn = document.getElementById("openSelectedAnalysisBtn") as HTMLButtonElement | null;

const files = new Map<string, LoadedAudioFile>();
const plotSessions = new Map<string, PlotSession>();
const selectedFileIds = new Set<string>();
let tabCounter = 0;
let acquisitionMeasurementController: MeasurementController | null = null;
let liveMonitorController: LiveMonitorController | null = null;
const ANALYSIS_COLORS = ["#a3e635", "#38bdf8", "#f97316", "#f472b6", "#facc15", "#22c55e", "#fb7185", "#60a5fa"];

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / (1024 ** exponent);
	return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function updateSelectedAnalysisButtonState(): void {
	if (!openSelectedAnalysisBtn) {
		return;
	}
	openSelectedAnalysisBtn.disabled = selectedFileIds.size === 0;
	openSelectedAnalysisBtn.textContent = selectedFileIds.size <= 1
		? "Open selected analysis tab"
		: `Open selected analysis tab (${selectedFileIds.size})`;
}

function getSelectedFiles(): File[] {
	const selected: File[] = [];
	for (const id of selectedFileIds) {
		const entry = files.get(id);
		if (entry) {
			selected.push(entry.file);
		}
	}
	return selected;
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

function drawEmptyPlotHost(host: HTMLElement, title: string, message: string): void {
	host.innerHTML = `
		<div class="analysis-plot-empty">
			<strong>${title}</strong>
			<span>${message}</span>
		</div>
	`;
}

function withAlpha(hexColor: string, alpha: number): string {
	const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
	if (!match) {
		return hexColor;
	}
	const hex = match[1];
	const red = Number.parseInt(hex.slice(0, 2), 16);
	const green = Number.parseInt(hex.slice(2, 4), 16);
	const blue = Number.parseInt(hex.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawLinePlot(
	canvas: HTMLCanvasElement,
	title: string,
	xLabel: string,
	yLabel: string,
	x: Float32Array,
	y: Float32Array,
	lineColor: string,
	options: { logX?: boolean; yMin?: number; yMax?: number; wrapY?: boolean } = {},
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
	let hasCurrentPoint = false;
	let prevX = 0;
	let prevY = 0;
	const wrapY = options.wrapY === true;
	const wrapRange = yMax - yMin;
	const halfWrapRange = wrapRange * 0.5;

	for (let i = 0; i < x.length; i += 1) {
		const xv = x[i] ?? 0;
		const yv = y[i] ?? 0;
		if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
			hasCurrentPoint = false;
			continue;
		}

		if (!hasCurrentPoint) {
			ctx.moveTo(projectX(xv), projectY(yv));
			prevX = xv;
			prevY = yv;
			hasCurrentPoint = true;
			continue;
		}

		if (wrapY && Number.isFinite(wrapRange) && wrapRange > 0) {
			const dy = yv - prevY;
			if (dy > halfWrapRange || dy < -halfWrapRange) {
				if (dy > halfWrapRange) {
					const yAdjusted = yv - wrapRange;
					const denom = yAdjusted - prevY;
					if (Math.abs(denom) > 1e-12) {
						const t = clamp((yMin - prevY) / denom, 0, 1);
						const xEdge = prevX + (xv - prevX) * t;
						ctx.lineTo(projectX(xEdge), projectY(yMin));
						ctx.moveTo(projectX(xEdge), projectY(yMax));
						ctx.lineTo(projectX(xv), projectY(yv));
					} else {
						ctx.lineTo(projectX(xv), projectY(yv));
					}
				} else {
					const yAdjusted = yv + wrapRange;
					const denom = yAdjusted - prevY;
					if (Math.abs(denom) > 1e-12) {
						const t = clamp((yMax - prevY) / denom, 0, 1);
						const xEdge = prevX + (xv - prevX) * t;
						ctx.lineTo(projectX(xEdge), projectY(yMax));
						ctx.moveTo(projectX(xEdge), projectY(yMin));
						ctx.lineTo(projectX(xv), projectY(yv));
					} else {
						ctx.lineTo(projectX(xv), projectY(yv));
					}
				}
				prevX = xv;
				prevY = yv;
				continue;
			}
		}

		ctx.lineTo(projectX(xv), projectY(yv));
		prevX = xv;
		prevY = yv;
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

function computeTransferMagnitudeResponse(recorded: Float32Array, stimulus: Float32Array, sampleRate: number): MagnitudeResponse | null {
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
	const frequencies: number[] = [];
	const valuesDb: number[] = [];

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
		const magnitude = Math.sqrt((hRe * hRe) + (hIm * hIm));
		if (!Number.isFinite(magnitude) || magnitude <= 1e-20) {
			continue;
		}

		frequencies.push(freq);
		valuesDb.push(20 * Math.log10(magnitude));
	}

	if (frequencies.length === 0) {
		return null;
	}

	return {
		frequencies: Float32Array.from(frequencies),
		valuesDb: Float32Array.from(valuesDb),
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

function smoothPhaseFractional(phasesDeg: Float32Array, smoothingFraction: number, sampleRate: number): PhaseResponse {
	if (phasesDeg.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
		return { frequencies: new Float32Array(0), phasesDeg: new Float32Array(0) };
	}

	const nyquist = Math.max(LOG_FREQUENCY_MIN * 2, sampleRate / 2);
	const frequencies = getFractionalOctaveFrequencies(
		PLOT_AXIS_FRACTION,
		LOG_FREQUENCY_MIN,
		nyquist,
		phasesDeg.length * 2,
		sampleRate,
	);
	const smoothed = fractionalOctaveSmoothing(phasesDeg, smoothingFraction, frequencies);
	return { frequencies, phasesDeg: smoothed };
}

function smoothMagnitudeFractional(valuesDb: Float32Array, smoothingFraction: number, sampleRate: number): MagnitudeResponse {
	if (valuesDb.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
		return { frequencies: new Float32Array(0), valuesDb: new Float32Array(0) };
	}

	const nyquist = Math.max(LOG_FREQUENCY_MIN * 2, sampleRate / 2);
	const frequencies = getFractionalOctaveFrequencies(
		PLOT_AXIS_FRACTION,
		LOG_FREQUENCY_MIN,
		nyquist,
		valuesDb.length * 2,
		sampleRate,
	);
	const smoothed = fractionalOctaveSmoothing(valuesDb, smoothingFraction, frequencies);
	return { frequencies, valuesDb: smoothed };
}

function computeSpectrumDbWithFrequencyScale(samples: Float32Array, sampleRate: number, frequencyScale: number): MagnitudeResponse | null {
	if (samples.length < 8 || sampleRate <= 0 || !Number.isFinite(frequencyScale) || frequencyScale <= 0) {
		return null;
	}

	const nfft = nextPow2(samples.length);
	const windowed = new Array<number>(nfft).fill(0);
	for (let index = 0; index < samples.length; index += 1) {
		const window = 0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, samples.length - 1)));
		windowed[index] = (samples[index] ?? 0) * window;
	}

	const [real, imag] = fft(windowed);
	const frequencies: number[] = [];
	const valuesDb: number[] = [];
	for (let bin = 1; bin < nfft / 2; bin += 1) {
		const frequency = ((bin * sampleRate) / nfft) * frequencyScale;
		if (frequency < LOG_FREQUENCY_MIN || frequency > 20000) {
			continue;
		}
		const magnitude = Math.sqrt((real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2);
		frequencies.push(frequency);
		valuesDb.push(20 * Math.log10(Math.max(magnitude, 1e-12)));
	}

	if (frequencies.length === 0) {
		return null;
	}

	return {
		frequencies: Float32Array.from(frequencies),
		valuesDb: Float32Array.from(valuesDb),
	};
}

function extractWindowedSlice(signal: Float32Array, center: number, windowSize: number): Float32Array {
	const output = new Float32Array(windowSize);
	const half = Math.floor(windowSize / 2);
	for (let i = 0; i < windowSize; i += 1) {
		const sourceIndex = center - half + i;
		if (sourceIndex < 0 || sourceIndex >= signal.length) {
			output[i] = 0;
			continue;
		}
		const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, windowSize - 1)));
		output[i] = (signal[sourceIndex] ?? 0) * window;
	}
	return output;
}

function estimateSweepStopHz(reference: Float32Array, sampleRate: number): number {
	const nyquist = sampleRate / 2;
	if (nyquist <= 0) {
		return 20000;
	}
	return Math.min(nyquist * 0.98, nyquist >= 22050 ? 24000 : 20000);
}

function computeFarinaLikeHarmonicCurves(
	measured: Float32Array,
	reference: Float32Array,
	sampleRate: number,
	label: string,
	windowSeconds = 0.2,
	maxHarmonics = 5,
): HarmonicCurve[] {
	const n = Math.min(measured.length, reference.length);
	if (n < 512 || sampleRate <= 0) {
		return [];
	}

	const nfft = nextPow2(n);
	const rec = new Float32Array(nfft);
	const stim = new Float32Array(nfft);
	rec.set(measured.subarray(0, n), 0);
	stim.set(reference.subarray(0, n), 0);
	const ir = calculateTwoChannelImpulseResponse(rec, stim) as Float32Array;
	if (!ir || ir.length === 0) {
		return [];
	}

	let peakIndex = 0;
	let peakValue = 0;
	for (let i = 0; i < ir.length; i += 1) {
		const value = Math.abs(ir[i] ?? 0);
		if (value > peakValue) {
			peakValue = value;
			peakIndex = i;
		}
	}

	const durationSeconds = Math.max(1e-3, n / sampleRate);
	const sweepStartHz = 20;
	const sweepStopHz = 24000;
	const ell = 2; //durationSeconds / Math.log(sweepStopHz / sweepStartHz);
	const windowSize = Math.max(256, Math.round(0.25 * sampleRate));

	const curves: HarmonicCurve[] = [];
	for (let order = 1; order <= maxHarmonics + 1; order += 1) {
		const lagSeconds = ell * Math.log(order);
		const center = Math.round(peakIndex - lagSeconds * sampleRate);
		const harmonicIr = extractWindowedSlice(ir, center, windowSize);
		const magnitude = computeSpectrumDbWithFrequencyScale(harmonicIr, sampleRate, 1 / order);
		if (!magnitude) {
			continue;
		}
		const smoothed = smoothMagnitudeFractional(magnitude.valuesDb, DEFAULT_SMOOTHING_FRACTION, sampleRate);
		curves.push({
			label,
			order,
			smoothed,
		});
	}

	return curves;
}

function computeThdSeries(harmonics: HarmonicCurve[]): SeriesResponse | null {
	const fundamental = harmonics.find((entry) => entry.order === 1);
	if (!fundamental || fundamental.smoothed.frequencies.length === 0) {
		return null;
	}

	const frequencies = Float32Array.from(fundamental.smoothed.frequencies);
	const values = new Float32Array(frequencies.length);
	for (let index = 0; index < frequencies.length; index += 1) {
		const frequency = frequencies[index] ?? 0;
		const fundamentalDb = interpolateMagnitudeValue(fundamental.smoothed, frequency);
		if (fundamentalDb === null || !Number.isFinite(fundamentalDb)) {
			values[index] = Number.NaN;
			continue;
		}

		const fundamentalLinear = Math.pow(10, fundamentalDb / 20);
		if (!Number.isFinite(fundamentalLinear) || fundamentalLinear <= 1e-12) {
			values[index] = Number.NaN;
			continue;
		}

		let sumSquares = 0;
		for (const harmonic of harmonics) {
			if (harmonic.order <= 1) {
				continue;
			}
			const harmonicDb = interpolateMagnitudeValue(harmonic.smoothed, frequency);
			if (harmonicDb === null || !Number.isFinite(harmonicDb)) {
				continue;
			}
			const harmonicLinear = Math.pow(10, harmonicDb / 20);
			sumSquares += harmonicLinear * harmonicLinear;
		}
		values[index] = (Math.sqrt(sumSquares) / fundamentalLinear) * 100;
	}

	return { frequencies, values };
}

function interpolateMagnitudeValue(series: MagnitudeResponse, targetFrequency: number): number | null {
	const { frequencies, valuesDb } = series;
	if (frequencies.length === 0 || valuesDb.length === 0) {
		return null;
	}
	if (targetFrequency < (frequencies[0] ?? 0) || targetFrequency > (frequencies[frequencies.length - 1] ?? 0)) {
		return null;
	}

	for (let index = 1; index < frequencies.length; index += 1) {
		const leftFrequency = frequencies[index - 1] ?? 0;
		const rightFrequency = frequencies[index] ?? 0;
		if (targetFrequency > rightFrequency) {
			continue;
		}
		const leftValue = valuesDb[index - 1] ?? 0;
		const rightValue = valuesDb[index] ?? 0;
		if (Math.abs(rightFrequency - leftFrequency) <= 1e-12) {
			return leftValue;
		}
		const leftLog = Math.log10(Math.max(1e-9, leftFrequency));
		const rightLog = Math.log10(Math.max(1e-9, rightFrequency));
		const targetLog = Math.log10(Math.max(1e-9, targetFrequency));
		const fraction = (targetLog - leftLog) / Math.max(1e-12, rightLog - leftLog);
		return leftValue + (rightValue - leftValue) * fraction;
	}

	return valuesDb[valuesDb.length - 1] ?? null;
}

function computeAverageMagnitudeResponse(curves: AnalysisCurve[]): MagnitudeResponse | null {
	if (curves.length === 0) {
		return null;
	}

	const base = curves[0]?.smoothed;
	if (!base || base.frequencies.length === 0) {
		return null;
	}

	const valuesDb = new Float32Array(base.frequencies.length);
	for (let index = 0; index < base.frequencies.length; index += 1) {
		const frequency = base.frequencies[index] ?? 0;
		let sum = 0;
		let count = 0;
		for (const curve of curves) {
			const value = interpolateMagnitudeValue(curve.smoothed, frequency);
			if (value === null || !Number.isFinite(value)) {
				continue;
			}
			sum += value;
			count += 1;
		}
		valuesDb[index] = count > 0 ? sum / count : Number.NaN;
	}

	return {
		frequencies: Float32Array.from(base.frequencies),
		valuesDb,
	};
}

function computeTargetMagnitudeResponse(base: MagnitudeResponse, offsetDb: number): MagnitudeResponse {
	const frequencies = base.frequencies;
	const baseValues = base.valuesDb;
	const valuesDb = new Float32Array(frequencies.length);

	let baseBandSum = 0;
	let baseBandCount = 0;
	let targetBandSum = 0;
	let targetBandCount = 0;

	for (let index = 0; index < frequencies.length; index += 1) {
		const frequency = frequencies[index] ?? 1000;
		const targetRaw = -Math.log10(Math.max(1e-9, frequency) / 1000);
		valuesDb[index] = targetRaw;

		if (frequency >= 250 && frequency <= 2000) {
			targetBandSum += targetRaw;
			targetBandCount += 1;
			const baseValue = baseValues[index];
			if (baseValue !== undefined && Number.isFinite(baseValue)) {
				baseBandSum += baseValue;
				baseBandCount += 1;
			}
		}
	}

	const baseBandMean = baseBandCount > 0 ? (baseBandSum / baseBandCount) : 0;
	const targetBandMean = targetBandCount > 0 ? (targetBandSum / targetBandCount) : 0;
	const alignmentOffset = (baseBandMean - targetBandMean) + offsetDb;

	for (let index = 0; index < valuesDb.length; index += 1) {
		valuesDb[index] += alignmentOffset;
	}

	return {
		frequencies: Float32Array.from(frequencies),
		valuesDb,
	};
}

function renderAnalysisFrequencyPlot(
	host: HTMLElement,
	curves: AnalysisCurve[],
	averageCurve: MagnitudeResponse | null,
	targetCurve: MagnitudeResponse | null,
): void {
	const traces: any[] = curves.flatMap((curve, index) => {
		const color = ANALYSIS_COLORS[index % ANALYSIS_COLORS.length];
		return [
			{
				type: "scatter",
				mode: "lines",
				name: `${curve.label} original`,
				x: Array.from(curve.raw.frequencies),
				y: Array.from(curve.raw.valuesDb),
				line: { color: withAlpha(color, 0.15), width: 1 },
				showlegend: false,
				hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>Original</extra>",
			},
			{
				type: "scatter",
				mode: "lines",
				name: curve.label,
				x: Array.from(curve.smoothed.frequencies),
				y: Array.from(curve.smoothed.valuesDb),
				line: { color, width: 2 },
				hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>1/6 octave</extra>",
			},
		];
	});
	if (averageCurve) {
		traces.push({
			type: "scatter",
			mode: "lines",
			name: "Average",
			x: Array.from(averageCurve.frequencies),
			y: Array.from(averageCurve.valuesDb),
			line: { color: "#f8fafc", width: 3 },
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>Average</extra>",
		});
	}
	if (targetCurve) {
		traces.push({
			type: "scatter",
			mode: "lines",
			name: "Target",
			x: Array.from(targetCurve.frequencies),
			y: Array.from(targetCurve.valuesDb),
			line: { color: "#ef4444", width: 2, dash: "dot" },
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>Target</extra>",
		});
	}

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Frequency response", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: {
				orientation: "v",
				yanchor: "top",
				y: 1,
				xanchor: "left",
				x: 1.02,
				font: { color: "#cbd5e1", size: 11 },
			},
			xaxis: {
				title: { text: "Frequency (Hz)", font: { color: "#9aa4b2", size: 12 } },
				type: "log",
				range: [Math.log10(20), Math.log10(20000)],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "Magnitude (dB)", font: { color: "#9aa4b2", size: 12 } },
				range: [-40, 20],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

function renderFarinaDistortionPlot(host: HTMLElement, harmonics: HarmonicCurve[]): void {
	const traces = harmonics.map((curve, index) => {
		const color = ANALYSIS_COLORS[index % ANALYSIS_COLORS.length];
		return {
			type: "scatter",
			mode: "lines",
			name: `${curve.label} ${curve.order === 1 ? "Fundamental" : `H${curve.order}`}`,
			x: Array.from(curve.smoothed.frequencies),
			y: Array.from(curve.smoothed.valuesDb),
			line: { color, width: curve.order === 1 ? 2.2 : 1.4 },
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra></extra>",
		};
	});

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Farina-style distortion", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: { orientation: "v", yanchor: "top", y: 1, xanchor: "left", x: 1.02, font: { color: "#cbd5e1", size: 11 } },
			xaxis: {
				title: { text: "Frequency (Hz)", font: { color: "#9aa4b2", size: 12 } },
				type: "log",
				range: [Math.log10(20), Math.log10(20000)],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "Amplitude (dB)", font: { color: "#9aa4b2", size: 12 } },
				range: [-85, 5],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

function renderThdPlot(host: HTMLElement, seriesList: Array<{ label: string; series: SeriesResponse }>): void {
	const traces = seriesList.map((entry, index) => ({
		type: "scatter",
		mode: "lines",
		name: `${entry.label} THD`,
		x: Array.from(entry.series.frequencies),
		y: Array.from(entry.series.values),
		line: { color: ANALYSIS_COLORS[index % ANALYSIS_COLORS.length], width: 2 },
		hovertemplate: "%{x:.1f} Hz<br>%{y:.2f}%<extra></extra>",
	}));

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Total harmonic distortion", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: { orientation: "v", yanchor: "top", y: 1, xanchor: "left", x: 1.02, font: { color: "#cbd5e1", size: 11 } },
			xaxis: {
				title: { text: "Frequency (Hz)", font: { color: "#9aa4b2", size: 12 } },
				type: "log",
				range: [Math.log10(20), Math.log10(20000)],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "THD (%)", font: { color: "#9aa4b2", size: 12 } },
				range: [0, 10],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

function renderAlignedImpulseResponsePlot(host: HTMLElement, traces: AlignedImpulseTrace[]): void {
	const plotTraces = traces.map((entry, index) => ({
		type: "scatter",
		mode: "lines",
		name: `${entry.label} (${entry.delayMs.toFixed(3)} ms)`,
		x: Array.from(entry.timeMs),
		y: Array.from(entry.amplitude),
		line: { color: ANALYSIS_COLORS[index % ANALYSIS_COLORS.length], width: 2 },
		hovertemplate: "%{x:.3f} ms<br>%{y:.5f}<extra></extra>",
	}));

	void Plotly.react(
		host,
		plotTraces,
		{
			title: { text: "Aligned impulse response (ch1 / ch2, aligned by ch3 / ch2)", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: { orientation: "v", yanchor: "top", y: 1, xanchor: "left", x: 1.02, font: { color: "#cbd5e1", size: 11 } },
			xaxis: {
				title: { text: "Time (ms)", font: { color: "#9aa4b2", size: 12 } },
				range: [-10, 40],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "Amplitude", font: { color: "#9aa4b2", size: 12 } },
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			shapes: [
				{
					type: "line",
					x0: 0,
					x1: 0,
					y0: 0,
					y1: 1,
					xref: "x",
					yref: "paper",
					line: { color: "rgba(248,250,252,0.6)", width: 1, dash: "dot" },
				},
			],
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

function wrapPhaseToRange(phasesDeg: Float32Array, minDeg = -720, maxDeg = 720): Float32Array {
	if (phasesDeg.length === 0) {
		return phasesDeg;
	}

	const range = maxDeg - minDeg;
	if (!Number.isFinite(range) || range <= 0) {
		return Float32Array.from(phasesDeg);
	}

	const wrapped = new Float32Array(phasesDeg.length);
	for (let i = 0; i < phasesDeg.length; i += 1) {
		const value = phasesDeg[i] ?? 0;
		const normalized = ((value - minDeg) % range + range) % range;
		wrapped[i] = normalized + minDeg;
	}
	return wrapped;
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

	const after = Math.round(0.5 * sampleRate);
	const start = peakIndex;
	const end = Math.min(ir.length, peakIndex + after);
	if (end <= start + 2) {
		return null;
	}

	const length = end - start;
	const timeMs = new Float32Array(length);
	const amplitudeRaw = new Float32Array(length);
	for (let i = 0; i < length; i += 1) {
		const idx = start + i;
		timeMs[i] = (i / sampleRate) * 1000;
		amplitudeRaw[i] = ir[idx] ?? 0;
	}

	// Apply a light Gaussian smoothing to match REW-style IR readability.
	const smoothedAmplitude = smoothImpulseResponse(amplitudeRaw, sampleRate, 0.1);
	const amplitude = normalizeImpulseToPeak(smoothedAmplitude);

	return { timeMs, amplitude };
}

function smoothImpulseResponse(samples: Float32Array, sampleRate: number, sigmaMs: number): Float32Array {
	if (samples.length === 0 || sampleRate <= 0 || !Number.isFinite(sigmaMs) || sigmaMs <= 0) {
		return Float32Array.from(samples);
	}

	const sigmaSamples = (sigmaMs / 1000) * sampleRate;
	if (!Number.isFinite(sigmaSamples) || sigmaSamples <= 0.5) {
		return Float32Array.from(samples);
	}

	const radius = Math.max(1, Math.min(512, Math.ceil(3 * sigmaSamples)));
	const kernelSize = (radius * 2) + 1;
	const kernel = new Float32Array(kernelSize);
	let kernelSum = 0;
	for (let index = 0; index < kernelSize; index += 1) {
		const x = index - radius;
		const weight = Math.exp(-0.5 * ((x / sigmaSamples) ** 2));
		kernel[index] = weight;
		kernelSum += weight;
	}
	if (kernelSum <= 0 || !Number.isFinite(kernelSum)) {
		return Float32Array.from(samples);
	}
	for (let index = 0; index < kernelSize; index += 1) {
		kernel[index] /= kernelSum;
	}

	const output = new Float32Array(samples.length);
	for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
		let value = 0;
		let norm = 0;
		for (let kernelIndex = 0; kernelIndex < kernelSize; kernelIndex += 1) {
			const sourceIndex = sampleIndex + kernelIndex - radius;
			if (sourceIndex < 0 || sourceIndex >= samples.length) {
				continue;
			}
			const weight = kernel[kernelIndex] ?? 0;
			value += (samples[sourceIndex] ?? 0) * weight;
			norm += weight;
		}
		output[sampleIndex] = norm > 0 ? value / norm : (samples[sampleIndex] ?? 0);
	}

	return output;
}

function normalizeImpulseToPeak(samples: Float32Array): Float32Array {
	if (samples.length === 0) {
		return Float32Array.from(samples);
	}

	let peak = 0;
	for (let index = 0; index < samples.length; index += 1) {
		const magnitude = Math.abs(samples[index] ?? 0);
		if (magnitude > peak) {
			peak = magnitude;
		}
	}

	if (!Number.isFinite(peak) || peak <= 1e-12) {
		return Float32Array.from(samples);
	}

	const normalized = new Float32Array(samples.length);
	for (let index = 0; index < samples.length; index += 1) {
		normalized[index] = (samples[index] ?? 0) / peak;
	}

	return normalized;
}

function computeAlignedImpulseResponse(
	measured: Float32Array,
	stimulus: Float32Array,
	recordedStimulus: Float32Array,
	sampleRate: number,
): { timeMs: Float32Array; amplitude: Float32Array; delayMs: number; delaySamples: number } | null {
	if (sampleRate <= 0) {
		return null;
	}

	const frameCount = Math.min(measured.length, stimulus.length, recordedStimulus.length);
	if (frameCount < 8) {
		return null;
	}

	const stimulusReference = stimulus.subarray(0, frameCount);
	const stimulusRecorded = recordedStimulus.subarray(0, frameCount);
	const delaySeconds = estimateDelay(stimulusRecorded, stimulusReference, sampleRate);
	console.log(delaySeconds, "delaySeconds");
	const delaySamples = 0;
	// Compute IR first from ch1/ch2, then time-align the IR using the ch2/ch3 delay.
	const impulse = computeImpulseResponseWindowed(measured.subarray(0, frameCount), stimulusReference, sampleRate);
	if (impulse) {
		impulse.amplitude = impulse.amplitude.map(v => -v);
	}
	if (!impulse) {
		return null;
	}

	const alignedTimeMs = new Float32Array(impulse.timeMs.length);
	const delayMs = delaySeconds * 1000 * 2;
	for (let index = 0; index < impulse.timeMs.length; index += 1) {
		alignedTimeMs[index] = (impulse.timeMs[index] ?? 0) - delayMs;
	}

	return {
		timeMs: alignedTimeMs,
		amplitude: impulse.amplitude,
		delayMs,
		delaySamples,
	};
}

function closeDynamicTab(tabId: string): void {
	if (tabId === "upload" || tabId === "acquisition" || tabId === "live") {
		return;
	}

	const session = plotSessions.get(tabId);
	session?.measurement?.destroy();
	session?.tool?.destroy();

	document.querySelector(`[data-tab="${tabId}"]`)?.remove();
	document.querySelector(`[data-content="${tabId}"]`)?.remove();
	plotSessions.delete(tabId);
}

function createWaveformMarkup(tabId: string): string {
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
				<label for="analysisReferenceDeviceSelect-${tabId}" class="acquisition-toolbar-label">Reference</label>
				<select id="analysisReferenceDeviceSelect-${tabId}" class="toolbar-select" aria-label="Reference input device selection"></select>
			</div>
			<div class="acquisition-toolbar-group acquisition-toolbar-group--compact">
				<label for="analysisReferenceChannelSelect-${tabId}" class="acquisition-toolbar-label">Ref ch</label>
				<select id="analysisReferenceChannelSelect-${tabId}" class="toolbar-select" aria-label="Reference input channel selection">
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
	`;
}

function createAnalysisMarkup(tabId: string, fileName: string, sampleRate: number, channelCount: number, frameCount: number): string {
	const durationSeconds = sampleRate > 0 ? frameCount / sampleRate : 0;
	return `
		<div class="tab-inner-content">
			<div class="loose-container">
				<p class="info">1/6-octave smoothed transfer magnitude from channel 1 measured against channel 2 reference.</p>
				<p id="analysisDelaySummary-${tabId}" class="info">Ch3 -> Ch2 delay compensation: unavailable (requires channel 3).</p>
				<p class="info">${fileName} · ${sampleRate} Hz · ${channelCount} ch · ${durationSeconds.toFixed(2)} s</p>
				<div class="analysis-target-controls">
					<label for="analysisTargetOffset-${tabId}" class="acquisition-toolbar-label">Target offset</label>
					<input id="analysisTargetOffset-${tabId}" class="toolbar-select analysis-target-input" type="number" value="0" step="0.5" min="-20" max="20" />
					<span class="info">dB @ 1 kHz</span>
				</div>
			</div>
			<div id="analysisExtraPlots-${tabId}" class="analysis-extra-plots">
				<section class="live-plot-card">
					<h2>Frequency response</h2>
					<div id="analysisFrequencyPlot-${tabId}" class="analysis-plot-host"></div>
				</section>
				<section class="live-plot-card">
					<h2>Farina-style distortion</h2>
					<div id="analysisDistortionPlot-${tabId}" class="analysis-plot-host"></div>
				</section>
				<section class="live-plot-card">
					<h2>THD</h2>
					<div id="analysisThdPlot-${tabId}" class="analysis-plot-host"></div>
				</section>
				<section class="live-plot-card">
					<h2>Delay alignment impulse</h2>
					<div id="analysisAlignmentIrPlot-${tabId}" class="analysis-plot-host"></div>
				</section>
			</div>
		</div>
	`;
}

function registerRecordedFile(file: File, options: { selected?: boolean } = {}): LoadedAudioFile {
	const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
	const entry: LoadedAudioFile = { id, file };
	files.set(id, entry);
	appendFileRow(entry, options);
	return entry;
}

function rerenderAllPlots(): void {
	plotSessions.forEach((session) => {
		session.tool?.rerender();
		session.rerenderDerivedPlots?.();
	});
}

async function openWaveformTab(file: File): Promise<void> {
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

		content.innerHTML = createWaveformMarkup(tabId);

		const mountHost = document.getElementById(`waveform-tool-${tabId}`) as HTMLElement | null;
		const stimulusSelect = document.getElementById(`analysisStimulusSelect-${tabId}`) as HTMLSelectElement | null;
		const outputDeviceSelect = document.getElementById(`analysisOutputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const outputChannelSelect = document.getElementById(`analysisOutputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const inputDeviceSelect = document.getElementById(`analysisInputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const inputChannelSelect = document.getElementById(`analysisInputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const referenceDeviceSelect = document.getElementById(`analysisReferenceDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const referenceChannelSelect = document.getElementById(`analysisReferenceChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const commentInput = document.getElementById(`analysisCommentInput-${tabId}`) as HTMLInputElement | null;
		const statusText = document.getElementById(`analysisStatusText-${tabId}`) as HTMLParagraphElement | null;
		const recordButton = document.getElementById(`analysisRecordBtn-${tabId}`) as HTMLButtonElement | null;
		const stopButton = document.getElementById(`analysisStopBtn-${tabId}`) as HTMLButtonElement | null;

		if (!mountHost) {
			throw new Error("Failed to create waveform tool host.");
		}
		if (
			!stimulusSelect ||
			!outputDeviceSelect ||
			!outputChannelSelect ||
			!inputDeviceSelect ||
			!inputChannelSelect ||
			!referenceDeviceSelect ||
			!referenceChannelSelect ||
			!commentInput ||
			!statusText ||
			!recordButton ||
			!stopButton
		) {
			throw new Error("Failed to create analysis acquisition toolbar.");
		}

		const tool = mountWaveformTool(mountHost);
		const measurement = createMeasurementController({
			stimulusSelect,
			inputDeviceSelect,
			inputChannelSelect,
			referenceDeviceSelect,
			referenceChannelSelect,
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
		plotSessions.set(tabId, { tool, measurement });
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

async function openAnalysisTab(inputFiles: File[] | File): Promise<void> {
	const analysisFiles = Array.isArray(inputFiles) ? inputFiles : [inputFiles];
	if (analysisFiles.length === 0) {
		return;
	}

	const tabId = `analysis-${++tabCounter}`;
	const shortName = analysisFiles.length === 1
		? (analysisFiles[0]?.name.length ?? 0) > 30
			? `${analysisFiles[0]?.name.slice(0, 27)}...`
			: (analysisFiles[0]?.name ?? "Analysis")
		: `${analysisFiles.length} files`;

	const tabButton = document.createElement("button");
	tabButton.className = "tab tab-closable tab-loading";
	tabButton.dataset.tab = tabId;
	tabButton.innerHTML = `<span class="tab-icon-analysis"></span>${shortName} <span class="tab-close" title="Close">x</span>`;
	tabsInnerEl.append(tabButton);

	const content = document.createElement("div");
	content.className = "tab-content";
	content.dataset.content = tabId;
	tabContentsEl.append(content);

	try {
		const parsedFiles = await Promise.all(analysisFiles.map(async (file) => ({ file, parsed: await readMultichannelWavFile(file) })));
		const sampleRate = parsedFiles[0]?.parsed.sampleRate ?? 0;
		const frameCount = parsedFiles[0]?.parsed.channels[0]?.length ?? 0;
		const channelCount = parsedFiles[0]?.parsed.channels.length ?? 0;
		const fileLabel = analysisFiles.length === 1 ? analysisFiles[0]?.name ?? "Analysis" : `${analysisFiles.length} selected files`;

		content.innerHTML = createAnalysisMarkup(tabId, fileLabel, sampleRate, channelCount, frameCount);

		const frequencyPlot = document.getElementById(`analysisFrequencyPlot-${tabId}`) as HTMLElement | null;
		const distortionPlot = document.getElementById(`analysisDistortionPlot-${tabId}`) as HTMLElement | null;
		const thdPlot = document.getElementById(`analysisThdPlot-${tabId}`) as HTMLElement | null;
		const alignmentIrPlot = document.getElementById(`analysisAlignmentIrPlot-${tabId}`) as HTMLElement | null;
		const analysisExtraPlots = document.getElementById(`analysisExtraPlots-${tabId}`) as HTMLElement | null;
		const delaySummary = document.getElementById(`analysisDelaySummary-${tabId}`) as HTMLElement | null;
		const targetOffsetInput = document.getElementById(`analysisTargetOffset-${tabId}`) as HTMLInputElement | null;
		if (!frequencyPlot) {
			throw new Error("Failed to create analysis frequency plot.");
		}
		if (!distortionPlot || !thdPlot || !alignmentIrPlot || !analysisExtraPlots || !delaySummary) {
			throw new Error("Failed to create distortion plots.");
		}
		if (!targetOffsetInput) {
			throw new Error("Failed to create target offset control.");
		}

		const renderDerivedPlots = (): void => {
			const curves: AnalysisCurve[] = [];
			for (const { file, parsed } of parsedFiles) {
				if (parsed.channels.length < 2) {
					continue;
				}
				const measured = parsed.channels[0] ?? new Float32Array(0);
				const reference = parsed.channels[1] ?? new Float32Array(0);
				const magnitude = computeTransferMagnitudeResponse(measured, reference, parsed.sampleRate);
				if (!magnitude) {
					continue;
				}
				const magnitudeSmoothed = smoothMagnitudeFractional(magnitude.valuesDb, DEFAULT_SMOOTHING_FRACTION, parsed.sampleRate);
				curves.push({
					label: file.name,
					raw: magnitude,
					smoothed: magnitudeSmoothed,
				});
			}

			if (curves.length === 0) {
				drawEmptyPlotHost(frequencyPlot, "Frequency response", "Requires a two-channel file.");
				return;
			}
			const averageCurve = computeAverageMagnitudeResponse(curves);
			const targetOffsetDb = Number.parseFloat(targetOffsetInput.value || "0");
			const targetBase = averageCurve ?? curves[0]?.smoothed ?? null;
			const targetCurve = targetBase
				? computeTargetMagnitudeResponse(targetBase, Number.isFinite(targetOffsetDb) ? targetOffsetDb : 0)
				: null;
			renderAnalysisFrequencyPlot(frequencyPlot, curves, averageCurve, targetCurve);

			const harmonicCurves: HarmonicCurve[] = [];
			const thdSeries: Array<{ label: string; series: SeriesResponse }> = [];
			for (const { file, parsed } of parsedFiles) {
				if (parsed.channels.length < 2) {
					continue;
				}
				const measured = parsed.channels[0] ?? new Float32Array(0);
				const reference = parsed.channels[1] ?? new Float32Array(0);
				const harmonics = computeFarinaLikeHarmonicCurves(measured, reference, parsed.sampleRate, file.name, 0.2, 5);
				if (harmonics.length === 0) {
					continue;
				}
				harmonicCurves.push(...harmonics);
				const thd = computeThdSeries(harmonics);
				if (thd) {
					thdSeries.push({ label: file.name, series: thd });
				}
			}

			if (harmonicCurves.length === 0) {
				drawEmptyPlotHost(distortionPlot, "Farina-style distortion", "Requires a valid two-channel sweep/reference file.");
			} else {
				renderFarinaDistortionPlot(distortionPlot, harmonicCurves);
			}

			if (thdSeries.length === 0) {
				drawEmptyPlotHost(thdPlot, "THD", "Could not compute THD from the selected files.");
			} else {
				renderThdPlot(thdPlot, thdSeries);
			}

			const alignmentTraces: AlignedImpulseTrace[] = [];
			for (const { file, parsed } of parsedFiles) {
				if (parsed.channels.length < 3) {
					continue;
				}
				const measured = parsed.channels[0] ?? new Float32Array(0);
				const stimulus = parsed.channels[1] ?? new Float32Array(0);
				const recordedStimulus = parsed.channels[2] ?? new Float32Array(0);
				const alignedImpulse = computeAlignedImpulseResponse(measured, stimulus, recordedStimulus, parsed.sampleRate);
				if (!alignedImpulse) {
					continue;
				}
				alignmentTraces.push({
					label: file.name,
					timeMs: alignedImpulse.timeMs,
					amplitude: alignedImpulse.amplitude,
					delayMs: alignedImpulse.delayMs,
					delaySamples: alignedImpulse.delaySamples,
				});
			}

			if (alignmentTraces.length === 0) {
				drawEmptyPlotHost(alignmentIrPlot, "Delay alignment impulse", "Requires files with channel 3 (recorded stimulus).");
				delaySummary.textContent = "Ch3 -> Ch2 delay compensation: unavailable (requires channel 3).";
			} else if (alignmentTraces.length === 1) {
				const entry = alignmentTraces[0];
				delaySummary.textContent = `Ch3 -> Ch2 delay compensation: ${entry.delayMs.toFixed(3)} ms (${entry.delaySamples.toFixed(1)} samples).`;
			} else {
				const averageMs = alignmentTraces.reduce((sum, entry) => sum + entry.delayMs, 0) / alignmentTraces.length;
				delaySummary.textContent = `Ch3 -> Ch2 delay compensation: average ${averageMs.toFixed(3)} ms across ${alignmentTraces.length} files.`;
			}

			if (alignmentTraces.length > 0) {
				renderAlignedImpulseResponsePlot(alignmentIrPlot, alignmentTraces);
			}
		};

		const updateAnalysisPlotLayout = (): void => {
			analysisExtraPlots.classList.toggle("analysis-extra-plots--wide", analysisExtraPlots.clientWidth > 2400);
		};
		const layoutObserver = new ResizeObserver(updateAnalysisPlotLayout);
		layoutObserver.observe(analysisExtraPlots);
		updateAnalysisPlotLayout();

		targetOffsetInput.addEventListener("input", renderDerivedPlots);

		renderDerivedPlots();
		plotSessions.set(tabId, { rerenderDerivedPlots: renderDerivedPlots });
		tabButton.classList.remove("tab-loading");
		switchTab(tabId);
		rerenderAllPlots();
	} catch (error) {
		content.innerHTML = `<div class="tab-inner-content"><div class="loose-container"><p class="info">Failed to open analysis tab: ${error instanceof Error ? error.message : "unknown error"}</p></div></div>`;
		tabButton.classList.remove("tab-loading");
		tabButton.classList.add("tab-error");
		switchTab(tabId);
	}
}

function appendFileRow(entry: LoadedAudioFile, options: { selected?: boolean } = {}): void {
	const row = document.createElement("tr");
	row.dataset.fileId = entry.id;
	const checkboxCell = document.createElement("td");
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.className = "file-select-checkbox";
	checkbox.checked = options.selected === true;
	if (checkbox.checked) {
		selectedFileIds.add(entry.id);
	}
	checkbox.setAttribute("aria-label", `Select ${entry.file.name} for combined analysis`);
	checkbox.addEventListener("change", () => {
		if (checkbox.checked) {
			selectedFileIds.add(entry.id);
		} else {
			selectedFileIds.delete(entry.id);
		}
		updateSelectedAnalysisButtonState();
	});
	checkboxCell.append(checkbox);
	row.append(checkboxCell);

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
	openButton.textContent = "Open waveform tab";
	openButton.addEventListener("click", () => {
		void openWaveformTab(entry.file);
	});
	actionCell.append(openButton);
	const analysisButton = document.createElement("button");
	analysisButton.type = "button";
	analysisButton.className = "button-custom button-custom-secondary file-open-btn";
	analysisButton.textContent = "Open analysis tab";
	analysisButton.addEventListener("click", () => {
		void openAnalysisTab(entry.file);
	});
	actionCell.append(analysisButton);
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
		registerRecordedFile(file, { selected: true });
	}
	uploadInput.value = "";
	updateSelectedAnalysisButtonState();
});

openSelectedAnalysisBtn?.addEventListener("click", () => {
	const selectedFiles = getSelectedFiles();
	if (selectedFiles.length === 0) {
		return;
	}
	void openAnalysisTab(selectedFiles);
});

acquisitionMeasurementController = createMeasurementController({
	stimulusSelect: acquisitionStimulusSelect,
	inputDeviceSelect: acquisitionInputDeviceSelect,
	inputChannelSelect: acquisitionInputChannelSelect,
	referenceDeviceSelect: acquisitionReferenceDeviceSelect,
	referenceChannelSelect: acquisitionReferenceChannelSelect,
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
	liveAdaptBtn &&
	liveMicSplValue &&
	liveReferenceSplValue &&
	liveDifferenceSplValue &&
	liveDelayValue &&
	liveSplHistoryCanvas &&
	liveSpectrumCanvas
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
		adaptButton: liveAdaptBtn,
		delayValue: liveDelayValue,
		micSplValue: liveMicSplValue,
		referenceSplValue: liveReferenceSplValue,
		differenceSplValue: liveDifferenceSplValue,
		splHistoryCanvas: liveSplHistoryCanvas,
		spectrumCanvas: liveSpectrumCanvas,
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
		session.tool?.destroy();
	});
});

switchTab("upload");
updateSelectedAnalysisButtonState();