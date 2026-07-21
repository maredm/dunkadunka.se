import { db, type MultichannelBuffer, type NumberArray } from "./signal";

type WaveformPlotAxes = {
	xAxis?: HTMLElement | null;
	yAxis?: HTMLElement | null;
};

type XAxisDisplayMode = "time" | "samples";

const lineColorOptions = [
    '#1F77B4', // steel blue
    '#2CA02C', // medium green
    '#D62728', // vermilion red
    '#9467BD', // muted purple
    '#8C564B', // warm brown
    '#E377C2', // soft magenta
    '#7F7F7F', // neutral gray
    '#BCBD22'  // olive chartreuse
];

export class WaveformPlot {
	private readonly canvas: HTMLCanvasElement;
	private readonly xAxis: HTMLElement | null;
	private readonly yAxis: HTMLElement | null;
	private samples: Float32Array[] = [new Float32Array(0)];
	private sampleRate = 48000;
	private visibleStartSample = 0;
	private visibleStopSample = 0;
	private visibleAmplitudeScale = 1;
	private xAxisDisplayMode: XAxisDisplayMode = "time";

	constructor(canvas: HTMLCanvasElement, axes: WaveformPlotAxes = {}) {
		this.canvas = canvas;
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

	rerenderPlotData(samples: NumberArray | MultichannelBuffer | null = null): void {
		if (samples !== null) {
			this.samples = this.normalizeSamples(samples);
		}

		const context = this.prepareCanvas();
		if (!context) {
			return;
		}

		const { ctx, width, height } = context;
		ctx.clearRect(0, 0, width, height);

		this.drawBackground(ctx, width, height);
		this.drawGrid(ctx, width, height);
		this.drawWaveform(ctx, width, height);
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

		return this.samples.reduce((minimum, channel) => Math.min(minimum, channel.length), this.samples[0].length);
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

		console.log(this.canvas.getBoundingClientRect().width, this.xAxis.getBoundingClientRect().width);

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

	private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, width, height);
	}

	private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		if (width <= 0 || height <= 0) {
			return;
		}

		const tickYs = this.getYAxisTicks(height).map(({ y }) => y);
		const tickXs = this.getXAxisTicks(width).map(({ x }) => x);

		ctx.save();
		ctx.strokeStyle = "rgba(181, 192, 224, 0.22)";
		ctx.lineWidth = 1;
		for (const y of tickYs) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}
		for (const x of tickXs) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}
		ctx.restore();
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

	private drawWaveform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		if (width <= 0 || height <= 0) {
			return;
		}

		const centerY = height / 2;
		const amplitude = Math.max(1, height * 0.42 * this.visibleAmplitudeScale);
		const sampleCount = this.getSampleCount();
		const channelCount = this.samples.length;
		const { startSample, stopSample } = this.getVisibleSampleWindow();
		const { startSeconds, stopSeconds } = this.getVisibleWindowSeconds();
		const visibleSampleCount = Math.max(0, stopSample - startSample);

		const useInterpolation = visibleSampleCount > 0 && visibleSampleCount < 2000;
		if (sampleCount === 0 || width <= 1 || visibleSampleCount <= 0) {
			ctx.save();
			ctx.strokeStyle = lineColorOptions[0];
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.lineTo(width, centerY);
			ctx.stroke();
			ctx.restore();
			return;
		}

		for (let channelIndex = channelCount - 1; channelIndex >= 0; channelIndex -= 1) {
			const channel = this.samples[channelIndex];
			if (!channel || channel.length === 0) {
				continue;
			}

			const lineColor = lineColorOptions[channelIndex % lineColorOptions.length];
			ctx.save();
			ctx.strokeStyle = lineColor;
			ctx.fillStyle = lineColor;
			ctx.lineWidth = 1;
			ctx.beginPath();

			if (channelCount === 1 && visibleSampleCount < 2000) {
				this.drawSampleMarkers(ctx, channel, startSeconds, stopSeconds, centerY, amplitude, lineColor);
			}

			if (useInterpolation) {
				const maxX = Math.max(1, width - 1);
				for (let x = 0; x < width; x += 1) {
					const samplePosition = startSample + (x / maxX) * (visibleSampleCount - 1);
					const sample = this.interpolateLanczosSample(samplePosition, channel);
					const normalized = Math.max(-1, Math.min(1, sample));
					const y = centerY - normalized * amplitude;

					if (x === 0) {
						ctx.moveTo(0, y);
					}
					ctx.lineTo(x, y);
				}
				ctx.stroke();
				ctx.beginPath();
			} else {
				const samplesPerPixel = visibleSampleCount / width;
				if (samplesPerPixel > 10) {
					const envelopePoints: Array<{ x: number; yMax: number; yMin: number }> = [];
					for (let x = 0; x < width; x += 1) {
						const blockStart = Math.floor(startSample + (x * visibleSampleCount) / width);
						const blockEnd = Math.max(blockStart + 1, Math.floor(startSample + ((x + 1) * visibleSampleCount) / width));
						let blockMax = -Infinity;
						let blockMin = Infinity;
						for (let sampleIndex = blockStart; sampleIndex < blockEnd; sampleIndex += 1) {
							const sample = channel[sampleIndex] ?? 0;
							blockMax = Math.max(blockMax, sample);
							blockMin = Math.min(blockMin, sample);
						}
						envelopePoints.push({
							x,
							yMax: centerY - (Math.max(-1, Math.min(1, blockMax === -Infinity ? 0 : blockMax)) * amplitude),
							yMin: centerY - (Math.max(-1, Math.min(1, blockMin === Infinity ? 0 : blockMin)) * amplitude),
						});
					}
					if (envelopePoints.length > 0) {
						ctx.beginPath();
						ctx.moveTo(envelopePoints[0].x, envelopePoints[0].yMax);
						for (let index = 1; index < envelopePoints.length; index += 1) {
							ctx.lineTo(envelopePoints[index].x, envelopePoints[index].yMax);
						}
						for (let index = envelopePoints.length - 1; index >= 0; index -= 1) {
							ctx.lineTo(envelopePoints[index].x, envelopePoints[index].yMin);
						}
						ctx.closePath();
						ctx.fill();
						ctx.stroke();
					}
				} else {
					const lastIndex = startSample + visibleSampleCount - 1;
					const maxX = width - 1;
					for (let x = 0; x < width; x += 0.01) {
						const sampleIndex = Math.round(startSample + (x / maxX) * (lastIndex - startSample));
						const sample = channel[sampleIndex] ?? 0;
						const normalized = Math.max(-1, Math.min(1, sample));
						const y = centerY - normalized * amplitude;
						ctx.lineTo(x, y);
					}
				}
				ctx.stroke();
			}

			ctx.restore();
		}
	}

	private drawSampleMarkers(ctx: CanvasRenderingContext2D, channel: Float32Array, startSeconds: number, stopSeconds: number, centerY: number, amplitude: number, lineColor: string): void {
		// TODO: FIX THIS FUNCTION SO THAT IT DOES START DRAWING AT x = 0, even if the sample is not at 0 (due to rounding). Right now, it will skip the first sample if it is not at 0, which is not correct.
		// Round seconds to nearest sample boundary

		const canvasWidth = Math.max(0, this.canvas.getBoundingClientRect().width - 1);
		const timeSpan = stopSeconds - startSeconds;
		
		const roundedStartSeconds = Math.round(startSeconds * this.sampleRate) / this.sampleRate;
		const startSample = Math.max(0, Math.floor(roundedStartSeconds * this.sampleRate));
		const visibleSampleCount = Math.max(0, timeSpan * this.sampleRate);

		const markerRadius = Math.max(1.0, Math.min(4, 4 - Math.max(visibleSampleCount / 40, 0)));

		const maxX = Math.max(1, canvasWidth);
		const roundingOffset = startSeconds * this.sampleRate - startSample;
		const sampleSpacing = visibleSampleCount > 1 ? (maxX / (visibleSampleCount - 1)) : 0;

		ctx.save();
		ctx.fillStyle = lineColor;
		
		for (let i = 0; i < visibleSampleCount; i += 1) {
			// Map sample index position to x coordinate using same logic as waveform drawing
			const sample = channel[startSample + i] ?? 0;

			const x = (i - roundingOffset) * sampleSpacing;
			const normalized = Math.max(-1, Math.min(1, sample));
			const y = centerY - normalized * amplitude;

			ctx.beginPath();
			ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	private interpolateLanczosSample(samplePosition: number, channel: Float32Array): number {
		if (channel.length === 0) {
			return 0;
		}

		const a = 3; // Lanczos kernel parameter
		const startIndex = Math.max(0, Math.floor(samplePosition - a));
		const endIndex = Math.min(channel.length - 1, Math.ceil(samplePosition + a));
		let sum = 0;
		let normalization = 0;

		for (let sampleIndex = startIndex; sampleIndex <= endIndex; sampleIndex += 1) {
			const distance = samplePosition - sampleIndex;
			const weight = this.lanczosKernel(distance, a);
			if (weight === 0) {
				continue;
			}

			sum += (channel[sampleIndex] ?? 0) * weight;
			normalization += weight;
		}

		if (normalization === 0) {
			return channel[Math.max(0, Math.min(channel.length - 1, Math.round(samplePosition)))] ?? 0;
		}

		return sum / normalization;
	}

	private lanczosKernel(x: number, a: number): number {
		if (x === 0) {
			return 1;
		}

		if (Math.abs(x) >= a) {
			return 0;
		}

		return this.sinc(x) * this.sinc(x / a);
	}

	private sinc(x: number): number {
		if (x === 0) {
			return 1;
		}

		const value = Math.PI * x;
		return Math.sin(value) / value;
	}

	private prepareCanvas(): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
		const rect = this.canvas.getBoundingClientRect();
		console.log(this.canvas.getBoundingClientRect().width, this.canvas.getBoundingClientRect().height);
		const width = Math.max(1, Math.floor(rect.width || 0));
		const height = Math.max(1, Math.floor(rect.height || 0));
		const devicePixelRatio = 1;

		console.log(this.canvas.getBoundingClientRect().width, this.xAxis?.getBoundingClientRect().width);

		this.canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
		this.canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

		const context = this.canvas.getContext("2d");
		if (!context) {
			return null;
		}

		context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
		return { ctx: context, width, height };
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

	private getTotalDurationSeconds(): number {
		const sampleCount = this.getSampleCount();
		return sampleCount > 0 && this.sampleRate > 0
			? sampleCount / this.sampleRate
			: 0;
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