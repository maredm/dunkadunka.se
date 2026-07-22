import { bindCachedFieldValue, listAudioDevices, restoreCachedFieldValue, setAudioDeviceSelectOptions } from "./audio_devices";
import { startLiveMonitor, type LiveMonitorSession, type AudioChannelSelection } from "./audio_io";
import Plotly from "plotly.js-dist-min";
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
import { nextPow2, clamp } from "./math";
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
	micCalibrationInput: HTMLInputElement;
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
	splHistoryCanvas: HTMLElement;
	spectrumCanvas: HTMLElement;
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

function parseCalibrationDb(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
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

function formatCalibratedLevel(value: number | null, calibrationDb: number): string {
	const unit = calibrationDb === 0 ? "dBFS" : "dBPa";
	if (value === null || !Number.isFinite(value)) {
		return `-- ${unit}`;
	}
	return `${(value + calibrationDb).toFixed(1)} ${unit}`;
}

const MIC_DEVICE_CACHE_KEY = "update.live.micDeviceId";
const MIC_CHANNEL_CACHE_KEY = "update.live.micChannel";
const MIC_CALIBRATION_CACHE_KEY = "update.live.micCalibrationDb";
const REFERENCE_DEVICE_CACHE_KEY = "update.live.referenceDeviceId";
const REFERENCE_CHANNEL_CACHE_KEY = "update.live.referenceChannel";

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

const LIVE_PLOTLY_CONFIG = {
	responsive: true,
	displayModeBar: false,
	staticPlot: true,
};

function drawEmptyPlot(container: HTMLElement, message: string): void {
	void Plotly.react(container, [], {
		margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
		paper_bgcolor: "#000",
		plot_bgcolor: "#000",
		xaxis: { visible: false },
		yaxis: { visible: false },
		annotations: [
			{
				x: 0.5,
				y: 0.5,
				xref: "paper",
				yref: "paper",
				text: message,
				showarrow: false,
				font: { size: 12, color: "#9aa4b2" },
			},
		],
	}, LIVE_PLOTLY_CONFIG);
}

function drawSplHistory(
	container: HTMLElement,
	history: LiveMonitorHistoryPoint[],
	nowSeconds: number,
): void {
	const micX: number[] = [];
	const micY: number[] = [];
	const referenceX: number[] = [];
	const referenceY: number[] = [];

	for (const point of history) {
		const ageSeconds = nowSeconds - point.timeSeconds;
		const x = -clamp(ageSeconds, 0, HISTORY_SECONDS);
		if (Number.isFinite(point.micDb)) {
			micX.push(x);
			micY.push(point.micDb);
		}
		if (point.referenceDb !== null && Number.isFinite(point.referenceDb)) {
			referenceX.push(x);
			referenceY.push(point.referenceDb);
		}
	}

	void Plotly.react(
		container,
		[
			{ x: micX, y: micY, type: "scattergl", mode: "lines", line: { color: "#f97316", width: 2 }, hoverinfo: "skip", name: "Mic" },
			{ x: referenceX, y: referenceY, type: "scattergl", mode: "lines", line: { color: "#38bdf8", width: 2 }, hoverinfo: "skip", name: "Reference" },
		],
		{
			margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			showlegend: false,
			xaxis: {
				range: [-HISTORY_SECONDS, 0],
				showgrid: true,
				gridcolor: "rgba(181, 192, 224, 0.1)",
				zeroline: false,
				tickfont: { color: "#9aa4b2", size: 10 },
				tickvals: [-60, -50, -40, -30, -20, -10, 0],
				ticktext: ["-60s", "-50s", "-40s", "-30s", "-20s", "-10s", "now"],
			},
			yaxis: {
				range: [MIN_DB, MAX_DB],
				showgrid: true,
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				tickfont: { color: "#9aa4b2", size: 10 },
			},
		},
		LIVE_PLOTLY_CONFIG,
	);
}

function drawSpectrum(
	container: HTMLElement,
	micSpectrum: LiveSpectrumSeries | null,
	referenceSpectrum: LiveSpectrumSeries | null,
	differenceSpectrum: LiveSpectrumSeries | null,
	nyquist: number,
): void {
	const maxFrequency = Math.max(LOG_FREQUENCY_MIN * 2, nyquist);
	if (!Number.isFinite(maxFrequency) || maxFrequency <= LOG_FREQUENCY_MIN) {
		drawEmptyPlot(container, "Waiting for spectrum data");
		return;
	}

	const targetFrequencies: number[] = [];
	const targetValues: number[] = [];
	for (let i = 0; i < 128; i += 1) {
		const ratio = i / 127;
		const frequency = Math.pow(10, Math.log10(LOG_FREQUENCY_MIN) + ratio * (Math.log10(maxFrequency) - Math.log10(LOG_FREQUENCY_MIN)));
		targetFrequencies.push(frequency);
		targetValues.push(-Math.log10(Math.max(1e-9, frequency) / 1000));
	}

	const toTrace = (series: LiveSpectrumSeries | null, color: string, name: string): { x: number[]; y: number[]; type: string; mode: string; line: { color: string; width: number }; hoverinfo: string; name: string } => ({
		x: Array.from(series?.frequencies ?? []),
		y: Array.from(series?.valuesDb ?? []),
		type: "scattergl",
		mode: "lines",
		line: { color, width: 2 },
		hoverinfo: "skip",
		name,
	});

	void Plotly.react(
		container,
		[
			toTrace(micSpectrum, "#f97316", "Mic"),
			toTrace(referenceSpectrum, "#38bdf8", "Reference"),
			toTrace(differenceSpectrum, "#a3e635", "Difference"),
			{
				x: targetFrequencies,
				y: targetValues,
				type: "scattergl",
				mode: "lines",
				line: { color: "#ef4444", width: 1.5, dash: "dash" },
				hoverinfo: "skip",
				name: "-1 dB/decade",
			},
		],
		{
			margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			showlegend: false,
			xaxis: {
				type: "log",
				range: [Math.log10(LOG_FREQUENCY_MIN), Math.log10(maxFrequency)],
				showgrid: true,
				gridcolor: "rgba(181, 192, 224, 0.1)",
				zeroline: false,
				tickfont: { color: "#9aa4b2", size: 10 },
			},
			yaxis: {
				range: [SPECTRUM_MIN_DB, SPECTRUM_MAX_DB],
				showgrid: true,
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				tickfont: { color: "#9aa4b2", size: 10 },
			},
		},
		LIVE_PLOTLY_CONFIG,
	);
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
		micCalibrationInput,
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
	} = options;

	bindCachedFieldValue(micDeviceSelect, MIC_DEVICE_CACHE_KEY);
	bindCachedFieldValue(micChannelSelect, MIC_CHANNEL_CACHE_KEY);
	bindCachedFieldValue(micCalibrationInput, MIC_CALIBRATION_CACHE_KEY);
	bindCachedFieldValue(referenceDeviceSelect, REFERENCE_DEVICE_CACHE_KEY);
	bindCachedFieldValue(referenceChannelSelect, REFERENCE_CHANNEL_CACHE_KEY);
	restoreCachedFieldValue(micChannelSelect, MIC_CHANNEL_CACHE_KEY, "left");
	restoreCachedFieldValue(referenceChannelSelect, REFERENCE_CHANNEL_CACHE_KEY, "left");
	restoreCachedFieldValue(micCalibrationInput, MIC_CALIBRATION_CACHE_KEY, "0");

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
		updateDelayUi(null, false);
	};

	const renderState = (): void => {
		const nowSeconds = performance.now() / 1000;
		drawSplHistory(splHistoryCanvas, history, nowSeconds);
	};

	const renderSpectrum = (mic: LiveSpectrumSeries | null, reference: LiveSpectrumSeries | null, sampleRate: number): void => {
		drawSpectrum(spectrumCanvas, mic, reference, buildDifferenceSpectrum(mic, reference), sampleRate / 2);
	};

	const updateDelayAlignment = (mic: Float32Array | null, reference: Float32Array | null, sampleRate: number): void => {
		if (!mic || !reference) {
			resetDelayAlignment();
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
		restoreCachedFieldValue(micDeviceSelect, MIC_DEVICE_CACHE_KEY);
		restoreCachedFieldValue(referenceDeviceSelect, REFERENCE_DEVICE_CACHE_KEY);
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
		const calibrationDb = parseCalibrationDb(micCalibrationInput.value);
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
		const calibratedMicLevel = micLevel + calibrationDb;
		const differenceLevel = referenceLevel === null ? null : calibratedMicLevel - referenceLevel;
		history.push(createHistoryPoint(currentTime / 1000, calibratedMicLevel, referenceLevel));
		history = history.filter((point) => (currentTime / 1000) - point.timeSeconds <= HISTORY_SECONDS);
		micSplValue.textContent = formatCalibratedLevel(micLevel, calibrationDb);
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
			updateDelayAlignment(snapshot.micWaveform, snapshot.referenceWaveform, snapshot.sampleRate);
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
		const calibrationDb = parseCalibrationDb(micCalibrationInput.value);
		micSplValue.textContent = formatCalibratedLevel(null, calibrationDb);
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
				const calibrationDb = parseCalibrationDb(micCalibrationInput.value);
				setStatus(
					calibrationDb === 0
						? `Live monitor running. Levels are uncalibrated full-scale values using ${getLevelMetricLabel(metric)}.`
						: `Live monitor running. Mic levels are offset by ${calibrationDb.toFixed(1)} dBFS/dBPa using ${getLevelMetricLabel(metric)}.`,
					"success",
				);
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
			Plotly.purge(splHistoryCanvas);
			Plotly.purge(spectrumCanvas);
			void stop();
		},
		isRunning: () => runningSession !== null,
	};
}