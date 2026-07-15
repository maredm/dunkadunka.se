import { type MultichannelBuffer, type StereoBuffer } from "./signal";

export type WavFileData = {
	sampleRate: number;
	channels: number;
	bitsPerSample: number;
	format: number;
	data: Uint8Array;
};

function readAscii(view: DataView, offset: number, length: number): string {
	let out = "";
	for (let index = 0; index < length; index += 1) {
		out += String.fromCharCode(view.getUint8(offset + index));
	}
	return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let index = 0; index < text.length; index += 1) {
		view.setUint8(offset + index, text.charCodeAt(index));
	}
}

function requireStereoBuffer(buffer: StereoBuffer): StereoBuffer {
	if (buffer[0].length !== buffer[1].length) {
		throw new Error("Stereo channels must have the same length");
	}
	return buffer;
}

function requireMultichannelBuffer(buffer: MultichannelBuffer): MultichannelBuffer {
	if (buffer.length === 0) {
		throw new Error("WAV file must have at least one channel");
	}

	const frameCount = buffer[0].length;
	if (buffer.some((channel) => channel.length !== frameCount)) {
		throw new Error("All channels must have the same length");
	}

	if (buffer.length > 32) {
		throw new Error("WAV files with more than 32 channels are not supported");
	}

	return buffer;
}

function sampleToPcm16(sample: number): number {
	if (!Number.isFinite(sample)) {
		return 0;
	}

	const clamped = Math.max(-1, Math.min(1, sample));
	return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

/**
 * Read raw wave data from a File object.
 */
export async function readWavFile(file: File): Promise<WavFileData> {
	const buffer = await file.arrayBuffer();
	const view = new DataView(buffer);

	if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
		throw new Error("Invalid WAV file");
	}

	let offset = 12;
	let format = 0;
	let channels = 0;
	let sampleRate = 0;
	let bitsPerSample = 0;
	let dataOffset = -1;
	let dataSize = 0;

	while (offset + 8 <= view.byteLength) {
		const chunkId = readAscii(view, offset, 4);
		const chunkSize = view.getUint32(offset + 4, true);
		const chunkDataOffset = offset + 8;

		if (chunkId === "fmt ") {
			const audioFormat = view.getUint16(chunkDataOffset, true);
			channels = view.getUint16(chunkDataOffset + 2, true);
			sampleRate = view.getUint32(chunkDataOffset + 4, true);
			bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
			format = audioFormat === 0xfffe && chunkSize >= 40
				? view.getUint16(chunkDataOffset + 24, true)
				: audioFormat;
		} else if (chunkId === "data") {
			dataOffset = chunkDataOffset;
			dataSize = chunkSize;
			break;
		}

		offset = chunkDataOffset + chunkSize + (chunkSize % 2);
	}

	if (dataOffset < 0) {
		throw new Error("WAV data chunk not found");
	}

	return {
		format,
		channels,
		sampleRate,
		bitsPerSample,
		data: new Uint8Array(buffer, dataOffset, dataSize),
	};
}

function readPcmSample(view: DataView, byteOffset: number, bitsPerSample: number, format: number): number {
	if (format === 3 && bitsPerSample === 32) {
		return view.getFloat32(byteOffset, true);
	}

	switch (bitsPerSample) {
		case 8:
			return (view.getUint8(byteOffset) - 128) / 128;
		case 16:
			return view.getInt16(byteOffset, true) / 32768;
		case 24: {
			const b0 = view.getUint8(byteOffset);
			const b1 = view.getUint8(byteOffset + 1);
			const b2 = view.getUint8(byteOffset + 2);
			const signed = (b2 << 24) | (b1 << 16) | (b0 << 8);
			return signed / 2147483648;
		}
		case 32:
			return format === 3 ? view.getFloat32(byteOffset, true) : view.getInt32(byteOffset, true) / 2147483648;
		default:
			throw new Error(`Unsupported WAV sample format: format=${format}, bits=${bitsPerSample}`);
	}
}

export async function readMultichannelWavFile(file: File): Promise<{ sampleRate: number; channels: MultichannelBuffer }> {
	const wav = await readWavFile(file);
	if (wav.channels < 1) {
		throw new Error("WAV file has no channels");
	}
	if (wav.channels > 32) {
		throw new Error("WAV files with more than 32 channels are not supported");
	}

	const bytesPerSample = wav.bitsPerSample / 8;
	if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
		throw new Error("Unsupported WAV bit depth");
	}

	const bytesPerFrame = bytesPerSample * wav.channels;
	const frameCount = Math.floor(wav.data.length / bytesPerFrame);
	const view = new DataView(wav.data.buffer, wav.data.byteOffset, wav.data.byteLength);
	const channels: Float32Array[] = Array.from({ length: wav.channels }, () => new Float32Array(frameCount));

	for (let frame = 0; frame < frameCount; frame += 1) {
		const frameOffset = frame * bytesPerFrame;
		for (let channel = 0; channel < wav.channels; channel += 1) {
			channels[channel][frame] = readPcmSample(view, frameOffset + (channel * bytesPerSample), wav.bitsPerSample, wav.format);
		}
	}

	return {
		sampleRate: wav.sampleRate,
		channels,
	};
}

export async function readStereoWavFile(file: File): Promise<{ sampleRate: number; stereo: StereoBuffer }> {
	const wav = await readMultichannelWavFile(file);
	const left = wav.channels[0] ?? new Float32Array(0);
	const right = wav.channels[1] ?? new Float32Array(left);

	return {
		sampleRate: wav.sampleRate,
		stereo: [left, right],
	};
}

export function encodeMultichannelWav(channels: MultichannelBuffer, sampleRate: number): ArrayBuffer {
	requireMultichannelBuffer(channels);
	if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(sampleRate)) {
		throw new Error("sampleRate must be a positive integer");
	}

	const frameCount = channels[0].length;
	const bitsPerSample = 16;
	const channelCount = channels.length;
	const bytesPerSample = bitsPerSample / 8;
	const blockAlign = channelCount * bytesPerSample;
	const dataSize = frameCount * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeAscii(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let channel = 0; channel < channelCount; channel += 1) {
			view.setInt16(offset, sampleToPcm16(channels[channel][frame]), true);
			offset += bytesPerSample;
		}
	}

	return buffer;
}

export function encodeStereoWav(stereo: StereoBuffer, sampleRate: number): ArrayBuffer {
	requireStereoBuffer(stereo);
	return encodeMultichannelWav(stereo, sampleRate);
}

export function createMultichannelWavBlob(channels: MultichannelBuffer, sampleRate: number): Blob {
	return new Blob([encodeMultichannelWav(channels, sampleRate)], { type: "audio/wav" });
}

export function createStereoWavBlob(stereo: StereoBuffer, sampleRate: number): Blob {
	return new Blob([encodeStereoWav(stereo, sampleRate)], { type: "audio/wav" });
}

export function downloadMultichannelWav(channels: MultichannelBuffer, sampleRate: number, fileName = "recording.wav"): void {
	const blob = createMultichannelWavBlob(channels, sampleRate);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.rel = "noopener";
	anchor.style.display = "none";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	queueMicrotask(() => URL.revokeObjectURL(url));
}

export function downloadStereoWav(stereo: StereoBuffer, sampleRate: number, fileName = "recording.wav"): void {
	const blob = createStereoWavBlob(stereo, sampleRate);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.rel = "noopener";
	anchor.style.display = "none";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	queueMicrotask(() => URL.revokeObjectURL(url));
}
