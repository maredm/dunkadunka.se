import Plotly from "plotly.js-dist-min";
import { fft } from "./fft";
import type { NumberArray } from "./signal";
import { waveformColormap } from "./waveform-colormap";

type SpectrogramPlotAxes = {
	xAxis?: HTMLElement | null;
	yAxis?: HTMLElement | null;
};

const DEFAULT_SPECTROGRAM_WINDOW_SIZE = 2048;
const MIN_SPECTROGRAM_WINDOW_SIZE = 256;
const MAX_SPECTROGRAM_WINDOW_SIZE = 8192;
const SPECTROGRAM_DYNAMIC_RANGE_DB = 80;
const SPECTROGRAM_SCALE_STEPS = 20;
const SPECTROGRAM_MAX_SCALE_STEP = SPECTROGRAM_SCALE_STEPS - 1;
const SPECTROGRAM_TICKS_BY_STEP: number[][] = [
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000],
	[0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 16000, 20000, 24000],
	[0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 16000, 20000, 24000],
	[0, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
	[0, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
	[0, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
	[0, 20, 50, 100, 200, 500, 1000, 2000, 5000, 8000, 10000, 16000, 20000, 24000],
];

const PLOTLY_CONFIG = {
	responsive: true,
	displayModeBar: false,
	staticPlot: true,
};

export class SpectrogramPlot {
	private readonly canvas: HTMLCanvasElement;
	private readonly plotHost: HTMLDivElement;
	private readonly xAxis: HTMLElement | null;
	private readonly yAxis: HTMLElement | null;
	private readonly zoomOverlay: HTMLDivElement | null;
	private samples: Float32Array = new Float32Array(0);
	private sampleRate = 48000;
	private visibleStartSample = 0;
	private visibleStopSample = 0;
	private frequencyScaleStep = SPECTROGRAM_MAX_SCALE_STEP;
	private windowSize = DEFAULT_SPECTROGRAM_WINDOW_SIZE;
	private wheelRenderTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(canvas: HTMLCanvasElement, axes: SpectrogramPlotAxes = {}) {
		this.canvas = canvas;
		this.plotHost = this.createPlotHost(canvas);
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

	setFrequencyScaleStep(step: number): void {
		const clampedStep = Math.max(0, Math.min(SPECTROGRAM_MAX_SCALE_STEP, Math.round(step)));
		if (clampedStep === this.frequencyScaleStep) {
			return;
		}

		this.frequencyScaleStep = clampedStep;
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	setWindowSize(windowSize: number): void {
		if (!Number.isFinite(windowSize)) {
			return;
		}

		const clamped = Math.max(
			MIN_SPECTROGRAM_WINDOW_SIZE,
			Math.min(MAX_SPECTROGRAM_WINDOW_SIZE, Math.round(windowSize)),
		);
		const powerOfTwo = 2 ** Math.round(Math.log2(clamped));
		const nextWindowSize = Math.max(MIN_SPECTROGRAM_WINDOW_SIZE, Math.min(MAX_SPECTROGRAM_WINDOW_SIZE, powerOfTwo));
		if (nextWindowSize === this.windowSize) {
			return;
		}

		this.windowSize = nextWindowSize;
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	getWindowSize(): number {
		return this.windowSize;
	}

	getFrequencyScaleStep(): number {
		return this.frequencyScaleStep;
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

		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSampleCount = Math.max(0, stopSample - startSample);
		const axisHeight = Math.max(1, Math.floor(this.canvas.getBoundingClientRect().height || 1));
		const axisWidth = Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || 1));
		const { startSeconds, stopSeconds } = this.getVisibleWindowSeconds();

		if (visibleSampleCount <= 1 || this.samples.length === 0 || this.sampleRate <= 0) {
			void Plotly.react(this.plotHost, [], {
				paper_bgcolor: "#000000",
				plot_bgcolor: "#000000",
				margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
				xaxis: { visible: false },
				yaxis: { visible: false },
			}, PLOTLY_CONFIG);
			this.setZoomOverlayVisible(false);
			return;
		}

		const renderWidth = Math.max(64, Math.min(axisWidth, 1024));
		const renderHeight = Math.max(64, Math.min(axisHeight, 512));
		const magnitudesByColumn = this.buildMagnitudeColumns(renderWidth, startSample, visibleSampleCount);
		let globalMaxDb = -Infinity;
		let globalMinDb = Infinity;

		for (const column of magnitudesByColumn) {
			for (let bin = 0; bin < column.length; bin += 1) {
				const dbValue = 20 * Math.log10((column[bin] ?? 0) + 1e-12);
				globalMaxDb = Math.max(globalMaxDb, dbValue);
				globalMinDb = Math.min(globalMinDb, dbValue);
			}
		}

		if (!Number.isFinite(globalMaxDb)) {
			this.setZoomOverlayVisible(false);
			return;
		}

		if (!Number.isFinite(globalMinDb)) {
			globalMinDb = globalMaxDb - SPECTROGRAM_DYNAMIC_RANGE_DB;
		}

		if (globalMaxDb - globalMinDb > SPECTROGRAM_DYNAMIC_RANGE_DB) {
			globalMinDb = globalMaxDb - SPECTROGRAM_DYNAMIC_RANGE_DB;
		}

		const dbSpan = Math.max(1e-12, globalMaxDb - globalMinDb);
		const binCount = this.getMagnitudeBinCount();
		const z: number[][] = new Array(renderHeight);
		const yRows: number[] = new Array(renderHeight);

		for (let row = 0; row < renderHeight; row += 1) {
			const rowValues = new Array<number>(renderWidth);
			const rowIndexFromBottom = renderHeight - 1 - row;
			const { startBin, endBin } = this.getFrequencyBinRange(rowIndexFromBottom, renderHeight, binCount);
			yRows[row] = row;

			for (let x = 0; x < renderWidth; x += 1) {
				const magnitudes = magnitudesByColumn[x] ?? new Float32Array(binCount);
				let totalDb = 0;
				let sampleCount = 0;
				for (let bin = startBin; bin <= endBin; bin += 1) {
					const dbValue = 20 * Math.log10((magnitudes[bin] ?? 0) + 1e-12);
					totalDb += dbValue;
					sampleCount += 1;
				}

				const dbValue = totalDb / Math.max(1, sampleCount);
				const clampedDb = Math.max(globalMinDb, Math.min(globalMaxDb, dbValue));
				rowValues[x] = Math.max(0, Math.min(1, (clampedDb - globalMinDb) / dbSpan));
			}

			z[row] = rowValues;
		}

		const xTimes: number[] = new Array(renderWidth);
		const secondsSpan = Math.max(1 / Math.max(1, this.sampleRate), stopSeconds - startSeconds);
		for (let index = 0; index < renderWidth; index += 1) {
			xTimes[index] = startSeconds + ((index / Math.max(1, renderWidth - 1)) * secondsSpan);
		}

		const yTickValues = this.getFrequencyTickPositions(axisHeight).map(({ y }) => {
			if (axisHeight <= 1) {
				return 0;
			}
			return (y / (axisHeight - 1)) * Math.max(1, renderHeight - 1);
		});

		void Plotly.react(
			this.plotHost,
			[
				{
					type: "heatmap",
					x: xTimes,
					y: yRows,
					z,
					zmin: 0,
					zmax: 1,
					colorscale: this.getPlotlyColorScale(),
					showscale: false,
					hoverinfo: "skip",
				},
			],
			{
				paper_bgcolor: "#000000",
				plot_bgcolor: "#000000",
				margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
				showlegend: false,
				xaxis: {
					range: [startSeconds, Math.max(startSeconds + (1 / Math.max(1, this.sampleRate)), stopSeconds)],
					showgrid: true,
					gridcolor: "rgba(181, 192, 224, 0.10)",
					zeroline: false,
					showline: false,
					fixedrange: true,
					showticklabels: false,
					ticks: "",
				},
				yaxis: {
					range: [0, Math.max(1, renderHeight - 1)],
					autorange: "reversed",
					showgrid: true,
					gridcolor: "rgba(181, 192, 224, 0.10)",
					zeroline: false,
					showline: false,
					fixedrange: true,
					showticklabels: false,
					ticks: "",
					tickvals: yTickValues,
				},
			},
			PLOTLY_CONFIG,
		);

		this.setZoomOverlayVisible(false);
	}

	private createPlotHost(canvas: HTMLCanvasElement): HTMLDivElement {
		const host = document.createElement("div");
		host.className = canvas.className;
		host.style.position = "absolute";
		host.style.inset = "0 auto 0 0";
		host.style.pointerEvents = "none";
		host.style.zIndex = "1";
		host.style.background = "#000";

		canvas.style.background = "transparent";
		canvas.style.position = "relative";
		canvas.style.zIndex = "2";

		canvas.parentElement?.append(host);
		return host;
	}

	private getPlotlyColorScale(): Array<[number, string]> {
		const scale: Array<[number, string]> = [];
		for (let index = 0; index < 256; index += 1) {
			const fraction = index / 255;
			scale.push([
				fraction,
				`rgb(${waveformColormap.r[index]}, ${waveformColormap.g[index]}, ${waveformColormap.b[index]})`,
			]);
		}
		return scale;
	}

	private buildMagnitudeColumns(width: number, startSample: number, visibleSampleCount: number): Float32Array[] {
		const halfWindow = this.windowSize / 2;
		const maxX = Math.max(1, width - 1);
		const window = this.createHannWindow(this.windowSize);
		const columns: Float32Array[] = new Array(width);

		for (let x = 0; x < width; x += 1) {
			const centerSample = Math.round(startSample + (x / maxX) * (visibleSampleCount - 1));
			const frame = new Array<number>(this.windowSize).fill(0);
			for (let i = 0; i < this.windowSize; i += 1) {
				const sampleIndex = centerSample + i - halfWindow;
				if (sampleIndex >= 0 && sampleIndex < this.samples.length) {
					frame[i] = (this.samples[sampleIndex] ?? 0) * window[i];
				}
			}

			const [real, imag] = fft(frame);
			const magnitudeBins = halfWindow;
			const magnitudes = new Float32Array(magnitudeBins);
			for (let bin = 0; bin < magnitudeBins; bin += 1) {
				magnitudes[bin] = Math.sqrt((real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2);
			}

			columns[x] = magnitudes;
		}

		return columns;
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

		for (const { value, y } of this.getFrequencyTickPositions(axisHeight)) {
			const tick = document.createElement("div");
			tick.className = "ytick";
			tick.style.top = `${Math.max(0, Math.min(axisHeight - 1, y)) - 0.5}px`;
			this.yAxis.append(tick);

			const labelTop = Math.max(-8, Math.min(axisHeight - tickLabelHeight, Math.round(y - tickLabelOffset))) + 1;
			if (labelTop < 0 || labelTop + tickLabelHeight > axisHeight) {
				continue;
			}

			const label = document.createElement("div");
			label.textContent = this.formatFrequency(value);
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

	private getFrequencyTickPositions(axisHeight: number): Array<{ value: number; y: number }> {
		if (axisHeight <= 0 || this.sampleRate <= 0) {
			return [];
		}

		const tickValues = SPECTROGRAM_TICKS_BY_STEP[Math.max(0, Math.min(SPECTROGRAM_MAX_SCALE_STEP, this.frequencyScaleStep))] ?? SPECTROGRAM_TICKS_BY_STEP[0];
		const positions: Array<{ value: number; y: number }> = [];
		for (const value of tickValues) {
			const y = this.frequencyToY(value, axisHeight);
			if (positions.length > 0 && Math.abs(y - positions[positions.length - 1]!.y) < 10) {
				continue;
			}
			positions.push({ value, y });
		}

		return positions;
	}

	private frequencyToY(frequencyHz: number, axisHeight: number): number {
		const nyquist = this.sampleRate / 2;
		if (axisHeight <= 1 || nyquist <= 0) {
			return 0;
		}

		const targetBin = Math.max(0, Math.min(this.getMagnitudeBinCount() - 1, Math.round((frequencyHz / nyquist) * (this.getMagnitudeBinCount() - 1))));
		for (let rowIndexFromBottom = 0; rowIndexFromBottom < axisHeight; rowIndexFromBottom += 1) {
			const { startBin, endBin } = this.getFrequencyBinRange(rowIndexFromBottom, axisHeight, this.getMagnitudeBinCount());
			if (targetBin >= startBin && targetBin <= endBin) {
				return axisHeight - 1 - rowIndexFromBottom;
			}
		}

		return 0;
	}

	private getMagnitudeBinCount(): number {
		return this.windowSize / 2;
	}

	private getFrequencyBinRange(rowIndexFromBottom: number, axisHeight: number, binCount: number): { startBin: number; endBin: number } {
		const scaleFraction = this.frequencyScaleStep / SPECTROGRAM_MAX_SCALE_STEP;
		const normalizedStart = rowIndexFromBottom / Math.max(1, axisHeight);
		const normalizedEnd = (rowIndexFromBottom + 1) / Math.max(1, axisHeight);

		const linearStart = normalizedStart * binCount;
		const linearEnd = normalizedEnd * binCount;
		const logStart = Math.max(0, Math.pow(binCount, normalizedStart) - 1);
		const logEnd = Math.max(0, Math.pow(binCount, normalizedEnd) - 1);

		let startBin = Math.round((linearStart * (1 - scaleFraction)) + (logStart * scaleFraction));
		let endBin = Math.round((linearEnd * (1 - scaleFraction)) + (logEnd * scaleFraction));

		startBin = Math.max(0, Math.min(binCount - 1, startBin));
		endBin = Math.max(0, Math.min(binCount - 1, endBin));
		if (endBin < startBin) {
			endBin = startBin;
		}

		return { startBin, endBin };
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

	private formatFrequency(valueHz: number): string {
		if (valueHz >= 1000) {
			return `${Math.round(valueHz / 1000)} kHz`;
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
		const minimumVisibleSamples = this.windowSize;
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