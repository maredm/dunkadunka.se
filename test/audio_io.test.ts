import { expect, test } from "bun:test";

import { createSilenceStereo, concatStereoBuffers, numberArrayToStereoBuffer } from "../src/signal";
import { planAudioProcessingWorklet, routePlaybackToChannel, selectRecordedChannel } from "../src/audio_io";
import { createStereoWavBlob, encodeMultichannelWav, encodeStereoWav, readMultichannelWavFile, readStereoWavFile } from "../src/wavfile";

test("plans playback-only processing", () => {
	const playback = createSilenceStereo(128);
	const plan = planAudioProcessingWorklet({ mode: "playback", playback });

	expect(plan.mode).toBe("playback");
	expect(plan.playbackFrameCount).toBe(128);
	expect(plan.recordFrameCount).toBe(0);
	expect(plan.recordTailFrames).toBe(0);
});

test("plans record-only processing", () => {
	const plan = planAudioProcessingWorklet({ mode: "record", recordFrameCount: 256 });

	expect(plan.mode).toBe("record");
	expect(plan.playbackFrameCount).toBe(0);
	expect(plan.recordFrameCount).toBe(256);
	expect(plan.recordTailFrames).toBe(0);
});

test("duplex mode extends recording beyond playback when requested", () => {
	const playback = createSilenceStereo(100);
	const plan = planAudioProcessingWorklet({ mode: "duplex", playback, recordTailFrames: 32 });

	expect(plan.mode).toBe("duplex");
	expect(plan.playbackFrameCount).toBe(100);
	expect(plan.recordFrameCount).toBe(132);
	expect(plan.recordTailFrames).toBe(32);
});

test("duplex mode accepts an explicit longer recording length", () => {
	const playback = createSilenceStereo(64);
	const plan = planAudioProcessingWorklet({ mode: "duplex", playback, recordFrameCount: 96 });

	expect(plan.recordFrameCount).toBe(96);
	expect(plan.recordTailFrames).toBe(32);
});

test("concatStereoBuffers preserves stereo channel alignment", () => {
	const leftOne = new Float32Array([1, 2]);
	const rightOne = new Float32Array([3, 4]);
	const leftTwo = new Float32Array([5]);
	const rightTwo = new Float32Array([6]);
	const [left, right] = concatStereoBuffers([
		[leftOne, rightOne],
		[leftTwo, rightTwo],
	]);

	expect(Array.from(left)).toEqual([1, 2, 5]);
	expect(Array.from(right)).toEqual([3, 4, 6]);
});

test("numberArrayToStereoBuffer duplicates a mono signal to both channels", () => {
	const stereo = numberArrayToStereoBuffer([1, 0.5, -0.25]);

	expect(Array.from(stereo[0])).toEqual([1, 0.5, -0.25]);
	expect(Array.from(stereo[1])).toEqual([1, 0.5, -0.25]);
	expect(stereo[0]).not.toBe(stereo[1]);
});

test("routePlaybackToChannel mutes the opposite playback channel", () => {
	const left = routePlaybackToChannel([1, 2], "left");
	const right = routePlaybackToChannel([1, 2], "right");

	expect(Array.from(left[0])).toEqual([1, 2]);
	expect(Array.from(left[1])).toEqual([0, 0]);
	expect(Array.from(right[0])).toEqual([0, 0]);
	expect(Array.from(right[1])).toEqual([1, 2]);
});

test("selectRecordedChannel duplicates the chosen capture channel", () => {
	const selected = selectRecordedChannel([
		new Float32Array([1, 2]),
		new Float32Array([3, 4]),
	], "right");

	expect(Array.from(selected[0])).toEqual([3, 4]);
	expect(Array.from(selected[1])).toEqual([3, 4]);
	expect(selected[0]).not.toBe(selected[1]);
});

test("encodeStereoWav writes a stereo pcm wav header", () => {
	const left = new Float32Array([0, 1]);
	const right = new Float32Array([0, -1]);
	const buffer = encodeStereoWav([left, right], 48000);
	const view = new DataView(buffer);

	expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
	expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
	expect(view.getUint16(22, true)).toBe(2);
	expect(view.getUint32(24, true)).toBe(48000);
	expect(view.getUint16(34, true)).toBe(16);
	expect(view.getUint32(40, true)).toBe(8);
	expect(view.getInt16(44, true)).toBe(0);
	expect(view.getInt16(46, true)).toBe(0);
	expect(view.getInt16(48, true)).toBe(32767);
	expect(view.getInt16(50, true)).toBe(-32768);
});

test("createStereoWavBlob returns an audio wav blob", async () => {
	const blob = createStereoWavBlob([new Float32Array(1), new Float32Array(1)], 44100);

	expect(blob.type).toBe("audio/wav");
	expect(blob.size).toBe(48);
	const arrayBuffer = await blob.arrayBuffer();
	expect(arrayBuffer.byteLength).toBe(48);
});

test("readStereoWavFile decodes a stereo pcm wav file", async () => {
	const left = new Float32Array([0, 1, -1]);
	const right = new Float32Array([0.5, -0.5, 0.25]);
	const file = new File([encodeStereoWav([left, right], 48000)], "test.wav", { type: "audio/wav" });
	const decoded = await readStereoWavFile(file);

	expect(decoded.sampleRate).toBe(48000);
	expect(Array.from(decoded.stereo[0])).toEqual([0, 1, -1]);
	expect(Array.from(decoded.stereo[1])).toEqual([0.5, -0.5, 0.25]);
});

test("readMultichannelWavFile decodes up to 32 channels", async () => {
	const channels = [
		new Float32Array([0, 1]),
		new Float32Array([0.25, -0.25]),
		new Float32Array([-0.5, 0.5]),
		new Float32Array([1, -1]),
	];
	const file = new File([encodeMultichannelWav(channels, 44100)], "test.wav", { type: "audio/wav" });
	const decoded = await readMultichannelWavFile(file);

	expect(decoded.sampleRate).toBe(44100);
	expect(decoded.channels.length).toBe(4);
	expect(Array.from(decoded.channels[0])).toEqual([0, 1]);
	expect(Array.from(decoded.channels[3])).toEqual([1, -1]);
});