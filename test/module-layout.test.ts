import { expect, test } from "bun:test";

type BrowserLikeWindow = {
	document: Document;
	navigator: Navigator;
	requestAnimationFrame: typeof requestAnimationFrame;
	cancelAnimationFrame: typeof cancelAnimationFrame;
};

function installDomStubs(): void {
	const createElement = () => ({
		style: {},
		append() {},
		appendChild() {},
		remove() {},
		addEventListener() {},
		removeEventListener() {},
		setAttribute() {},
		getContext() {
			return null;
		},
		getBoundingClientRect() {
			return { width: 1, height: 1 };
		},
		classList: { add() {}, remove() {}, toggle() {} },
		dataset: {},
	});

	const documentMock = {
		createElement: () => createElement(),
		body: createElement(),
		documentElement: createElement(),
		getElementById() {
			return null;
		},
		querySelector() {
			return null;
		},
		querySelectorAll() {
			return [];
		},
		addEventListener() {},
		removeEventListener() {},
	} as unknown as Document;

	const navigatorMock = { userAgent: "node" } as unknown as Navigator;
	const windowMock = {
		document: documentMock,
		navigator: navigatorMock,
		addEventListener() {},
		removeEventListener() {},
		requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
		cancelAnimationFrame: (handle: number) => clearTimeout(handle),
	} as unknown as BrowserLikeWindow;

	(globalThis as typeof globalThis & { window?: unknown; document?: Document; navigator?: Navigator; requestAnimationFrame?: typeof requestAnimationFrame; cancelAnimationFrame?: typeof cancelAnimationFrame }).window = windowMock as unknown as Window & typeof globalThis;
	(globalThis as typeof globalThis & { window?: unknown; document?: Document; navigator?: Navigator; requestAnimationFrame?: typeof requestAnimationFrame; cancelAnimationFrame?: typeof cancelAnimationFrame }).document = documentMock;
	(globalThis as typeof globalThis & { window?: unknown; document?: Document; navigator?: Navigator; requestAnimationFrame?: typeof requestAnimationFrame; cancelAnimationFrame?: typeof cancelAnimationFrame }).navigator = navigatorMock;
	(globalThis as typeof globalThis & { window?: unknown; document?: Document; navigator?: Navigator; requestAnimationFrame?: typeof requestAnimationFrame; cancelAnimationFrame?: typeof cancelAnimationFrame }).requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
	(globalThis as typeof globalThis & { window?: unknown; document?: Document; navigator?: Navigator; requestAnimationFrame?: typeof requestAnimationFrame; cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}

test("grouped signal and plotting modules are importable", async () => {
	installDomStubs();

	const [{ fft }, { db, chirp }, { WaveformPlot, getWaveformLineColor }, { SpectrogramPlot }, { waveformColormap }] = await Promise.all([
		import("../src/signal/fft"),
		import("../src/signal"),
		import("../src/plotting/waveform-plot"),
		import("../src/plotting/spectrogram-plot"),
		import("../src/plotting/waveform-colormap"),
	]);

	expect(typeof fft).toBe("function");
	expect(typeof db).toBe("function");
	expect(typeof chirp).toBe("function");
	expect(typeof WaveformPlot).toBe("function");
	expect(typeof SpectrogramPlot).toBe("function");
	expect(typeof getWaveformLineColor).toBe("function");
	expect(typeof waveformColormap).toBe("function");
});
