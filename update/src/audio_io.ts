import { type NumberArray, type StereoBuffer, numberArrayToStereoBuffer, concatStereoBuffers } from "./signal";

export type AudioChannelSelection = "left" | "right";

export interface AudioRoutingOptions {
	inputDeviceId?: string;
	outputDeviceId?: string;
	inputChannel?: AudioChannelSelection;
	outputChannel?: AudioChannelSelection;
}

export interface LiveMonitorOptions {
	micDeviceId?: string;
	micChannel?: AudioChannelSelection;
	referenceDeviceId?: string;
	referenceChannel?: AudioChannelSelection;
	fftSize?: number;
}

export interface LiveMonitorSnapshot {
	sampleRate: number;
	micWaveform: Float32Array;
	referenceWaveform: Float32Array | null;
}

export interface LiveMonitorSession {
	sampleRate: number;
	getSnapshot(): LiveMonitorSnapshot;
	stop(): Promise<void>;
}

type AudioProcessingMode = "playback" | "record" | "duplex";

interface AudioProcessingWorkletRequest {
	mode: AudioProcessingMode;
	playback?: StereoBuffer;
	recordFrameCount?: number;
	recordTailFrames?: number;
}

interface AudioProcessingWorkletPlan {
	mode: AudioProcessingMode;
	playbackFrameCount: number;
	recordFrameCount: number;
	recordTailFrames: number;
}

interface AudioProcessingWorkletSession {
	node: AudioWorkletNode;
	recorded: Promise<StereoBuffer>;
	stop(): Promise<StereoBuffer>;
	disconnect(): void;
}

export interface ActiveDuplexSession {
	recorded: Promise<StereoBuffer>;
	stop(): Promise<StereoBuffer>;
}

type AudioOutputRouter = {
	destination: AudioNode;
	stop(): void;
};

type MonitorInputNodes = {
	stream: MediaStream;
	source: MediaStreamAudioSourceNode;
	splitter: ChannelSplitterNode;
	leftAnalyser: AnalyserNode;
	rightAnalyser: AnalyserNode;
};

const WORKLET_NAME = "audio-processing-worklet";
let cachedModuleUrl: string | null = null;

function requireNonNegativeInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value < 0 || !Number.isFinite(value)) {
		throw new Error(`${label} must be a non-negative integer`);
	}
}

function requireStereoBuffer(buffer: StereoBuffer | undefined, label: string): StereoBuffer {
	if (!buffer) {
		throw new Error(`${label} is required`);
	}
	if (buffer[0].length !== buffer[1].length) {
		throw new Error(`${label} channels must have the same length`);
	}
	return buffer;
}

export function routePlaybackToChannel(samples: NumberArray, channel: AudioChannelSelection = "left"): StereoBuffer {
	const stereo = numberArrayToStereoBuffer(samples);
	const silent = new Float32Array(stereo[0].length);
	return channel === "right" ? [silent, stereo[0]] : [stereo[0], silent];
}

export function selectRecordedChannel(buffer: StereoBuffer, channel: AudioChannelSelection = "left"): StereoBuffer {
	const source = channel === "right" ? buffer[1] : buffer[0];
	return [new Float32Array(source), new Float32Array(source)];
}

async function createAudioOutputRouter(context: AudioContext, outputDeviceId?: string): Promise<AudioOutputRouter> {
	if (outputDeviceId && "setSinkId" in context) {
		try {
			await (context as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(outputDeviceId);
		} catch {
			// Fall back to the default output device if the browser rejects the sink change.
		}
	}

	return {
		destination: context.destination,
		stop: () => {},
	};
}

export function planAudioProcessingWorklet(request: AudioProcessingWorkletRequest): AudioProcessingWorkletPlan {
	const playbackFrameCount = request.playback ? request.playback[0].length : 0;
	if (request.playback && request.playback[0].length !== request.playback[1].length) {
		throw new Error("playback channels must have the same length");
	}

	if (request.mode === "playback") {
		if (!request.playback) {
			throw new Error("playback is required for playback mode");
		}
		return {
			mode: request.mode,
			playbackFrameCount,
			recordFrameCount: 0,
			recordTailFrames: 0,
		};
	}

	if (request.mode === "record") {
		const recordFrameCount = request.recordFrameCount;
		if (recordFrameCount === undefined) {
			throw new Error("recordFrameCount is required for record mode");
		}
		requireNonNegativeInteger(recordFrameCount, "recordFrameCount");
		return {
			mode: request.mode,
			playbackFrameCount: 0,
			recordFrameCount,
			recordTailFrames: 0,
		};
	}

	if (!request.playback) {
		throw new Error("playback is required for duplex mode");
	}

	const recordTailFrames = request.recordTailFrames ?? 0;
	requireNonNegativeInteger(recordTailFrames, "recordTailFrames");

	const recordFrameCount = request.recordFrameCount ?? playbackFrameCount + recordTailFrames;
	requireNonNegativeInteger(recordFrameCount, "recordFrameCount");
	if (recordFrameCount < playbackFrameCount) {
		throw new Error("recordFrameCount must be at least playback length in duplex mode");
	}

	return {
		mode: request.mode,
		playbackFrameCount,
		recordFrameCount,
		recordTailFrames: recordFrameCount - playbackFrameCount,
	};
}

function buildWorkletSource(): string {
	return `
class AudioProcessingWorklet extends AudioWorkletProcessor {
	constructor() {
		super();
		this.mode = "duplex";
		this.playback = [new Float32Array(0), new Float32Array(0)];
		this.playbackIndex = 0;
		this.recordFrameCount = 0;
		this.framesCaptured = 0;
		this.tailFrames = 0;
		this.pendingStop = false;
		this.chunks = [];
		this.port.onmessage = (event) => {
			const message = event.data || {};
			if (message.type === "configure") {
				this.mode = message.mode;
				this.recordFrameCount = message.recordFrameCount >>> 0;
				this.tailFrames = message.tailFrames >>> 0;
				this.playbackIndex = 0;
				this.framesCaptured = 0;
				this.pendingStop = false;
				this.chunks = [];
				return;
			}
			if (message.type === "playback") {
				this.playback = [new Float32Array(message.left), new Float32Array(message.right)];
				return;
			}
			if (message.type === "stop") {
				this.pendingStop = true;
			}
		};
	}

	pushChunk(left, right) {
		this.chunks.push(left, right);
	}

	flushRecorded() {
		let totalFrames = 0;
		for (let i = 0; i < this.chunks.length; i += 2) {
			totalFrames += this.chunks[i].length;
		}
		const targetFrames = this.recordFrameCount > 0 ? Math.min(totalFrames, this.recordFrameCount) : totalFrames;
		const left = new Float32Array(targetFrames);
		const right = new Float32Array(targetFrames);
		let offset = 0;
		for (let i = 0; i < this.chunks.length; i += 2) {
			if (offset >= targetFrames) {
				break;
			}
			const chunkLeft = this.chunks[i];
			const chunkRight = this.chunks[i + 1];
			const remaining = targetFrames - offset;
			const copyFrames = Math.min(chunkLeft.length, remaining);
			left.set(chunkLeft.subarray(0, copyFrames), offset);
			right.set(chunkRight.subarray(0, copyFrames), offset);
			offset += copyFrames;
		}

		// Apply a short edge fade to avoid discontinuity clicks when capture starts/stops mid-wave.
		const fadeFrames = Math.min(128, Math.floor(targetFrames / 2));
		for (let i = 0; i < fadeFrames; i += 1) {
			const inGain = i / Math.max(1, fadeFrames);
			left[i] *= inGain;
			right[i] *= inGain;

			const endIndex = targetFrames - 1 - i;
			const outGain = (fadeFrames - 1 - i) / Math.max(1, fadeFrames);
			left[endIndex] *= outGain;
			right[endIndex] *= outGain;
		}

		this.chunks = [];
		this.port.postMessage({ type: "recorded", left, right }, [left.buffer, right.buffer]);
	}

	readSample(channel, index) {
		if (!channel || index >= channel.length) {
			return 0;
		}
		return channel[index];
	}

	process(inputs, outputs) {
		const output = outputs[0];
		const outputLeft = output[0];
		const outputRight = output[1] || outputLeft;
		const input = inputs[0] || [];
		const frames = Math.max(
			outputLeft ? outputLeft.length : 0,
			outputRight ? outputRight.length : 0,
			this.mode === "playback" ? this.playback[0].length - this.playbackIndex : 0,
		);

		for (let frame = 0; frame < frames; frame += 1) {
			const playbackLeft = this.mode === "record" ? 0 : this.readSample(this.playback[0], this.playbackIndex + frame);
			const playbackRight = this.mode === "record" ? 0 : this.readSample(this.playback[1], this.playbackIndex + frame);
			if (outputLeft) outputLeft[frame] = playbackLeft;
			if (outputRight) outputRight[frame] = playbackRight;
		}

		if (this.mode !== "playback" && frames > 0) {
			const recordedLeft = new Float32Array(frames);
			const recordedRight = new Float32Array(frames);
			
			if (input[0] && input[0].length > 0) {
				recordedLeft.set(input[0].slice(0, frames));
			}
			if (input[1] && input[1].length > 0) {
				recordedRight.set(input[1].slice(0, frames));
			} else if (input[0] && input[0].length > 0) {
				// Duplicate left channel to right if mono input
				recordedRight.set(input[0].slice(0, frames));
			}
			
			this.pushChunk(recordedLeft, recordedRight);
			this.framesCaptured += frames;
		}

		this.playbackIndex += frames;

		if (this.mode === "playback") {
			if (this.playbackIndex >= this.playback[0].length) {
				this.port.postMessage({ type: "complete" });
				return false;
			}
			return true;
		}

		const recordComplete = this.framesCaptured >= this.recordFrameCount;
		if (this.mode === "record") {
			if (this.pendingStop || recordComplete) {
				this.flushRecorded();
				this.port.postMessage({ type: "complete" });
				return false;
			}
			return true;
		}

		if (this.pendingStop || (this.playbackIndex >= this.playback[0].length && recordComplete)) {
			this.flushRecorded();
			this.port.postMessage({ type: "complete" });
			return false;
		}

		return true;
	}
}

registerProcessor(${JSON.stringify(WORKLET_NAME)}, AudioProcessingWorklet);
`;
}

async function withAudioContext<T>(callback: (context: AudioContext) => Promise<T>): Promise<T> {
	const context = new AudioContext();
	await context.resume();
	try {
		return await callback(context);
	} finally {
		await context.close();
	}
}

function connectMonitor(context: AudioContext, node: AudioNode): void {
	const monitor = context.createGain();
	monitor.gain.value = 1;
	node.connect(monitor).connect(context.destination);
}

function stopStream(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

async function createSelectedInputSource(
	context: AudioContext,
	deviceId?: string,
): Promise<{ source: MediaStreamAudioSourceNode; stream: MediaStream }> {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error("audio input is unavailable in this environment");
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			deviceId: deviceId ? { exact: deviceId } : undefined,
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
			channelCount: 2,
		},
		video: false,
	});

	return {
		source: context.createMediaStreamSource(stream),
		stream,
	};
}

function createMonitorAnalyser(context: AudioContext, fftSize: number): AnalyserNode {
	const analyser = context.createAnalyser();
	analyser.fftSize = fftSize;
	analyser.minDecibels = -120;
	analyser.maxDecibels = 0;
	analyser.smoothingTimeConstant = 0;
	return analyser;
}

async function createMonitorInput(
	context: AudioContext,
	deviceId: string | undefined,
	fftSize: number,
): Promise<MonitorInputNodes> {
	const { source, stream } = await createSelectedInputSource(context, deviceId);
	const splitter = context.createChannelSplitter(2);
	const leftAnalyser = createMonitorAnalyser(context, fftSize);
	const rightAnalyser = createMonitorAnalyser(context, fftSize);
	source.connect(splitter);
	splitter.connect(leftAnalyser, 0);
	splitter.connect(rightAnalyser, 1);
	return {
		stream,
		source,
		splitter,
		leftAnalyser,
		rightAnalyser,
	};
}

function readAnalyserWaveform(analyser: AnalyserNode): Float32Array {
	const waveform = new Float32Array(analyser.fftSize);
	analyser.getFloatTimeDomainData(waveform);
	return waveform;
}

function getSelectedAnalyser(input: MonitorInputNodes, channel: AudioChannelSelection): AnalyserNode {
	return channel === "right" ? input.rightAnalyser : input.leftAnalyser;
}

async function runPlayback(context: AudioContext, playback: StereoBuffer, outputDeviceId?: string): Promise<void> {
	const outputRouter = await createAudioOutputRouter(context, outputDeviceId);
	const session = await createAudioProcessingWorkletSession(context, {
		mode: "playback",
		playback,
	});
	session.node.connect(outputRouter.destination);
	try {
		await session.recorded;
	} finally {
		outputRouter.stop();
		session.disconnect();
	}
}

async function runRecording(
	context: AudioContext,
	recordFrameCount: number,
	deviceId?: string,
	playback?: StereoBuffer,
	recordTailFrames = 0,
	outputDeviceId?: string,
): Promise<StereoBuffer> {
	const outputRouter = playback ? await createAudioOutputRouter(context, outputDeviceId) : null;
	const session = await createAudioProcessingWorkletSession(context, {
		mode: playback ? "duplex" : "record",
		playback,
		recordFrameCount,
		recordTailFrames,
	});
	if (outputRouter) {
		session.node.connect(outputRouter.destination);
	}

	let input: { source: MediaStreamAudioSourceNode; stream: MediaStream } | null = null;
	try {
		input = await createSelectedInputSource(context, deviceId);
		input.source.connect(session.node);
		return await session.recorded;
	} finally {
		if (outputRouter) {
			outputRouter.stop();
		}
		if (input) {
			input.source.disconnect();
			stopStream(input.stream);
		}
		session.disconnect();
	}
}

export async function play(samples: NumberArray, outputDeviceId?: string): Promise<void> {
	await withAudioContext(async (context) => {
		await runPlayback(context, numberArrayToStereoBuffer(samples), outputDeviceId);
	});
}

export async function record(durationSeconds: number, deviceId?: string): Promise<StereoBuffer> {
	if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
		throw new Error("durationSeconds must be a non-negative number");
	}

	return await withAudioContext(async (context) => {
		const recordFrameCount = Math.max(0, Math.round(context.sampleRate * durationSeconds));
		return await runRecording(context, recordFrameCount, deviceId);
	});
}

export async function playAndRecord(
	samples: NumberArray,
	deviceId?: string,
	paddingSeconds = 0,
	outputDeviceId?: string,
): Promise<StereoBuffer> {
	if (!Number.isFinite(paddingSeconds) || paddingSeconds < 0) {
		throw new Error("paddingSeconds must be a non-negative number");
	}

	return await withAudioContext(async (context) => {
		const playback = numberArrayToStereoBuffer(samples);
		const recordTailFrames = Math.max(0, Math.round(context.sampleRate * paddingSeconds));
		return await runRecording(context, playback[0].length + recordTailFrames, deviceId, playback, recordTailFrames, outputDeviceId);
	});
}

export async function startPlayAndRecord(
	samples: NumberArray,
	options: AudioRoutingOptions & { paddingSeconds?: number } = {},
): Promise<ActiveDuplexSession> {
	const {
		inputDeviceId,
		outputDeviceId,
		inputChannel = "left",
		outputChannel = "left",
		paddingSeconds = 0,
	} = options;

	if (!Number.isFinite(paddingSeconds) || paddingSeconds < 0) {
		throw new Error("paddingSeconds must be a non-negative number");
	}

	const context = new AudioContext();
	await context.resume();

	const playback = routePlaybackToChannel(samples, outputChannel);
	const recordTailFrames = Math.max(0, Math.round(context.sampleRate * paddingSeconds));
	const recordFrameCount = playback[0].length + recordTailFrames;

	let outputRouter: AudioOutputRouter | null = null;
	let input: { source: MediaStreamAudioSourceNode; stream: MediaStream } | null = null;
	let session: AudioProcessingWorkletSession | null = null;
	let cleanedUp = false;

	const cleanup = async (): Promise<void> => {
		if (cleanedUp) {
			return;
		}
		cleanedUp = true;

		if (input) {
			input.source.disconnect();
			stopStream(input.stream);
			input = null;
		}

		if (session) {
			session.disconnect();
			session = null;
		}

		if (outputRouter) {
			outputRouter.stop();
			outputRouter = null;
		}

		await context.close();
	};

	try {
		outputRouter = await createAudioOutputRouter(context, outputDeviceId);
		session = await createAudioProcessingWorkletSession(context, {
			mode: "duplex",
			playback,
			recordFrameCount,
			recordTailFrames,
		});
		session.node.connect(outputRouter.destination);

		input = await createSelectedInputSource(context, inputDeviceId);
		input.source.connect(session.node);

		const recorded = session.recorded.then((buffer) => selectRecordedChannel(buffer, inputChannel)).finally(() => {
			void cleanup();
		});

		return {
			recorded,
			stop: async () => {
				if (!session) {
					return recorded;
				}
				return session.stop();
			},
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}

export async function startLiveMonitor(options: LiveMonitorOptions = {}): Promise<LiveMonitorSession> {
	const {
		micDeviceId,
		micChannel = "left",
		referenceDeviceId,
		referenceChannel = "left",
		fftSize = 4096,
	} = options;

	const context = new AudioContext();
	await context.resume();

	let micInput: MonitorInputNodes | null = null;
	let referenceInput: MonitorInputNodes | null = null;
	let closed = false;
	const useSharedInput = !!referenceDeviceId && referenceDeviceId === micDeviceId;

	const cleanup = async (): Promise<void> => {
		if (closed) {
			return;
		}
		closed = true;

		const inputs = new Set<MonitorInputNodes>();
		if (micInput) {
			inputs.add(micInput);
		}
		if (referenceInput) {
			inputs.add(referenceInput);
		}
		for (const input of inputs) {
			input.source.disconnect();
			input.splitter.disconnect();
			stopStream(input.stream);
		}

		await context.close();
	};

	try {
		micInput = await createMonitorInput(context, micDeviceId, fftSize);
		if (referenceDeviceId) {
			referenceInput = useSharedInput ? micInput : await createMonitorInput(context, referenceDeviceId, fftSize);
		}

		return {
			sampleRate: context.sampleRate,
			getSnapshot: () => ({
				sampleRate: context.sampleRate,
				micWaveform: readAnalyserWaveform(getSelectedAnalyser(micInput as MonitorInputNodes, micChannel)),
				referenceWaveform: referenceInput ? readAnalyserWaveform(getSelectedAnalyser(referenceInput, referenceChannel)) : null,
			}),
			stop: cleanup,
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}

async function loadWorkletModule(context: AudioContext): Promise<void> {
	if (cachedModuleUrl === null) {
		cachedModuleUrl = URL.createObjectURL(new Blob([buildWorkletSource()], { type: "text/javascript" }));
	}
	await context.audioWorklet.addModule(cachedModuleUrl);
}

function postPlayback(node: AudioWorkletNode, playback: StereoBuffer): void {
	node.port.postMessage({ type: "playback", left: playback[0], right: playback[1] });
}

function waitForRecordedBuffer(node: AudioWorkletNode): Promise<StereoBuffer> {
	return new Promise((resolve) => {
		const chunks: StereoBuffer[] = [];
		const onMessage = (event: MessageEvent) => {
			const message = event.data;
			if (!message || typeof message !== "object") {
				return;
			}
			if (message.type === "recorded") {
				chunks.push([new Float32Array(message.left), new Float32Array(message.right)]);
				return;
			}
			if (message.type === "complete") {
				node.port.removeEventListener("message", onMessage);
				resolve(concatStereoBuffers(chunks));
			}
		};
		node.port.addEventListener("message", onMessage);
		node.port.start();
	});
}

async function createAudioProcessingWorkletSession(
	context: AudioContext,
	request: AudioProcessingWorkletRequest,
): Promise<AudioProcessingWorkletSession> {
	const plan = planAudioProcessingWorklet(request);
	await loadWorkletModule(context);

	const node = new AudioWorkletNode(context, WORKLET_NAME, {
		numberOfInputs: 1,
		numberOfOutputs: 1,
		outputChannelCount: [2],
		channelCount: 2,
		channelCountMode: "explicit",
		channelInterpretation: "speakers",
	});

	const recorded = waitForRecordedBuffer(node);
	node.port.postMessage({
		type: "configure",
		mode: plan.mode,
		recordFrameCount: plan.recordFrameCount,
		tailFrames: plan.recordTailFrames,
	});

	if (plan.mode !== "record") {
		postPlayback(node, requireStereoBuffer(request.playback, "playback"));
	}

	return {
		node,
		recorded,
		stop: async () => {
			node.port.postMessage({ type: "stop" });
			return recorded;
		},
		disconnect: () => {
			node.disconnect();
		},
	};
}
