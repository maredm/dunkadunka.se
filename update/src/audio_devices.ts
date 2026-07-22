export type AudioDeviceKind = "audioinput" | "audiooutput";

export type AudioDeviceOption = {
	deviceId: string;
	label: string;
};

function getStorage(): Storage | null {
	try {
		return globalThis.localStorage;
	} catch {
		return null;
	}
}

function readCachedValue(key: string): string {
	return getStorage()?.getItem(key) ?? "";
}

function writeCachedValue(key: string, value: string): void {
	getStorage()?.setItem(key, value);
}

export async function listAudioDevices(kind: AudioDeviceKind): Promise<AudioDeviceOption[]> {
	if (!navigator.mediaDevices?.enumerateDevices) {
		return [];
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	let fallbackIndex = 0;
	return devices
		.filter((device) => device.kind === kind)
		.map((device) => {
			fallbackIndex += 1;
			return {
				deviceId: device.deviceId,
				label: device.label || `${kind === "audioinput" ? "Input" : "Output"} ${fallbackIndex}`,
			};
		});
}

export function setAudioDeviceSelectOptions(
	select: HTMLSelectElement,
	options: AudioDeviceOption[],
	defaultLabel: string,
	defaultValue = "",
): void {
	const previousValue = select.value;
	select.replaceChildren();

	const defaultOption = document.createElement("option");
	defaultOption.value = defaultValue;
	defaultOption.textContent = defaultLabel;
	select.append(defaultOption);

	for (const option of options) {
		const element = document.createElement("option");
		element.value = option.deviceId;
		element.textContent = option.label;
		select.append(element);
	}

	if (previousValue === defaultValue || options.some((option) => option.deviceId === previousValue)) {
		select.value = previousValue;
		if (select.value !== previousValue) {
			select.value = defaultValue;
		}
	} else {
		select.value = defaultValue;
	}
}

export function restoreCachedFieldValue(field: HTMLInputElement | HTMLSelectElement, key: string, defaultValue = ""): void {
	const cachedValue = readCachedValue(key);
	field.value = cachedValue || defaultValue;
	if (field.value !== cachedValue && field.value !== defaultValue) {
		field.value = defaultValue;
	}
}

export function bindCachedFieldValue(field: HTMLInputElement | HTMLSelectElement, key: string): void {
	field.addEventListener("change", () => {
		writeCachedValue(key, field.value);
	});
}