import "./styles.css";
import { createLiveMonitorController, type LiveMonitorController } from "./live_monitor";
import { mountWaveformTool, type WaveformToolHandle } from "./waveform";
import { createMeasurementController, type MeasurementController } from "./measurement";
import { readMultichannelWavFile } from "./wavfile";

type LoadedAudioFile = {
	id: string;
	file: File;
};

type PlotSession = {
	tool: WaveformToolHandle;
	measurement: MeasurementController | null;
};

const tabsOuter = document.getElementById("tabs-outer") as HTMLElement | null;
const tabsInner = document.getElementById("tabs") as HTMLElement | null;
const tabContents = document.getElementById("tab-contents") as HTMLElement | null;
const uploadInput = document.getElementById("responseFileUpload") as HTMLInputElement | null;
const fileTableBody = document.getElementById("fileTableBody") as HTMLTableSectionElement | null;
const acquisitionStimulusSelect = document.getElementById("acquisitionStimulusSelect") as HTMLSelectElement | null;
const acquisitionInputDeviceSelect = document.getElementById("acquisitionInputDeviceSelect") as HTMLSelectElement | null;
const acquisitionInputChannelSelect = document.getElementById("acquisitionInputChannelSelect") as HTMLSelectElement | null;
const acquisitionOutputDeviceSelect = document.getElementById("acquisitionOutputDeviceSelect") as HTMLSelectElement | null;
const acquisitionOutputChannelSelect = document.getElementById("acquisitionOutputChannelSelect") as HTMLSelectElement | null;
const acquisitionStatusText = document.getElementById("acquisitionStatusText") as HTMLParagraphElement | null;
const acquisitionRecordBtn = document.getElementById("acquisitionRecordBtn") as HTMLButtonElement | null;
const acquisitionStopBtn = document.getElementById("acquisitionStopBtn") as HTMLButtonElement | null;
const liveMicDeviceSelect = document.getElementById("liveMicDeviceSelect") as HTMLSelectElement | null;
const liveMicChannelSelect = document.getElementById("liveMicChannelSelect") as HTMLSelectElement | null;
const liveReferenceDeviceSelect = document.getElementById("liveReferenceDeviceSelect") as HTMLSelectElement | null;
const liveReferenceChannelSelect = document.getElementById("liveReferenceChannelSelect") as HTMLSelectElement | null;
const liveAverageTimeConstantSelect = document.getElementById("liveAverageTimeConstantSelect") as HTMLSelectElement | null;
const liveSmoothingSelect = document.getElementById("liveSmoothingSelect") as HTMLSelectElement | null;
const liveWeightingSelect = document.getElementById("liveWeightingSelect") as HTMLSelectElement | null;
const liveStatusText = document.getElementById("liveStatusText") as HTMLParagraphElement | null;
const liveStartBtn = document.getElementById("liveStartBtn") as HTMLButtonElement | null;
const liveStopBtn = document.getElementById("liveStopBtn") as HTMLButtonElement | null;
const liveMicSplValue = document.getElementById("liveMicSplValue") as HTMLElement | null;
const liveReferenceSplValue = document.getElementById("liveReferenceSplValue") as HTMLElement | null;
const liveDifferenceSplValue = document.getElementById("liveDifferenceSplValue") as HTMLElement | null;
const liveSplHistoryCanvas = document.getElementById("liveSplHistoryCanvas") as HTMLCanvasElement | null;
const liveSpectrumCanvas = document.getElementById("liveSpectrumCanvas") as HTMLCanvasElement | null;

if (!tabsOuter || !tabsInner || !tabContents || !uploadInput || !fileTableBody) {
	throw new Error("Missing required tab UI elements.");
}

if (
	!acquisitionStimulusSelect ||
	!acquisitionInputDeviceSelect ||
	!acquisitionInputChannelSelect ||
	!acquisitionOutputDeviceSelect ||
	!acquisitionOutputChannelSelect ||
	!acquisitionStatusText ||
	!acquisitionRecordBtn ||
	!acquisitionStopBtn
) {
	throw new Error("Missing required acquisition toolbar elements.");
}

const tabsInnerEl: HTMLElement = tabsInner;
const tabContentsEl: HTMLElement = tabContents;
const fileTableBodyEl: HTMLTableSectionElement = fileTableBody;

const files = new Map<string, LoadedAudioFile>();
const plotSessions = new Map<string, PlotSession>();
let tabCounter = 0;
let acquisitionMeasurementController: MeasurementController | null = null;
let liveMonitorController: LiveMonitorController | null = null;

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / (1024 ** exponent);
	return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function switchTab(tabId: string): void {
	document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
	document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
	document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
	document.querySelector(`[data-content="${tabId}"]`)?.classList.add("active");

	requestAnimationFrame(() => {
		window.dispatchEvent(new Event("resize"));
	});
}

function closeDynamicTab(tabId: string): void {
	if (tabId === "upload" || tabId === "acquisition" || tabId === "live") {
		return;
	}

	const session = plotSessions.get(tabId);
	session?.measurement?.destroy();
	session?.tool.destroy();

	document.querySelector(`[data-tab="${tabId}"]`)?.remove();
	document.querySelector(`[data-content="${tabId}"]`)?.remove();
	plotSessions.delete(tabId);
}

function createAnalysisMarkup(tabId: string, fileName: string, sampleRate: number, channelCount: number, frameCount: number): string {
	const durationSeconds = sampleRate > 0 ? frameCount / sampleRate : 0;
	return `
		<div class="acquisition-toolbar" role="toolbar" aria-label="Acquisition controls">
			<div class="acquisition-toolbar-group">
				<label for="analysisStimulusSelect-${tabId}" class="acquisition-toolbar-label">Stimulus</label>
				<select id="analysisStimulusSelect-${tabId}" class="toolbar-select" aria-label="Stimulus selection">
				<option value="swept-20-24000" selected>20-24000 Hz swept-sine</option>
				<option value="swept-20-20000">20-20000 Hz swept-sine</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisOutputDeviceSelect-${tabId}" class="acquisition-toolbar-label">Output</label>
				<select id="analysisOutputDeviceSelect-${tabId}" class="toolbar-select" aria-label="Output device selection"></select>
			</div>
			<div class="acquisition-toolbar-group acquisition-toolbar-group--compact">
				<label for="analysisOutputChannelSelect-${tabId}" class="acquisition-toolbar-label">Out ch</label>
				<select id="analysisOutputChannelSelect-${tabId}" class="toolbar-select" aria-label="Output channel selection">
					<option value="left" selected>L</option>
					<option value="right">R</option>
				</select>
			</div>
			<div class="acquisition-toolbar-group">
				<label for="analysisInputDeviceSelect-${tabId}" class="acquisition-toolbar-label">Input</label>
				<select id="analysisInputDeviceSelect-${tabId}" class="toolbar-select" aria-label="Input device selection"></select>
			</div>
			<div class="acquisition-toolbar-group acquisition-toolbar-group--compact">
				<label for="analysisInputChannelSelect-${tabId}" class="acquisition-toolbar-label">In ch</label>
				<select id="analysisInputChannelSelect-${tabId}" class="toolbar-select" aria-label="Input channel selection">
					<option value="left" selected>L</option>
					<option value="right">R</option>
				</select>
			</div>
			<p id="analysisStatusText-${tabId}" class="acquisition-status" data-state="idle" aria-live="polite">Ready</p>
			<button id="analysisRecordBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button">Record</button>
			<button id="analysisStopBtn-${tabId}" type="button" class="toolbar-button button acquisition-action-button" disabled>Stop</button>
		</div>
		<div id="waveform-tool-${tabId}" class="waveform-tool-host"></div>
	`;
}

function registerRecordedFile(file: File): LoadedAudioFile {
	const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
	const entry: LoadedAudioFile = { id, file };
	files.set(id, entry);
	appendFileRow(entry);
	return entry;
}

function rerenderAllPlots(): void {
	plotSessions.forEach((session) => {
		session.tool.rerender();
	});
}

async function openAnalysisTab(file: File): Promise<void> {
	const tabId = `analysis-${++tabCounter}`;
	const shortName = file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;

	const tabButton = document.createElement("button");
	tabButton.className = "tab tab-closable tab-loading";
	tabButton.dataset.tab = tabId;
	tabButton.innerHTML = `<span class="tab-icon-waveform"></span>${shortName} <span class="tab-close" title="Close">x</span>`;
	tabsInnerEl.append(tabButton);

	const content = document.createElement("div");
	content.className = "tab-content";
	content.dataset.content = tabId;
	tabContentsEl.append(content);

	try {
		const parsed = await readMultichannelWavFile(file);
		const sampleRate = parsed.sampleRate;
		const frameCount = parsed.channels[0]?.length ?? 0;
		const channelCount = parsed.channels.length;

		content.innerHTML = createAnalysisMarkup(tabId, file.name, sampleRate, channelCount, frameCount);

		const mountHost = document.getElementById(`waveform-tool-${tabId}`) as HTMLElement | null;
		const stimulusSelect = document.getElementById(`analysisStimulusSelect-${tabId}`) as HTMLSelectElement | null;
		const outputDeviceSelect = document.getElementById(`analysisOutputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const outputChannelSelect = document.getElementById(`analysisOutputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const inputDeviceSelect = document.getElementById(`analysisInputDeviceSelect-${tabId}`) as HTMLSelectElement | null;
		const inputChannelSelect = document.getElementById(`analysisInputChannelSelect-${tabId}`) as HTMLSelectElement | null;
		const statusText = document.getElementById(`analysisStatusText-${tabId}`) as HTMLParagraphElement | null;
		const recordButton = document.getElementById(`analysisRecordBtn-${tabId}`) as HTMLButtonElement | null;
		const stopButton = document.getElementById(`analysisStopBtn-${tabId}`) as HTMLButtonElement | null;

		if (!mountHost) {
			throw new Error("Failed to create waveform tool host.");
		}
		if (
			!stimulusSelect ||
			!outputDeviceSelect ||
			!outputChannelSelect ||
			!inputDeviceSelect ||
			!inputChannelSelect ||
			!statusText ||
			!recordButton ||
			!stopButton
		) {
			throw new Error("Failed to create analysis acquisition toolbar.");
		}

		const tool = mountWaveformTool(mountHost);
		const measurement = createMeasurementController({
			stimulusSelect,
			inputDeviceSelect,
			inputChannelSelect,
			outputDeviceSelect,
			outputChannelSelect,
			statusText,
			recordButton,
			stopButton,
			onRecordedFile: (recordedFile) => {
				registerRecordedFile(recordedFile);
				void openAnalysisTab(recordedFile);
			},
		});
		await tool.openFile(file);
		plotSessions.set(tabId, { tool, measurement });
		tabButton.classList.remove("tab-loading");
		switchTab(tabId);
		rerenderAllPlots();
	} catch (error) {
		content.innerHTML = `<div class="tab-inner-content"><div class="loose-container"><p class="info">Failed to open ${file.name}: ${error instanceof Error ? error.message : "unknown error"}</p></div></div>`;
		tabButton.classList.remove("tab-loading");
		tabButton.classList.add("tab-error");
		switchTab(tabId);
	}
}

function appendFileRow(entry: LoadedAudioFile): void {
	const row = document.createElement("tr");
	row.dataset.fileId = entry.id;

	const nameCell = document.createElement("td");
	nameCell.textContent = entry.file.name;
	row.append(nameCell);

	const sizeCell = document.createElement("td");
	sizeCell.textContent = formatBytes(entry.file.size);
	row.append(sizeCell);

	const actionCell = document.createElement("td");
	const openButton = document.createElement("button");
	openButton.type = "button";
	openButton.className = "button-custom button-custom-secondary file-open-btn";
	openButton.textContent = "Open tab";
	openButton.addEventListener("click", () => {
		void openAnalysisTab(entry.file);
	});
	actionCell.append(openButton);
	row.append(actionCell);

	fileTableBodyEl.append(row);
}

tabsOuter.addEventListener("click", (event: MouseEvent) => {
	const target = event.target as HTMLElement;
	const tab = target.closest(".tab") as HTMLElement | null;
	if (!tab) {
		return;
	}

	const tabId = tab.dataset.tab;
	if (!tabId) {
		return;
	}

	if (target.classList.contains("tab-close")) {
		const wasActive = tab.classList.contains("active");
		closeDynamicTab(tabId);
		if (wasActive) {
			switchTab("upload");
		}
		event.stopPropagation();
		return;
	}

	switchTab(tabId);
});

uploadInput.addEventListener("change", () => {
	const fileList = Array.from(uploadInput.files ?? []);
	for (const file of fileList) {
		registerRecordedFile(file);
	}
	uploadInput.value = "";
});

acquisitionMeasurementController = createMeasurementController({
	stimulusSelect: acquisitionStimulusSelect,
	inputDeviceSelect: acquisitionInputDeviceSelect,
	inputChannelSelect: acquisitionInputChannelSelect,
	outputDeviceSelect: acquisitionOutputDeviceSelect,
	outputChannelSelect: acquisitionOutputChannelSelect,
	statusText: acquisitionStatusText,
	recordButton: acquisitionRecordBtn,
	stopButton: acquisitionStopBtn,
	onRecordedFile: (file) => {
		registerRecordedFile(file);
		void openAnalysisTab(file);
	},
});

if (
	liveMicDeviceSelect &&
	liveMicChannelSelect &&
	liveReferenceDeviceSelect &&
	liveReferenceChannelSelect &&
	liveAverageTimeConstantSelect &&
	liveSmoothingSelect &&
	liveWeightingSelect &&
	liveStatusText &&
	liveStartBtn &&
	liveStopBtn &&
	liveMicSplValue &&
	liveReferenceSplValue &&
	liveDifferenceSplValue &&
	liveSplHistoryCanvas &&
	liveSpectrumCanvas
) {
	liveMonitorController = createLiveMonitorController({
		micDeviceSelect: liveMicDeviceSelect,
		micChannelSelect: liveMicChannelSelect,
		referenceDeviceSelect: liveReferenceDeviceSelect,
		referenceChannelSelect: liveReferenceChannelSelect,
		averageTimeConstantSelect: liveAverageTimeConstantSelect,
		smoothingSelect: liveSmoothingSelect,
		weightingSelect: liveWeightingSelect,
		statusText: liveStatusText,
		startButton: liveStartBtn,
		stopButton: liveStopBtn,
		micSplValue: liveMicSplValue,
		referenceSplValue: liveReferenceSplValue,
		differenceSplValue: liveDifferenceSplValue,
		splHistoryCanvas: liveSplHistoryCanvas,
		spectrumCanvas: liveSpectrumCanvas,
	});
}

window.addEventListener("resize", () => {
	rerenderAllPlots();
});

window.addEventListener("beforeunload", () => {
	acquisitionMeasurementController?.destroy();
	liveMonitorController?.destroy();
	plotSessions.forEach((session) => {
		session.measurement?.destroy();
		session.tool.destroy();
	});
});

switchTab("upload");