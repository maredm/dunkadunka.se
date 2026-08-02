type PlotlyConfig = {
	displayModeBar?: boolean;
	displaylogo?: boolean;
	modeBarButtonsToAdd?: Array<Record<string, unknown>>;
	[key: string]: unknown;
};

type PlotlyGraphDiv = HTMLElement & {
	data?: unknown[];
	layout?: Record<string, unknown>;
	config?: PlotlyConfig;
	_context?: PlotlyConfig;
};

const POP_OUT_BUTTON_ID = "plot-popout-window";
const POP_OUT_ICON = {
	width: 1024,
	height: 1024,
	ascent: 1024,
	descent: 0,
	path: "M640 128h256v256h-96V288L511 577l-64-64 289-289h-96V128zM224 224h288v96H320v384h384V512h96v288H224V224z",
};

function cloneForPlotly<T>(value: T): T {
	if (value === undefined || value === null) {
		return value;
	}
	try {
		return structuredClone(value);
	} catch {
		return JSON.parse(JSON.stringify(value)) as T;
	}
}

function getPlotTitle(layout: Record<string, unknown> | undefined): string {
	if (!layout) {
		return "Plot";
	}
	const title = layout.title;
	if (typeof title === "string" && title.trim().length > 0) {
		return title.trim();
	}
	if (title && typeof title === "object") {
		const text = (title as { text?: unknown }).text;
		if (typeof text === "string" && text.trim().length > 0) {
			return text.trim();
		}
	}
	return "Plot";
}

export function buildPopupLayout(layout: Record<string, unknown> | undefined, width: number, height: number): Record<string, unknown> {
	const popupLayout = cloneForPlotly(layout ?? {});
	const nextLayout = popupLayout as Record<string, unknown>;
	nextLayout.autosize = false;
	nextLayout.width = width;
	nextLayout.height = height;
	return nextLayout;
}

function createOverlayPopout(title: string, width: number, height: number): { host: HTMLDivElement; cleanup: () => void } {
	const overlay = document.createElement("div");
	overlay.style.position = "fixed";
	overlay.style.inset = "0";
	overlay.style.zIndex = "2147483647";
	overlay.style.display = "flex";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.padding = "24px";
	overlay.style.background = "rgba(10, 10, 12, 0.55)";
	overlay.style.backdropFilter = "blur(10px)";
	overlay.style.webkitBackdropFilter = "blur(10px)";

	const panel = document.createElement("div");
	panel.style.width = `${Math.min(width, Math.max(640, window.innerWidth - 48))}px`;
	panel.style.height = `${Math.min(height, Math.max(480, window.innerHeight - 48))}px`;
	panel.style.maxWidth = "calc(100vw - 48px)";
	panel.style.maxHeight = "calc(100vh - 48px)";
	panel.style.display = "flex";
	panel.style.flexDirection = "column";
	panel.style.borderRadius = "12px";
	panel.style.background = "#16181d";
	panel.style.boxShadow = "0 16px 48px rgba(0, 0, 0, 0.28)";
	panel.style.backdropFilter = "none";
	panel.style.overflow = "hidden";

	const header = document.createElement("div");
	header.style.display = "flex";
	header.style.alignItems = "center";
	header.style.justifyContent = "space-between";
	header.style.padding = "12px 16px";
	header.style.background = "#1d2027";
	header.style.color = "#f3f4f6";
	header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";

	const titleEl = document.createElement("div");
	titleEl.textContent = title;
	titleEl.style.fontWeight = "600";
	titleEl.style.fontSize = "14px";

	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.textContent = "✕";
	closeButton.style.background = "transparent";
	closeButton.style.border = "none";
	closeButton.style.color = "#f3f4f6";
	closeButton.style.cursor = "pointer";
	closeButton.style.fontSize = "18px";

	const host = document.createElement("div");
	host.style.flex = "1 1 auto";
	host.style.width = "100%";
	host.style.height = "100%";
	host.style.minHeight = "0";

	header.appendChild(titleEl);
	header.appendChild(closeButton);
	panel.appendChild(header);
	panel.appendChild(host);
	overlay.appendChild(panel);
	document.body.appendChild(overlay);

	const cleanup = () => {
		overlay.remove();
		document.removeEventListener("keydown", onKeyDown);
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			cleanup();
		}
	};

	closeButton.addEventListener("click", cleanup);
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) {
			cleanup();
		}
	});
	document.addEventListener("keydown", onKeyDown);

	return { host, cleanup };
}

async function openPlotInNewWindow(graphDiv: PlotlyGraphDiv): Promise<void> {
	const { default: Plotly } = await import("plotly.js-dist-min");

	const data = cloneForPlotly(graphDiv.data ?? []);
	const layout = cloneForPlotly(graphDiv.layout ?? {});
	const inheritedConfig = cloneForPlotly(graphDiv._context ?? graphDiv.config ?? {});
	const popupWidth = Math.max(720, Math.min(1600, window.innerWidth - 80));
	const popupHeight = Math.max(400, Math.min(900, window.innerHeight - 80));
	const popupLayout = buildPopupLayout(layout as Record<string, unknown> | undefined, popupWidth, popupHeight);
	const modeBarButtonsToAdd = Array.isArray(inheritedConfig.modeBarButtonsToAdd)
		? inheritedConfig.modeBarButtonsToAdd.filter((button) => {
			if (!button || typeof button !== "object") {
				return true;
			}
			const name = (button as { name?: unknown }).name;
			return name !== POP_OUT_BUTTON_ID;
		})
		: [];

	const popupConfig: PlotlyConfig = {
		...inheritedConfig,
		responsive: true,
		displayModeBar: true,
		displaylogo: false,
		modeBarButtonsToAdd,
	};

	const title = getPlotTitle(layout);
	let host: HTMLDivElement;
	let cleanup: () => void = () => undefined;

	const overlay = createOverlayPopout(title, popupWidth, popupHeight);
	host = overlay.host;
	cleanup = overlay.cleanup;

	try {
		void Plotly.newPlot(host, data, popupLayout, popupConfig);
		requestAnimationFrame(() => {
			void Plotly.Plots.resize(host);
		});
		setTimeout(() => {
			void Plotly.Plots.resize(host);
		}, 100);
	} catch (error) {
		console.error("Failed to render Plotly popout", error);
		cleanup();
	}

	window.addEventListener("resize", () => {
		void Plotly.Plots.resize(host);
	});
}

export function withPlotPopoutButton(config: PlotlyConfig): PlotlyConfig {
	const modeBarButtonsToAdd = Array.isArray(config.modeBarButtonsToAdd)
		? [...config.modeBarButtonsToAdd]
		: [];

	const hasButton = modeBarButtonsToAdd.some((button) => {
		if (!button || typeof button !== "object") {
			return false;
		}
		return (button as { name?: unknown }).name === POP_OUT_BUTTON_ID;
	});

	if (!hasButton) {
		modeBarButtonsToAdd.push({
			name: POP_OUT_BUTTON_ID,
			title: "Pop out in new window",
			icon: POP_OUT_ICON,
			click: (graphDiv: unknown) => {
				void openPlotInNewWindow(graphDiv as PlotlyGraphDiv);
			},
		});
	}

	return {
		...config,
		displayModeBar: true,
		displaylogo: false,
		modeBarButtonsToAdd,
	};
}