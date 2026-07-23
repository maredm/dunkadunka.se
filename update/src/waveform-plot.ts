import Plotly from "plotly.js-dist-min";
import { db, type MultichannelBuffer, type NumberArray } from "./signal";

type WaveformPlotAxes = {
	xAxis?: HTMLElement | null;
	yAxis?: HTMLElement | null;
};

type XAxisDisplayMode = "time" | "samples";

const lineColorOptions = [
	"#1F77B4",
	"#2CA02C",
	"#D62728",
	"#9467BD",
	"#8C564B",
	"#E377C2",
	"#7F7F7F",
	"#BCBD22",
];

export function getWaveformLineColor(channelIndex: number): string {
	if (!Number.isFinite(channelIndex)) {
		return lineColorOptions[0];
	}
	const index = Math.max(0, Math.floor(channelIndex));
	return lineColorOptions[index % lineColorOptions.length];
}

const PLOTLY_CONFIG = {
	responsive: true,
	displayModeBar: false,
	staticPlot: true,
};

export class WaveformPlot {
	private readonly canvas: HTMLCanvasElement;
	private readonly plotHost: HTMLDivElement;
	private readonly xAxis: HTMLElement | null;
	private readonly yAxis: HTMLElement | null;
	private samples: Float32Array[] = [new Float32Array(0)];
	private sampleRate = 48000;
	private visibleStartSample = 0;
	private visibleStopSample = 0;
	private visibleAmplitudeScale = 1;
	private xAxisDisplayMode: XAxisDisplayMode = "time";
	private channelDrawOrder: number[] = [];

	constructor(canvas: HTMLCanvasElement, axes: WaveformPlotAxes = {}) {
		this.canvas = canvas;
		this.plotHost = this.createPlotHost(canvas);
		this.xAxis = axes.xAxis ?? null;
		this.yAxis = axes.yAxis ?? null;
		this.yAxis?.addEventListener("wheel", this.handleYAxisWheel, { passive: false });
		this.canvas.addEventListener("dblclick", this.handleResetZoom);
		this.yAxis?.addEventListener("dblclick", this.handleResetZoom);
	}

	setData(samples: NumberArray | MultichannelBuffer, sampleRate = this.sampleRate): void {
		this.samples = this.normalizeSamples(samples);
		this.sampleRate = sampleRate;
		this.resetZoom();
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	zoom(startSeconds: number, stopSeconds: number): void {
		if (!Number.isFinite(startSeconds) || !Number.isFinite(stopSeconds) || this.getSampleCount() === 0 || this.sampleRate <= 0) {
			this.resetZoom();
			return;
		}

		const sampleCount = this.getSampleCount();
		const startSample = Math.max(0, Math.min(sampleCount, Math.min(startSeconds, stopSeconds) * this.sampleRate));
		const stopSample = Math.max(startSample + 1, Math.min(sampleCount, Math.max(startSeconds, stopSeconds) * this.sampleRate));
		this.setVisibleWindowSamples(startSample, stopSample);
	}

	zoomY(startValue: number, stopValue: number): void {
		if (!Number.isFinite(startValue) || !Number.isFinite(stopValue)) {
			this.resetZoom();
			return;
		}

		const halfRange = Math.max(Math.abs(startValue), Math.abs(stopValue));
		if (halfRange <= 0) {
			this.resetZoom();
			return;
		}

		this.visibleAmplitudeScale = Math.max(0.00001, Math.min(2 ** 16, 1 / halfRange));
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	rerenderAxis(): void {
		this.renderYAxis();
		this.renderXAxis();
	}

	setXAxisDisplayMode(mode: XAxisDisplayMode): void {
		this.xAxisDisplayMode = mode;
		this.renderXAxis();
	}

	setChannelDrawOrder(channelIndices: number[]): void {
		const nextOrder: number[] = [];
		const seen = new Set<number>();
		for (const channelIndex of channelIndices) {
			if (!Number.isInteger(channelIndex) || channelIndex < 0 || seen.has(channelIndex)) {
				continue;
			}
			seen.add(channelIndex);
			nextOrder.push(channelIndex);
		}
		this.channelDrawOrder = nextOrder;
	}

	rerenderPlotData(samples: NumberArray | MultichannelBuffer | null = null): void {
		if (samples !== null) {
			this.samples = this.normalizeSamples(samples);
		}

		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSampleCount = Math.max(0, stopSample - startSample);
		const { startSeconds, stopSeconds } = this.getVisibleWindowSeconds();
		const halfRange = 1 / this.visibleAmplitudeScale;
		const axisHeight = Math.max(1, Math.floor(this.canvas.getBoundingClientRect().height || 1));
		const axisWidth = Math.max(1, Math.floor(this.canvas.getBoundingClientRect().width || 1));

		const traces: any[] = [];
		const channelCount = this.samples.length;
		const visibleChannelIndices: number[] = [];
		for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
			const channel = this.samples[channelIndex];
			if (channel && channel.length > 0) {
				visibleChannelIndices.push(channelIndex);
			}
		}

		const preferredOrder = this.channelDrawOrder.filter((channelIndex) => {
			return channelIndex >= 0 && channelIndex < channelCount && (this.samples[channelIndex]?.length ?? 0) > 0;
		});
		const missingOrder = visibleChannelIndices.filter((channelIndex) => !preferredOrder.includes(channelIndex));
		const renderOrder = preferredOrder.length > 0
			? [...missingOrder, ...preferredOrder]
			: [...visibleChannelIndices].sort((left, right) => right - left);

		if (visibleSampleCount > 0 && this.sampleRate > 0) {
			const maxPoints = Math.max(256, Math.min(6000, axisWidth * 2));
			const samplesPerPixel = visibleSampleCount / Math.max(1, axisWidth);
			for (const channelIndex of renderOrder) {
				const channel = this.samples[channelIndex];
				if (!channel || channel.length === 0) {
					continue;
				}

				const lineColor = getWaveformLineColor(channelIndex);
				const shouldHighlightSamples = visibleSampleCount < 2000;
				if (samplesPerPixel > 10) {
					const [upperTrace, lowerTrace] = this.createEnvelopeTraces(
						channel,
						startSample,
						visibleSampleCount,
						axisWidth,
						lineColor,
					);
					traces.push(upperTrace, lowerTrace);
					continue;
				}

				const x: number[] = [];
				const y: number[] = [];
				const markerX: number[] = [];
				const markerY: number[] = [];
				const pointCount = shouldHighlightSamples
					? visibleSampleCount
					: Math.max(1, Math.min(maxPoints, visibleSampleCount));
				const step = visibleSampleCount / pointCount;

				for (let i = 0; i < pointCount; i += 1) {
					const sampleIndex = Math.max(
						0,
						Math.min(channel.length - 1, Math.round(startSample + (i * step))),
					);
					const timeSeconds = sampleIndex / this.sampleRate;
					const value = Math.max(-1, Math.min(1, channel[sampleIndex] ?? 0));
					x.push(timeSeconds);
					y.push(value);
					if (shouldHighlightSamples) {
						markerX.push(timeSeconds);
						markerY.push(value);
					}
				}

				if (x.length > 0 && x[x.length - 1] < stopSeconds) {
					x.push(stopSeconds);
					y.push(Math.max(-1, Math.min(1, channel[Math.max(0, Math.min(channel.length - 1, stopSample - 1))] ?? 0)));
				}

				traces.push({
					type: "scattergl",
					mode: "lines",
					x,
					y,
					line: { color: lineColor, width: 1 },
					hoverinfo: "skip",
					showlegend: false,
				});

				if (shouldHighlightSamples && markerX.length > 0) {
					traces.push({
						type: "scatter",
						mode: "markers",
						x: markerX,
						y: markerY,
						marker: {
							size: Math.max(2, Math.min(8, 8 - (visibleSampleCount / 100))),
							color: lineColor,
							symbol: "circle",
							line: { width: 0 },
						},
						hoverinfo: "skip",
						showlegend: false,
					});
				}
			}
		}

		if (traces.length === 0) {
			traces.push({
				type: "scattergl",
				mode: "lines",
				x: [startSeconds, stopSeconds],
				y: [0, 0],
				line: { color: lineColorOptions[0], width: 1 },
				hoverinfo: "skip",
				showlegend: false,
			});
		}

		const yTickValues = this.getYAxisTicks(axisHeight).map(({ value }) => value);
		const xTickValues = this.getXAxisTicks(axisWidth).map(({ value }) => value);

		void Plotly.react(
			this.plotHost,
			traces,
			{
				paper_bgcolor: "#000000",
				plot_bgcolor: "#000000",
				margin: { l: 0, r: 0, t: 0, b: 0, pad: 0 },
				showlegend: false,
				xaxis: {
					range: [startSeconds, Math.max(startSeconds + (1 / Math.max(1, this.sampleRate)), stopSeconds)],
					showgrid: true,
					gridcolor: "rgba(181, 192, 224, 0.22)",
					zeroline: false,
					showline: false,
					fixedrange: true,
					showticklabels: false,
					ticks: "",
					tickvals: xTickValues,
				},
				yaxis: {
					range: [-halfRange, halfRange],
					showgrid: true,
					gridcolor: "rgba(181, 192, 224, 0.22)",
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
	}

	private createEnvelopeTraces(
		channel: Float32Array,
		startSample: number,
		visibleSampleCount: number,
		axisWidth: number,
		lineColor: string,
	): [any, any] {
		const pointCount = Math.max(2, Math.min(axisWidth, visibleSampleCount));
		const x: number[] = new Array(pointCount);
		const yMax: number[] = new Array(pointCount);
		const yMin: number[] = new Array(pointCount);

		for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
			const blockStart = Math.floor(startSample + ((pointIndex * visibleSampleCount) / pointCount));
			const blockEnd = Math.max(
				blockStart + 1,
				Math.floor(startSample + (((pointIndex + 1) * visibleSampleCount) / pointCount)),
			);

			let blockMax = -Infinity;
			let blockMin = Infinity;
			for (let sampleIndex = blockStart; sampleIndex < blockEnd; sampleIndex += 1) {
				const sample = Math.max(-1, Math.min(1, channel[sampleIndex] ?? 0));
				blockMax = Math.max(blockMax, sample);
				blockMin = Math.min(blockMin, sample);
			}

			const representativeSample = Math.max(
				0,
				Math.min(channel.length - 1, Math.floor((blockStart + blockEnd) * 0.5)),
			);
			x[pointIndex] = representativeSample / this.sampleRate;
			yMax[pointIndex] = blockMax === -Infinity ? 0 : blockMax;
			yMin[pointIndex] = blockMin === Infinity ? 0 : blockMin;
		}

		const upperTrace = {
			type: "scatter",
			mode: "lines",
			x,
			y: yMax,
			line: { color: lineColor, width: 0 },
			hoverinfo: "skip",
			showlegend: false,
		};

		const lowerTrace = {
			type: "scatter",
			mode: "lines",
			x,
			y: yMin,
			line: { color: lineColor, width: 0 },
			fill: "tonexty",
			fillcolor: this.colorWithAlpha(lineColor, 1),
			hoverinfo: "skip",
			showlegend: false,
		};

		return [upperTrace, lowerTrace];
	}

	private colorWithAlpha(hexColor: string, alpha: number): string {
		const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
		if (!match) {
			return hexColor;
		}
		const hex = match[1];
		const red = Number.parseInt(hex.slice(0, 2), 16);
		const green = Number.parseInt(hex.slice(2, 4), 16);
		const blue = Number.parseInt(hex.slice(4, 6), 16);
		return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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

	private normalizeSamples(samples: NumberArray | MultichannelBuffer): Float32Array[] {
		if (samples.length > 0 && ArrayBuffer.isView(samples[0])) {
			return (samples as MultichannelBuffer).map((channel) => Float32Array.from(channel));
		}

		return [Float32Array.from(samples as NumberArray)];
	}

	private getSampleCount(): number {
		if (this.samples.length === 0) {
			return 0;
		}

		const visibleChannels = this.samples.filter((channel) => channel.length > 0);
		if (visibleChannels.length === 0) {
			return 0;
		}

		return visibleChannels.reduce((minimum, channel) => Math.min(minimum, channel.length), visibleChannels[0].length);
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
		const ticks = this.getYAxisTicks(axisHeight);

		this.yAxis.replaceChildren();
		if (axisHeight < 10) {
			return;
		}

		for (const { value, y } of ticks) {
			const tick = document.createElement("div");
			tick.className = "ytick";
			tick.style.top = `${Math.max(0, Math.min(axisHeight - 1, Math.round(y))) - 0.5}px`;
			this.yAxis.append(tick);

			const labelTop = Math.max(-8, Math.min(axisHeight - tickLabelHeight, Math.round(y - tickLabelOffset))) + 1;
			if (labelTop < 0 || labelTop + tickLabelHeight > axisHeight) {
				continue;
			}

			const label = document.createElement("div");
			label.textContent = this.formatAmplitudeLabel(value);
			label.style.top = `${labelTop}px`;
			label.classList.add("tick-label");
			this.yAxis.append(label);
		}
	}

	private renderXAxis(): void {
		if (!this.xAxis) {
			return;
		}

		const axisWidth = Math.max(
			1,
			Math.floor(this.canvas.getBoundingClientRect().width || this.xAxis.getBoundingClientRect().width || 0),
		);
		const xTicks = this.getXAxisTicks(axisWidth);
		const { startSeconds, stopSeconds } = this.getVisibleWindowSeconds();
		const visibleSeconds = stopSeconds - startSeconds;

		this.xAxis.replaceChildren();
		this.xAxis.style.position = "relative";
		this.xAxis.style.overflow = "hidden";
		this.xAxis.style.display = "block";
		this.xAxis.style.width = `${axisWidth}px`;
		if (xTicks.length === 0) {
			const tick = document.createElement("div");
			tick.className = "xtick";
			tick.style.left = "0px";
			tick.style.top = "24px";
			this.xAxis.append(tick);
			return;
		}

		for (const { value, x } of xTicks) {
			const tick = document.createElement("div");
			tick.className = "xtick";
			tick.style.left = `${x}px`;
			tick.style.top = "24px";
			this.xAxis.append(tick);

			if (x <= 0 || x >= axisWidth) {
				continue;
			}

			const label = document.createElement("div");
			label.textContent = this.formatXAxisLabel(value, visibleSeconds);
			label.classList.add("tick-label");
			label.style.left = `${Math.min(x - 24, axisWidth - 48)}px`;
			label.style.top = "8px";
			label.style.width = "70px";
			this.xAxis.append(label);
		}
	}

	private getXAxisTicks(axisWidth: number): Array<{ value: number; x: number }> {
		const { startSeconds, stopSeconds } = this.getVisibleWindowSeconds();
		const visibleSeconds = stopSeconds - startSeconds;
		const candidates = [2 / 48000, 0.00002, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];

		if (visibleSeconds <= 0) {
			return [];
		}

		const interval = candidates.find((candidate) => {
			const lineCount = visibleSeconds / candidate;
			return lineCount >= 4 && lineCount <= 12;
		}) ?? candidates.reduce((best, candidate) => {
			const bestError = Math.abs((visibleSeconds / best) - 10);
			const candidateError = Math.abs((visibleSeconds / candidate) - 10);
			return candidateError < bestError ? candidate : best;
		});

		const ticks: Array<{ value: number; x: number }> = [];
		const firstTick = Math.ceil(startSeconds / interval) * interval;
		for (let value = firstTick; value <= stopSeconds + 1e-12; value += interval) {
			const frac = (value - startSeconds) / visibleSeconds;
			const x = Math.round(Math.max(0, Math.min(1, frac)) * Math.max(0, axisWidth - 1));
			ticks.push({ value, x });
		}

		return ticks;
	}

	private getYAxisTicks(displayHeight: number): Array<{ value: number; y: number }> {
		const centerY = displayHeight / 2;
		const ticks = [-4, -Math.SQRT2 * 2, -2, -Math.SQRT2, -1, -Math.SQRT1_2, -0.5, -Math.SQRT1_2 * 0.5, -0.25];
		for (let index = 0; index < 34; index += 1) {
			ticks.push(ticks[ticks.length - 1] / 2);
		}
		ticks.push(0);
		for (let index = ticks.length - 1; index > 0; index -= 1) {
			ticks.push(-ticks[index]);
		}

		return ticks
			.map((value) => ({
				value,
				y: centerY - value * this.visibleAmplitudeScale * centerY,
			}))
			.filter(({ value, y }) => y >= 0 && y <= displayHeight && (value === 0 || Math.abs(centerY - y) >= 20));
	}

	private formatAmplitudeLabel(value: number): string {
		if (value === 0) {
			return "-Inf dB";
		}

		return `${db(Math.abs(value)).toFixed(0)} dB`;
	}

	private formatXAxisLabel(value: number, visibleSeconds: number): string {
		if (this.xAxisDisplayMode === "samples") {
			return Math.round(value * this.sampleRate).toLocaleString("en-US");
		}

		return this.formatSeconds(value, visibleSeconds);
	}

	private formatSeconds(value: number, visibleSeconds: number): string {
		if (!Number.isFinite(value)) {
			return "0.0 s";
		}

		const showMillis = visibleSeconds < 10;
		const digits = Math.max(0, 1 - Math.floor(Math.log10(Math.max(visibleSeconds, 1e-12))));

		if (value >= 60) {
			const totalSeconds = Math.floor(value);
			const seconds = (totalSeconds % 60).toString().padStart(2, "0");
			const minutesTotal = Math.floor(totalSeconds / 60);
			const hours = Math.floor(minutesTotal / 60);
			const minutes = (minutesTotal % 60).toString().padStart(2, "0");
			if (showMillis) {
				const fraction = value - Math.floor(value);
				const milliseconds = Math.round(fraction * 10 ** digits).toString().padStart(digits, "0");
				return hours >= 1 ? `${hours}:${minutes}:${seconds}.${milliseconds}` : `${minutes}:${seconds}.${milliseconds}`;
			}
			return hours >= 1 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
		}

		if (value >= 1) {
			if (showMillis) {
				const seconds = Math.floor(value);
				const fraction = value - seconds;
				const milliseconds = Math.round(fraction * 10 ** digits).toString().padStart(digits, "0");
				return `${seconds}.${milliseconds} s`;
			}

			return `${Math.floor(value)} s`;
		}

		return `${Math.round(value * 1000)} ms`;
	}

	private resetZoom(): void {
		this.visibleStartSample = 0;
		this.visibleStopSample = this.getSampleCount();
		this.visibleAmplitudeScale = 1;
	}

	applyWheelZoom(pointerFraction: number, deltaY: number): void {
		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSamples = stopSample - startSample;
		if (visibleSamples <= 0 || this.getSampleCount() === 0 || this.sampleRate <= 0) {
			return;
		}

		const focusFraction = Math.max(0, Math.min(1, pointerFraction));
		const zoomFactor = Math.pow(1.003, deltaY);
		const minimumVisibleSamples = 1;
		const sampleCount = this.getSampleCount();
		const nextVisibleSamples = Math.max(minimumVisibleSamples, Math.min(sampleCount, visibleSamples * zoomFactor));
		const focalSample = startSample + (focusFraction * visibleSamples);

		let nextStartSample = focalSample - (focusFraction * nextVisibleSamples);
		let nextStopSample = nextStartSample + nextVisibleSamples;

		if (nextStartSample < 0) {
			nextStopSample -= nextStartSample;
			nextStartSample = 0;
		}

		if (nextStopSample > sampleCount) {
			const overshoot = nextStopSample - sampleCount;
			nextStartSample = Math.max(0, nextStartSample - overshoot);
			nextStopSample = sampleCount;
		}

		this.setVisibleWindowSamples(nextStartSample, nextStopSample);
	}

	panByFraction(panFraction: number): void {
		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const visibleSamples = stopSample - startSample;
		if (visibleSamples <= 0 || this.getSampleCount() === 0) {
			return;
		}

		const panSamples = panFraction * visibleSamples;
		let nextStartSample = startSample + panSamples;
		let nextStopSample = nextStartSample + visibleSamples;

		if (nextStartSample < 0) {
			nextStopSample -= nextStartSample;
			nextStartSample = 0;
		}

		const sampleCount = this.getSampleCount();
		if (nextStopSample > sampleCount) {
			const overshoot = nextStopSample - sampleCount;
			nextStartSample = Math.max(0, nextStartSample - overshoot);
			nextStopSample = sampleCount;
		}

		this.setVisibleWindowSamples(nextStartSample, nextStopSample);
	}

	private readonly handleYAxisWheel = (event: WheelEvent): void => {
		event.preventDefault();

		const nextScale = Math.max(0.00001, Math.min(2 ** 16, this.visibleAmplitudeScale * Math.pow(1.003, -event.deltaY)));
		const nextHalfRange = 1 / nextScale;
		this.zoomY(-nextHalfRange, nextHalfRange);
	};

	private readonly handleResetZoom = (): void => {
		this.resetZoom();
		this.rerenderAxis();
		this.rerenderPlotData();
	};

	private setVisibleWindowSamples(startSample: number, stopSample: number): void {
		const sampleCount = this.getSampleCount();
		if (sampleCount === 0 || this.sampleRate <= 0) {
			this.resetZoom();
			this.rerenderAxis();
			this.rerenderPlotData();
			return;
		}

		const clampedStart = Math.max(0, Math.min(sampleCount, startSample));
		const clampedStop = Math.max(clampedStart + 1, Math.min(sampleCount, stopSample));
		this.visibleStartSample = clampedStart;
		this.visibleStopSample = clampedStop;
		this.rerenderAxis();
		this.rerenderPlotData();
	}

	getVisibleWindowSeconds(): { startSeconds: number; stopSeconds: number } {
		const sampleCount = this.getSampleCount();
		if (sampleCount === 0 || this.sampleRate <= 0) {
			return { startSeconds: 0, stopSeconds: 0 };
		}

		const startSeconds = Math.max(0, Math.min(sampleCount / this.sampleRate, this.visibleStartSample / this.sampleRate));
		const stopSeconds = Math.max(startSeconds + (1 / this.sampleRate), Math.min(sampleCount / this.sampleRate, this.visibleStopSample / this.sampleRate));

		return { startSeconds, stopSeconds };
	}

	private getVisibleSampleWindow(): { startSample: number; stopSample: number } {
		const sampleCount = this.getSampleCount();
		if (sampleCount === 0 || this.sampleRate <= 0) {
			return { startSample: 0, stopSample: 0 };
		}

		return {
			startSample: Math.max(0, Math.min(sampleCount, this.visibleStartSample)),
			stopSample: Math.max(0, Math.min(sampleCount, this.visibleStopSample)),
		};
	}
}