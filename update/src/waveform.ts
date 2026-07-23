

import "./styles.css";
import { type MultichannelBuffer, chirp, normalizeToRMS } from "./signal";
import { readMultichannelWavFile } from "./wavfile";
import { WaveformPlot } from "./waveform-plot";
import { SpectrogramPlot } from "./spectrogram-plot";

export interface WaveformToolHandle {
	openFile(file: File): Promise<void>;
	rerender(): void;
	play(startSample?: number): Promise<void>;
	stop(): void;
	onPlaybackStateChanged(listener: (isPlaying: boolean) => void): () => void;
	setPlaybackGainDb(gainDb: number): number;
	getPlaybackGainDb(): number;
	setPlaybackGainLinear(gainLinear: number): number;
	getPlaybackGainLinear(): number;
	getPlaybackGainMaxLinear(): number;
	getPlaybackGainMaxDb(): number;
	onPlaybackGainMaxDbChanged(listener: (maxGainDb: number) => void): () => void;
	setDisplayedChannels(channelIndices: number[]): void;
	onDisplayedChannelsChanged(listener: (channelIndices: number[]) => void): () => void;
	setSpectrogramFftSize(size: number): void;
	getSpectrogramFftSize(): number;
	setPlaybackDeviceId(deviceId: string): Promise<void>;
	getChannelCount(): number;
	onChannelCountChanged(listener: (channelCount: number) => void): () => void;
	destroy(): void;
}

export const WAVEFORM_TOOL_MARKUP = `
<div class="split-view-container window vertical">
	<div class="split-view toolbar visible">
		<div class="flex">
			<div class="waveform-x-axis">
				<span>1.0</span>
				<span>0.5</span>
				<span>0.0</span>
				<span>-0.5</span>
				<span>-1.0</span>
			</div>
			<div id="resetZoomBtn" title="Reset zoom" aria-label="Reset zoom" alt="Reset zoom" class="toolbar-button button">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin: auto;" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<path d="M8 3H5a2 2 0 0 0-2 2v3" stroke="var(--color-tool)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
					<path d="M16 21h3a2 2 0 0 0 2-2v-3" stroke="var(--color-tool)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
					<path d="M21 8V5a2 2 0 0 0-2-2h-3" stroke="var(--color-tool)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
					<path d="M3 16v3a2 2 0 0 0 2 2h3" stroke="var(--color-tool)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
					<polygon points="12,4 9,8 15,8" fill="var(--color-tool)"></polygon>
					<polygon points="20,12 16,9 16,15" fill="var(--color-tool)"></polygon>
					<polygon points="12,20 9,16 15,16" fill="var(--color-tool)"></polygon>
					<polygon points="4,12 8,9 8,15" fill="var(--color-tool)"></polygon>
				</svg>
			</div>
		</div>
	</div>
	<div class="split-view mainx visible">
		<div class="waveform-main">
			<div class="waveform-container">
				<canvas id="waveformCanvas" class="waveform-canvas"></canvas>
				<div class="waveform-y-axis"></div>
			</div>
			<div class="divider"></div>
			<div class="spectrogram-container">
				<canvas id="spectrogramCanvas" class="spectrogram-canvas"></canvas>
				<div class="spectrogram-y-axis"></div>
			</div>
		</div>
	</div>
</div>`;

function formatPlayheadSeconds(value: number): string {
	if (!Number.isFinite(value) || value < 0) {
		return "0.000 s";
	}

	if (value >= 60) {
		const totalSeconds = Math.floor(value);
		const seconds = (totalSeconds % 60).toString().padStart(2, "0");
		const minutesTotal = Math.floor(totalSeconds / 60);
		const hours = Math.floor(minutesTotal / 60);
		const minutes = (minutesTotal % 60).toString().padStart(2, "0");
		const fraction = Math.floor((value - totalSeconds) * 1000).toString().padStart(3, "0");
		return hours >= 1
			? `${hours}:${minutes}:${seconds}.${fraction}`
			: `${minutes}:${seconds}.${fraction}`;
	}

	if (value >= 1) {
		return `${value.toFixed(3)} s`;
	}

	return `${Math.round(value * 1000)} ms`;
}

function mixMultichannelToMono(channels: MultichannelBuffer): Float32Array {
	if (channels.length === 0) {
		return new Float32Array(0);
	}

	const frameCount = Math.min(...channels.map((channel) => channel.length));
	const mono = new Float32Array(frameCount);
	for (let frame = 0; frame < frameCount; frame += 1) {
		let sum = 0;
		for (const channel of channels) {
			sum += channel[frame] ?? 0;
		}
		mono[frame] = sum / channels.length;
	}
	return mono;
}

function bootstrapWaveformPlot(root: ParentNode = document): WaveformToolHandle | null {
	const canvas = root.querySelector("#waveformCanvas");
	const spectrogramCanvas = root.querySelector("#spectrogramCanvas");
	const xAxis = root.querySelector(".waveform-x-axis");
	const yAxis = root.querySelector(".waveform-y-axis");
	const spectrogramYAxis = root.querySelector(".spectrogram-y-axis");
	const timeDisplaySelect = root.querySelector("#timeDisplaySelect");
	const toolbarControls = root.querySelector(".split-view.toolbar .flex");
	const waveformContainer = canvas instanceof HTMLCanvasElement ? canvas.closest(".waveform-container") : null;

	if (
		!(canvas instanceof HTMLCanvasElement)
		|| !(spectrogramCanvas instanceof HTMLCanvasElement)
		|| !(xAxis instanceof HTMLElement)
		|| !(yAxis instanceof HTMLElement)
		|| !(spectrogramYAxis instanceof HTMLElement)
		|| !(toolbarControls instanceof HTMLElement)
		|| !(waveformContainer instanceof HTMLElement)
	) {
		return null;
	}

	const waveformPlot = new WaveformPlot(canvas, { xAxis, yAxis });
	const spectrogramPlot = new SpectrogramPlot(spectrogramCanvas, { yAxis: spectrogramYAxis });
	const spectrogramScaleSteps = 20;

	const playhead = document.createElement("div");
	playhead.className = "waveform-playhead";
	const playheadLabel = document.createElement("div");
	playheadLabel.className = "waveform-playhead-label";
	playhead.append(playheadLabel);
	waveformContainer.append(playhead);
	const playheadAxisMarker = document.createElement("div");
	playheadAxisMarker.className = "waveform-playhead-axis-marker";
	xAxis.append(playheadAxisMarker);

	let currentChannels: Float32Array[] = [new Float32Array(0)];
	let currentSampleRate = 48000;
	let playheadSample = 0;
	let isPlaying = false;
	let playbackAudioContext: AudioContext | null = null;
	let playbackSource: AudioBufferSourceNode | null = null;
	let playbackGainNode: GainNode | null = null;
	let playbackStartedAt = 0;
	let playbackStartSample = 0;
	let playbackAnimation: number | null = null;
	let playbackToken = 0;
	let playheadInitialized = false;
	let selectedChannelIndices = new Set<number>();
	let playbackDeviceId = "";
	let playbackGainLinear = 1;
	let playbackGainMaxDb = 0;
	const channelCountListeners = new Set<(channelCount: number) => void>();
	const playbackStateListeners = new Set<(isPlaying: boolean) => void>();
	const displayedChannelsListeners = new Set<(channelIndices: number[]) => void>();
	const playbackGainMaxDbListeners = new Set<(maxGainDb: number) => void>();

	const setPlayheadColor = (color: string): void => {
		playhead.style.setProperty("--playhead-color", color);
		playheadAxisMarker.style.setProperty("--playhead-color", color);
	};

	const updatePlayheadColor = (): void => {
		setPlayheadColor(isPlaying ? "#72cc1e" : "color-mix(in lab, var(--color) 82%, #ffffff 18%)");
	};

	const getFrameCount = (): number => {
		if (currentChannels.length === 0) {
			return 0;
		}

		return currentChannels.reduce((minimum, channel) => Math.min(minimum, channel.length), currentChannels[0].length);
	};

	const getChannelCount = (): number => currentChannels.length;

	const notifyChannelCountChanged = (): void => {
		const channelCount = getChannelCount();
		for (const listener of channelCountListeners) {
			listener(channelCount);
		}
	};

	const notifyDisplayedChannelsChanged = (): void => {
		const channelIndices = [...selectedChannelIndices];
		for (const listener of displayedChannelsListeners) {
			listener(channelIndices);
		}
	};

	const notifyPlaybackGainMaxDbChanged = (): void => {
		for (const listener of playbackGainMaxDbListeners) {
			listener(playbackGainMaxDb);
		}
	};

	const dbToLinear = (valueDb: number): number => Math.pow(10, valueDb / 20);
	const linearToDb = (valueLinear: number): number => {
		if (!Number.isFinite(valueLinear) || valueLinear <= 0) {
			return Number.NEGATIVE_INFINITY;
		}
		return 20 * Math.log10(valueLinear);
	};

	const computePlaybackGainMaxDb = (): number => {
		let peak = 0;
		for (const channelIndex of selectedChannelIndices) {
			const channel = currentChannels[channelIndex];
			if (!channel) {
				continue;
			}
			for (let frame = 0; frame < channel.length; frame += 1) {
				const magnitude = Math.abs(channel[frame] ?? 0);
				if (magnitude > peak) {
					peak = magnitude;
				}
			}
		}

		if (!Number.isFinite(peak) || peak <= 1e-9) {
			return 0;
		}

		const maxDb = 20 * Math.log10(1 / peak);
		if (!Number.isFinite(maxDb)) {
			return 0;
		}

		return Math.max(0, maxDb);
	};

	const updatePlaybackGainLimits = (): void => {
		playbackGainMaxDb = computePlaybackGainMaxDb();
		const maxLinear = dbToLinear(playbackGainMaxDb);
		if (playbackGainLinear > maxLinear) {
			playbackGainLinear = maxLinear;
		}
		if (playbackGainNode) {
			playbackGainNode.gain.value = playbackGainLinear;
		}
		notifyPlaybackGainMaxDbChanged();
	};

	const setPlaybackGainLinearValue = (gainLinear: number): number => {
		if (!Number.isFinite(gainLinear)) {
			return playbackGainLinear;
		}
		const maxLinear = dbToLinear(playbackGainMaxDb);
		playbackGainLinear = Math.max(0, Math.min(maxLinear, gainLinear));
		if (playbackGainNode) {
			playbackGainNode.gain.value = playbackGainLinear;
		}
		return playbackGainLinear;
	};

	const setPlaybackGainDbValue = (gainDb: number): number => {
		if (gainDb === Number.NEGATIVE_INFINITY) {
			setPlaybackGainLinearValue(0);
			return linearToDb(playbackGainLinear);
		}
		if (!Number.isFinite(gainDb)) {
			return linearToDb(playbackGainLinear);
		}
		setPlaybackGainLinearValue(dbToLinear(gainDb));
		return linearToDb(playbackGainLinear);
	};

	const clampSample = (value: number): number => {
		const frameCount = getFrameCount();
		if (!Number.isFinite(value)) {
			return 0;
		}
		return Math.max(0, Math.min(frameCount, Math.round(value)));
	};

	const updatePlaybackVisualState = (): void => {
		updatePlayheadColor();
		for (const listener of playbackStateListeners) {
			listener(isPlaying);
		}
	};

	const hidePlayheadVisual = (): void => {
		playhead.classList.remove("visible");
		playheadAxisMarker.classList.remove("visible");
	};

	const panViewByWindowLength = (): void => {
		waveformPlot.panByFraction(1);
		spectrogramPlot.panByFraction(1, true);
	};

	const updatePlayheadVisual = (): void => {
		if (playheadAxisMarker.parentElement !== xAxis) {
			xAxis.append(playheadAxisMarker);
		}

		if (!playheadInitialized && !isPlaying) {
			hidePlayheadVisual();
			return;
		}

		const frameCount = getFrameCount();
		if (frameCount <= 0 || currentSampleRate <= 0) {
			hidePlayheadVisual();
			return;
		}

		if (!isPlaying && playheadSample >= frameCount) {
			hidePlayheadVisual();
			return;
		}

		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0) {
			hidePlayheadVisual();
			return;
		}
		const axisRect = xAxis.getBoundingClientRect();
		if (axisRect.width <= 0) {
			hidePlayheadVisual();
			return;
		}

		const { startSeconds, stopSeconds } = waveformPlot.getVisibleWindowSeconds();
		if (!Number.isFinite(startSeconds) || !Number.isFinite(stopSeconds) || stopSeconds <= startSeconds) {
			hidePlayheadVisual();
			return;
		}

		const playheadSeconds = playheadSample / currentSampleRate;
		if (isPlaying && playheadSeconds > stopSeconds) {
			const totalDurationSeconds = getFrameCount() / currentSampleRate;
			if (stopSeconds < totalDurationSeconds) {
				let nextStartSeconds = startSeconds;
				let nextStopSeconds = stopSeconds;
				while (playheadSeconds > nextStopSeconds && nextStopSeconds < totalDurationSeconds) {
					panViewByWindowLength();
					const windowSeconds = waveformPlot.getVisibleWindowSeconds();
					if (windowSeconds.startSeconds === nextStartSeconds && windowSeconds.stopSeconds === nextStopSeconds) {
						break;
					}
					nextStartSeconds = windowSeconds.startSeconds;
					nextStopSeconds = windowSeconds.stopSeconds;
				}
				updatePlayheadVisual();
				return;
			}
		}

		if (playheadSeconds < startSeconds || playheadSeconds > stopSeconds) {
			hidePlayheadVisual();
			return;
		}

		const fraction = (playheadSeconds - startSeconds) / (stopSeconds - startSeconds);
		const clampedFraction = Math.max(0, Math.min(1, fraction));
		const x = Math.round(clampedFraction * Math.max(0, rect.width - 1));
		const canvasViewportX = rect.left + x;
		const axisX = Math.round(Math.max(0, Math.min(axisRect.width - 1, canvasViewportX - axisRect.left)));
		playhead.style.left = `${x}px`;
		playheadAxisMarker.style.left = `${axisX}px`;
		playhead.classList.toggle("is-playing", isPlaying);
		if (isPlaying) {
			playheadLabel.textContent = "Playing";
		} else {
			playheadLabel.textContent = "";
		}
		playhead.classList.add("visible");
		playheadAxisMarker.classList.add("visible");
	};

	const stopPlayheadAnimation = (): void => {
		if (playbackAnimation !== null) {
			cancelAnimationFrame(playbackAnimation);
			playbackAnimation = null;
		}
	};

	const animatePlayhead = (): void => {
		if (!isPlaying || !playbackAudioContext) {
			stopPlayheadAnimation();
			return;
		}

		const elapsedSamples = (playbackAudioContext.currentTime - playbackStartedAt) * currentSampleRate;
		playheadSample = clampSample(playbackStartSample + elapsedSamples);
		updatePlayheadVisual();
		playbackAnimation = requestAnimationFrame(animatePlayhead);
	};

	const ensureAudioContext = async (): Promise<AudioContext> => {
		if (!playbackAudioContext) {
			playbackAudioContext = new AudioContext();
		}
		if (playbackAudioContext.state === "suspended") {
			await playbackAudioContext.resume();
		}
		if (playbackDeviceId && "setSinkId" in playbackAudioContext) {
			try {
				await (playbackAudioContext as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(playbackDeviceId);
			} catch {
				// Keep default output when sink selection is unsupported or fails.
			}
		}
		return playbackAudioContext;
	};

	const buildPlaybackBuffer = (context: AudioContext): AudioBuffer => {
		const frameCount = getFrameCount();
		const channelCount = Math.max(1, Math.min(32, currentChannels.length));
		const buffer = context.createBuffer(channelCount, frameCount, currentSampleRate);
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
			const channel = currentChannels[channelIndex] ?? currentChannels[0] ?? new Float32Array(frameCount);
			buffer.copyToChannel(Float32Array.from(channel.subarray(0, frameCount)), channelIndex);
		}
		return buffer;
	};

	const getDisplayedWaveformChannels = (): Float32Array[] => {
		if (currentChannels.length === 0) {
			return [new Float32Array(0)];
		}

		const channels = currentChannels.map(() => new Float32Array(0));
		for (const channelIndex of selectedChannelIndices) {
			const channel = currentChannels[channelIndex];
			if (channel) {
				channels[channelIndex] = channel;
			}
		}

		const hasVisibleChannel = channels.some((channel) => channel.length > 0);
		return hasVisibleChannel ? channels : [new Float32Array(0)];
	};

	const getDisplayedSpectrogramChannel = (): Float32Array => {
		const selected = [...selectedChannelIndices]
			.map((index) => currentChannels[index])
			.filter((channel): channel is Float32Array => channel instanceof Float32Array);
		if (selected.length === 0) {
			return new Float32Array(0);
		}
		if (selected.length === 1) {
			return Float32Array.from(selected[0]);
		}
		return mixMultichannelToMono(selected);
	};

	const selectAllChannels = (): void => {
		selectedChannelIndices = new Set<number>();
		for (let channelIndex = 0; channelIndex < currentChannels.length; channelIndex += 1) {
			selectedChannelIndices.add(channelIndex);
		}
		updatePlaybackGainLimits();
		notifyDisplayedChannelsChanged();
	};

	const pausePlayback = (): void => {
		if (!isPlaying) {
			updatePlaybackVisualState();
			return;
		}

		if (playbackAudioContext) {
			const elapsedSamples = (playbackAudioContext.currentTime - playbackStartedAt) * currentSampleRate;
			playheadSample = clampSample(playbackStartSample + elapsedSamples);
		}

		isPlaying = false;
		playbackToken += 1;
		if (playbackSource) {
			playbackSource.onended = null;
			try {
				playbackSource.stop();
			} catch {
				// Ignore stop races when the source already ended.
			}
			playbackSource.disconnect();
			playbackSource = null;
		}
		if (playbackGainNode) {
			playbackGainNode.disconnect();
			playbackGainNode = null;
		}

		stopPlayheadAnimation();
		updatePlayheadVisual();
		updatePlaybackVisualState();
	};

	const startPlayback = async (startSample = playheadSample): Promise<void> => {
		const frameCount = getFrameCount();
		if (frameCount <= 0 || currentSampleRate <= 0) {
			return;
		}

		const clampedStart = clampSample(startSample);
		if (clampedStart >= frameCount) {
			playheadSample = frameCount;
			updatePlayheadVisual();
			return;
		}

		pausePlayback();

		const context = await ensureAudioContext();
		const source = context.createBufferSource();
		source.buffer = buildPlaybackBuffer(context);
		const gainNode = context.createGain();
		gainNode.gain.value = playbackGainLinear;
		source.connect(gainNode);
		gainNode.connect(context.destination);

		const token = playbackToken + 1;
		playbackToken = token;
		source.onended = () => {
			if (token !== playbackToken || !isPlaying) {
				return;
			}
			isPlaying = false;
			playbackSource = null;
			playbackGainNode = null;
			playheadSample = frameCount;
			playheadInitialized = false;
			stopPlayheadAnimation();
			updatePlayheadVisual();
			updatePlaybackVisualState();
		};

		playbackStartedAt = context.currentTime;
		playbackStartSample = clampedStart;
		playheadSample = clampedStart;
		playheadInitialized = true;
		isPlaying = true;
		playbackSource = source;
		playbackGainNode = gainNode;
		source.start(0, clampedStart / currentSampleRate);

		updatePlaybackVisualState();
		updatePlayheadVisual();
		stopPlayheadAnimation();
		playbackAnimation = requestAnimationFrame(animatePlayhead);
	};

	const togglePlayback = (): void => {
		if (isPlaying) {
			pausePlayback();
			return;
		}

		void startPlayback(playheadSample >= getFrameCount() ? 0 : playheadSample);
	};

	const getSampleAtPointer = (event: MouseEvent): number | null => {
		const { startSeconds, stopSeconds } = waveformPlot.getVisibleWindowSeconds();
		if (!Number.isFinite(startSeconds) || !Number.isFinite(stopSeconds) || stopSeconds <= startSeconds || currentSampleRate <= 0) {
			return null;
		}

		const rect = canvas.getBoundingClientRect();
		const width = Math.max(1, rect.width || 0);
		const pointerX = Math.max(0, Math.min(width, event.clientX - rect.left));
		const seconds = startSeconds + ((pointerX / width) * (stopSeconds - startSeconds));
		return clampSample(seconds * currentSampleRate);
	};

	canvas.addEventListener("click", (event) => {
		const sample = getSampleAtPointer(event);
		if (sample === null) {
			return;
		}

		if (isPlaying) {
			const nearCurrent = Math.abs(playheadSample - sample) <= 2;
			if (nearCurrent) {
				pausePlayback();
				return;
			}
			void startPlayback(sample);
			return;
		}

		playheadSample = sample;
		playheadInitialized = true;
		updatePlayheadVisual();
	});

	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = ".wav,audio/wav";
	fileInput.hidden = true;
	fileInput.tabIndex = -1;
	if (root instanceof HTMLElement) {
		root.append(fileInput);
	} else {
		document.body.append(fileInput);
	}

	const contextMenu = document.createElement("div");
	contextMenu.className = "app-context-menu";
	contextMenu.hidden = true;
	let isSpectrogramHovered = false;

	const openFileButton = document.createElement("button");
	openFileButton.type = "button";
	openFileButton.className = "app-context-menu__item";
	openFileButton.textContent = "Open file...";
	contextMenu.append(openFileButton);

	const contextMenuDivider = document.createElement("div");
	contextMenuDivider.className = "app-context-menu__separator";
	contextMenu.append(contextMenuDivider);

	const spectrogramMenuLabel = document.createElement("div");
	spectrogramMenuLabel.className = "app-context-menu__label";
	spectrogramMenuLabel.textContent = "Spectrogram scale";
	contextMenu.append(spectrogramMenuLabel);

	const spectrogramMenuGroup = document.createElement("div");
	spectrogramMenuGroup.className = "app-context-menu__group";
	contextMenu.append(spectrogramMenuGroup);

	const channelMenuLabel = document.createElement("div");
	channelMenuLabel.className = "app-context-menu__label";
	channelMenuLabel.textContent = "Displayed channel";
	contextMenu.append(channelMenuLabel);

	const channelMenuGroup = document.createElement("div");
	channelMenuGroup.className = "app-context-menu__group";
	contextMenu.append(channelMenuGroup);
	if (root instanceof HTMLElement) {
		root.append(contextMenu);
	} else {
		document.body.append(contextMenu);
	}

	const applyDisplayedChannelSelection = (resetZoom = false): void => {
		const waveformChannels = getDisplayedWaveformChannels();
		const spectrogramSamples = getDisplayedSpectrogramChannel();
		waveformPlot.setChannelDrawOrder([...selectedChannelIndices]);
		if (resetZoom) {
			waveformPlot.setData(waveformChannels, currentSampleRate);
			spectrogramPlot.setData(spectrogramSamples, currentSampleRate);
		} else {
			waveformPlot.rerenderPlotData(waveformChannels);
			spectrogramPlot.rerenderPlotData(spectrogramSamples);
		}
		updatePlayheadVisual();
	};

	const renderSpectrogramScaleMenu = (): void => {
		spectrogramMenuGroup.replaceChildren();

		const createItem = (label: string, step: number): HTMLButtonElement => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "app-context-menu__item";
			if (spectrogramPlot.getFrequencyScaleStep() === step) {
				button.classList.add("is-selected");
			}
			button.textContent = label;
			button.addEventListener("click", () => {
				spectrogramPlot.setFrequencyScaleStep(step);
				renderSpectrogramScaleMenu();
				hideContextMenu();
			});
			return button;
		};

		spectrogramMenuGroup.append(createItem("Linear", 0));
		spectrogramMenuGroup.append(createItem("Mostly linear", 6));
		spectrogramMenuGroup.append(createItem("Balanced", 10));
		spectrogramMenuGroup.append(createItem("Mostly log", 14));
		spectrogramMenuGroup.append(createItem("Logarithmic", spectrogramScaleSteps - 1));
	};

	const renderChannelMenu = (): void => {
		channelMenuGroup.replaceChildren();

		const createItem = (label: string, channelIndex: number | null): HTMLButtonElement => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "app-context-menu__item";
			const isSelected = channelIndex === null
				? selectedChannelIndices.size === currentChannels.length
				: selectedChannelIndices.has(channelIndex);
			if (isSelected) {
				button.classList.add("is-selected");
			}
			button.textContent = label;
			button.addEventListener("click", () => {
				if (channelIndex === null) {
					selectAllChannels();
				} else if (selectedChannelIndices.has(channelIndex)) {
					selectedChannelIndices.delete(channelIndex);
					notifyDisplayedChannelsChanged();
				} else {
					selectedChannelIndices.add(channelIndex);
					notifyDisplayedChannelsChanged();
				}
				applyDisplayedChannelSelection(false);
				renderChannelMenu();
				hideContextMenu();
			});
			return button;
		};

		channelMenuGroup.append(createItem("All channels", null));
		for (let channelIndex = 0; channelIndex < currentChannels.length; channelIndex += 1) {
			channelMenuGroup.append(createItem(`Channel ${channelIndex + 1}`, channelIndex));
		}
	};

	const hideContextMenu = (): void => {
		contextMenu.hidden = true;
	};

	const showContextMenu = (clientX: number, clientY: number): void => {
		contextMenuDivider.hidden = !isSpectrogramHovered;
		spectrogramMenuLabel.hidden = !isSpectrogramHovered;
		spectrogramMenuGroup.hidden = !isSpectrogramHovered;
		if (isSpectrogramHovered) {
			renderSpectrogramScaleMenu();
		} else {
			spectrogramMenuGroup.replaceChildren();
		}
		renderChannelMenu();
		contextMenu.hidden = false;
		const viewportPadding = 8;
		const menuRect = contextMenu.getBoundingClientRect();
		const left = Math.max(viewportPadding, Math.min(clientX, window.innerWidth - menuRect.width - viewportPadding));
		const top = Math.max(viewportPadding, Math.min(clientY, window.innerHeight - menuRect.height - viewportPadding));
		contextMenu.style.left = `${left}px`;
		contextMenu.style.top = `${top}px`;
	};

	const openFilePicker = (): void => {
		hideContextMenu();
		fileInput.value = "";
		fileInput.click();
	};

	openFileButton.addEventListener("click", openFilePicker);

	const openFile = async (file: File): Promise<void> => {
		try {
			const { sampleRate, channels } = await readMultichannelWavFile(file);
			pausePlayback();
			currentChannels = channels.map((channel) => Float32Array.from(channel));
			currentSampleRate = sampleRate;
			selectAllChannels();
			playheadSample = 0;
			playheadInitialized = false;
			applyDisplayedChannelSelection(true);
			notifyChannelCountChanged();
			updatePlaybackGainLimits();
		} catch (error) {
			console.error(error);
			window.alert(error instanceof Error ? error.message : "Unable to open that file.");
		}
	};

	fileInput.addEventListener("change", async () => {
		const file = fileInput.files?.[0];
		fileInput.value = "";
		if (!file) {
			return;
		}

		await openFile(file);
	});

	const handleWindowClick = (event: MouseEvent): void => {
		if (event.target instanceof Node && !contextMenu.contains(event.target)) {
			hideContextMenu();
		}
	};
	window.addEventListener("click", handleWindowClick);

	const handleWindowBlur = (): void => {
		hideContextMenu();
	};
	window.addEventListener("blur", handleWindowBlur);

	const handleBeforeUnload = (): void => {
		pausePlayback();
		if (playbackAudioContext) {
			void playbackAudioContext.close();
			playbackAudioContext = null;
		}
	};
	window.addEventListener("beforeunload", handleBeforeUnload);

	const handleDocumentKeydown = (event: KeyboardEvent): void => {
		const target = event.target as HTMLElement | null;
		const typingTarget = target && (
			target.tagName === "INPUT"
			|| target.tagName === "TEXTAREA"
			|| target.tagName === "SELECT"
			|| target.tagName === "BUTTON"
			|| target.isContentEditable
		);

		if (event.code === "Space" && !typingTarget) {
			event.preventDefault();
			togglePlayback();
			return;
		}

		if (event.key === "Escape") {
			hideContextMenu();
		}
	};
	document.addEventListener("keydown", handleDocumentKeydown);

	const contextMenuTarget = root.querySelector(".window");
	const handleContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
		showContextMenu(event.clientX, event.clientY);
	};
	if (contextMenuTarget instanceof HTMLElement) {
		contextMenuTarget.addEventListener("contextmenu", handleContextMenu);
	}

	spectrogramCanvas.addEventListener("pointerenter", () => {
		isSpectrogramHovered = true;
	});
	spectrogramCanvas.addEventListener("pointerleave", () => {
		isSpectrogramHovered = false;
	});

	if (timeDisplaySelect instanceof HTMLSelectElement) {
		waveformPlot.setXAxisDisplayMode(timeDisplaySelect.value === "samples" ? "samples" : "time");
		timeDisplaySelect.addEventListener("change", () => {
			waveformPlot.setXAxisDisplayMode(timeDisplaySelect.value === "samples" ? "samples" : "time");
			updatePlayheadVisual();
		});
	}
	const sampleRate = 48000;
	const [chirpSamples] = chirp(20, 24000, undefined, 2);
	const waveformSamples = normalizeToRMS(chirpSamples);
	currentChannels = [Float32Array.from(waveformSamples)];
	currentSampleRate = sampleRate;
	selectAllChannels();
	playheadSample = 0;
	playheadInitialized = false;
	applyDisplayedChannelSelection(true);
	notifyChannelCountChanged();
	updatePlaybackGainLimits();
	updatePlaybackVisualState();
	updatePlayheadVisual();

	const getPointerFraction = (event: WheelEvent, target: HTMLCanvasElement): number => {
		const rect = target.getBoundingClientRect();
		const width = Math.max(1, rect.width || 0);
		const pointerX = Math.max(0, Math.min(width, event.clientX - rect.left));
		return pointerX / width;
	};

	const handleSharedWheel = (event: WheelEvent, target: HTMLCanvasElement): void => {
		event.preventDefault();

		let deltaX = event.deltaX;
		let deltaY = event.deltaY;
		if (event.shiftKey && Math.abs(deltaX) < Math.abs(deltaY)) {
			deltaX = event.deltaY;
			deltaY = 0;
		}

		const absDeltaX = Math.abs(deltaX);
		const absDeltaY = Math.abs(deltaY);
		const dominantAxis: "x" | "y" | null = absDeltaY > absDeltaX ? "y" : absDeltaX > absDeltaY ? "x" : null;
		if (dominantAxis !== null) {
			if (wheelAxisLock === null) {
				wheelAxisLock = dominantAxis;
			} else if (wheelAxisLock !== dominantAxis) {
				return;
			}
		}

		if (wheelAxisResetTimer !== null) {
			clearTimeout(wheelAxisResetTimer);
		}
		wheelAxisResetTimer = setTimeout(() => {
			wheelAxisLock = null;
			wheelAxisResetTimer = null;
		}, 120);

		const pointerFraction = getPointerFraction(event, target);
		if (absDeltaY >= absDeltaX && absDeltaY > 0) {
			waveformPlot.applyWheelZoom(pointerFraction, deltaY);
			spectrogramPlot.applyWheelZoom(pointerFraction, deltaY);
		} else if (absDeltaX > 0) {
			const rect = target.getBoundingClientRect();
			const width = Math.max(1, rect.width || 0);
			const panFraction = (deltaX / width) * 0.5;
			waveformPlot.panByFraction(panFraction);
			spectrogramPlot.panByFraction(panFraction, true);
		}

		updatePlayheadVisual();
	};

	canvas.addEventListener("wheel", (event) => {
		handleSharedWheel(event, canvas);
	}, { passive: false });

	spectrogramCanvas.addEventListener("wheel", (event) => {
		handleSharedWheel(event, spectrogramCanvas);
	}, { passive: false });

	let wheelAxisLock: "x" | "y" | null = null;
	let wheelAxisResetTimer: ReturnType<typeof setTimeout> | null = null;

	let resizeAnimation: number | null = null;
	let resizeDoneTimer: any;

	const startResizeAnimation = (callback: () => void): void => {
		if (resizeAnimation !== null) {
			return;
		}

		resizeAnimation = requestAnimationFrame(() => {
			resizeAnimation = null;
			callback();
		});
	};

	const stopResizeAnimation = (): void => {
		if (resizeAnimation !== null) {
			cancelAnimationFrame(resizeAnimation);
			resizeAnimation = null;
		}
	}
	const rerender = () => {
		if (!resizeAnimation) startResizeAnimation(() => {
			waveformPlot.rerenderAxis();
			waveformPlot.rerenderPlotData();
			spectrogramPlot.rerenderAxis();
			spectrogramPlot.rerenderPlotData();
			updatePlayheadVisual();
		});
		clearTimeout(resizeDoneTimer);
		resizeDoneTimer = setTimeout(function() {
			resizeDoneTimer = null;
			stopResizeAnimation();
		}, 200);
    };

	window.addEventListener("resize", rerender);

	const destroy = (): void => {
		pausePlayback();
		window.removeEventListener("resize", rerender);
		window.removeEventListener("click", handleWindowClick);
		window.removeEventListener("blur", handleWindowBlur);
		window.removeEventListener("beforeunload", handleBeforeUnload);
		document.removeEventListener("keydown", handleDocumentKeydown);
		if (contextMenuTarget instanceof HTMLElement) {
			contextMenuTarget.removeEventListener("contextmenu", handleContextMenu);
		}
		if (playbackAudioContext) {
			void playbackAudioContext.close();
			playbackAudioContext = null;
		}
		contextMenu.remove();
		fileInput.remove();
	};

	return {
		openFile,
		rerender,
		play: async (startSample?: number) => {
			const sample = typeof startSample === "number" ? startSample : playheadSample >= getFrameCount() ? 0 : playheadSample;
			await startPlayback(sample);
		},
		stop: pausePlayback,
		onPlaybackStateChanged: (listener: (isPlaying: boolean) => void) => {
			playbackStateListeners.add(listener);
			listener(isPlaying);
			return () => {
				playbackStateListeners.delete(listener);
			};
		},
		setDisplayedChannels: (channelIndices: number[]) => {
			const maxChannelIndex = Math.max(0, getChannelCount() - 1);
			const sanitized = new Set<number>();
			for (const index of channelIndices) {
				if (Number.isInteger(index) && index >= 0 && index <= maxChannelIndex) {
					sanitized.add(index);
				}
			}
			selectedChannelIndices = sanitized;
			updatePlaybackGainLimits();
			notifyDisplayedChannelsChanged();
			applyDisplayedChannelSelection(false);
		},
		onDisplayedChannelsChanged: (listener: (channelIndices: number[]) => void) => {
			displayedChannelsListeners.add(listener);
			listener([...selectedChannelIndices]);
			return () => {
				displayedChannelsListeners.delete(listener);
			};
		},
		setPlaybackGainDb: (gainDb: number) => setPlaybackGainDbValue(gainDb),
		getPlaybackGainDb: () => linearToDb(playbackGainLinear),
		setPlaybackGainLinear: (gainLinear: number) => setPlaybackGainLinearValue(gainLinear),
		getPlaybackGainLinear: () => playbackGainLinear,
		getPlaybackGainMaxLinear: () => dbToLinear(playbackGainMaxDb),
		getPlaybackGainMaxDb: () => playbackGainMaxDb,
		onPlaybackGainMaxDbChanged: (listener: (maxGainDb: number) => void) => {
			playbackGainMaxDbListeners.add(listener);
			listener(playbackGainMaxDb);
			return () => {
				playbackGainMaxDbListeners.delete(listener);
			};
		},
		setSpectrogramFftSize: (size: number) => {
			spectrogramPlot.setWindowSize(size);
		},
		getSpectrogramFftSize: () => spectrogramPlot.getWindowSize(),
		setPlaybackDeviceId: async (deviceId: string) => {
			playbackDeviceId = deviceId.trim();
			if (playbackAudioContext && "setSinkId" in playbackAudioContext) {
				try {
					await (playbackAudioContext as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(playbackDeviceId);
				} catch {
					// Keep default output when sink selection is unsupported or fails.
				}
			}
		},
		getChannelCount,
		onChannelCountChanged: (listener: (channelCount: number) => void) => {
			channelCountListeners.add(listener);
			listener(getChannelCount());
			return () => {
				channelCountListeners.delete(listener);
			};
		},
		destroy,
	};
}

export function mountWaveformTool(target: string | HTMLElement): WaveformToolHandle {
	const host = typeof target === "string"
		? document.getElementById(target)
		: target;

	if (!(host instanceof HTMLElement)) {
		throw new Error(`Waveform mount target not found: ${String(target)}`);
	}

	if (!host.querySelector("#waveformCanvas")) {
		const canonical = document.querySelector('.tab-content[data-content="waveform"] .split-view-container.window.vertical') as HTMLElement | null;
		host.innerHTML = canonical ? canonical.outerHTML : WAVEFORM_TOOL_MARKUP;
	}

	const handle = bootstrapWaveformPlot(host);
	if (!handle) {
		throw new Error("Failed to initialize waveform tool.");
	}

	return handle;
}
