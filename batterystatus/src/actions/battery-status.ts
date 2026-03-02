import { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { DialAction, KeyAction } from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findWirelessMouse, readMouseBattery } from "../corsair";
import { readG502Battery } from "../logitech";

const POLL_INTERVAL_MS = 30_000;

type BatterySettings = {
	device?: "corsair" | "logitech";
	titlePosition?: "top" | "bottom";
};

// State indices defined in manifest.json States array:
//   0 → TitleAlignment "top"
//   1 → TitleAlignment "bottom"
const STATE_TOP = 0;
const STATE_BOTTOM = 1;

type ActionEntry = {
	action: DialAction | KeyAction;
	settings: BatterySettings;
};

// Battery level thresholds for icon selection
const THRESHOLD_GOOD = 75; // > 75% → good
const THRESHOLD_FAIR = 30; // 30–75% → fair, < 30% → poor

type BatteryIcons = { good: string; fair: string; poor: string };

// Loaded once on first use; null if the image files are missing.
let icons: BatteryIcons | null | undefined = undefined;

function loadIcons(): BatteryIcons | null {
	if (icons !== undefined) return icons;

	try {
		// At runtime, import.meta.url resolves to sdPlugin/bin/plugin.js.
		// Battery icons live at sdPlugin/imgs/actions/battery/.
		const imgsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../imgs/actions/battery");
		const toDataUrl = (file: string): string => {
			const data = readFileSync(resolve(imgsDir, file));
			return `data:image/png;base64,${data.toString("base64")}`;
		};

		icons = {
			good: toDataUrl("good.png"),
			fair: toDataUrl("fair.png"),
			poor: toDataUrl("poor.png"),
		};
	} catch {
		icons = null;
	}

	return icons;
}

function iconForLevel(level: number, imgs: BatteryIcons): string {
	if (level > THRESHOLD_GOOD) return imgs.good;
	if (level >= THRESHOLD_FAIR) return imgs.fair;
	return imgs.poor;
}

@action({ UUID: "com.ash-matheson.batterystatus.battery" })
export class BatteryStatus extends SingletonAction<BatterySettings> {
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private readonly visibleActions = new Map<string, ActionEntry>();

	override onWillAppear(ev: WillAppearEvent<BatterySettings>): void {
		this.visibleActions.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
		if (this.intervalId === null) {
			void this.pollAll();
			this.intervalId = setInterval(() => void this.pollAll(), POLL_INTERVAL_MS);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<BatterySettings>): void {
		this.visibleActions.delete(ev.action.id);
		if (this.visibleActions.size === 0 && this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<BatterySettings>): void {
		const entry = this.visibleActions.get(ev.action.id);
		if (entry) {
			entry.settings = ev.payload.settings;
			void this.updateAction(entry);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<BatterySettings>): Promise<void> {
		const entry = this.visibleActions.get(ev.action.id);
		if (!entry) return;

		const devices: Array<BatterySettings["device"]> = ["corsair", "logitech"];
		const current = entry.settings.device ?? "corsair";
		const next = devices[(devices.indexOf(current) + 1) % devices.length];

		entry.settings = { ...entry.settings, device: next };
		await ev.action.setSettings(entry.settings);
		await this.updateAction(entry);
	}

	private async pollAll(): Promise<void> {
		// Resolve Corsair mouse ID once per cycle so all Corsair-type keys share it.
		const corsairMouseId = findWirelessMouse();

		for (const entry of this.visibleActions.values()) {
			await this.updateAction(entry, corsairMouseId);
		}
	}

	private async updateAction(entry: ActionEntry, corsairMouseId?: string | null): Promise<void> {
		if (!entry.action.isKey()) return;

		const device = entry.settings.device ?? "corsair";
		let level: number | null;

		if (device === "corsair") {
			const mouseId = corsairMouseId ?? findWirelessMouse();
			level = mouseId ? readMouseBattery(mouseId) : null;
		} else {
			level = readG502Battery();
		}

		// Icon: set for all states so it persists across alignment state switches.
		// Stream Deck scales the image to fill the key.
		const imgs = loadIcons();
		if (imgs && level !== null) {
			await entry.action.setImage(iconForLevel(level, imgs));
		} else {
			await entry.action.setImage(); // reset to manifest default
		}

		// Title: percentage text, or a fallback when the device isn't reachable.
		const title = level !== null ? `${level}%` : (device === "corsair" ? "N/A" : "?");

		// Apply title alignment via state, then set text for all states.
		const stateIdx = entry.settings.titlePosition === "bottom" ? STATE_BOTTOM : STATE_TOP;
		await entry.action.setState(stateIdx);
		await entry.action.setTitle(title);
	}
}
