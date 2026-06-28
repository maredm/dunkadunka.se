import { expect, test } from "bun:test";

import { WaveformPlot } from "../src/waveform-plot";

type DrawOperation =
	| { type: "lineTo"; x: number; y: number }
	| { type: "moveTo"; x: number; y: number }
	| { type: "arc"; x: number; y: number; radius: number }
	| { type: "clearRect" }
	| { type: "fillRect" }
	| { type: "fill" }
	| { type: "beginPath" }
	| { type: "stroke" }
	| { type: "save" }
	| { type: "restore" }
	| { type: "setTransform" };

function createPlotHarness(width = 200, height = 100): {
	plot: WaveformPlot;
	operations: DrawOperation[];
	dispatchCanvasEvent: (type: string, event: Partial<Event>) => void;
} {
	const operations: DrawOperation[] = [];
	const canvasListeners = new Map<string, Array<(event: Event) => void>>();
	const context = {
		clearRect: () => operations.push({ type: "clearRect" }),
		fillRect: () => operations.push({ type: "fillRect" }),
		save: () => operations.push({ type: "save" }),
		restore: () => operations.push({ type: "restore" }),
		beginPath: () => operations.push({ type: "beginPath" }),
		moveTo: (x: number, y: number) => operations.push({ type: "moveTo", x, y }),
		lineTo: (x: number, y: number) => operations.push({ type: "lineTo", x, y }),
		arc: (x: number, y: number, radius: number) => operations.push({ type: "arc", x, y, radius }),
		stroke: () => operations.push({ type: "stroke" }),
		fill: () => operations.push({ type: "fill" }),
		setTransform: () => operations.push({ type: "setTransform" }),
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		lineJoin: "round",
		lineCap: "round",
	} as unknown as CanvasRenderingContext2D;

	const canvas = {
		getBoundingClientRect: () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }),
		getContext: (kind: string) => (kind === "2d" ? context : null),
		addEventListener: (type: string, listener: (event: Event) => void) => {
			const listeners = canvasListeners.get(type) ?? [];
			listeners.push(listener);
			canvasListeners.set(type, listeners);
		},
		width: 0,
		height: 0,
	} as unknown as HTMLCanvasElement;

	return {
		plot: new WaveformPlot(canvas),
		operations,
		dispatchCanvasEvent: (type: string, event: Partial<Event>) => {
			for (const listener of canvasListeners.get(type) ?? []) {
				listener({ preventDefault: () => undefined, ...event } as Event);
			}
		},
	};
}

function firstWaveformPoint(operations: DrawOperation[], width: number): { x: number; y: number } {
	const point = operations.find((operation): operation is Extract<DrawOperation, { type: "lineTo" }> => {
		return operation.type === "lineTo" && operation.x > 0 && operation.x < width && operation.y > 0 && operation.y < 100;
	});

	if (!point) {
		throw new Error("expected a waveform line segment to be drawn");
	}

	return { x: point.x, y: point.y };
}

function maxWaveformDeviation(operations: DrawOperation[]): number {
	let maxDeviation = 0;
	for (const operation of operations) {
		if (operation.type !== "lineTo") {
			continue;
		}

		maxDeviation = Math.max(maxDeviation, Math.abs(operation.y - 50));
	}

	if (maxDeviation === 0) {
		throw new Error("expected a waveform line segment with nonzero deviation");
	}

	return maxDeviation;
}

function markerOperations(operations: DrawOperation[]): Array<Extract<DrawOperation, { type: "arc" }>> {
	return operations.filter((operation): operation is Extract<DrawOperation, { type: "arc" }> => operation.type === "arc");
}

test("zoom limits waveform rendering to the selected time window", () => {
	const { plot, operations } = createPlotHarness();
	const samples = new Float32Array([0, 0.25, 0.5, 0.75, 1]);

	plot.setData(samples, 1);
	const initialPoint = firstWaveformPoint(operations, 200);

	operations.length = 0;
	plot.zoom(2, 4);
	const zoomedPoint = firstWaveformPoint(operations, 200);

	expect(initialPoint.y).toBeGreaterThan(49);
	expect(initialPoint.y).toBeLessThan(51);
	expect(zoomedPoint.y).toBeLessThan(initialPoint.y);
	expect(zoomedPoint.y).toBeCloseTo(29, 0);
});

test("zoomY scales waveform rendering vertically", () => {
	const { plot, operations } = createPlotHarness();
	const samples = new Float32Array([0, 0.25, 0.5, 0.75, 1]);

	plot.setData(samples, 1);
	const initialDeviation = maxWaveformDeviation(operations);

	operations.length = 0;
	plot.zoomY(-0.5, 0.5);
	const zoomedDeviation = maxWaveformDeviation(operations);

	expect(zoomedDeviation).toBeGreaterThan(initialDeviation);
});

test("zoomed-in waveform draws circular sample markers", () => {
	const { plot, operations } = createPlotHarness();
	const samples = new Float32Array([0, 0.25, 0.5, 0.75, 1]);

	plot.setData(samples, 1);
	plot.zoom(0, 0.003);

	const markers = markerOperations(operations);
	const lineSegments = operations.filter((operation): operation is Extract<DrawOperation, { type: "lineTo" }> => operation.type === "lineTo");

	expect(lineSegments.length).toBeGreaterThan(0);
	expect(markers.length).toBeGreaterThan(0);
	expect(markers[0].radius).toBeGreaterThan(0);
});

test("sample markers get larger as zoom increases", () => {
	const { plot, operations } = createPlotHarness();
	const samples = new Float32Array(Array.from({ length: 100 }, (_, index) => Math.sin((index / 100) * Math.PI * 2)));

	plot.setData(samples, 1);
	operations.length = 0;
	plot.zoom(0, 0.5);
	const mediumZoomRadius = markerOperations(operations)[0].radius;

	operations.length = 0;
	plot.zoom(0, 0.1);
	const deepZoomRadius = markerOperations(operations)[0].radius;

	expect(deepZoomRadius).toBeGreaterThan(mediumZoomRadius);
});

test("double click resets waveform zoom", () => {
	const { plot, operations, dispatchCanvasEvent } = createPlotHarness();
	const samples = new Float32Array([0, 0.25, 0.5, 0.75, 1]);

	plot.setData(samples, 1);
	const initialDeviation = maxWaveformDeviation(operations);
	operations.length = 0;
	plot.zoom(2, 4);
	plot.zoomY(-0.5, 0.5);
	const zoomedDeviation = maxWaveformDeviation(operations);
	expect(zoomedDeviation).toBeGreaterThan(initialDeviation);

	operations.length = 0;
	dispatchCanvasEvent("dblclick", {});

	const resetPoint = firstWaveformPoint(operations, 200);
	const resetDeviation = maxWaveformDeviation(operations);
	expect(resetDeviation).toBeCloseTo(initialDeviation, 6);
	expect(resetPoint.y).toBeGreaterThan(49);
	expect(resetPoint.y).toBeLessThan(51);
});