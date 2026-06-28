export type WavFileData = {
	sampleRate: number;
	channels: number;
	bitsPerSample: number;
	format: number;
	data: Uint8Array;
};

export type StereoBuffer = readonly [Float32Array, Float32Array];

function readAscii(view: DataView, offset: number, length: number): string {
	let out = "";
	for (let i = 0; i < length; i += 1) {
		out += String.fromCharCode(view.getUint8(offset + i));
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
			format = view.getUint16(chunkDataOffset, true);
			channels = view.getUint16(chunkDataOffset + 2, true);
			sampleRate = view.getUint32(chunkDataOffset + 4, true);
			bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
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

export function encodeStereoWav(stereo: StereoBuffer, sampleRate: number): ArrayBuffer {
	requireStereoBuffer(stereo);
	if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(sampleRate)) {
		throw new Error("sampleRate must be a positive integer");
	}

	const frameCount = stereo[0].length;
	const bitsPerSample = 16;
	const channels = 2;
	const bytesPerSample = bitsPerSample / 8;
	const blockAlign = channels * bytesPerSample;
	const dataSize = frameCount * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeAscii(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let frame = 0; frame < frameCount; frame += 1) {
		view.setInt16(offset, sampleToPcm16(stereo[0][frame]), true);
		view.setInt16(offset + 2, sampleToPcm16(stereo[1][frame]), true);
		offset += blockAlign;
	}

	return buffer;
}

export function createStereoWavBlob(stereo: StereoBuffer, sampleRate: number): Blob {
	return new Blob([encodeStereoWav(stereo, sampleRate)], { type: "audio/wav" });
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
