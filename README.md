# Stream Deck Plugins

Personal Stream Deck plugins built with the [Elgato Stream Deck SDK](https://docs.elgato.com/sdk).

## Plugins

### Battery Status (`batterystatus/`)

Displays the wireless mouse battery level on a Stream Deck key. Supports:

- **Corsair** mice via iCUE (uses the Corsair iCUE SDK)
- **Logitech G502 Lightspeed** (and compatible) via direct HID++ communication over the LIGHTSPEED USB receiver

Press the key to cycle between Corsair and Logitech device sources. The icon changes colour based on charge level (good / fair / poor), and the percentage is shown as the key title.

---

## Building

### Prerequisites

- [Node.js](https://nodejs.org/) v20
- [Stream Deck software](https://www.elgato.com/software-overview) v6.9 or later
- The [`streamdeck` CLI](https://docs.elgato.com/sdk/plugins/getting-started) (installed via `@elgato/cli`)

### Install dependencies

```bash
cd batterystatus
npm install
```

### Development build (watch mode)

Rebuilds on every file change and automatically restarts the plugin in Stream Deck:

```bash
npm run watch
```

### Production build

```bash
npm run build
```

The compiled plugin is output to `com.ash-matheson.batterystatus.sdPlugin/bin/plugin.js`.

### Linting

```bash
npm run lint
```

---

## Libraries

| Package | Purpose |
|---|---|
| [`@elgato/streamdeck`](https://github.com/elgatosf/streamdeck) | Stream Deck plugin SDK — WebSocket communication, action lifecycle, settings |
| [`cue-sdk`](https://github.com/CorsairOfficial/cue-sdk-node) | Node.js bindings for the Corsair iCUE SDK |
| [`koffi`](https://koffi.dev/) | FFI library used to call `CorsairReadDeviceProperty` directly from the iCUE DLL |
| [`node-hid`](https://github.com/node-hid/node-hid) | Raw HID access for Logitech HID++ communication over the LIGHTSPEED receiver |
| [`rollup`](https://rollupjs.org/) | Bundler — produces the single `plugin.js` file required by the SDK |
| [`typescript`](https://www.typescriptlang.org/) | Language |

---

## Contributing

1. Fork the repository and create a branch from `main`.
2. Install dependencies (`npm install` inside the plugin directory).
3. Make your changes in `src/`. Run `npm run watch` to test live against Stream Deck.
4. Ensure `npm run lint` passes with zero warnings before opening a PR.
5. Open a pull request with a clear description of what was changed and why.

### Project structure

```
batterystatus/
├── src/
│   ├── actions/
│   │   └── battery-status.ts   # Stream Deck action (poll loop, icon/title updates)
│   ├── corsair.ts              # iCUE SDK integration
│   ├── logitech.ts             # HID++ battery reader for Logitech receivers
│   └── plugin.ts               # Entry point — registers actions and connects to Stream Deck
├── com.ash-matheson.batterystatus.sdPlugin/
│   ├── bin/                    # Compiled output (do not edit by hand)
│   ├── imgs/                   # Plugin and action icons
│   ├── ui/                     # Property Inspector HTML pages
│   └── manifest.json           # Plugin metadata and action declarations
└── package.json
```
