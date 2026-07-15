/// <reference path="./plotly.d.ts" />

import "./styles.css";
import { play, record, playAndRecord } from "./audio_io";
import { calculateTwoChannelImpulseResponse, estimateDelay, type NumberArray, type MultichannelBuffer, chirp, normalizeToRMS } from "./signal";
import { downloadStereoWav, readMultichannelWavFile } from "./wavfile";
import { WaveformPlot } from "./waveform-plot";
import { SpectrogramPlot } from "./spectrogram-plot";

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

const bootstrapWaveformPlot = (): void => {
	const canvas = document.getElementById("waveformCanvas");
	const spectrogramCanvas = document.getElementById("spectrogramCanvas");
	const xAxis = document.querySelector(".waveform-x-axis");
	const yAxis = document.querySelector(".waveform-y-axis");
	const spectrogramYAxis = document.querySelector(".spectrogram-y-axis");
	const timeDisplaySelect = document.getElementById("timeDisplaySelect");
	const toolbarControls = document.querySelector(".split-view.toolbar .flex");
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
		return;
	}

	const waveformPlot = new WaveformPlot(canvas, { xAxis, yAxis });
	const spectrogramPlot = new SpectrogramPlot(spectrogramCanvas, { yAxis: spectrogramYAxis });
	const playToggleButton = document.createElement("button");
	playToggleButton.type = "button";
	playToggleButton.className = "toolbar-button transport-play-button";
	playToggleButton.title = "Play or pause (Space)";
	playToggleButton.ariaLabel = "Play or pause";
	playToggleButton.textContent = "Play";
	const resetZoomButton = document.getElementById("resetZoomBtn");
	if (resetZoomButton instanceof HTMLElement && resetZoomButton.parentElement === toolbarControls) {
		toolbarControls.insertBefore(playToggleButton, resetZoomButton);
	} else {
		toolbarControls.append(playToggleButton);
	}

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
	let playbackStartedAt = 0;
	let playbackStartSample = 0;
	let playbackAnimation: number | null = null;
	let playbackToken = 0;
	let playheadInitialized = false;

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

	const clampSample = (value: number): number => {
		const frameCount = getFrameCount();
		if (!Number.isFinite(value)) {
			return 0;
		}
		return Math.max(0, Math.min(frameCount, Math.round(value)));
	};

	const updatePlayToggleButton = (): void => {
		playToggleButton.textContent = isPlaying ? "Pause" : "Play";
		playToggleButton.classList.toggle("is-playing", isPlaying);
		updatePlayheadColor();
	};

	const hidePlayheadVisual = (): void => {
		playhead.classList.remove("visible");
		playheadAxisMarker.classList.remove("visible");
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
			playheadLabel.textContent = formatPlayheadSeconds(playheadSeconds);
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

	const pausePlayback = (): void => {
		if (!isPlaying) {
			updatePlayToggleButton();
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

		stopPlayheadAnimation();
		updatePlayheadVisual();
		updatePlayToggleButton();
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
		source.connect(context.destination);

		const token = playbackToken + 1;
		playbackToken = token;
		source.onended = () => {
			if (token !== playbackToken || !isPlaying) {
				return;
			}
			isPlaying = false;
			playbackSource = null;
			playheadSample = frameCount;
			playheadInitialized = false;
			stopPlayheadAnimation();
			updatePlayheadVisual();
			updatePlayToggleButton();
		};

		playbackStartedAt = context.currentTime;
		playbackStartSample = clampedStart;
		playheadSample = clampedStart;
		playheadInitialized = true;
		isPlaying = true;
		playbackSource = source;
		source.start(0, clampedStart / currentSampleRate);

		updatePlayToggleButton();
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

	playToggleButton.addEventListener("click", () => {
		togglePlayback();
	});
	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = ".wav,audio/wav";
	fileInput.hidden = true;
	fileInput.tabIndex = -1;
	document.body.append(fileInput);

	const contextMenu = document.createElement("div");
	contextMenu.className = "app-context-menu";
	contextMenu.hidden = true;

	const openFileButton = document.createElement("button");
	openFileButton.type = "button";
	openFileButton.className = "app-context-menu__item";
	openFileButton.textContent = "Open file...";
	contextMenu.append(openFileButton);
	document.body.append(contextMenu);

	const hideContextMenu = (): void => {
		contextMenu.hidden = true;
	};

	const showContextMenu = (clientX: number, clientY: number): void => {
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

	fileInput.addEventListener("change", async () => {
		const file = fileInput.files?.[0];
		fileInput.value = "";
		if (!file) {
			return;
		}

		try {
			const { sampleRate, channels } = await readMultichannelWavFile(file);
			pausePlayback();
			currentChannels = channels.map((channel) => Float32Array.from(channel));
			currentSampleRate = sampleRate;
			playheadSample = 0;
			playheadInitialized = false;
			waveformPlot.setData(currentChannels, sampleRate);
			const mono = mixMultichannelToMono(channels);
			spectrogramPlot.setData(mono, sampleRate);
			updatePlayheadVisual();
		} catch (error) {
			console.error(error);
			window.alert(error instanceof Error ? error.message : "Unable to open that file.");
		}
	});

	window.addEventListener("click", (event) => {
		if (event.target instanceof Node && !contextMenu.contains(event.target)) {
			hideContextMenu();
		}
	});

	window.addEventListener("blur", hideContextMenu);
	window.addEventListener("beforeunload", () => {
		pausePlayback();
		if (playbackAudioContext) {
			void playbackAudioContext.close();
			playbackAudioContext = null;
		}
	});

	document.addEventListener("keydown", (event) => {
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
	});

	const contextMenuTarget = document.querySelector(".window");
	if (contextMenuTarget instanceof HTMLElement) {
		contextMenuTarget.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			showContextMenu(event.clientX, event.clientY);
		});
	}

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
	playheadSample = 0;
	playheadInitialized = false;
	waveformPlot.setData(currentChannels, sampleRate);
	spectrogramPlot.setData(waveformSamples, sampleRate);
	updatePlayToggleButton();
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
	window.addEventListener("resize", () => {
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
	});
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", bootstrapWaveformPlot, { once: true });
} else {
	bootstrapWaveformPlot();
}
