import {
	computeWeightedMeanSquare,
	type FrequencyWeighting,
} from "./weighting";

export type LevelMetric =
	| "laeq"
	| "dba-fast"
	| "dba-slow"
	| "dba-instant"
	| "lcmax"
	| "dbc-fast"
	| "dbc-slow";

export interface LevelMeterState {
	metric: LevelMetric;
	sampleRate: number;
	smoothedMeanSquare: number | null;
	equivalentEnergySum: number;
	equivalentSampleCount: number;
	maximumLevelDb: number | null;
}

const MIN_DB = -96;
const MIN_MEAN_SQUARE = 1e-12;
const FAST_TIME_CONSTANT_SECONDS = 0.125;
const SLOW_TIME_CONSTANT_SECONDS = 1;

type LevelMetricDefinition = {
	weighting: FrequencyWeighting;
	label: string;
	mode: "instant" | "exponential" | "equivalent" | "maximum";
	timeConstantSeconds?: number;
};

const LEVEL_METRIC_DEFINITIONS: Record<LevelMetric, LevelMetricDefinition> = {
	laeq: { weighting: "a", label: "LAeq", mode: "equivalent" },
	"dba-fast": { weighting: "a", label: "dBA(F)", mode: "exponential", timeConstantSeconds: FAST_TIME_CONSTANT_SECONDS },
	"dba-slow": { weighting: "a", label: "dBA(S)", mode: "exponential", timeConstantSeconds: SLOW_TIME_CONSTANT_SECONDS },
	"dba-instant": { weighting: "a", label: "dBA(I)", mode: "instant" },
	lcmax: { weighting: "c", label: "LCmax", mode: "maximum" },
	"dbc-fast": { weighting: "c", label: "dBC(F)", mode: "exponential", timeConstantSeconds: FAST_TIME_CONSTANT_SECONDS },
	"dbc-slow": { weighting: "c", label: "dBC(S)", mode: "exponential", timeConstantSeconds: SLOW_TIME_CONSTANT_SECONDS },
};

export function computeWaveformDecibels(samples: Float32Array): number {
	return decibelsFromMeanSquare(computeMeanSquare(samples));
}

export function computeExponentialAverageAlpha(elapsedSeconds: number, timeConstantSeconds: number): number {
	if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
		return 1;
	}
	if (!Number.isFinite(timeConstantSeconds) || timeConstantSeconds <= 0) {
		return 1;
	}
	return 1 - Math.exp(-elapsedSeconds / timeConstantSeconds);
}

export function parseLevelMetric(value: string): LevelMetric {
	return value in LEVEL_METRIC_DEFINITIONS ? (value as LevelMetric) : "laeq";
}

export function getLevelMetricLabel(metric: LevelMetric): string {
	return LEVEL_METRIC_DEFINITIONS[metric].label;
}

export function getLevelMetricWeighting(metric: LevelMetric): FrequencyWeighting {
	return LEVEL_METRIC_DEFINITIONS[metric].weighting;
}

export function createLevelMeterState(metric: LevelMetric, sampleRate: number): LevelMeterState {
	const definition = LEVEL_METRIC_DEFINITIONS[metric];
	return {
		metric,
		sampleRate,
		smoothedMeanSquare: null,
		equivalentEnergySum: 0,
		equivalentSampleCount: 0,
		maximumLevelDb: null,
	};
}

export function updateLevelMeter(state: LevelMeterState, samples: Float32Array, sampleRate: number): number {
	if (sampleRate !== state.sampleRate) {
		const resetState = createLevelMeterState(state.metric, sampleRate);
		state.sampleRate = resetState.sampleRate;
		state.smoothedMeanSquare = resetState.smoothedMeanSquare;
		state.equivalentEnergySum = resetState.equivalentEnergySum;
		state.equivalentSampleCount = resetState.equivalentSampleCount;
		state.maximumLevelDb = resetState.maximumLevelDb;
	}

	const definition = LEVEL_METRIC_DEFINITIONS[state.metric];
	const meanSquare = computeWeightedMeanSquare(samples, sampleRate, definition.weighting);
	if (definition.mode === "instant") {
		return decibelsFromMeanSquare(meanSquare);
	}

	if (definition.mode === "exponential") {
		const durationSeconds = sampleRate > 0 ? samples.length / sampleRate : 0;
		const alpha = computeExponentialAverageAlpha(durationSeconds, definition.timeConstantSeconds ?? FAST_TIME_CONSTANT_SECONDS);
		state.smoothedMeanSquare = state.smoothedMeanSquare === null
			? meanSquare
			: ((1 - alpha) * state.smoothedMeanSquare) + (alpha * meanSquare);
		return decibelsFromMeanSquare(state.smoothedMeanSquare);
	}

	if (definition.mode === "equivalent") {
		state.equivalentEnergySum += meanSquare * samples.length;
		state.equivalentSampleCount += samples.length;
		if (state.equivalentSampleCount <= 0) {
			return MIN_DB;
		}
		return decibelsFromMeanSquare(state.equivalentEnergySum / state.equivalentSampleCount);
	}

	const currentLevelDb = decibelsFromMeanSquare(meanSquare);
	state.maximumLevelDb = state.maximumLevelDb === null
		? currentLevelDb
		: Math.max(state.maximumLevelDb, currentLevelDb);
	return state.maximumLevelDb;
}

export function computeWeightedWaveformDecibels(
	samples: Float32Array,
	weighting: FrequencyWeighting,
	sampleRate: number,
): number {
	return decibelsFromMeanSquare(computeWeightedMeanSquare(samples, sampleRate, weighting));
}

function computeMeanSquare(samples: Float32Array): number {
	if (samples.length === 0) {
		return 0;
	}

	let sumSquares = 0;
	for (let index = 0; index < samples.length; index += 1) {
		const value = samples[index] ?? 0;
		sumSquares += value * value;
	}
	return sumSquares / Math.max(1, samples.length);
}

function decibelsFromMeanSquare(meanSquare: number): number {
	if (!Number.isFinite(meanSquare) || meanSquare <= 0) {
		return MIN_DB;
	}
	return 10 * Math.log10(Math.max(meanSquare, MIN_MEAN_SQUARE));
}