import { type NumberArray, type StereoBuffer, numberArrayToStereoBuffer, concatStereoBuffers } from "./signal";

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

type AudioOutputRouter = {
	destination: MediaStreamAudioDestinationNode;
	audioElement: HTMLAudioElement;
	stop(): void;
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

async function createAudioOutputRouter(context: AudioContext, outputDeviceId?: string): Promise<AudioOutputRouter> {
	const destination = context.createMediaStreamDestination();
	const audioElement = document.createElement("audio");
	audioElement.autoplay = true;
	audioElement.srcObject = destination.stream;
	audioElement.style.display = "none";
	document.body.append(audioElement);

	if (outputDeviceId && typeof audioElement.setSinkId === "function") {
		try {
			await audioElement.setSinkId(outputDeviceId);
		} catch {
			// Fall back to the default output device if the browser rejects the sink change.
		}
	}

	await audioElement.play();

	return {
		destination,
		audioElement,
		stop: () => {
			audioElement.pause();
			audioElement.srcObject = null;
			audioElement.remove();
		},
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
class StereoAudioProcessingWorklet extends AudioWorkletProcessor {
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
		const left = new Float32Array(totalFrames);
		const right = new Float32Array(totalFrames);
		let offset = 0;
		for (let i = 0; i < this.chunks.length; i += 2) {
			left.set(this.chunks[i], offset);
			right.set(this.chunks[i + 1], offset);
			offset += this.chunks[i].length;
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
		const input = this.mode === "duplex" ? (inputs[1] || []) : (inputs[0] || []);
		const playbackInput = inputs[0] || [];
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

			if (this.mode !== "playback") {
				const source = this.mode === "duplex" ? input : playbackInput;
				const left = this.readSample(source[0], frame);
				const right = this.readSample(source[1] || source[0], frame);
				this.pushChunk(Float32Array.of(left), Float32Array.of(right));
				this.framesCaptured += 1;
			}
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

registerProcessor(${JSON.stringify(WORKLET_NAME)}, StereoAudioProcessingWorklet);
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
		input.source.connect(session.node, 0, playback ? 1 : 0);
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
		numberOfInputs: plan.mode === "duplex" ? 2 : 1,
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
