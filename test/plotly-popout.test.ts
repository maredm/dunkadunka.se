import { expect, test } from "bun:test";

import { buildPopupLayout } from "../src/plotting/plotly-popout";

test("buildPopupLayout uses the popup viewport when sizing the plot", () => {
	const layout = {
		title: "Spectrum",
		autosize: true,
		margin: { t: 40, r: 20, b: 20, l: 20 },
	};

	const popupLayout = buildPopupLayout(layout, 1280, 720);

	expect(popupLayout).toMatchObject({
		title: "Spectrum",
		autosize: false,
		width: 1280,
		height: 720,
	});
});
