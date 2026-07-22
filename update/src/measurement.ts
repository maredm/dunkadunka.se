import { bindCachedFieldValue, listAudioDevices, restoreCachedFieldValue, setAudioDeviceSelectOptions } from "./audio_devices";
import { startPlayAndRecord, type ActiveDuplexSession, type AudioChannelSelection } from "./audio_io";
import { chirp, normalizeToRMS } from "./signal";
import { createMultichannelWavBlob } from "./wavfile";

export type MeasurementStimulusPreset = {
	id: string;
	startHz: number;
	stopHz: number;
	rate: number;
	paddingSeconds: number;
};

export const DEFAULT_STIMULUS_PRESETS: MeasurementStimulusPreset[] = [
	{ id: "swept-20-24000", startHz: 20, stopHz: 24000, rate: 2, paddingSeconds: 1 },
	{ id: "swept-70-20000", startHz: 70, stopHz: 20000, rate: 2, paddingSeconds: 1 },
];

export interface MeasurementControllerOptions {
	stimulusSelect: HTMLSelectElement;
	inputDeviceSelect: HTMLSelectElement;
	inputChannelSelect: HTMLSelectElement;
	referenceDeviceSelect?: HTMLSelectElement | null;
	referenceChannelSelect?: HTMLSelectElement | null;
	outputDeviceSelect: HTMLSelectElement;
	outputChannelSelect: HTMLSelectElement;
	commentInput?: HTMLInputElement | null;
	statusText: HTMLElement;
	recordButton: HTMLButtonElement;
	stopButton: HTMLButtonElement;
	onRecordedFile: (file: File) => void;
	onRecordingComplete?: () => void;
	presets?: MeasurementStimulusPreset[];
}

export interface MeasurementController {
	stop(): Promise<void>;
	destroy(): void;
	isRunning(): boolean;
}

function sanitizeFilePart(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/-+/g, "-")
		.slice(0, 48);
}

function buildAcquisitionFileName(comment?: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	const commentPart = comment ? sanitizeFilePart(comment) : "";
	return commentPart ? `acquisition-${commentPart}-${stamp}.wav` : `acquisition-${stamp}.wav`;
}

function triggerFileDownload(file: File): void {
	const url = URL.createObjectURL(file);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = file.name;
	anchor.rel = "noopener";
	anchor.style.display = "none";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	queueMicrotask(() => URL.revokeObjectURL(url));
}

function normalizeChannelSelection(value: string): AudioChannelSelection {
	return value === "right" ? "right" : "left";
}

const INPUT_DEVICE_CACHE_KEY = "update.measurement.inputDeviceId";
const INPUT_CHANNEL_CACHE_KEY = "update.measurement.inputChannel";
const REFERENCE_DEVICE_CACHE_KEY = "update.measurement.referenceDeviceId";
const REFERENCE_CHANNEL_CACHE_KEY = "update.measurement.referenceChannel";
const OUTPUT_DEVICE_CACHE_KEY = "update.measurement.outputDeviceId";
const OUTPUT_CHANNEL_CACHE_KEY = "update.measurement.outputChannel";

export function createMeasurementController(options: MeasurementControllerOptions): MeasurementController {
	const SAMPLE_RATE = 48000;
	const ACQUISITION_PREROLL_SECONDS = 0.5;
	const ACQUISITION_PREROLL_FRAMES = Math.round(SAMPLE_RATE * ACQUISITION_PREROLL_SECONDS);

	const {
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
		onRecordedFile,
		onRecordingComplete,
		presets = DEFAULT_STIMULUS_PRESETS,
	} = options;

	bindCachedFieldValue(inputDeviceSelect, INPUT_DEVICE_CACHE_KEY);
	bindCachedFieldValue(inputChannelSelect, INPUT_CHANNEL_CACHE_KEY);
	if (referenceDeviceSelect) {
		bindCachedFieldValue(referenceDeviceSelect, REFERENCE_DEVICE_CACHE_KEY);
	}
	if (referenceChannelSelect) {
		bindCachedFieldValue(referenceChannelSelect, REFERENCE_CHANNEL_CACHE_KEY);
	}
	bindCachedFieldValue(outputDeviceSelect, OUTPUT_DEVICE_CACHE_KEY);
	bindCachedFieldValue(outputChannelSelect, OUTPUT_CHANNEL_CACHE_KEY);
	restoreCachedFieldValue(inputChannelSelect, INPUT_CHANNEL_CACHE_KEY, "left");
	restoreCachedFieldValue(outputChannelSelect, OUTPUT_CHANNEL_CACHE_KEY, "left");
	if (referenceChannelSelect) {
		restoreCachedFieldValue(referenceChannelSelect, REFERENCE_CHANNEL_CACHE_KEY, "left");
	}

	let activeSession: ActiveDuplexSession | null = null;
	let destroyed = false;
	let deviceRefreshToken = 0;

	const setStatus = (message: string, state: "idle" | "busy" | "success" | "error" = "idle"): void => {
		statusText.textContent = message;
		statusText.dataset.state = state;
	};

	const setControlsBusy = (isBusy: boolean): void => {
		stimulusSelect.disabled = isBusy;
		inputDeviceSelect.disabled = isBusy;
		inputChannelSelect.disabled = isBusy;
		if (referenceDeviceSelect) {
			referenceDeviceSelect.disabled = isBusy;
		}
		if (referenceChannelSelect) {
			referenceChannelSelect.disabled = isBusy;
		}
		outputDeviceSelect.disabled = isBusy;
		outputChannelSelect.disabled = isBusy;
		recordButton.disabled = isBusy;
		stopButton.disabled = !isBusy;
	};

	const refreshDeviceLists = async (): Promise<void> => {
		if (destroyed) {
			return;
		}

		const token = ++deviceRefreshToken;
		try {
			const [inputs, outputs] = await Promise.all([listAudioDevices("audioinput"), listAudioDevices("audiooutput")]);
			if (destroyed || token !== deviceRefreshToken) {
				return;
			}
			setAudioDeviceSelectOptions(inputDeviceSelect, inputs, "System default input");
			if (referenceDeviceSelect) {
				setAudioDeviceSelectOptions(referenceDeviceSelect, inputs, "No reference input");
			}
			setAudioDeviceSelectOptions(outputDeviceSelect, outputs, "System default output");
			restoreCachedFieldValue(inputDeviceSelect, INPUT_DEVICE_CACHE_KEY);
			if (referenceDeviceSelect) {
				restoreCachedFieldValue(referenceDeviceSelect, REFERENCE_DEVICE_CACHE_KEY);
			}
			restoreCachedFieldValue(outputDeviceSelect, OUTPUT_DEVICE_CACHE_KEY);
			if (inputs.length === 0) {
				inputDeviceSelect.disabled = true;
				if (referenceDeviceSelect) {
					referenceDeviceSelect.disabled = true;
				}
			}
			if (outputs.length === 0) {
				outputDeviceSelect.disabled = true;
			}
		} catch {
			if (!destroyed && token === deviceRefreshToken) {
				inputDeviceSelect.disabled = true;
				if (referenceDeviceSelect) {
					referenceDeviceSelect.disabled = true;
				}
				outputDeviceSelect.disabled = true;
			}
		}
	};

	const run = async (): Promise<void> => {
		if (destroyed || activeSession) {
			return;
		}

		const preset = presets.find((option) => option.id === stimulusSelect.value);
		if (!preset) {
			setStatus("Unknown stimulus preset.", "error");
			return;
		}

		setStatus(`Recording: ${preset.startHz}-${preset.stopHz} Hz swept-sine...`, "busy");
		setControlsBusy(true);

		try {
			const [stimulus] = chirp(preset.startHz, preset.stopHz, null, preset.rate);
			const normalizedStimulus = normalizeToRMS(stimulus);

			// Add a 100 ms pre-roll so playback and capture settle before the sweep starts.
			const paddedStimulus = new Float32Array(normalizedStimulus.length + ACQUISITION_PREROLL_FRAMES);
			paddedStimulus.set(normalizedStimulus, ACQUISITION_PREROLL_FRAMES);

			const referenceDeviceId = referenceDeviceSelect?.value?.trim() ?? "";
			const referenceChannel = normalizeChannelSelection(referenceChannelSelect?.value ?? "left");

			activeSession = await startPlayAndRecord(paddedStimulus, {
				inputDeviceId: inputDeviceSelect.value || undefined,
				inputChannel: normalizeChannelSelection(inputChannelSelect.value),
				referenceInputDeviceId: referenceDeviceId || undefined,
				referenceInputChannel: referenceChannel,
				outputDeviceId: outputDeviceSelect.value || undefined,
				outputChannel: normalizeChannelSelection(outputChannelSelect.value),
				paddingSeconds: preset.paddingSeconds,
			});
			await refreshDeviceLists();
			const recorded = await activeSession.recorded;
			const captureStart = Math.min(ACQUISITION_PREROLL_FRAMES, recorded[0].length);
			const captureMeasured = recorded[0].subarray(captureStart);
			const captureReferenceInput = recorded[1].subarray(captureStart);
			const hasReferenceInput = referenceDeviceId.length > 0;

			// Export acquisition channels as:
			// - ch1 = recorded (measured input)
			// - ch2 = stimulus (played sweep)
			// - ch3 = recorded stimulus (reference input), when configured
			const measured = new Float32Array(captureMeasured);
			const stimulusTrack = new Float32Array(measured.length);
			stimulusTrack.set(normalizedStimulus.subarray(0, Math.min(normalizedStimulus.length, stimulusTrack.length)), 0);
			const channels: Float32Array[] = [measured, stimulusTrack];
			if (hasReferenceInput) {
				const recordedStimulus = new Float32Array(measured.length);
				recordedStimulus.set(captureReferenceInput.subarray(0, Math.min(captureReferenceInput.length, recordedStimulus.length)), 0);
				channels.push(recordedStimulus);
			}

			const comment = commentInput?.value?.trim() ?? "";
			const file = new File(
				[createMultichannelWavBlob(channels, SAMPLE_RATE)],
				buildAcquisitionFileName(comment),
				{ type: "audio/wav" },
			);
			triggerFileDownload(file);
			onRecordedFile(file);
			onRecordingComplete?.();
			setStatus("Recording complete. WAV downloaded and added to Files.", "success");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			setStatus(`Recording failed: ${message}`, "error");
		} finally {
			activeSession = null;
			setControlsBusy(false);
		}
	};

	const stop = async (): Promise<void> => {
		if (!activeSession) {
			return;
		}
		setStatus("Stopping recording...", "busy");
		stopButton.disabled = true;
		try {
			await activeSession.stop();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			setStatus(`Stop failed: ${message}`, "error");
		}
	};

	const handleRecord = (): void => {
		void run();
	};
	const handleStop = (): void => {
		void stop();
	};

	void refreshDeviceLists();
	navigator.mediaDevices?.addEventListener?.("devicechange", refreshDeviceLists);
	recordButton.addEventListener("click", handleRecord);
	stopButton.addEventListener("click", handleStop);

	return {
		stop,
		destroy: () => {
			if (destroyed) {
				return;
			}
			destroyed = true;
			navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDeviceLists);
			recordButton.removeEventListener("click", handleRecord);
			stopButton.removeEventListener("click", handleStop);
			void stop();
		},
		isRunning: () => activeSession !== null,
	};
}
