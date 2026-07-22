import { listAudioDevices, setAudioDeviceSelectOptions } from "./audio_devices";
import { startLiveMonitor, type LiveMonitorSession, type AudioChannelSelection } from "./audio_io";
import { fft } from "./fft";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import {
	createLevelMeterState,
	computeExponentialAverageAlpha,
	computeWaveformDecibels,
	getLevelMetricLabel,
	parseLevelMetric,
	updateLevelMeter,
	type LevelMeterState,
	type LevelMetric,
} from "./level_meter";
import { nextPow2 } from "./math";
import { calculateTwoChannelImpulseResponse, estimateDelay } from "./signal";

type LiveSpectrumSeries = {
	frequencies: Float32Array;
	valuesDb: Float32Array;
};

type LiveMonitorHistoryPoint = {
	timeSeconds: number;
	micDb: number;
	referenceDb: number | null;
};

export interface LiveMonitorControllerOptions {
	micDeviceSelect: HTMLSelectElement;
	micChannelSelect: HTMLSelectElement;
	referenceDeviceSelect: HTMLSelectElement;
	referenceChannelSelect: HTMLSelectElement;
	averageTimeConstantSelect: HTMLSelectElement;
	smoothingSelect: HTMLSelectElement;
	weightingSelect: HTMLSelectElement;
	statusText: HTMLElement;
	startButton: HTMLButtonElement;
	stopButton: HTMLButtonElement;
	adaptButton: HTMLButtonElement;
	delayValue: HTMLElement;
	micSplValue: HTMLElement;
	referenceSplValue: HTMLElement;
	differenceSplValue: HTMLElement;
	splHistoryCanvas: HTMLCanvasElement;
	spectrumCanvas: HTMLCanvasElement;
	impulseCanvas: HTMLCanvasElement;
	phaseCanvas: HTMLCanvasElement;
}

export interface LiveMonitorController {
	destroy(): void;
	isRunning(): boolean;
}

const HISTORY_SECONDS = 60;
const MIN_DB = -96;
const MAX_DB = 6;
const SPECTRUM_MIN_DB = -40;
const SPECTRUM_MAX_DB = 20;
const DEFAULT_SMOOTHING_FRACTION = 1 / 6;
const PLOT_AXIS_FRACTION = 1 / 24;
const LOG_FREQUENCY_MIN = 20;
const DEFAULT_AVERAGING_SECONDS = 1;
const SPECTRUM_GRID_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const LEVEL_GRID_VALUES = [-90, -80, -70, -60, -50, -40, -30, -20, -10, 0];
const SPECTRUM_LEVEL_GRID_VALUES = [-50, -40, -30, -20, -10, 0, 10];
const DERIVED_PLOT_MIN_UPDATE_MS = 250;
const DERIVED_AVERAGING_SECONDS = 15;
const DELAY_ALIGNMENT_SECONDS = 120;
const DELAY_STABILITY_THRESHOLD_MS = 0.25;
const DELAY_STABILITY_UPDATES = 8;

type PhaseResponse = {
	frequencies: Float32Array;
	phasesDeg: Float32Array;
};

type ImpulseResponseWindow = {
	timeMs: Float32Array;
	amplitude: Float32Array;
};

type TransferComplexResponse = {
	frequencies: Float32Array;
	re: Float32Array;
	im: Float32Array;
};

export function applyExponentialAverage(previous: Float32Array | null, next: Float32Array, alpha: number): Float32Array {
	if (!previous || previous.length !== next.length || alpha >= 1) {
		return Float32Array.from(next);
	}

	const output = new Float32Array(next.length);
	const clampedAlpha = Math.max(0, Math.min(1, alpha));
	for (let index = 0; index < next.length; index += 1) {
		output[index] = (clampedAlpha * next[index]) + ((1 - clampedAlpha) * previous[index]);
	}
	return output;
}

function normalizeChannelSelection(value: string): AudioChannelSelection {
	return value === "right" ? "right" : "left";
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function formatLevel(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return "-- dBFS";
	}
	return `${value.toFixed(1)} dBFS`;
}

function formatMetricLevel(value: number | null, metric: LevelMetric): string {
	if (value === null || !Number.isFinite(value)) {
		return `-- ${getLevelMetricLabel(metric)}`;
	}
	return `${value.toFixed(1)} ${getLevelMetricLabel(metric)}`;
}

function formatDifferenceLevel(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return "-- dB";
	}
	return `${value.toFixed(1)} dB`;
}

function formatFrequencyLabel(value: number): string {
	return value >= 1000 ? `${Math.round(value / 1000)} kHz` : `${Math.round(value)} Hz`;
}

function parseSmoothingFraction(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SMOOTHING_FRACTION;
}

function parseAveragingSeconds(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AVERAGING_SECONDS;
}

function computeSpectrumMagnitudes(samples: Float32Array, useWindow = true): Float32Array {
	const fftSize = nextPow2(samples.length);
	const windowed = new Array<number>(fftSize).fill(0);
	for (let index = 0; index < samples.length; index += 1) {
		const window = useWindow ? 0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, samples.length - 1))) : 1;
		windowed[index] = (samples[index] ?? 0) * window;
	}

	const [real, imag] = fft(windowed);
	const half = fftSize / 2;
	const magnitudes = new Float32Array(half);
	for (let index = 0; index < half; index += 1) {
		const magnitude = Math.sqrt((real[index] ?? 0) ** 2 + (imag[index] ?? 0) ** 2) / Math.max(1, samples.length);
		magnitudes[index] = magnitude;
	}
	return magnitudes;
}

export function buildSmoothedSpectrum(
	samples: Float32Array,
	sampleRate: number,
	smoothingFraction: number,
): LiveSpectrumSeries {
	const magnitudes = computeSpectrumMagnitudes(samples);
	const nyquist = sampleRate / 2;
	if (magnitudes.length === 0 || nyquist <= LOG_FREQUENCY_MIN) {
		return {
			frequencies: new Float32Array(0),
			valuesDb: new Float32Array(0),
		};
	}

	const frequencies = getFractionalOctaveFrequencies(PLOT_AXIS_FRACTION, LOG_FREQUENCY_MIN, nyquist, magnitudes.length * 2, sampleRate);
	const smoothed = fractionalOctaveSmoothing(magnitudes, smoothingFraction, frequencies);
	const valuesDb = new Float32Array(smoothed.length);
	for (let index = 0; index < smoothed.length; index += 1) {
		valuesDb[index] = 20 * Math.log10(Math.max(smoothed[index] ?? 0, 1e-12));
	}
	return { frequencies, valuesDb };
}

function createHistoryPoint(timeSeconds: number, micDb: number, referenceDb: number | null): LiveMonitorHistoryPoint {
	return { timeSeconds, micDb, referenceDb };
}

function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
	const rect = canvas.getBoundingClientRect();
	const width = Math.max(1, Math.floor(rect.width));
	const height = Math.max(1, Math.floor(rect.height));
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}
	context.setTransform(1, 0, 0, 1, 0, 0);
	return { ctx: context, width, height };
}

function drawChartBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = "rgba(181, 192, 224, 0.16)";
	ctx.lineWidth = 1;
	ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
}

function drawEmptyPlot(canvas: HTMLCanvasElement, title: string, message: string): void {
	const prepared = prepareCanvas(canvas);
	if (!prepared) {
		return;
	}
	const { ctx, width, height } = prepared;
	drawChartBackground(ctx, width, height);
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
	options: { logX?: boolean; yMin?: number; yMax?: number; wrapY?: boolean } = {},
): void {
	const prepared = prepareCanvas(canvas);
	if (!prepared) {
		return;
	}

	const { ctx, width, height } = prepared;
	drawChartBackground(ctx, width, height);

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

function computeTransferComplexResponse(
	recorded: Float32Array,
	stimulus: Float32Array,
	sampleRate: number,
): TransferComplexResponse | null {
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
	const re: number[] = [];
	const im: number[] = [];

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

		freqs.push(freq);
		re.push(hRe);
		im.push(hIm);
	}

	if (freqs.length === 0) {
		return null;
	}

	return {
		frequencies: Float32Array.from(freqs),
		re: Float32Array.from(re),
		im: Float32Array.from(im),
	};
}

function alignSignalsByDelay(
	recorded: Float32Array,
	stimulus: Float32Array,
	delaySamples: number,
): { recorded: Float32Array; stimulus: Float32Array } | null {
	if (recorded.length === 0 || stimulus.length === 0) {
		return null;
	}

	const shift = Math.round(delaySamples);
	let recordedStart = 0;
	let stimulusStart = 0;

	if (shift >= 0) {
		recordedStart = shift;
	} else {
		stimulusStart = -shift;
	}

	const length = Math.min(
		recorded.length - recordedStart,
		stimulus.length - stimulusStart,
	);

	if (!Number.isFinite(length) || length < 8) {
		return null;
	}

	return {
		recorded: recorded.subarray(recordedStart, recordedStart + length),
		stimulus: stimulus.subarray(stimulusStart, stimulusStart + length),
	};
}

function computeUnwrappedPhaseFromComplex(re: Float32Array, im: Float32Array): Float32Array {
	const phases = new Float32Array(re.length);
	let prev = 0;
	let first = true;
	for (let i = 0; i < re.length; i += 1) {
		let phase = Math.atan2(im[i] ?? 0, re[i] ?? 0) * (180 / Math.PI);
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
		phases[i] = phase;
	}
	return phases;
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

function smoothPhaseFractional(
	phasesDeg: Float32Array,
	smoothingFraction: number,
	sampleRate: number,
): { frequencies: Float32Array; phasesDeg: Float32Array } {
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

function computeImpulseResponseWindowed(recorded: Float32Array, stimulus: Float32Array, sampleRate: number): ImpulseResponseWindow | null {
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

function computeImpulseResponseAlignedWindow(
	recorded: Float32Array,
	stimulus: Float32Array,
	sampleRate: number,
	delaySamples: number,
): ImpulseResponseWindow | null {
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

	const center = Math.floor(ir.length / 2) + Math.round(delaySamples);
	const before = Math.round(0.08 * sampleRate);
	const after = Math.round(0.45 * sampleRate);
	const length = before + after;
	if (length <= 4) {
		return null;
	}

	const timeMs = new Float32Array(length);
	const amplitude = new Float32Array(length);
	for (let i = 0; i < length; i += 1) {
		const idx = center - before + i;
		timeMs[i] = ((i - before) / sampleRate) * 1000;
		amplitude[i] = (idx >= 0 && idx < ir.length) ? (ir[idx] ?? 0) : 0;
	}

	return { timeMs, amplitude };
}

function drawSplHistory(
	canvas: HTMLCanvasElement,
	history: LiveMonitorHistoryPoint[],
	nowSeconds: number,
): void {
	const prepared = prepareCanvas(canvas);
	if (!prepared) {
		return;
	}

	const { ctx, width, height } = prepared;
	drawChartBackground(ctx, width, height);

	ctx.font = "11px sans-serif";
	ctx.fillStyle = "#9aa4b2";
	for (const value of LEVEL_GRID_VALUES) {
		const fraction = (value - MIN_DB) / (MAX_DB - MIN_DB);
		const y = Math.round((1 - fraction) * (height - 1));
		ctx.strokeStyle = "rgba(181, 192, 224, 0.12)";
		ctx.beginPath();
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(width, y + 0.5);
		ctx.stroke();
		ctx.fillText(`${value}`, 6, Math.max(12, y - 2));
	}

	for (let second = 0; second <= HISTORY_SECONDS; second += 10) {
		const x = Math.round((1 - (second / HISTORY_SECONDS)) * (width - 1));
		ctx.strokeStyle = "rgba(181, 192, 224, 0.08)";
		ctx.beginPath();
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, height);
		ctx.stroke();
		ctx.fillText(`-${second}s`, Math.max(4, x - 16), height - 6);
	}

	const drawSeries = (color: string, pickValue: (point: LiveMonitorHistoryPoint) => number | null): void => {
		ctx.beginPath();
		let started = false;
		for (const point of history) {
			const value = pickValue(point);
			if (value === null || !Number.isFinite(value)) {
				continue;
			}
			const ageSeconds = nowSeconds - point.timeSeconds;
			const x = Math.round((1 - clamp(ageSeconds / HISTORY_SECONDS, 0, 1)) * (width - 1));
			const y = Math.round((1 - ((value - MIN_DB) / (MAX_DB - MIN_DB))) * (height - 1));
			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();
	};

	drawSeries("#f97316", (point) => point.micDb);
	drawSeries("#38bdf8", (point) => point.referenceDb);
}

function drawSpectrum(
	canvas: HTMLCanvasElement,
	micSpectrum: LiveSpectrumSeries | null,
	referenceSpectrum: LiveSpectrumSeries | null,
	differenceSpectrum: LiveSpectrumSeries | null,
	nyquist: number,
): void {
	const prepared = prepareCanvas(canvas);
	if (!prepared) {
		return;
	}

	const { ctx, width, height } = prepared;
	drawChartBackground(ctx, width, height);

	const maxFrequency = Math.max(LOG_FREQUENCY_MIN * 2, nyquist);
	const logMin = Math.log10(LOG_FREQUENCY_MIN);
	const logMax = Math.log10(maxFrequency);
	const projectX = (frequency: number): number => {
		const clamped = clamp(frequency, LOG_FREQUENCY_MIN, maxFrequency);
		return ((Math.log10(clamped) - logMin) / Math.max(1e-12, logMax - logMin)) * (width - 1);
	};
	const projectY = (valueDb: number): number => (1 - ((valueDb - SPECTRUM_MIN_DB) / (SPECTRUM_MAX_DB - SPECTRUM_MIN_DB))) * (height - 1);

	ctx.font = "11px sans-serif";
	ctx.fillStyle = "#9aa4b2";
	for (const frequency of SPECTRUM_GRID_FREQUENCIES) {
		if (frequency > maxFrequency) {
			continue;
		}
		const x = Math.round(projectX(frequency));
		ctx.strokeStyle = "rgba(181, 192, 224, 0.1)";
		ctx.beginPath();
		ctx.moveTo(x + 0.5, 0);
		ctx.lineTo(x + 0.5, height);
		ctx.stroke();
		ctx.fillText(formatFrequencyLabel(frequency), Math.max(2, x - 14), height - 6);
	}
	for (const value of SPECTRUM_LEVEL_GRID_VALUES) {
		const y = Math.round(projectY(value));
		ctx.strokeStyle = "rgba(181, 192, 224, 0.12)";
		ctx.beginPath();
		ctx.moveTo(0, y + 0.5);
		ctx.lineTo(width, y + 0.5);
		ctx.stroke();
		ctx.fillText(`${value}`, 6, Math.max(12, y - 2));
	}

	// Draw a -1 dB/decade target with 0 dB at 1 kHz.
	ctx.beginPath();
	for (let index = 0; index < width; index += 1) {
		const ratio = index / Math.max(1, width - 1);
		const frequency = Math.pow(10, logMin + ratio * (logMax - logMin));
		const targetDb = -Math.log10(Math.max(1e-9, frequency) / 1000);
		const y = projectY(targetDb);
		if (index === 0) {
			ctx.moveTo(index, y);
		} else {
			ctx.lineTo(index, y);
		}
	}
	ctx.strokeStyle = "#ef4444";
	ctx.lineWidth = 1.5;
	ctx.setLineDash([6, 4]);
	ctx.stroke();
	ctx.setLineDash([]);

	const drawSeries = (series: LiveSpectrumSeries | null, color: string): void => {
		if (!series || series.frequencies.length === 0) {
			return;
		}
		ctx.beginPath();
		for (let index = 0; index < series.frequencies.length; index += 1) {
			const x = projectX(series.frequencies[index] ?? LOG_FREQUENCY_MIN);
			const y = projectY(series.valuesDb[index] ?? SPECTRUM_MIN_DB);
			if (index === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();
	};

	drawSeries(micSpectrum, "#f97316");
	drawSeries(referenceSpectrum, "#38bdf8");
	drawSeries(differenceSpectrum, "#a3e635");
}

function buildDifferenceSpectrum(
	micSpectrum: LiveSpectrumSeries | null,
	referenceSpectrum: LiveSpectrumSeries | null,
): LiveSpectrumSeries | null {
	if (!micSpectrum || !referenceSpectrum) {
		return null;
	}

	const pointCount = Math.min(
		micSpectrum.frequencies.length,
		referenceSpectrum.frequencies.length,
		micSpectrum.valuesDb.length,
		referenceSpectrum.valuesDb.length,
	);
	if (pointCount <= 0) {
		return null;
	}

	const frequencies = micSpectrum.frequencies.slice(0, pointCount);
	const valuesDb = new Float32Array(pointCount);
	for (let index = 0; index < pointCount; index += 1) {
		valuesDb[index] = (micSpectrum.valuesDb[index] ?? MIN_DB) - (referenceSpectrum.valuesDb[index] ?? MIN_DB);
	}

	return { frequencies, valuesDb };
}

export function createLiveMonitorController(options: LiveMonitorControllerOptions): LiveMonitorController {
	const {
		micDeviceSelect,
		micChannelSelect,
		referenceDeviceSelect,
		referenceChannelSelect,
		averageTimeConstantSelect,
		smoothingSelect,
		weightingSelect,
		statusText,
		startButton,
		stopButton,
		adaptButton,
		delayValue,
		micSplValue,
		referenceSplValue,
		differenceSplValue,
		splHistoryCanvas,
		spectrumCanvas,
		impulseCanvas,
		phaseCanvas,
	} = options;

	let destroyed = false;
	let runningSession: LiveMonitorSession | null = null;
	let animationFrame: number | null = null;
	let deviceRefreshToken = 0;
	let lastFrameTime = 0;
	let averagedMicSpectrum: Float32Array | null = null;
	let averagedReferenceSpectrum: Float32Array | null = null;
	let history: LiveMonitorHistoryPoint[] = [];
	let micLevelMeter: LevelMeterState | null = null;
	let referenceLevelMeter: LevelMeterState | null = null;
	let lastDerivedPlotUpdateMs = 0;
	let smoothedDelaySamples: number | null = null;
	let delaySampleRate: number | null = null;
	let delayStableUpdateCount = 0;
	let delayAdaptationLocked = false;
	let averagedPhaseRe: Float32Array | null = null;
	let averagedPhaseIm: Float32Array | null = null;
	let phaseFrequencies: Float32Array | null = null;
	let averagedImpulse: Float32Array | null = null;
	let impulseTimeMs: Float32Array | null = null;

	const setStatus = (message: string, state: "idle" | "busy" | "success" | "error" = "idle"): void => {
		statusText.textContent = message;
		statusText.dataset.state = state;
	};

	const updateLevelPlaceholders = (): void => {
		const metric = parseLevelMetric(weightingSelect.value);
		micSplValue.textContent = formatMetricLevel(null, metric);
		referenceSplValue.textContent = formatMetricLevel(null, metric);
		differenceSplValue.textContent = formatDifferenceLevel(null);
	};

	const resetDerivedAverages = (): void => {
		averagedPhaseRe = null;
		averagedPhaseIm = null;
		phaseFrequencies = null;
		averagedImpulse = null;
		impulseTimeMs = null;
	};

	const updateDelayUi = (sampleRate: number | null, hasReference: boolean): void => {
		if (!hasReference) {
			delayValue.textContent = "-- ms";
			adaptButton.textContent = "Freeze delay";
			adaptButton.disabled = true;
			return;
		}

		if (sampleRate === null || sampleRate <= 0 || smoothedDelaySamples === null || !Number.isFinite(smoothedDelaySamples)) {
			delayValue.textContent = "Adapting...";
			adaptButton.textContent = "Freeze delay";
			adaptButton.disabled = true;
			return;
		}

		const delayMs = (smoothedDelaySamples / sampleRate) * 1000;
		delayValue.textContent = `${delayMs.toFixed(2)} ms${delayAdaptationLocked ? " (locked)" : ""}`;
		adaptButton.textContent = delayAdaptationLocked ? "Adapt delay" : "Freeze delay";
		adaptButton.disabled = !runningSession;
	};

	const resetDelayAlignment = (): void => {
		smoothedDelaySamples = null;
		delaySampleRate = null;
		delayStableUpdateCount = 0;
		delayAdaptationLocked = false;
		resetDerivedAverages();
		updateDelayUi(null, false);
	};

	const renderState = (): void => {
		const nowSeconds = performance.now() / 1000;
		drawSplHistory(splHistoryCanvas, history, nowSeconds);
	};

	const renderSpectrum = (mic: LiveSpectrumSeries | null, reference: LiveSpectrumSeries | null, sampleRate: number): void => {
		drawSpectrum(spectrumCanvas, mic, reference, buildDifferenceSpectrum(mic, reference), sampleRate / 2);
	};

	const renderDerivedPlots = (mic: Float32Array | null, reference: Float32Array | null, sampleRate: number, smoothingFraction: number): void => {
		if (!mic || !reference) {
			resetDelayAlignment();
			drawEmptyPlot(impulseCanvas, "Impulse response (live)", "Select a reference input device.");
			drawEmptyPlot(phaseCanvas, "Phase response (live)", "Select a reference input device.");
			return;
		}

		const delaySecondsInst = estimateDelay(reference, mic, sampleRate);
		const delaySamplesInst = delaySecondsInst * sampleRate;
		delaySampleRate = sampleRate;
		if (smoothedDelaySamples === null || !Number.isFinite(smoothedDelaySamples)) {
			smoothedDelaySamples = delaySamplesInst;
			delayStableUpdateCount = 0;
			delayAdaptationLocked = false;
		} else if (!delayAdaptationLocked) {
			const elapsedSeconds = Math.max(1 / 120, (lastDerivedPlotUpdateMs <= 0 ? DERIVED_PLOT_MIN_UPDATE_MS : DERIVED_PLOT_MIN_UPDATE_MS) / 1000);
			const alphaDelay = computeExponentialAverageAlpha(elapsedSeconds, DELAY_ALIGNMENT_SECONDS);
			const nextDelaySamples = (1 - alphaDelay) * smoothedDelaySamples + alphaDelay * delaySamplesInst;
			const stabilityThresholdSamples = Math.max(1, (DELAY_STABILITY_THRESHOLD_MS / 1000) * sampleRate);
			if (Math.abs(delaySamplesInst - smoothedDelaySamples) <= stabilityThresholdSamples) {
				delayStableUpdateCount += 1;
				if (delayStableUpdateCount >= DELAY_STABILITY_UPDATES) {
					delayAdaptationLocked = true;
				}
			} else {
				delayStableUpdateCount = 0;
			}
			smoothedDelaySamples = nextDelaySamples;
		}
		updateDelayUi(sampleRate, true);

		const alphaLong = computeExponentialAverageAlpha(Math.max(1 / 120, DERIVED_PLOT_MIN_UPDATE_MS / 1000), DERIVED_AVERAGING_SECONDS);

		const aligned = alignSignalsByDelay(mic, reference, smoothedDelaySamples ?? 0);
		const transferComplex = aligned
			? computeTransferComplexResponse(aligned.recorded, aligned.stimulus, sampleRate)
			: null;
		if (!transferComplex) {
			drawEmptyPlot(phaseCanvas, "Phase response (live)", "Unable to compute phase response.");
		} else {
			if (!averagedPhaseRe || !averagedPhaseIm || !phaseFrequencies || averagedPhaseRe.length !== transferComplex.re.length) {
				averagedPhaseRe = Float32Array.from(transferComplex.re);
				averagedPhaseIm = Float32Array.from(transferComplex.im);
				phaseFrequencies = Float32Array.from(transferComplex.frequencies);
			} else {
				for (let i = 0; i < averagedPhaseRe.length; i += 1) {
					averagedPhaseRe[i] = (1 - alphaLong) * averagedPhaseRe[i] + alphaLong * (transferComplex.re[i] ?? 0);
					averagedPhaseIm[i] = (1 - alphaLong) * averagedPhaseIm[i] + alphaLong * (transferComplex.im[i] ?? 0);
				}
			}

			const phaseUnwrapped = computeUnwrappedPhaseFromComplex(averagedPhaseRe, averagedPhaseIm);
			const phaseNormalized = normalizePhaseAtReference(phaseFrequencies, phaseUnwrapped, 100);
			const phaseSmoothed = smoothPhaseFractional(phaseNormalized, smoothingFraction, sampleRate);
			const phaseWrapped = wrapPhaseToRange(phaseSmoothed.phasesDeg, -1440, 1440);
			drawLinePlot(
				phaseCanvas,
				"Phase response (live, long average, 100 Hz ref)",
				"Frequency (Hz)",
				"Phase (deg)",
				phaseSmoothed.frequencies,
				phaseWrapped,
				"#38bdf8",
					{ logX: true, yMin: -1440, yMax: 1440, wrapY: true },
			);
		}

		const impulse = computeImpulseResponseAlignedWindow(mic, reference, sampleRate, smoothedDelaySamples ?? 0);
		if (!impulse || impulse.amplitude.length === 0) {
			drawEmptyPlot(impulseCanvas, "Impulse response (live)", "Unable to compute impulse response.");
		} else {
			if (!averagedImpulse || !impulseTimeMs || averagedImpulse.length !== impulse.amplitude.length) {
				averagedImpulse = Float32Array.from(impulse.amplitude);
				impulseTimeMs = Float32Array.from(impulse.timeMs);
			} else {
				for (let i = 0; i < averagedImpulse.length; i += 1) {
					averagedImpulse[i] = (1 - alphaLong) * averagedImpulse[i] + alphaLong * (impulse.amplitude[i] ?? 0);
				}
			}

			drawLinePlot(
				impulseCanvas,
				"Impulse response (live, long average)",
				"Time (ms)",
				"Amplitude",
				impulseTimeMs,
				averagedImpulse,
				"#f97316",
			);
		}
	};

	const stopLoop = (): void => {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	};

	const setControlsBusy = (isBusy: boolean): void => {
		micDeviceSelect.disabled = isBusy;
		micChannelSelect.disabled = isBusy;
		referenceDeviceSelect.disabled = isBusy;
		referenceChannelSelect.disabled = isBusy;
		averageTimeConstantSelect.disabled = isBusy;
		smoothingSelect.disabled = isBusy;
		weightingSelect.disabled = isBusy;
		startButton.disabled = isBusy;
		stopButton.disabled = !isBusy;
		adaptButton.disabled = !isBusy;
	};

	const refreshDeviceLists = async (): Promise<void> => {
		if (destroyed) {
			return;
		}

		const token = ++deviceRefreshToken;
		const inputs = await listAudioDevices("audioinput");
		if (destroyed || token !== deviceRefreshToken) {
			return;
		}
		setAudioDeviceSelectOptions(micDeviceSelect, inputs, "System default mic");
		setAudioDeviceSelectOptions(referenceDeviceSelect, inputs, "Reference disabled", "none");
		micDeviceSelect.disabled = inputs.length === 0 || !!runningSession;
		referenceDeviceSelect.disabled = inputs.length === 0 || !!runningSession;
	};

	const stop = async (): Promise<void> => {
		stopLoop();
		if (runningSession) {
			const session = runningSession;
			runningSession = null;
			await session.stop();
		}
		setControlsBusy(false);
		setStatus("Live monitor stopped.", "idle");
		void refreshDeviceLists();
	};

	const step = (): void => {
		if (!runningSession || destroyed) {
			stopLoop();
			return;
		}

		const snapshot = runningSession.getSnapshot();
		const currentTime = performance.now();
		const elapsedSeconds = lastFrameTime > 0 ? (currentTime - lastFrameTime) / 1000 : 0;
		lastFrameTime = currentTime;
		const alpha = computeExponentialAverageAlpha(elapsedSeconds, parseAveragingSeconds(averageTimeConstantSelect.value));
		const smoothingFraction = parseSmoothingFraction(smoothingSelect.value);
		const metric = parseLevelMetric(weightingSelect.value);
		if (!micLevelMeter || micLevelMeter.metric !== metric || micLevelMeter.sampleRate !== snapshot.sampleRate) {
			micLevelMeter = createLevelMeterState(metric, snapshot.sampleRate);
		}
		if (snapshot.referenceWaveform && (!referenceLevelMeter || referenceLevelMeter.metric !== metric || referenceLevelMeter.sampleRate !== snapshot.sampleRate)) {
			referenceLevelMeter = createLevelMeterState(metric, snapshot.sampleRate);
		}

		const micLevel = updateLevelMeter(micLevelMeter, snapshot.micWaveform, snapshot.sampleRate);
		const referenceLevel = snapshot.referenceWaveform && referenceLevelMeter
			? updateLevelMeter(referenceLevelMeter, snapshot.referenceWaveform, snapshot.sampleRate)
			: null;
		const differenceLevel = referenceLevel === null ? null : micLevel - referenceLevel;
		history.push(createHistoryPoint(currentTime / 1000, micLevel, referenceLevel));
		history = history.filter((point) => (currentTime / 1000) - point.timeSeconds <= HISTORY_SECONDS);
		micSplValue.textContent = formatMetricLevel(micLevel, metric);
		referenceSplValue.textContent = formatMetricLevel(referenceLevel, metric);
		differenceSplValue.textContent = formatDifferenceLevel(differenceLevel);
		renderState();

		const micSpectrumRaw = buildSmoothedSpectrum(snapshot.micWaveform, snapshot.sampleRate, smoothingFraction);
		averagedMicSpectrum = applyExponentialAverage(averagedMicSpectrum, micSpectrumRaw.valuesDb, alpha);
		const micSpectrum = {
			frequencies: micSpectrumRaw.frequencies,
			valuesDb: averagedMicSpectrum,
		};

		let referenceSpectrum: LiveSpectrumSeries | null = null;
		if (snapshot.referenceWaveform) {
			const referenceRaw = buildSmoothedSpectrum(snapshot.referenceWaveform, snapshot.sampleRate, smoothingFraction);
			averagedReferenceSpectrum = applyExponentialAverage(averagedReferenceSpectrum, referenceRaw.valuesDb, alpha);
			referenceSpectrum = {
				frequencies: referenceRaw.frequencies,
				valuesDb: averagedReferenceSpectrum,
			};
		} else {
			averagedReferenceSpectrum = null;
			referenceLevelMeter = null;
		}

		renderSpectrum(micSpectrum, referenceSpectrum, snapshot.sampleRate);

		if ((currentTime - lastDerivedPlotUpdateMs) >= DERIVED_PLOT_MIN_UPDATE_MS) {
			lastDerivedPlotUpdateMs = currentTime;
			renderDerivedPlots(snapshot.micWaveform, snapshot.referenceWaveform, snapshot.sampleRate, smoothingFraction);
		}
		animationFrame = requestAnimationFrame(step);
	};

	const start = async (): Promise<void> => {
		if (destroyed || runningSession) {
			return;
		}

		setControlsBusy(true);
		setStatus("Starting live monitor...", "busy");
		const metric = parseLevelMetric(weightingSelect.value);
		micSplValue.textContent = formatMetricLevel(null, metric);
		referenceSplValue.textContent = formatMetricLevel(null, metric);
		differenceSplValue.textContent = formatDifferenceLevel(null);
		history = [];
		averagedMicSpectrum = null;
		averagedReferenceSpectrum = null;
		lastFrameTime = 0;
		lastDerivedPlotUpdateMs = 0;
		resetDelayAlignment();
		micLevelMeter = null;
		referenceLevelMeter = null;

		try {
			runningSession = await startLiveMonitor({
				micDeviceId: micDeviceSelect.value || undefined,
				micChannel: normalizeChannelSelection(micChannelSelect.value),
				referenceDeviceId: referenceDeviceSelect.value && referenceDeviceSelect.value !== "none" ? referenceDeviceSelect.value : undefined,
				referenceChannel: normalizeChannelSelection(referenceChannelSelect.value),
			});
			setStatus(`Live monitor running. Levels are uncalibrated full-scale values using ${getLevelMetricLabel(metric)}.`, "success");
			await refreshDeviceLists();
			animationFrame = requestAnimationFrame(step);
		} catch (error) {
			runningSession = null;
			setControlsBusy(false);
			setStatus(`Live monitor failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
		}
	};

	const handleStart = (): void => {
		void start();
	};

	const handleStop = (): void => {
		void stop();
	};

	const handleDelayButtonClick = (): void => {
		if (!runningSession) {
			return;
		}

		if (delayAdaptationLocked) {
			resetDelayAlignment();
			updateDelayUi(null, true);
			return;
		}

		delayAdaptationLocked = true;
		delayStableUpdateCount = 0;
		updateDelayUi(delaySampleRate, true);
	};

	startButton.addEventListener("click", handleStart);
	stopButton.addEventListener("click", handleStop);
	adaptButton.addEventListener("click", handleDelayButtonClick);
	weightingSelect.addEventListener("change", updateLevelPlaceholders);
	navigator.mediaDevices?.addEventListener?.("devicechange", refreshDeviceLists);
	void refreshDeviceLists();
	updateLevelPlaceholders();
	updateDelayUi(null, false);
	renderState();
	renderSpectrum(null, null, 48000);
	renderDerivedPlots(null, null, 48000, DEFAULT_SMOOTHING_FRACTION);

	return {
		destroy: () => {
			if (destroyed) {
				return;
			}
			destroyed = true;
			startButton.removeEventListener("click", handleStart);
			stopButton.removeEventListener("click", handleStop);
			adaptButton.removeEventListener("click", handleDelayButtonClick);
			weightingSelect.removeEventListener("change", updateLevelPlaceholders);
			navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDeviceLists);
			void stop();
		},
		isRunning: () => runningSession !== null,
	};
}