import { fft } from "./fft";
import type { NumberArray } from "./signal";
import { waveformColormap } from "./waveform-colormap";

type SpectrogramPlotAxes = {
	xAxis?: HTMLElement | null;
	yAxis?: HTMLElement | null;
};

const SPECTROGRAM_WINDOW_SIZE = 2048;
const SPECTROGRAM_MIN_DB = -100;
const SPECTROGRAM_MAX_DB = 0;

export class SpectrogramPlot {
	private readonly canvas: HTMLCanvasElement;
	private readonly xAxis: HTMLElement | null;
	private readonly yAxis: HTMLElement | null;
	private readonly zoomOverlay: HTMLDivElement | null;
	private samples: Float32Array = new Float32Array(0);
	private sampleRate = 48000;
	private visibleStartSample = 0;
	private visibleStopSample = 0;
	private wheelRenderTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(canvas: HTMLCanvasElement, axes: SpectrogramPlotAxes = {}) {
		this.canvas = canvas;
		this.xAxis = axes.xAxis ?? null;
		this.yAxis = axes.yAxis ?? null;
		this.zoomOverlay = this.createZoomOverlay();
		this.canvas.addEventListener("dblclick", this.handleResetZoom);
		this.yAxis?.addEventListener("dblclick", this.handleResetZoom);
	}

	setData(samples: NumberArray, sampleRate = this.sampleRate): void {
		this.samples = Float32Array.from(samples);
		this.sampleRate = sampleRate;
		this.resetZoom();
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	zoom(startSeconds: number, stopSeconds: number): void {
		if (!Number.isFinite(startSeconds) || !Number.isFinite(stopSeconds) || this.samples.length === 0 || this.sampleRate <= 0) {
			this.resetZoom();
			return;
		}

		const startSample = Math.max(0, Math.min(this.samples.length, Math.min(startSeconds, stopSeconds) * this.sampleRate));
		const stopSample = Math.max(startSample + 1, Math.min(this.samples.length, Math.max(startSeconds, stopSeconds) * this.sampleRate));
		this.setVisibleWindowSamples(startSample, stopSample);
	}

	rerenderAxis(): void {
		this.renderYAxis();
		this.renderXAxis();
	}

	rerenderPlotData(samples: NumberArray | null = null): void {
		if (samples !== null) {
			this.samples = Float32Array.from(samples);
		}

		const context = this.prepareCanvas();
		if (!context) {
			return;
		}

		const { ctx, width, height } = context;
		ctx.clearRect(0, 0, width, height);
		this.drawBackground(ctx, width, height);
		this.drawGrid(ctx, width, height);
		this.drawSpectrogram(ctx, width, height);
		this.setZoomOverlayVisible(false);
	}

	private createZoomOverlay(): HTMLDivElement | null {
		const parent = this.canvas.parentElement;
		if (!parent) {
			return null;
		}

		const overlay = document.createElement("div");
		overlay.className = "spectrogram-zoom-overlay";
		overlay.textContent = "zooming";
		overlay.setAttribute("aria-hidden", "true");
		parent.append(overlay);
		return overlay;
	}

	private setZoomOverlayVisible(visible: boolean): void {
		if (!this.zoomOverlay) {
			return;
		}
		this.zoomOverlay.classList.toggle("visible", visible);
	}

	private setZoomOverlayText(text: "zooming" | "scrolling"): void {
		if (!this.zoomOverlay) {
			return;
		}
		this.zoomOverlay.textContent = text;
	}

	private renderYAxis(): void {
		if (!this.yAxis) {
			return;
		}

		const tickLabelHeight = 12;
		const tickLabelOffset = 8;
		const axisHeight = Math.max(
			1,
			Math.floor(this.yAxis.getBoundingClientRect().height || this.canvas.getBoundingClientRect().height || 0),
		);

		this.yAxis.replaceChildren();
		if (axisHeight < 10 || this.sampleRate <= 0) {
			return;
		}

		const nyquist = this.sampleRate / 2;
		const divisions = 6;
		for (let index = 0; index <= divisions; index += 1) {
			const freqHz = (index / divisions) * nyquist;
			const y = Math.round(axisHeight - 1 - ((freqHz / nyquist) * (axisHeight - 1)));

			const tick = document.createElement("div");
			tick.className = "ytick";
			tick.style.top = `${Math.max(0, Math.min(axisHeight - 1, y)) - 0.5}px`;
			this.yAxis.append(tick);

			const labelTop = Math.max(-8, Math.min(axisHeight - tickLabelHeight, Math.round(y - tickLabelOffset))) + 1;
			if (labelTop < 0 || labelTop + tickLabelHeight > axisHeight) {
				continue;
			}

			const label = document.createElement("div");
			label.textContent = this.formatFrequency(freqHz);
			label.style.top = `${labelTop}px`;
			label.classList.add("tick-label");
			this.yAxis.append(label);
		}
	}

	private renderXAxis(): void {
		if (!this.xAxis) {
			return;
		}
	}

	private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, width, height);
	}

	private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		if (width <= 0 || height <= 0 || this.sampleRate <= 0) {
			return;
		}

		ctx.save();
		ctx.strokeStyle = "rgba(181, 192, 224, 0.08)";
		ctx.lineWidth = 1;

		const horizontalDivisions = 6;
		for (let index = 0; index <= horizontalDivisions; index += 1) {
			const y = Math.round((index / horizontalDivisions) * (height - 1));
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}

		const verticalDivisions = 8;
		for (let index = 0; index <= verticalDivisions; index += 1) {
			const x = Math.round((index / verticalDivisions) * (width - 1));
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}

		ctx.restore();
	}

	private drawSpectrogram(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		if (width <= 0 || height <= 0 || this.samples.length === 0 || this.sampleRate <= 0) {
			return;
		}

		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSampleCount = Math.max(0, stopSample - startSample);
		if (visibleSampleCount <= 1) {
			return;
		}

		const imageData = ctx.createImageData(width, height);
		const pixels = imageData.data;
		const halfWindow = SPECTROGRAM_WINDOW_SIZE / 2;
		const maxX = Math.max(1, width - 1);
		const window = this.createHannWindow(SPECTROGRAM_WINDOW_SIZE);
		const cmap = waveformColormap;

		for (let x = 0; x < width; x += 1) {
			const centerSample = Math.round(startSample + (x / maxX) * (visibleSampleCount - 1));
			const frame = new Array<number>(SPECTROGRAM_WINDOW_SIZE).fill(0);
			for (let i = 0; i < SPECTROGRAM_WINDOW_SIZE; i += 1) {
				const sampleIndex = centerSample + i - halfWindow;
				if (sampleIndex >= 0 && sampleIndex < this.samples.length) {
					frame[i] = (this.samples[sampleIndex] ?? 0) * window[i];
				}
			}

			const [real, imag] = fft(frame);
			const magnitudeBins = halfWindow;

			for (let y = 0; y < height; y += 1) {
				const freqFraction = 1 - (y / Math.max(1, height - 1));
				const bin = Math.max(0, Math.min(magnitudeBins - 1, Math.round(freqFraction * (magnitudeBins - 1))));
				const magnitude = Math.sqrt((real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2);
				const dbValue = 20 * Math.log10(magnitude + 1e-12);
				const normalized = Math.max(0, Math.min(1, (dbValue - SPECTROGRAM_MIN_DB) / (SPECTROGRAM_MAX_DB - SPECTROGRAM_MIN_DB)));

				const [r, g, b] = this.colorForNormalized(normalized, cmap);
				const pixelIndex = (y * width + x) * 4;
				pixels[pixelIndex] = r;
				pixels[pixelIndex + 1] = g;
				pixels[pixelIndex + 2] = b;
				pixels[pixelIndex + 3] = 255;
			}
		}

		ctx.putImageData(imageData, 0, 0);
	}

	private colorForNormalized(value: number, cmap: typeof waveformColormap): [number, number, number] {
		const idx = Math.max(0, Math.min(255, Math.round(value * 255)));
		return [cmap.r[idx], cmap.g[idx], cmap.b[idx]];
	}

	private createHannWindow(length: number): number[] {
		if (length <= 1) {
			return [1];
		}
		const output = new Array<number>(length);
		for (let index = 0; index < length; index += 1) {
			output[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (length - 1)));
		}
		return output;
	}

	private prepareCanvas(): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
		const rect = this.canvas.getBoundingClientRect();
		const width = Math.max(1, Math.floor(rect.width || 0));
		const height = Math.max(1, Math.floor(rect.height || 0));
		const devicePixelRatio = 1;

		this.canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
		this.canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

		const context = this.canvas.getContext("2d");
		if (!context) {
			return null;
		}

		context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
		return { ctx: context, width, height };
	}

	private formatFrequency(valueHz: number): string {
		if (valueHz >= 1000) {
			return `${(valueHz / 1000).toFixed(1)} kHz`;
		}
		return `${Math.round(valueHz)} Hz`;
	}

	private resetZoom(): void {
		this.visibleStartSample = 0;
		this.visibleStopSample = this.samples.length;
	}

	applyWheelZoom(pointerFraction: number, deltaY: number): void {
		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSamples = stopSample - startSample;
		if (visibleSamples <= 0 || this.samples.length === 0 || this.sampleRate <= 0) {
			return;
		}

		const focusFraction = Math.max(0, Math.min(1, pointerFraction));
		const zoomFactor = Math.pow(1.003, deltaY);
		const minimumVisibleSamples = SPECTROGRAM_WINDOW_SIZE;
		const nextVisibleSamples = Math.max(minimumVisibleSamples, Math.min(this.samples.length, visibleSamples * zoomFactor));
		const focalSample = startSample + (focusFraction * visibleSamples);

		let nextStartSample = focalSample - (focusFraction * nextVisibleSamples);
		let nextStopSample = nextStartSample + nextVisibleSamples;

		if (nextStartSample < 0) {
			nextStopSample -= nextStartSample;
			nextStartSample = 0;
		}

		if (nextStopSample > this.samples.length) {
			const overshoot = nextStopSample - this.samples.length;
			nextStartSample = Math.max(0, nextStartSample - overshoot);
			nextStopSample = this.samples.length;
		}

		this.setVisibleWindowSamples(nextStartSample, nextStopSample, false);
		this.scheduleWheelRender("zooming");
	}

	panByFraction(panFraction: number, deferRender = false): void {
		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSamples = stopSample - startSample;
		if (visibleSamples <= 0 || this.samples.length === 0) {
			return;
		}

		const panSamples = panFraction * visibleSamples;
		let nextStartSample = startSample + panSamples;
		let nextStopSample = nextStartSample + visibleSamples;

		if (nextStartSample < 0) {
			nextStopSample -= nextStartSample;
			nextStartSample = 0;
		}

		if (nextStopSample > this.samples.length) {
			const overshoot = nextStopSample - this.samples.length;
			nextStartSample = Math.max(0, nextStartSample - overshoot);
			nextStopSample = this.samples.length;
		}

		if (deferRender) {
			this.setVisibleWindowSamples(nextStartSample, nextStopSample, false);
			this.scheduleWheelRender("scrolling");
			return;
		}

		this.setVisibleWindowSamples(nextStartSample, nextStopSample);
	}

	private readonly handleResetZoom = (): void => {
		this.clearWheelRenderTimer();
		this.resetZoom();
		this.rerenderAxis();
		this.rerenderPlotData();
	};

	private setVisibleWindowSamples(startSample: number, stopSample: number, shouldRender = true): void {
		const sampleCount = this.samples.length;
		if (sampleCount === 0 || this.sampleRate <= 0) {
			this.resetZoom();
			this.rerenderAxis();
			if (shouldRender) {
				this.rerenderPlotData();
			}
			return;
		}

		const clampedStart = Math.max(0, Math.min(sampleCount, startSample));
		const clampedStop = Math.max(clampedStart + 1, Math.min(sampleCount, stopSample));
		this.visibleStartSample = clampedStart;
		this.visibleStopSample = clampedStop;
		this.rerenderAxis();
		if (shouldRender) {
			this.rerenderPlotData();
		}
	}

	private scheduleWheelRender(mode: "zooming" | "scrolling"): void {
		this.clearWheelRenderTimer();
		this.setZoomOverlayText(mode);
		this.setZoomOverlayVisible(true);
		this.wheelRenderTimer = setTimeout(() => {
			this.wheelRenderTimer = null;
			this.rerenderPlotData();
		}, 120);
	}

	private clearWheelRenderTimer(): void {
		if (this.wheelRenderTimer !== null) {
			clearTimeout(this.wheelRenderTimer);
			this.wheelRenderTimer = null;
		}
		this.setZoomOverlayVisible(false);
	}

	getVisibleWindowSeconds(): { startSeconds: number; stopSeconds: number } {
		if (this.samples.length === 0 || this.sampleRate <= 0) {
			return { startSeconds: 0, stopSeconds: 0 };
		}

		const startSeconds = Math.max(0, Math.min(this.samples.length / this.sampleRate, this.visibleStartSample / this.sampleRate));
		const stopSeconds = Math.max(startSeconds + (1 / this.sampleRate), Math.min(this.samples.length / this.sampleRate, this.visibleStopSample / this.sampleRate));

		return { startSeconds, stopSeconds };
	}

	private getVisibleSampleWindow(): { startSample: number; stopSample: number } {
		if (this.samples.length === 0 || this.sampleRate <= 0) {
			return { startSample: 0, stopSample: 0 };
		}

		return {
			startSample: Math.max(0, Math.min(this.samples.length, this.visibleStartSample)),
			stopSample: Math.max(0, Math.min(this.samples.length, this.visibleStopSample)),
		};
	}
}
