# update

Web audio tool with Bun + TypeScript, now runnable as a desktop app with Electron.

## Install

- `bun install`

## Web workflow

- `bun run dev` - Watch and rebuild renderer into `static/`.
- `bun run build` - Build renderer and regenerate `index.html`.
- `bun run check` - TypeScript check.
- `bun test` - Run tests.

## Electron workflow

- `bun run electron:start` - Launch Electron once (builds `index.html` first).
- `bun run electron:dev` - Run renderer watch and Electron together.
- `bun run electron:pack` - Build unpacked desktop bundle.
- `bun run electron:dist` - Build distributables for Linux, macOS, and Windows.

## Notes

- Renderer remains browser-like (`contextIsolation` enabled, `nodeIntegration` disabled).
- Microphone access uses Electron permission handling in the main process.
- Packaging output is written to `dist-electron/`.