import { setAudioDeviceSelectOptions, listAudioDevices } from "./audio_devices";
import { startPlayAndRecord, type ActiveDuplexSession, type AudioChannelSelection } from "./audio_io";
import { chirp, normalizeToRMS } from "./signal";
import { createStereoWavBlob } from "./wavfile";

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
	outputDeviceSelect: HTMLSelectElement;
	outputChannelSelect: HTMLSelectElement;
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

function buildAcquisitionFileName(): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	return `acquisition-${stamp}.wav`;
}

function normalizeChannelSelection(value: string): AudioChannelSelection {
	return value === "right" ? "right" : "left";
}

export function createMeasurementController(options: MeasurementControllerOptions): MeasurementController {
	const SAMPLE_RATE = 48000;
	const ACQUISITION_PREROLL_SECONDS = 0.5;
	const ACQUISITION_PREROLL_FRAMES = Math.round(SAMPLE_RATE * ACQUISITION_PREROLL_SECONDS);

	const {
		stimulusSelect,
		inputDeviceSelect,
		inputChannelSelect,
		outputDeviceSelect,
		outputChannelSelect,
		statusText,
		recordButton,
		stopButton,
		onRecordedFile,
		onRecordingComplete,
		presets = DEFAULT_STIMULUS_PRESETS,
	} = options;

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
			setAudioDeviceSelectOptions(outputDeviceSelect, outputs, "System default output");
			if (inputs.length === 0) {
				inputDeviceSelect.disabled = true;
			}
			if (outputs.length === 0) {
				outputDeviceSelect.disabled = true;
			}
		} catch {
			if (!destroyed && token === deviceRefreshToken) {
				inputDeviceSelect.disabled = true;
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

			activeSession = await startPlayAndRecord(paddedStimulus, {
				inputDeviceId: inputDeviceSelect.value || undefined,
				inputChannel: normalizeChannelSelection(inputChannelSelect.value),
				outputDeviceId: outputDeviceSelect.value || undefined,
				outputChannel: normalizeChannelSelection(outputChannelSelect.value),
				paddingSeconds: preset.paddingSeconds,
			});
			await refreshDeviceLists();
			const recorded = await activeSession.recorded;
			const trimmedRecorded: [Float32Array, Float32Array] = [
				recorded[0].subarray(Math.min(ACQUISITION_PREROLL_FRAMES, recorded[0].length)),
				recorded[1].subarray(Math.min(ACQUISITION_PREROLL_FRAMES, recorded[1].length)),
			];
			const file = new File([createStereoWavBlob(trimmedRecorded, SAMPLE_RATE)], buildAcquisitionFileName(), { type: "audio/wav" });
			onRecordedFile(file);
			onRecordingComplete?.();
			setStatus("Recording complete. WAV added to Files.", "success");
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
