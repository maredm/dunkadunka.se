import fs from "node:fs";
import path from "node:path";
import nunjucks from "nunjucks";

const projectRoot = path.resolve(import.meta.dirname, "..");
const templatePath = path.join(projectRoot, "index.xhtml");
const outputPath = path.join(projectRoot, "index.html");

const context = {
	lang: "en",
	charset: "utf-8",
	viewport: "width=device-width, initial-scale=1",
	title: "Update - Audio processing demo",
	stylesheetHref: "dist/app.css",
	scriptSrc: "dist/app.js",
};

const rendered = nunjucks.render(templatePath, context);
fs.writeFileSync(outputPath, rendered, "utf-8");

console.log(`Rendered ${path.relative(projectRoot, outputPath)} from ${path.relative(projectRoot, templatePath)}`);