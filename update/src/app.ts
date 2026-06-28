/// <reference path="./plotly.d.ts" />

import "./styles.css";
import { play, record, playAndRecord } from "./audio_io";
import { calculateTwoChannelImpulseResponse, estimateDelay, type NumberArray, type StereoBuffer, chirp, normalizeToRMS } from "./signal";
import { downloadStereoWav } from "./wavfile";
import { WaveformPlot } from "./waveform-plot";
import { SpectrogramPlot } from "./spectrogram-plot";

const bootstrapWaveformPlot = (): void => {
	const canvas = document.getElementById("waveformCanvas");
	const spectrogramCanvas = document.getElementById("spectrogramCanvas");
	const xAxis = document.querySelector(".waveform-x-axis");
	const yAxis = document.querySelector(".waveform-y-axis");
	const spectrogramYAxis = document.querySelector(".spectrogram-y-axis");

	if (
		!(canvas instanceof HTMLCanvasElement)
		|| !(spectrogramCanvas instanceof HTMLCanvasElement)
		|| !(xAxis instanceof HTMLElement)
		|| !(yAxis instanceof HTMLElement)
		|| !(spectrogramYAxis instanceof HTMLElement)
	) {
		return;
	}

	const waveformPlot = new WaveformPlot(canvas, { xAxis, yAxis });
	const spectrogramPlot = new SpectrogramPlot(spectrogramCanvas, { yAxis: spectrogramYAxis });
	const sampleRate = 48000;
	const [chirpSamples] = chirp(40, 12000, 1.25, null, 0.02, sampleRate);
	const waveformSamples = normalizeToRMS(chirpSamples);
	waveformPlot.setData(waveformSamples, sampleRate);
	spectrogramPlot.setData(waveformSamples, sampleRate);

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

		const pointerFraction = getPointerFraction(event, target);
		if (Math.abs(deltaY) > 0) {
			waveformPlot.applyWheelZoom(pointerFraction, deltaY);
			spectrogramPlot.applyWheelZoom(pointerFraction, deltaY);
		}

		if (Math.abs(deltaX) > 0) {
			const rect = target.getBoundingClientRect();
			const width = Math.max(1, rect.width || 0);
			const panFraction = (deltaX / width) * 0.5;
			waveformPlot.panByFraction(panFraction);
			spectrogramPlot.panByFraction(panFraction, true);
		}
	};

	canvas.addEventListener("wheel", (event) => {
		handleSharedWheel(event, canvas);
	}, { passive: false });

	spectrogramCanvas.addEventListener("wheel", (event) => {
		handleSharedWheel(event, spectrogramCanvas);
	}, { passive: false });

	let resizeAnimation: number | null = null;
	let resizeDoneTimer: any;

	const startResizeAnimation = (callback: () => void): void => {
		resizeAnimation = requestAnimationFrame(() => {
			callback();
		});
	}

	const stopResizeAnimation = (): void => {
		if (resizeAnimation !== null) {
			cancelAnimationFrame(resizeAnimation);
			resizeAnimation = null;
		}
	}
	window.addEventListener("resize", () => {
		if (!resizeAnimation) startResizeAnimation(() => {
			waveformPlot.rerenderPlotData();
			spectrogramPlot.rerenderPlotData();
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
