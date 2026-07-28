import Plotly from "plotly.js-dist-min";
import { fft, nextPow2 } from "./fft";
import { fractionalOctaveSmoothing, getFractionalOctaveFrequencies } from "./fractional_octave_smoothing";
import { calculateTwoChannelImpulseResponse } from "./signal";

export type MagnitudeResponse = {
	frequencies: Float32Array;
	valuesDb: Float32Array;
};

export type HarmonicCurve = {
	label: string;
	order: number;
	smoothed: MagnitudeResponse;
};

export type SeriesResponse = {
	frequencies: Float32Array;
	values: Float32Array;
};

const PLOT_AXIS_FRACTION = 1 / 96;
const LOG_FREQUENCY_MIN = 20;
const ANALYSIS_COLORS = ["#a3e635", "#38bdf8", "#f97316", "#f472b6", "#facc15", "#22c55e", "#fb7185", "#60a5fa"];
const ANALYSIS_PLOTLY_CONFIG = {
	responsive: true,
	displayModeBar: true,
	displaylogo: false,
};

function smoothMagnitudeFractional(valuesDb: Float32Array, smoothingFraction: number, sampleRate: number): MagnitudeResponse {
	if (valuesDb.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
		return { frequencies: new Float32Array(0), valuesDb: new Float32Array(0) };
	}

	const nyquist = Math.max(LOG_FREQUENCY_MIN * 2, sampleRate / 2);
	const frequencies = getFractionalOctaveFrequencies(
		PLOT_AXIS_FRACTION,
		LOG_FREQUENCY_MIN,
		nyquist,
		valuesDb.length * 2,
		sampleRate,
	);
	const smoothed = fractionalOctaveSmoothing(valuesDb, smoothingFraction, frequencies);
	return { frequencies, valuesDb: smoothed };
}

function computeSpectrumDbWithFrequencyScale(samples: Float32Array, sampleRate: number, frequencyScale: number): MagnitudeResponse | null {
	if (samples.length < 8 || sampleRate <= 0 || !Number.isFinite(frequencyScale) || frequencyScale <= 0) {
		return null;
	}

	const nfft = nextPow2(samples.length);
	const windowed = new Array<number>(nfft).fill(0);
	for (let index = 0; index < samples.length; index += 1) {
		const window = 0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, samples.length - 1)));
		windowed[index] = (samples[index] ?? 0) * window;
	}

	const { real, imag } = fft(windowed);
	const frequencies: number[] = [];
	const valuesDb: number[] = [];
	for (let bin = 1; bin < nfft / 2; bin += 1) {
		const frequency = ((bin * sampleRate) / nfft) * frequencyScale;
		const magnitude = Math.sqrt((real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2);
		frequencies.push(frequency);
		valuesDb.push(20 * Math.log10(Math.max(magnitude, 1e-12)));
	}

	if (frequencies.length === 0) {
		return null;
	}

	return {
		frequencies: Float32Array.from(frequencies),
		valuesDb: Float32Array.from(valuesDb),
	};
}

function extractWindowedSlice(signal: Float32Array, center: number, windowSize: number): Float32Array {
	const output = new Float32Array(windowSize);
	const half = Math.floor(windowSize / 2);
	for (let i = 0; i < windowSize; i += 1) {
		const sourceIndex = center - half + i;
		if (sourceIndex < 0 || sourceIndex >= signal.length) {
			output[i] = 0;
			continue;
		}
		const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, windowSize - 1)));
		output[i] = (signal[sourceIndex] ?? 0) * window;
	}
	return output;
}

export function computeFarinaLikeHarmonicCurves(
	measured: Float32Array,
	reference: Float32Array,
	sampleRate: number,
	label: string,
	windowSeconds = 0.2,
	maxHarmonics = 5,
	smoothingFraction = 1 / 6,
): HarmonicCurve[] {
	const n = Math.min(measured.length, reference.length);
	if (n < 512 || sampleRate <= 0) {
		return [];
	}

	const nfft = nextPow2(n);
	const rec = new Float32Array(nfft);
	const stim = new Float32Array(nfft);
	rec.set(measured.subarray(0, n), 0);
	stim.set(reference.subarray(0, n), 0);
	const ir = calculateTwoChannelImpulseResponse(rec, stim) as Float32Array;
	if (!ir || ir.length === 0) {
		return [];
	}

	let peakIndex = 0;
	let peakValue = 0;
	for (let i = 0; i < ir.length; i += 1) {
		const value = Math.abs(ir[i] ?? 0);
		if (value > peakValue) {
			peakValue = value;
			peakIndex = i;
		}
	}

	const ell = 2;
	const windowSize = Math.max(256, Math.round(windowSeconds * sampleRate));

	const curves: HarmonicCurve[] = [];
	for (let order = 1; order <= maxHarmonics + 1; order += 1) {
		const lagSeconds = ell * Math.log(order);
		const center = Math.round(peakIndex - lagSeconds * sampleRate);
		const harmonicIr = extractWindowedSlice(ir, center, windowSize);
		const magnitude = computeSpectrumDbWithFrequencyScale(harmonicIr, sampleRate, 1 / order);
		if (!magnitude) {
			continue;
		}
		const smoothed = smoothingFraction > 0
			? smoothMagnitudeFractional(magnitude.valuesDb, smoothingFraction, sampleRate)
			: magnitude;
		curves.push({
			label,
			order,
			smoothed,
		});
	}

	return curves;
}

export function computeThdSeries(harmonics: HarmonicCurve[]): SeriesResponse | null {
	const fundamental = harmonics.find((entry) => entry.order === 1);
	if (!fundamental || fundamental.smoothed.frequencies.length === 0) {
		return null;
	}

	const frequencies = Float32Array.from(fundamental.smoothed.frequencies);
	const values = new Float32Array(frequencies.length);
	for (let index = 0; index < frequencies.length; index += 1) {
		const frequency = frequencies[index] ?? 0;
		const fundamentalDb = interpolateMagnitudeValue(fundamental.smoothed, frequency);
		if (fundamentalDb === null || !Number.isFinite(fundamentalDb)) {
			values[index] = Number.NaN;
			continue;
		}

		const fundamentalLinear = Math.pow(10, fundamentalDb / 20);
		if (!Number.isFinite(fundamentalLinear) || fundamentalLinear <= 1e-12) {
			values[index] = Number.NaN;
			continue;
		}

		let sumSquares = 0;
		for (const harmonic of harmonics) {
			if (harmonic.order <= 1) {
				continue;
			}
			const harmonicDb = interpolateMagnitudeValue(harmonic.smoothed, frequency);
			if (harmonicDb === null || !Number.isFinite(harmonicDb)) {
				continue;
			}
			const harmonicLinear = Math.pow(10, harmonicDb / 20);
			sumSquares += harmonicLinear * harmonicLinear;
		}
		values[index] = (Math.sqrt(sumSquares) / fundamentalLinear) * 100;
	}

	return { frequencies, values };
}

function interpolateMagnitudeValue(series: MagnitudeResponse, targetFrequency: number): number | null {
	const { frequencies, valuesDb } = series;
	if (frequencies.length === 0 || valuesDb.length === 0) {
		return null;
	}
	if (targetFrequency < (frequencies[0] ?? 0) || targetFrequency > (frequencies[frequencies.length - 1] ?? 0)) {
		return null;
	}

	for (let index = 1; index < frequencies.length; index += 1) {
		const leftFrequency = frequencies[index - 1] ?? 0;
		const rightFrequency = frequencies[index] ?? 0;
		if (targetFrequency > rightFrequency) {
			continue;
		}
		const leftValue = valuesDb[index - 1] ?? 0;
		const rightValue = valuesDb[index] ?? 0;
		if (Math.abs(rightFrequency - leftFrequency) <= 1e-12) {
			return leftValue;
		}
		const leftLog = Math.log10(Math.max(1e-9, leftFrequency));
		const rightLog = Math.log10(Math.max(1e-9, rightFrequency));
		const targetLog = Math.log10(Math.max(1e-9, targetFrequency));
		const fraction = (targetLog - leftLog) / Math.max(1e-12, rightLog - leftLog);
		return leftValue + (rightValue - leftValue) * fraction;
	}

	return valuesDb[valuesDb.length - 1] ?? null;
}

export function renderFarinaDistortionPlot(host: HTMLElement, harmonics: HarmonicCurve[], colors: string[] = ANALYSIS_COLORS): void {
	const traces = harmonics.map((curve, index) => {
		const color = colors[index % colors.length];
		return {
			type: "scatter",
			mode: "lines",
			name: `${curve.label} ${curve.order === 1 ? "Fundamental" : `H${curve.order}`}`,
			x: Array.from(curve.smoothed.frequencies),
			y: Array.from(curve.smoothed.valuesDb),
			line: { color, width: curve.order === 1 ? 2.2 : 1.4 },
			hovertemplate: "%{x:.1f} Hz<br>%{y:.2f} dB<extra></extra>",
		};
	});

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Farina-style distortion", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: { orientation: "v", yanchor: "top", y: 1, xanchor: "left", x: 1.02, font: { color: "#cbd5e1", size: 11 } },
			xaxis: {
				title: { text: "Frequency (Hz)", font: { color: "#9aa4b2", size: 12 } },
				type: "log",
				range: [Math.log10(20), Math.log10(20000)],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "Amplitude (dB)", font: { color: "#9aa4b2", size: 12 } },
				range: [-85, 5],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}

export function renderThdPlot(host: HTMLElement, seriesList: Array<{ label: string; series: SeriesResponse }>, colors: string[] = ANALYSIS_COLORS): void {
	const traces = seriesList.map((entry, index) => ({
		type: "scatter",
		mode: "lines",
		name: `${entry.label} THD`,
		x: Array.from(entry.series.frequencies),
		y: Array.from(entry.series.values),
		line: { color: colors[index % colors.length], width: 2 },
		hovertemplate: "%{x:.1f} Hz<br>%{y:.2f}%<extra></extra>",
	}));

	void Plotly.react(
		host,
		traces,
		{
			title: { text: "Total harmonic distortion", font: { color: "#f8fafc", size: 14 } },
			paper_bgcolor: "#000",
			plot_bgcolor: "#000",
			margin: { l: 56, r: 180, t: 36, b: 44 },
			showlegend: true,
			legend: { orientation: "v", yanchor: "top", y: 1, xanchor: "left", x: 1.02, font: { color: "#cbd5e1", size: 11 } },
			xaxis: {
				title: { text: "Frequency (Hz)", font: { color: "#9aa4b2", size: 12 } },
				type: "log",
				range: [Math.log10(20), Math.log10(20000)],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
			yaxis: {
				title: { text: "THD (%)", font: { color: "#9aa4b2", size: 12 } },
				range: [0, 5],
				gridcolor: "rgba(181, 192, 224, 0.12)",
				zeroline: false,
				color: "#9aa4b2",
			},
		},
		ANALYSIS_PLOTLY_CONFIG,
	);
}
