import { listAudioDevices, setAudioDeviceSelectOptions } from "./audio_devices";
import { startLiveMonitor, type LiveMonitorSession, type AudioChannelSelection } from "./audio_io";
import { fft } from "./fft";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import { nextPow2 } from "./math";
import { A_WEIGHTING_COEFFICIENTS, applyAWeightingToBuffer } from "./signal";

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