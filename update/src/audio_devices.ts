export type AudioDeviceKind = "audioinput" | "audiooutput";

export type AudioDeviceOption = {
	deviceId: string;
	label: string;
};

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