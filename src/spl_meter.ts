import { bindCachedFieldValue, listAudioDevices, restoreCachedFieldValue, setAudioDeviceSelectOptions } from "./audio_devices";
import { startLiveMonitor, type AudioChannelSelection, type LiveMonitorSession } from "./audio_io";
import { createLevelMeterState, getLevelMetricLabel, parseLevelMetric, updateLevelMeter, type LevelMeterState } from "./level_meter";

export interface SplMeterControllerOptions {
	micDeviceSelect: HTMLSelectElement;
	micChannelSelect: HTMLSelectElement;
	calibrationInput: HTMLInputElement;
	metricSelect: HTMLSelectElement;
	statusText: HTMLElement;
	startButton: HTMLButtonElement;
	stopButton: HTMLButtonElement;
	valueElement: HTMLElement;
	metricElement: HTMLElement;
	historyCanvas: HTMLCanvasElement;
}

export interface SplMeterController {
	destroy(): void;
	isRunning(): boolean;
}

type HistoryPoint = {
	timeSeconds: number;
	levelDb: number;
};

const HISTORY_SECONDS = 60;
const PLOT_UPDATE_MS = 100;
const MIC_DEVICE_CACHE_KEY = "update.spl.micDeviceId";
const MIC_CHANNEL_CACHE_KEY = "update.spl.micChannel";
const CALIBRATION_CACHE_KEY = "update.spl.calibrationDb";
const METRIC_CACHE_KEY = "update.spl.metric";

function normalizeChannel(value: string): AudioChannelSelection {
	return value === "right" ? "right" : "left";
}

function parseCalibration(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getUnit(calibrationDb: number): string {
	return calibrationDb === 0 ? "dBFS" : "dB SPL";
}

function drawHistory(canvas: HTMLCanvasElement, history: HistoryPoint[], calibrationDb: number): void {
	const rect = canvas.getBoundingClientRect();
	const scale = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.floor(rect.width));
	const height = Math.max(1, Math.floor(rect.height));
	canvas.width = Math.floor(width * scale);
	canvas.height = Math.floor(height * scale);
	const context = canvas.getContext("2d");
	if (!context) {
		return;
	}

	context.scale(scale, scale);
	context.fillStyle = "#08090a";
	context.fillRect(0, 0, width, height);

	const calibrated = calibrationDb !== 0;
	const minDb = calibrated ? 20 : -100;
	const maxDb = calibrated ? 140 : 10;
	const left = 52;
	const right = 16;
	const top = 18;
	const bottom = 30;
	const plotWidth = Math.max(1, width - left - right);
	const plotHeight = Math.max(1, height - top - bottom);
	context.font = "11px ui-monospace, monospace";
	context.textAlign = "right";
	context.textBaseline = "middle";

	for (let level = minDb; level <= maxDb; level += 20) {
		const y = top + ((maxDb - level) / (maxDb - minDb)) * plotHeight;
		context.strokeStyle = "rgba(181, 192, 224, 0.14)";
		context.beginPath();
		context.moveTo(left, y);
		context.lineTo(left + plotWidth, y);
		context.stroke();
		context.fillStyle = "#9aa4b2";
		context.fillText(String(level), left - 8, y);
	}

	const nowSeconds = performance.now() / 1000;
	for (const secondsAgo of [60, 45, 30, 15, 0]) {
		const x = left + ((HISTORY_SECONDS - secondsAgo) / HISTORY_SECONDS) * plotWidth;
		context.strokeStyle = "rgba(181, 192, 224, 0.1)";
		context.beginPath();
		context.moveTo(x, top);
		context.lineTo(x, top + plotHeight);
		context.stroke();
		context.fillStyle = "#9aa4b2";
		context.textAlign = "center";
		context.textBaseline = "top";
		context.fillText(secondsAgo === 0 ? "now" : `-${secondsAgo}s`, x, top + plotHeight + 8);
	}

	if (history.length === 0) {
		context.fillStyle = "#9aa4b2";
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.fillText("Start the meter to record level history", left + (plotWidth / 2), top + (plotHeight / 2));
		return;
	}

	context.strokeStyle = "#facc15";
	context.lineWidth = 2;
	context.beginPath();
	let hasPoint = false;
	for (const point of history) {
		const age = nowSeconds - point.timeSeconds;
		const x = left + ((HISTORY_SECONDS - age) / HISTORY_SECONDS) * plotWidth;
		const y = top + ((maxDb - point.levelDb) / (maxDb - minDb)) * plotHeight;
		if (!hasPoint) {
			context.moveTo(x, y);
			hasPoint = true;
		} else {
			context.lineTo(x, y);
		}
	}
	context.stroke();
}

export function createSplMeterController(options: SplMeterControllerOptions): SplMeterController {
	const {
		micDeviceSelect,
		micChannelSelect,
		calibrationInput,
		metricSelect,
		statusText,
		startButton,
		stopButton,
		valueElement,
		metricElement,
		historyCanvas,
	} = options;

	bindCachedFieldValue(micDeviceSelect, MIC_DEVICE_CACHE_KEY);
	bindCachedFieldValue(micChannelSelect, MIC_CHANNEL_CACHE_KEY);
	bindCachedFieldValue(calibrationInput, CALIBRATION_CACHE_KEY);
	bindCachedFieldValue(metricSelect, METRIC_CACHE_KEY);
	restoreCachedFieldValue(micChannelSelect, MIC_CHANNEL_CACHE_KEY, "left");
	restoreCachedFieldValue(calibrationInput, CALIBRATION_CACHE_KEY, "0");
	restoreCachedFieldValue(metricSelect, METRIC_CACHE_KEY, "laeq");

	let destroyed = false;
	let session: LiveMonitorSession | null = null;
	let animationFrame: number | null = null;
	let meterState: LevelMeterState | null = null;
	let history: HistoryPoint[] = [];
	let lastPlotUpdate = 0;
	let deviceRefreshToken = 0;

	const updateLabels = (): void => {
		const calibrationDb = parseCalibration(calibrationInput.value);
		const metric = parseLevelMetric(metricSelect.value);
		metricElement.textContent = `${getLevelMetricLabel(metric)} · ${getUnit(calibrationDb)}`;
		if (!session) {
			valueElement.textContent = `--.- ${getUnit(calibrationDb)}`;
		}
		drawHistory(historyCanvas, history, calibrationDb);
	};

	const setRunning = (running: boolean): void => {
		micDeviceSelect.disabled = running;
		micChannelSelect.disabled = running;
		calibrationInput.disabled = running;
		metricSelect.disabled = running;
		startButton.disabled = running;
		stopButton.disabled = !running;
	};

	const refreshDevices = async (): Promise<void> => {
		const token = ++deviceRefreshToken;
		const inputs = await listAudioDevices("audioinput");
		if (destroyed || token !== deviceRefreshToken) {
			return;
		}
		setAudioDeviceSelectOptions(micDeviceSelect, inputs, "System default mic");
		restoreCachedFieldValue(micDeviceSelect, MIC_DEVICE_CACHE_KEY);
		micDeviceSelect.disabled = inputs.length === 0 || session !== null;
	};

	const stopLoop = (): void => {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	};

	const stop = async (): Promise<void> => {
		stopLoop();
		if (session) {
			const activeSession = session;
			session = null;
			await activeSession.stop();
		}
		setRunning(false);
		statusText.textContent = "SPL meter stopped.";
		statusText.dataset.state = "idle";
		void refreshDevices();
	};

	const step = (): void => {
		if (!session || destroyed) {
			stopLoop();
			return;
		}
		const snapshot = session.getSnapshot();
		const metric = parseLevelMetric(metricSelect.value);
		if (!meterState || meterState.metric !== metric || meterState.sampleRate !== snapshot.sampleRate) {
			meterState = createLevelMeterState(metric, snapshot.sampleRate);
		}
		const calibrationDb = parseCalibration(calibrationInput.value);
		const levelDb = updateLevelMeter(meterState, snapshot.micWaveform, snapshot.sampleRate) + calibrationDb;
		const now = performance.now();
		valueElement.textContent = `${levelDb.toFixed(1)} ${getUnit(calibrationDb)}`;
		history.push({ timeSeconds: now / 1000, levelDb });
		const cutoff = (now / 1000) - HISTORY_SECONDS;
		while (history[0] && history[0].timeSeconds < cutoff) {
			history.shift();
		}
		if (now - lastPlotUpdate >= PLOT_UPDATE_MS) {
			lastPlotUpdate = now;
			drawHistory(historyCanvas, history, calibrationDb);
		}
		animationFrame = requestAnimationFrame(step);
	};

	const start = async (): Promise<void> => {
		if (destroyed || session) {
			return;
		}
		setRunning(true);
		statusText.textContent = "Starting SPL meter...";
		statusText.dataset.state = "busy";
		history = [];
		meterState = null;
		lastPlotUpdate = 0;
		try {
			session = await startLiveMonitor({
				micDeviceId: micDeviceSelect.value || undefined,
				micChannel: normalizeChannel(micChannelSelect.value),
			});
			const calibrationDb = parseCalibration(calibrationInput.value);
			statusText.textContent = calibrationDb === 0
				? "Running with uncalibrated full-scale levels."
				: `Running with a ${calibrationDb.toFixed(1)} dB calibration offset.`;
			statusText.dataset.state = "success";
			animationFrame = requestAnimationFrame(step);
		} catch (error) {
			session = null;
			setRunning(false);
			statusText.textContent = `SPL meter failed: ${error instanceof Error ? error.message : "Unknown error"}`;
			statusText.dataset.state = "error";
		}
	};

	const handleStart = (): void => { void start(); };
	const handleStop = (): void => { void stop(); };
	const handleResize = (): void => { updateLabels(); };
	startButton.addEventListener("click", handleStart);
	stopButton.addEventListener("click", handleStop);
	calibrationInput.addEventListener("change", updateLabels);
	metricSelect.addEventListener("change", updateLabels);
	window.addEventListener("resize", handleResize);
	navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
	void refreshDevices();
	updateLabels();

	return {
		destroy: () => {
			if (destroyed) {
				return;
			}
			destroyed = true;
			startButton.removeEventListener("click", handleStart);
			stopButton.removeEventListener("click", handleStop);
			calibrationInput.removeEventListener("change", updateLabels);
			metricSelect.removeEventListener("change", updateLabels);
			window.removeEventListener("resize", handleResize);
			navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
			void stop();
		},
		isRunning: () => session !== null,
	};
}