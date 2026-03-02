import cue from "cue-sdk";
import koffi from "koffi";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// CorsairSessionState
const CSS_Connected = 6;

// CorsairDeviceType
const CDT_Mouse = 0x0002;

// CorsairDevicePropertyId
const CDPI_BatteryLevel = 9;

// CorsairDataType
const CT_Int32 = 1;

// CorsairProperty struct layout on x64 Windows:
//   offset  0: int  type  (CorsairDataType enum, 4 bytes)
//   offset  4: 4 bytes padding (union is 8-byte aligned due to pointer members)
//   offset  8: int  int32 (value for CT_Int32, first field in the union)
//   total: 24 bytes
const PROPERTY_STRUCT_SIZE = 24;
const PROPERTY_TYPE_OFFSET = 0;
const PROPERTY_VALUE_OFFSET = 8;

let readDevicePropertyFn: ((deviceId: string, propertyId: number, index: number, buf: Buffer) => number) | null = null;

function initBatteryReader(): void {
	if (readDevicePropertyFn) return;

	// At runtime this module is part of the bundle at sdPlugin/bin/plugin.js.
	// The DLL is deployed to sdPlugin/node_modules/cue-sdk/prebuilds/win32-x64/.
	const pluginDir = dirname(fileURLToPath(import.meta.url));
	const dllPath = resolve(pluginDir, "../node_modules/cue-sdk/prebuilds/win32-x64/iCUESDK.x64_2019.dll");

	const lib = koffi.load(dllPath);
	readDevicePropertyFn = lib.func("CorsairReadDeviceProperty", "int", ["str", "int", "uint32", "void *"]);
}

export function connectToCUE(onConnected: () => void): void {
	initBatteryReader();

	cue.CorsairConnect((evt: { data?: { state?: number } }) => {
		if (evt?.data?.state === CSS_Connected) {
			onConnected();
		}
	});
}

export function findWirelessMouse(): string | null {
	const result: { error: number; data?: Array<{ id: string }> | null } = cue.CorsairGetDevices({ deviceTypeMask: CDT_Mouse });
	if (result.error !== 0 || !result.data?.length) return null;
	return result.data[0].id;
}

export function readMouseBattery(deviceId: string): number | null {
	if (!readDevicePropertyFn) return null;

	const buf = Buffer.alloc(PROPERTY_STRUCT_SIZE, 0);
	const err = readDevicePropertyFn(deviceId, CDPI_BatteryLevel, 0, buf);
	if (err !== 0) return null;

	if (buf.readInt32LE(PROPERTY_TYPE_OFFSET) !== CT_Int32) return null;
	return buf.readInt32LE(PROPERTY_VALUE_OFFSET);
}
