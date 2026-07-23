import "./styles.css";
import { createLiveMonitorController, type LiveMonitorController } from "./live_monitor";
import { mountWaveformTool, type WaveformToolHandle } from "./waveform";
import { createMeasurementController, type MeasurementController } from "./measurement";
import { bindCachedFieldValue, listAudioDevices, restoreCachedFieldValue, setAudioDeviceSelectOptions } from "./audio_devices";
import Plotly from "plotly.js-dist-min";
import { readMultichannelWavFile } from "./wavfile";
import { fft } from "./fft";
import { nextPow2 } from "./math";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import { calculateTwoChannelImpulseResponse, estimateDelay } from "./signal";
import { getWaveformLineColor } from "./waveform-plot";

type LoadedAudioFile = {
	id: string;
	file: File;
};

type AnalysisCurve = {
	label: string;
	raw: MagnitudeResponse;
	smoothed: MagnitudeResponse;
	phase: PhaseResponse;
	phaseSmoothed: PhaseResponse;
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

type DelayDisplayUnit = "ms" | "m";

type PlotSession = {
	tool?: WaveformToolHandle | null;
	measurement?: MeasurementController | null;
	cleanup?: (() => void) | null;
};

type PhaseResponse = {
	frequencies: Float32Array;
	phasesDeg: Float32Array;
};

type MagnitudeResponse = {
	frequencies: Float32Array;
	valuesDb: Float32Array;
};

type MagnitudeResponseWithStdDev = MagnitudeResponse & {
	stddevUp: Float32Array;
	stddevDown: Float32Array;
};

const DEFAULT_SMOOTHING_FRACTION = 1 / 6;
const PLOT_AXIS_FRACTION = 1 / 96;
const LOG_FREQUENCY_MIN = 20;
const SPEED_OF_SOUND_METERS_PER_SECOND = 343;
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
const liveMicCalibrationInput = document.getElementById("liveMicCalibrationInput") as HTMLInputElement | null;
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

function convertDelayMsForDisplay(delayMs: number, unit: DelayDisplayUnit): number {
	if (unit === "m") {
		return delayMs * (SPEED_OF_SOUND_METERS_PER_SECOND / 1000);
	}
	return delayMs;
}

function getDelayDisplayUnitLabel(unit: DelayDisplayUnit): string {
	return unit === "m" ? "m" : "ms";
}

function formatDelayForDisplay(delayMs: number, unit: DelayDisplayUnit, digits = 3): string {
	const converted = convertDelayMsForDisplay(delayMs, unit);
	return `${converted.toFixed(digits)} ${getDelayDisplayUnitLabel(unit)}`;
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
	smoothingFraction = DEFAULT_SMOOTHING_FRACTION,
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
	const windowSize = Math.max(256, Math.round(windowSeconds * sampleRate));

	const curves: HarmonicCurve[] = [];
	for (let order = 1; order <= maxHarmonics + 1; order += 1) {
		const lagSeconds = ell * Math.log(order);
		const center = Math.round(peakIndex - lagSeconds * sampleRate);
		const harmonicIr = extractWindowedSlice(ir, center, windowSize);
		const magnitude = computeSpectrumDbWithFrequencyScale(harmonicIr, sampleRate, 1 / order);
		if (!magnitude) {
			continue;
		}
		const smoothed = smoothingFraction > 0
			? smoothMagnitudeFractional(magnitude.valuesDb, smoothingFraction, sampleRate)
			: magnitude;
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

function computeAverageMagnitudeResponseWithStdDev(curves: AnalysisCurve[]): MagnitudeResponseWithStdDev | null {
	if (curves.length === 0) {
		return null;
	}

	const base = curves[0]?.smoothed;
	if (!base || base.frequencies.length === 0) {
		return null;
	}

	const valuesDb = new Float32Array(base.frequencies.length);
	const stddevUp = new Float32Array(base.frequencies.length);
	const stddevDown = new Float32Array(base.frequencies.length);

	for (let index = 0; index < base.frequencies.length; index += 1) {
		const frequency = base.frequencies[index] ?? 0;
		const values: number[] = [];
		for (const curve of curves) {
			const value = interpolateMagnitudeValue(curve.smoothed, frequency);
			if (value !== null && Number.isFinite(value)) {
				values.push(value);
			}
		}

		if (values.length === 0) {
			valuesDb[index] = Number.NaN;
			stddevUp[index] = Number.NaN;
			stddevDown[index] = Number.NaN;
			continue;
		}

		const mean = values.reduce((a, b) => a + b, 0) / values.length;
		const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
		const stddev = Math.sqrt(variance);

		valuesDb[index] = mean;
		stddevUp[index] = mean + stddev;
		stddevDown[index] = mean - stddev;
	}

	return {
		frequencies: Float32Array.from(base.frequencies),
		valuesDb,
		stddevUp,
		stddevDown,
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
	averageCurve: MagnitudeResponseWithStdDev | null,
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
	if (averageCurve && curves.length > 1) {
		// Add upper stddev band
		traces.push({
			type: "scatter",
			mode: "lines",
			name: "Average +1SD",
			x: Array.from(averageCurve.frequencies),
			y: Array.from(averageCurve.stddevUp),
			line: { color: "rgba(248, 250, 252, 0.3)", width: 1 },
			showlegend: false,
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>+1SD</extra>",
		});

		// Add average curve
		traces.push({
			type: "scatter",
			mode: "lines",
			name: "Average",
			x: Array.from(averageCurve.frequencies),
			y: Array.from(averageCurve.valuesDb),
			line: { color: "#f8fafc", width: 6 },
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>Average</extra>",
		});

		// Add lower stddev band
		traces.push({
			type: "scatter",
			mode: "lines",
			name: "Average -1SD",
			x: Array.from(averageCurve.frequencies),
			y: Array.from(averageCurve.stddevDown),
			line: { color: "rgba(248, 250, 252, 0.3)", width: 1 },
			showlegend: false,
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra>-1SD</extra>",
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

function renderAnalysisPhaseDelayPlot(
	host: HTMLElement,
	curves: AnalysisCurve[],
	delayOffsetMs: number = 0,
	displayUnit: DelayDisplayUnit = "ms",
): void {
	const traces: any[] = curves.flatMap((curve, index) => {
		const color = ANALYSIS_COLORS[index % ANALYSIS_COLORS.length];
		// Calculate group delay from phase: gd = -d(phase)/d(freq)
		const frequencies = Array.from(curve.phaseSmoothed.frequencies);
		const phases = Array.from(curve.phaseSmoothed.phasesDeg);
		const groupDelays: number[] = [];

		for (let i = 0; i < phases.length; i += 1) {
			if (i === 0) {
				groupDelays.push(Number.NaN);
				continue;
			}
			const df = (frequencies[i] ?? 0) - (frequencies[i - 1] ?? 0);
			const dp = (phases[i] ?? 0) - (phases[i - 1] ?? 0);
			if (Math.abs(df) < 0.1) {
				groupDelays.push(Number.NaN);
				continue;
			}
			// gd = -d(phase_rad) / d(freq) / (2*pi)
			const phaseRad = dp * (Math.PI / 180);
			const gd = (-phaseRad / df) / (2 * Math.PI) * 1000; // convert to ms
			const gdCompensated = gd - delayOffsetMs; // subtract ch3/ch2 delay
			const gdDisplay = convertDelayMsForDisplay(gdCompensated, displayUnit);
			groupDelays.push(Number.isFinite(gdDisplay) ? gdDisplay : Number.NaN);
		}

		const delayUnitLabel = getDelayDisplayUnitLabel(displayUnit);
		const delayHoverFormat = displayUnit === "m" ? "%{y:.4f}" : "%{y:.2f}";

		return [{
			type: "scatter",
			mode: "lines",
			name: curve.label,
			x: frequencies,
			y: groupDelays,
			line: { color, width: 2 },
			hovertemplate: `%{x:.1f} Hz<br>${delayHoverFormat} ${delayUnitLabel}<extra>Group delay</extra>`,
		}];
	});

	const yMin = convertDelayMsForDisplay(-10, displayUnit);
	const yMax = convertDelayMsForDisplay(40, displayUnit);
	const delayUnitLabel = getDelayDisplayUnitLabel(displayUnit);

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Group delay (phase)", font: { color: "#f8fafc", size: 14 } },
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
				title: { text: `Group delay (${delayUnitLabel})`, font: { color: "#9aa4b2", size: 12 } },
				range: [yMin, yMax],
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
				range: [0, 2.5],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

function renderAlignedImpulseResponsePlot(
	host: HTMLElement,
	traces: AlignedImpulseTrace[],
	displayUnit: DelayDisplayUnit = "ms",
): void {
	const delayUnitLabel = getDelayDisplayUnitLabel(displayUnit);
	const xHoverFormat = displayUnit === "m" ? "%{x:.4f}" : "%{x:.3f}";
	const xMin = convertDelayMsForDisplay(-10, displayUnit);
	const xMax = convertDelayMsForDisplay(40, displayUnit);
	const plotTraces = traces.map((entry, index) => ({
		type: "scatter",
		mode: "lines",
		name: `${entry.label} (${formatDelayForDisplay(entry.delayMs, displayUnit, displayUnit === "m" ? 4 : 3)})`,
		x: Array.from(entry.timeMs, (value) => convertDelayMsForDisplay(value, displayUnit)),
		y: Array.from(entry.amplitude),
		line: { color: ANALYSIS_COLORS[index % ANALYSIS_COLORS.length], width: 2 },
		hovertemplate: `${xHoverFormat} ${delayUnitLabel}<br>%{y:.5f}<extra></extra>`,
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
				title: { text: `Time (${delayUnitLabel})`, font: { color: "#9aa4b2", size: 12 } },
				range: [xMin, xMax],
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
		timeMs[i] = (i / sampleRate) * 500;
		amplitudeRaw[i] = ir[idx] ?? 0;
	}

	// Apply a light Gaussian smoothing to match REW-style IR readability.
	const smoothedAmplitude = smoothImpulseResponse(amplitudeRaw, sampleRate, 0.1);
	const amplitude = normalizeImpulseToPeak(smoothedAmplitude.slice(length / 4, 3 * length / 4));

	return { timeMs: timeMs.slice(length / 4, 3 * length / 4), amplitude };
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
	const delayMs = delaySeconds * 1000;
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
	session?.cleanup?.();
	session?.measurement?.destroy();
	session?.tool?.destroy();

	document.querySelector(`[data-tab="${tabId}"]`)?.remove();
	document.querySelector(`[data-content="${tabId}"]`)?.remove();
	plotSessions.delete(tabId);
}

function createWaveformMarkup(tabId: string): string {
	return `
		<div class="acquisition-toolbar" role="toolbar" aria-label="Waveform plot controls">
			<div class="acquisition-toolbar-group">
				<label for="analysisPlaybackDeviceSelect-${tabId}" class="acquisition-toolbar-label">Playback</label>
				<select id="analysisPlaybackDeviceSelect-${tabId}" class="toolbar-select" aria-label="Playback device selection"></select>
			</div>
			<div class="acquisition-toolbar-group">
				<label class="acquisition-toolbar-label">Channels</label>
				<div id="analysisChannelButtons-${tabId}" class="waveform-channel-buttons" role="group" aria-label="Displayed channels"></div>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisSpectrogramFftSelect-${tabId}" class="acquisition-toolbar-label">FFT</label>
				<select id="analysisSpectrogramFftSelect-${tabId}" class="toolbar-select" aria-label="Spectrogram FFT size">
					<option value="512">512</option>
					<option value="1024">1024</option>
					<option value="2048" selected>2048</option>
					<option value="4096">4096</option>
					<option value="8192">8192</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group waveform-toolbar-actions">
				<button id="analysisPlayBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button waveform-play-action-button">Play</button>
				<button id="analysisStopBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button">Stop</button>
			</div>
		</div>
		<div id="waveform-tool-${tabId}" class="waveform-tool-host"></div>
		<div class="waveform-statusbar" role="status" aria-live="polite">
			<p id="analysisWaveformStatusText-${tabId}" class="waveform-statusbar-text">Ready</p>
			<div class="waveform-statusbar-gain">
				<label for="analysisPlaybackGainSlider-${tabId}" class="waveform-statusbar-label">Volume</label>
				<input id="analysisPlaybackGainSlider-${tabId}" class="waveform-gain-slider" type="range" min="0" max="0" step="0.1" value="0" aria-label="Playback gain" />
				<span id="analysisPlaybackGainValue-${tabId}" class="waveform-statusbar-value">+0.0 dB</span>
			</div>
		</div>
	`;
}

function createAnalysisMarkup(tabId: string, fileName: string, sampleRate: number, channelCount: number, frameCount: number): string {
	const durationSeconds = sampleRate > 0 ? frameCount / sampleRate : 0;
	return `
		<div class="acquisition-toolbar" role="toolbar" aria-label="Analysis plot controls">
			<div class="acquisition-toolbar-group">
				<label for="analysisTargetOffset-${tabId}" class="acquisition-toolbar-label">Target offset</label>
				<input id="analysisTargetOffset-${tabId}" class="toolbar-select analysis-target-input" type="number" value="0" step="0.5" min="-20" max="20" />
				<span class="acquisition-toolbar-label" style="font-size: 0.85em; color: #9aa4b2;">dB @ 1k</span>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisFarinaWindow-${tabId}" class="acquisition-toolbar-label">Farina window</label>
				<input id="analysisFarinaWindow-${tabId}" class="toolbar-select analysis-target-input" type="number" value="0.2" step="0.05" min="0.05" max="1" />
				<span class="acquisition-toolbar-label" style="font-size: 0.85em; color: #9aa4b2;">s</span>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisSmoothingFraction-${tabId}" class="acquisition-toolbar-label">Smoothing</label>
				<select id="analysisSmoothingFraction-${tabId}" class="toolbar-select">
					<option value="0">None</option>
					<option value="0.3333">1/3 octave</option>
					<option value="0.1667" selected>1/6 octave</option>
					<option value="0.0833">1/12 octave</option>
					<option value="0.0417">1/24 octave</option>
					<option value="0.0208">1/48 octave</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisDelayUnit-${tabId}" class="acquisition-toolbar-label">Delay unit</label>
				<select id="analysisDelayUnit-${tabId}" class="toolbar-select">
					<option value="ms" selected>ms</option>
					<option value="m">meters</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group" style="margin-left: auto;">
				<button id="analysisUpdateBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button" style="background-color: #3b82f6; border-color: #2563eb;">Update analysis</button>
			</div>
		</div>
		<div class="tab-inner-content">
			<div class="loose-container">
				<p class="info">Press "Update analysis" to run or refresh the analysis plots.</p>
				<p class="info">1/6-octave smoothed transfer magnitude from channel 1 measured against channel 2 reference.</p>
				<p id="analysisDelaySummary-${tabId}" class="info">Ch3 -> Ch2 delay compensation: unavailable (requires channel 3).</p>
				<p class="info">${fileName} · ${sampleRate} Hz · ${channelCount} ch · ${durationSeconds.toFixed(2)} s</p>
			</div>
			
			<div id="analysisExtraPlots-${tabId}" class="analysis-extra-plots">
				<section class="live-plot-card">
					<h2>Frequency response</h2>
					<div id="analysisFrequencyPlot-${tabId}" class="analysis-plot-host"></div>
				</section>
				<section class="live-plot-card">
					<h2>Delay alignment impulse</h2>
					<div id="analysisAlignmentIrPlot-${tabId}" class="analysis-plot-host"></div>
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
					<h2>Group delay (phase)</h2>
					<div id="analysisPhaseDelayPlot-${tabId}" class="analysis-plot-host"></div>
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
		const playbackDeviceSelect = document.getElementById(`analysisPlaybackDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const channelButtonsHost = document.getElementById(`analysisChannelButtons-${tabId}`) as HTMLDivElement | null;
		const fftSelect = document.getElementById(`analysisSpectrogramFftSelect-${tabId}`) as HTMLSelectElement | null;
		const playButton = document.getElementById(`analysisPlayBtn-${tabId}`) as HTMLButtonElement | null;
		const stopButton = document.getElementById(`analysisStopBtn-${tabId}`) as HTMLButtonElement | null;
		const waveformStatusText = document.getElementById(`analysisWaveformStatusText-${tabId}`) as HTMLParagraphElement | null;
		const playbackGainSlider = document.getElementById(`analysisPlaybackGainSlider-${tabId}`) as HTMLInputElement | null;
		const playbackGainValue = document.getElementById(`analysisPlaybackGainValue-${tabId}`) as HTMLSpanElement | null;

		if (!mountHost) {
			throw new Error("Failed to create waveform tool host.");
		}
		if (
			!playbackDeviceSelect ||
			!channelButtonsHost ||
			!fftSelect ||
			!playButton ||
			!stopButton ||
			!waveformStatusText ||
			!playbackGainSlider ||
			!playbackGainValue
		) {
			throw new Error("Failed to create waveform toolbar.");
		}

		const tool = mountWaveformTool(mountHost);
		const WAVEFORM_PLAYBACK_DEVICE_CACHE_KEY = "update.waveform.playbackDeviceId";
		let destroyed = false;
		let deviceRefreshToken = 0;
		let loadingOperations = 0;
		const selectedChannels = new Set<number>();
		let isWaveformPlaying = false;

		const formatGainDb = (valueDb: number): string => {
			if (!Number.isFinite(valueDb) || valueDb <= -200) {
				return "-inf dB";
			}
			return `${valueDb >= 0 ? "+" : ""}${valueDb.toFixed(1)} dB`;
		};

		const updateWaveformStatusText = (): void => {
			const selectedCount = selectedChannels.size;
			const totalCount = tool.getChannelCount();
			const stateText = isWaveformPlaying ? "Playing" : "Stopped";
			waveformStatusText.textContent = `${stateText} · ${selectedCount}/${totalCount} channels · max ${formatGainDb(tool.getPlaybackGainMaxDb())}`;
		};

		const syncPlaybackGainUi = (): void => {
			const maxGainDb = tool.getPlaybackGainMaxDb();
			const maxGainLinear = tool.getPlaybackGainMaxLinear();
			const gainLinear = tool.getPlaybackGainLinear();
			const gainDb = tool.getPlaybackGainDb();
			playbackGainSlider.min = "0";
			playbackGainSlider.max = maxGainLinear.toFixed(4);
			playbackGainSlider.step = "0.001";
			playbackGainSlider.value = gainLinear.toFixed(4);
			playbackGainValue.textContent = `${formatGainDb(gainDb)} (${gainLinear.toFixed(3)}x)`;
			playbackGainSlider.disabled = selectedChannels.size === 0;
		};

		const setTabLoading = (loading: boolean): void => {
			tabButton.classList.toggle("tab-loading", loading);
		};

		const runWithTabLoading = async <T>(work: () => Promise<T> | T): Promise<T> => {
			loadingOperations += 1;
			setTabLoading(true);
			try {
				return await work();
			} finally {
				loadingOperations = Math.max(0, loadingOperations - 1);
				if (loadingOperations === 0) {
					setTabLoading(false);
				}
			}
		};

		const ensureSelectedChannels = (channelCount: number): void => {
			for (const channelIndex of [...selectedChannels]) {
				if (channelIndex < 0 || channelIndex >= channelCount) {
					selectedChannels.delete(channelIndex);
				}
			}
			if (selectedChannels.size === 0) {
				for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
					selectedChannels.add(channelIndex);
				}
			}
		};

		const syncSelectedChannels = (): void => {
			tool.setDisplayedChannels([...selectedChannels]);
		};

		const renderChannelButtons = (channelCount: number): void => {
			channelButtonsHost.replaceChildren();
			if (channelCount <= 0) {
				return;
			}
			for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "toolbar-button button waveform-channel-button";
				button.textContent = String(channelIndex + 1);
				button.setAttribute("aria-label", `Toggle channel ${channelIndex + 1}`);
				button.style.setProperty("--channel-color", getWaveformLineColor(channelIndex));
				if (selectedChannels.has(channelIndex)) {
					button.classList.add("is-active");
				}
				button.addEventListener("click", () => {
					let changed = false;
					if (selectedChannels.has(channelIndex)) {
						selectedChannels.delete(channelIndex);
						changed = true;
					} else {
						selectedChannels.add(channelIndex);
						changed = true;
					}
					if (!changed) {
						return;
					}
					renderChannelButtons(channelCount);
					void runWithTabLoading(() => {
						syncSelectedChannels();
					});
				});
				channelButtonsHost.append(button);
			}
		};

		const refreshPlaybackDevices = async (): Promise<void> => {
			if (destroyed) {
				return;
			}
			const token = ++deviceRefreshToken;
			try {
				const outputs = await listAudioDevices("audiooutput");
				if (destroyed || token !== deviceRefreshToken) {
					return;
				}
				setAudioDeviceSelectOptions(playbackDeviceSelect, outputs, "System default output");
				restoreCachedFieldValue(playbackDeviceSelect, WAVEFORM_PLAYBACK_DEVICE_CACHE_KEY);
				playbackDeviceSelect.disabled = outputs.length === 0;
				await tool.setPlaybackDeviceId(playbackDeviceSelect.value || "");
			} catch {
				if (!destroyed && token === deviceRefreshToken) {
					playbackDeviceSelect.disabled = true;
				}
			}
		};

		const handlePlay = (): void => {
			void tool.play();
		};
		const handleStop = (): void => {
			tool.stop();
		};
		const handlePlaybackDeviceChange = (): void => {
			void runWithTabLoading(async () => {
				await tool.setPlaybackDeviceId(playbackDeviceSelect.value || "");
			});
		};
		const handleFftChange = (): void => {
			const fftSize = Number.parseInt(fftSelect.value, 10);
			if (Number.isFinite(fftSize) && fftSize > 0) {
				void runWithTabLoading(() => {
					tool.setSpectrogramFftSize(fftSize);
				});
			}
		};
		const handlePlaybackGainInput = (): void => {
			const gainLinear = Number.parseFloat(playbackGainSlider.value);
			const unityGain = 1;
			const snapThreshold = 0.01;
			const requestedGainLinear = Number.isFinite(gainLinear) ? gainLinear : unityGain;
			const snappedGainLinear = Math.abs(requestedGainLinear - unityGain) <= snapThreshold
				? unityGain
				: requestedGainLinear;
			const appliedGainLinear = tool.setPlaybackGainLinear(snappedGainLinear);
			const appliedGainDb = tool.getPlaybackGainDb();
			playbackGainSlider.value = appliedGainLinear.toFixed(4);
			playbackGainValue.textContent = `${formatGainDb(appliedGainDb)} (${appliedGainLinear.toFixed(3)}x)`;
			updateWaveformStatusText();
		};

		bindCachedFieldValue(playbackDeviceSelect, WAVEFORM_PLAYBACK_DEVICE_CACHE_KEY);
		playButton.addEventListener("click", handlePlay);
		stopButton.addEventListener("click", handleStop);
		playbackDeviceSelect.addEventListener("change", handlePlaybackDeviceChange);
		fftSelect.addEventListener("change", handleFftChange);
		playbackGainSlider.addEventListener("input", handlePlaybackGainInput);
		navigator.mediaDevices?.addEventListener?.("devicechange", refreshPlaybackDevices);

		const unsubscribePlaybackState = tool.onPlaybackStateChanged((isPlaying) => {
			isWaveformPlaying = isPlaying;
			playButton.classList.toggle("is-active", isPlaying);
			playButton.setAttribute("aria-pressed", isPlaying ? "true" : "false");
			updateWaveformStatusText();
		});

		const unsubscribePlaybackGainMaxDb = tool.onPlaybackGainMaxDbChanged(() => {
			syncPlaybackGainUi();
			updateWaveformStatusText();
		});

		const unsubscribeDisplayedChannels = tool.onDisplayedChannelsChanged((channelIndices) => {
			selectedChannels.clear();
			for (const channelIndex of channelIndices) {
				selectedChannels.add(channelIndex);
			}
			renderChannelButtons(tool.getChannelCount());
			syncPlaybackGainUi();
			updateWaveformStatusText();
		});

		const unsubscribeChannelCount = tool.onChannelCountChanged((channelCount) => {
			ensureSelectedChannels(channelCount);
			renderChannelButtons(channelCount);
			syncSelectedChannels();
			syncPlaybackGainUi();
			updateWaveformStatusText();
		});

		const initialFftSize = tool.getSpectrogramFftSize();
		fftSelect.value = String(initialFftSize);
		tool.setSpectrogramFftSize(initialFftSize);
		syncPlaybackGainUi();
		updateWaveformStatusText();
		await runWithTabLoading(async () => {
			await Promise.all([
				tool.openFile(file),
				refreshPlaybackDevices(),
			]);
		});
		syncPlaybackGainUi();
		updateWaveformStatusText();
		plotSessions.set(tabId, {
			tool,
			cleanup: () => {
				destroyed = true;
				unsubscribePlaybackState();
				unsubscribePlaybackGainMaxDb();
				unsubscribeDisplayedChannels();
				unsubscribeChannelCount();
				navigator.mediaDevices?.removeEventListener?.("devicechange", refreshPlaybackDevices);
				playButton.removeEventListener("click", handlePlay);
				stopButton.removeEventListener("click", handleStop);
				playbackDeviceSelect.removeEventListener("change", handlePlaybackDeviceChange);
				fftSelect.removeEventListener("change", handleFftChange);
				playbackGainSlider.removeEventListener("input", handlePlaybackGainInput);
			},
		});
		setTabLoading(false);
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
		const phaseDelayPlot = document.getElementById(`analysisPhaseDelayPlot-${tabId}`) as HTMLElement | null;
		const distortionPlot = document.getElementById(`analysisDistortionPlot-${tabId}`) as HTMLElement | null;
		const thdPlot = document.getElementById(`analysisThdPlot-${tabId}`) as HTMLElement | null;
		const alignmentIrPlot = document.getElementById(`analysisAlignmentIrPlot-${tabId}`) as HTMLElement | null;
		const analysisExtraPlots = document.getElementById(`analysisExtraPlots-${tabId}`) as HTMLElement | null;
		const delaySummary = document.getElementById(`analysisDelaySummary-${tabId}`) as HTMLElement | null;
		const targetOffsetInput = document.getElementById(`analysisTargetOffset-${tabId}`) as HTMLInputElement | null;
		const farinaWindowInput = document.getElementById(`analysisFarinaWindow-${tabId}`) as HTMLInputElement | null;
		const smoothingFractionInput = document.getElementById(`analysisSmoothingFraction-${tabId}`) as HTMLSelectElement | null;
		const delayUnitInput = document.getElementById(`analysisDelayUnit-${tabId}`) as HTMLSelectElement | null;
		const updateBtn = document.getElementById(`analysisUpdateBtn-${tabId}`) as HTMLButtonElement | null;
		if (!frequencyPlot) {
			throw new Error("Failed to create analysis frequency plot.");
		}
		if (!phaseDelayPlot || !distortionPlot || !thdPlot || !alignmentIrPlot || !analysisExtraPlots || !delaySummary) {
			throw new Error("Failed to create distortion plots.");
		}
		if (!targetOffsetInput) {
			throw new Error("Failed to create target offset control.");
		}
		if (!farinaWindowInput) {
			throw new Error("Failed to create farina window control.");
		}
		if (!smoothingFractionInput) {
			throw new Error("Failed to create smoothing fraction control.");
		}
		if (!delayUnitInput) {
			throw new Error("Failed to create delay unit control.");
		}
		if (!updateBtn) {
			throw new Error("Failed to create update button.");
		}

		const renderDerivedPlots = (): void => {
			const smoothingFraction = Number.parseFloat(smoothingFractionInput.value || "0.1667");
			const delayDisplayUnit: DelayDisplayUnit = delayUnitInput.value === "m" ? "m" : "ms";
			const curves: AnalysisCurve[] = [];
			let ch3Ch2DelayMs = 0;
			
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
				const phase = computeTransferPhaseResponse(measured, reference, parsed.sampleRate);
				if (!phase) {
					continue;
				}
				
				// Compute ch3/ch2 delay if channel 3 exists
				if (parsed.channels.length >= 3 && ch3Ch2DelayMs === 0) {
					const ch3 = parsed.channels[2] ?? new Float32Array(0);
					const ch2 = parsed.channels[1] ?? new Float32Array(0);
					const ch3Ch2Phase = computeTransferPhaseResponse(ch3, ch2, parsed.sampleRate);
					if (ch3Ch2Phase && ch3Ch2Phase.frequencies.length > 0) {
						let closest1kIdx = 0;
						let minDist = Math.abs((ch3Ch2Phase.frequencies[0] ?? 0) - 1000);
						for (let i = 1; i < ch3Ch2Phase.frequencies.length; i += 1) {
							const dist = Math.abs((ch3Ch2Phase.frequencies[i] ?? 0) - 1000);
							if (dist < minDist) {
								minDist = dist;
								closest1kIdx = i;
							}
						}
						const phase1k = ch3Ch2Phase.phasesDeg[closest1kIdx] ?? 0;
						ch3Ch2DelayMs = -phase1k / (360 * 1); // -phase_deg / (360 * freq_kHz)
					}
				}
				
				const magnitudeSmoothed = smoothingFraction > 0 
					? smoothMagnitudeFractional(magnitude.valuesDb, smoothingFraction, parsed.sampleRate)
					: magnitude;
				const phaseSmoothed = smoothingFraction > 0
					? smoothPhaseFractional(phase.phasesDeg, smoothingFraction, parsed.sampleRate)
					: phase;
				curves.push({
					label: file.name,
					raw: magnitude,
					smoothed: magnitudeSmoothed,
					phase,
					phaseSmoothed,
				});
			}

			if (curves.length === 0) {
				drawEmptyPlotHost(frequencyPlot, "Frequency response", "Requires a two-channel file.");
				return;
			}
			const averageCurve = computeAverageMagnitudeResponseWithStdDev(curves);
			const targetOffsetDb = Number.parseFloat(targetOffsetInput.value || "0");
			const targetBase = averageCurve ?? curves[0]?.smoothed ?? null;
			const targetCurve = targetBase
				? computeTargetMagnitudeResponse(targetBase, Number.isFinite(targetOffsetDb) ? targetOffsetDb : 0)
				: null;
			renderAnalysisFrequencyPlot(frequencyPlot, curves, averageCurve, targetCurve);

			// Render alignment impulse (second plot)
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
				delaySummary.textContent = `Ch3 -> Ch2 delay compensation: ${formatDelayForDisplay(entry.delayMs, delayDisplayUnit)} (${entry.delaySamples.toFixed(1)} samples).`;
			} else {
				const averageMs = alignmentTraces.reduce((sum, entry) => sum + entry.delayMs, 0) / alignmentTraces.length;
				delaySummary.textContent = `Ch3 -> Ch2 delay compensation: average ${formatDelayForDisplay(averageMs, delayDisplayUnit)} across ${alignmentTraces.length} files.`;
			}

			if (alignmentTraces.length > 0) {
				renderAlignedImpulseResponsePlot(alignmentIrPlot, alignmentTraces, delayDisplayUnit);
			}

			const harmonicCurves: HarmonicCurve[] = [];
			const thdSeries: Array<{ label: string; series: SeriesResponse }> = [];
			for (const { file, parsed } of parsedFiles) {
				if (parsed.channels.length < 2) {
					continue;
				}
				const measured = parsed.channels[0] ?? new Float32Array(0);
				const reference = parsed.channels[1] ?? new Float32Array(0);
				const farinaWindow = Number.parseFloat(farinaWindowInput.value || "0.2");
				const harmonics = computeFarinaLikeHarmonicCurves(measured, reference, parsed.sampleRate, file.name, farinaWindow, 5, smoothingFraction);
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

			// Render phase delay plot last
			if (curves.length > 0) {
				renderAnalysisPhaseDelayPlot(phaseDelayPlot, curves, ch3Ch2DelayMs, delayDisplayUnit);
			} else {
				drawEmptyPlotHost(phaseDelayPlot, "Group delay (phase)", "Requires a two-channel file.");
			}
		};

		const updateAnalysisPlotLayout = (): void => {
			analysisExtraPlots.classList.toggle("analysis-extra-plots--wide", analysisExtraPlots.clientWidth > 2400);
		};
		const layoutObserver = new ResizeObserver(updateAnalysisPlotLayout);
		layoutObserver.observe(analysisExtraPlots);
		updateAnalysisPlotLayout();

		updateBtn.addEventListener("click", renderDerivedPlots);
		renderDerivedPlots();
		plotSessions.set(tabId, {});
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

function registerPwaServiceWorker(): void {
	if (!("serviceWorker" in navigator)) {
		return;
	}

	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("./sw.js").catch((error) => {
			console.warn("Service worker registration failed", error);
		});
	});
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
	liveMicCalibrationInput &&
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
		micCalibrationInput: liveMicCalibrationInput,
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
registerPwaServiceWorker();