import { expect, test } from "bun:test";

const template = await Bun.file(new URL("../index.xhtml", import.meta.url)).text();
const appSource = await Bun.file(new URL("../src/app.ts", import.meta.url)).text();

test("welcome page is standalone and opens on startup", () => {
	expect(template).toContain('data-content="welcome"');
	expect(template).not.toContain('data-tab="welcome"');
	expect(template).toContain('id="welcomeHomeButton"');
	expect(appSource).toContain('switchTab("welcome");');
});

test("welcome page covers the primary workflows and views", () => {
	for (const label of ["Acquisition", "Live", "SPL mode", "Waveform view", "Analysis view"]) {
		expect(template).toContain(label);
	}
});

test("welcome page shows real waveform and analysis screenshots", () => {
	for (const screenshot of ["waveform.png", "analysis.png"]) {
		expect(template).toContain(`src="static/screenshots/${screenshot}"`);
		expect(Bun.file(new URL(`../static/screenshots/${screenshot}`, import.meta.url)).size).toBeGreaterThan(0);
	}
});

test("SPL mode has a dedicated tab and welcome action", () => {
	expect(template).toContain('data-tab="spl"');
	expect(template).toContain('data-content="spl"');
	expect(template).toContain('data-welcome-target="spl"');
});