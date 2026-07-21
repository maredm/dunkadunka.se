import { listAudioDevices, setAudioDeviceSelectOptions } from "./audio_devices";
import { startLiveMonitor, type LiveMonitorSession, type AudioChannelSelection } from "./audio_io";
import { fft } from "./fft";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import { nextPow2 } from "./math";
import { A_WEIGHTING_COEFFICIENTS, applyAWeightingToBuffer, calculateTwoChannelImpulseResponse, estimateDelay } from "./signal";

type LiveSpectrumSeries = {
	frequencies: Float32Array;
	valuesDb: Float32Array;
};

export type FrequencyWeighting = "z" | "a";

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
const SPECTRUM_MIN_DB = -50;
const SPECTRUM_MAX_DB = 10;
const DEFAULT_SMOOTHING_FRACTION = 1 / 6;
const LOG_FREQUENCY_MIN = 20;
const DEFAULT_AVERAGING_SECONDS = 1;
const SPECTRUM_GRID_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const LEVEL_GRID_VALUES = [-90, -80, -70, -60, -50, -40, -30, -20, -10, 0];
const SPECTRUM_LEVEL_GRID_VALUES = [-50, -40, -30, -20, -10, 0, 10];
const DERIVED_PLOT_MIN_UPDATE_MS = 250;
const DERIVED_AVERAGING_SECONDS = 15;
const DELAY_ALIGNMENT_SECONDS = 25;

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

export function computeWaveformDecibels(samples: Float32Array): number {
	if (samples.length === 0) {
		return MIN_DB;
	}

	let sumSquares = 0;
	for (let index = 0; index < samples.length; index += 1) {
		const value = samples[index] ?? 0;
		sumSquares += value * value;
	}

	const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
	return 20 * Math.log10(Math.max(rms, 1e-12));
}

export function computeExponentialAverageAlpha(elapsedSeconds: number, timeConstantSeconds: number): number {
	if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
		return 1;
	}
	if (!Number.isFinite(timeConstantSeconds) || timeConstantSeconds <= 0) {
		return 1;
	}
	return 1 - Math.exp(-elapsedSeconds / timeConstantSeconds);
}

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

function formatWeightedLevel(value: number | null, weighting: FrequencyWeighting): string {
	if (value === null || !Number.isFinite(value)) {
		return weighting === "a" ? "-- dBFS(A)" : "-- dBFS";
	}
	return weighting === "a" ? `${value.toFixed(1)} dBFS(A)` : formatLevel(value);
}

function formatDifferenceLevel(value: number | null, weighting: FrequencyWeighting): string {
	if (value === null || !Number.isFinite(value)) {
		return weighting === "a" ? "-- dB(A)" : "-- dB";
	}
	return weighting === "a" ? `${value.toFixed(1)} dB(A)` : `${value.toFixed(1)} dB`;
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

function parseWeighting(value: string): FrequencyWeighting {
	return value === "a" ? "a" : "z";
}

function createAWeightingState(): Float32Array {
	return new Float32Array(A_WEIGHTING_COEFFICIENTS[0].length);
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

export function applyFrequencyWeightingToWaveform(
	samples: Float32Array,
	weighting: FrequencyWeighting,
	state?: Float32Array,
): Float32Array {
	if (weighting === "z") {
		return Float32Array.from(samples);
	}

    const output = applyAWeightingToBuffer(samples, state ?? createAWeightingState());

	return output;
}

export function computeWeightedWaveformDecibels(
	samples: Float32Array,
	weighting: FrequencyWeighting,
	state?: Float32Array,
): number {
	return computeWaveformDecibels(applyFrequencyWeightingToWaveform(samples, weighting, state));
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

	const frequencies = getFractionalOctaveFrequencies(smoothingFraction, LOG_FREQUENCY_MIN, nyquist, magnitudes.length * 2, sampleRate);
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
	options: { logX?: boolean; yMin?: number; yMax?: number } = {},
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
	let micWeightingState = createAWeightingState();
	let referenceWeightingState = createAWeightingState();
	let lastDerivedPlotUpdateMs = 0;
	let smoothedDelaySamples: number | null = null;
	let averagedPhaseRe: Float32Array | null = null;
	let averagedPhaseIm: Float32Array | null = null;
	let phaseFrequencies: Float32Array | null = null;
	let averagedImpulse: Float32Array | null = null;
	let impulseTimeMs: Float32Array | null = null;

	const setStatus = (message: string, state: "idle" | "busy" | "success" | "error" = "idle"): void => {
		statusText.textContent = message;
		statusText.dataset.state = state;
	};

	const renderState = (): void => {
		const nowSeconds = performance.now() / 1000;
		drawSplHistory(splHistoryCanvas, history, nowSeconds);
	};

	const renderSpectrum = (mic: LiveSpectrumSeries | null, reference: LiveSpectrumSeries | null, sampleRate: number): void => {
		drawSpectrum(spectrumCanvas, mic, reference, buildDifferenceSpectrum(mic, reference), sampleRate / 2);
	};

	const renderDerivedPlots = (mic: Float32Array | null, reference: Float32Array | null, sampleRate: number): void => {
		if (!mic || !reference) {
			averagedPhaseRe = null;
			averagedPhaseIm = null;
			phaseFrequencies = null;
			averagedImpulse = null;
			impulseTimeMs = null;
			smoothedDelaySamples = null;
			drawEmptyPlot(impulseCanvas, "Impulse response (live)", "Select a reference input device.");
			drawEmptyPlot(phaseCanvas, "Phase response (live)", "Select a reference input device.");
			return;
		}

		const delaySecondsInst = estimateDelay(reference, mic, sampleRate);
		const delaySamplesInst = delaySecondsInst * sampleRate;
		if (smoothedDelaySamples === null || !Number.isFinite(smoothedDelaySamples)) {
			smoothedDelaySamples = delaySamplesInst;
		} else {
			const elapsedSeconds = Math.max(1 / 120, (lastDerivedPlotUpdateMs <= 0 ? DERIVED_PLOT_MIN_UPDATE_MS : DERIVED_PLOT_MIN_UPDATE_MS) / 1000);
			const alphaDelay = computeExponentialAverageAlpha(elapsedSeconds, DELAY_ALIGNMENT_SECONDS);
			smoothedDelaySamples = (1 - alphaDelay) * smoothedDelaySamples + alphaDelay * delaySamplesInst;
		}

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
			let phaseMin = Number.POSITIVE_INFINITY;
			let phaseMax = Number.NEGATIVE_INFINITY;
			for (let i = 0; i < phaseUnwrapped.length; i += 1) {
				const v = phaseUnwrapped[i] ?? 0;
				phaseMin = Math.min(phaseMin, v);
				phaseMax = Math.max(phaseMax, v);
			}
			const padding = 15;
			drawLinePlot(
				phaseCanvas,
				"Phase response (live, long average)",
				"Frequency (Hz)",
				"Phase (deg)",
				phaseFrequencies,
				phaseUnwrapped,
				"#38bdf8",
				{ logX: true, yMin: phaseMin - padding, yMax: phaseMax + padding },
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
		const weighting = parseWeighting(weightingSelect.value);
		const micWaveform = applyFrequencyWeightingToWaveform(snapshot.micWaveform, weighting, micWeightingState);
		const referenceWaveform = snapshot.referenceWaveform
			? applyFrequencyWeightingToWaveform(snapshot.referenceWaveform, weighting, referenceWeightingState)
			: null;

		const micLevel = computeWaveformDecibels(micWaveform);
		const referenceLevel = referenceWaveform
			? computeWaveformDecibels(referenceWaveform)
			: null;
		const differenceLevel = referenceLevel === null ? null : micLevel - referenceLevel;
		history.push(createHistoryPoint(currentTime / 1000, micLevel, referenceLevel));
		history = history.filter((point) => (currentTime / 1000) - point.timeSeconds <= HISTORY_SECONDS);
		micSplValue.textContent = formatWeightedLevel(micLevel, weighting);
		referenceSplValue.textContent = formatWeightedLevel(referenceLevel, weighting);
		differenceSplValue.textContent = formatDifferenceLevel(differenceLevel, weighting);
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
		}

		renderSpectrum(micSpectrum, referenceSpectrum, snapshot.sampleRate);

		if ((currentTime - lastDerivedPlotUpdateMs) >= DERIVED_PLOT_MIN_UPDATE_MS) {
			lastDerivedPlotUpdateMs = currentTime;
			renderDerivedPlots(snapshot.micWaveform, snapshot.referenceWaveform, snapshot.sampleRate);
		}
		animationFrame = requestAnimationFrame(step);
	};

	const start = async (): Promise<void> => {
		if (destroyed || runningSession) {
			return;
		}

		setControlsBusy(true);
		setStatus("Starting live monitor...", "busy");
		const weighting = parseWeighting(weightingSelect.value);
		micSplValue.textContent = formatWeightedLevel(null, weighting);
		referenceSplValue.textContent = formatWeightedLevel(null, weighting);
		differenceSplValue.textContent = formatDifferenceLevel(null, weighting);
		history = [];
		averagedMicSpectrum = null;
		averagedReferenceSpectrum = null;
		lastFrameTime = 0;
		lastDerivedPlotUpdateMs = 0;
		smoothedDelaySamples = null;
		averagedPhaseRe = null;
		averagedPhaseIm = null;
		phaseFrequencies = null;
		averagedImpulse = null;
		impulseTimeMs = null;
		micWeightingState = createAWeightingState();
		referenceWeightingState = createAWeightingState();

		try {
			runningSession = await startLiveMonitor({
				micDeviceId: micDeviceSelect.value || undefined,
				micChannel: normalizeChannelSelection(micChannelSelect.value),
				referenceDeviceId: referenceDeviceSelect.value && referenceDeviceSelect.value !== "none" ? referenceDeviceSelect.value : undefined,
				referenceChannel: normalizeChannelSelection(referenceChannelSelect.value),
			});
			setStatus(`Live monitor running. SPL is uncalibrated ${weighting === "a" ? "dBFS(A)" : "dBFS"}.`, "success");
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

	startButton.addEventListener("click", handleStart);
	stopButton.addEventListener("click", handleStop);
	navigator.mediaDevices?.addEventListener?.("devicechange", refreshDeviceLists);
	void refreshDeviceLists();
	micSplValue.textContent = formatWeightedLevel(null, parseWeighting(weightingSelect.value));
	referenceSplValue.textContent = formatWeightedLevel(null, parseWeighting(weightingSelect.value));
	differenceSplValue.textContent = formatDifferenceLevel(null, parseWeighting(weightingSelect.value));
	renderState();
	renderSpectrum(null, null, 48000);
	renderDerivedPlots(null, null, 48000);

	return {
		destroy: () => {
			if (destroyed) {
				return;
			}
			destroyed = true;
			startButton.removeEventListener("click", handleStart);
			stopButton.removeEventListener("click", handleStop);
			navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDeviceLists);
			void stop();
		},
		isRunning: () => runningSession !== null,
	};
}