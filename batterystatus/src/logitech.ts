import { devices, HID } from "node-hid";

const VENDOR_ID = 0x046d;

// LIGHTSPEED receiver product IDs (the USB dongle, not the mouse itself)
const RECEIVER_PIDS = [0xc539, 0xc53a, 0xc547];

// The vendor-specific HID interface used for HID++ communication.
// Windows does not claim this interface, so user-space code can open it.
const HIDPP_USAGE_PAGE = 0xff00;
const HIDPP_USAGE = 0x0001;

// HID++ protocol constants
const HIDPP_SHORT = 0x10; // 7-byte report
const DEVICE_INDEX = 0x01; // first wireless device paired to the receiver
const SW_ID = 0x01; // software ID echoed in responses for request matching

// HID++ 2.0 feature codes
const FEATURE_IROOT = 0x0000;
const FEATURE_BATTERY_VOLTAGE = 0x1001; // primary for G502 Lightspeed — reports mV
const FEATURE_BATTERY_STATUS = 0x1000;  // older devices — reports percentage directly
const FEATURE_UNIFIED_BATTERY = 0x1004; // newer devices — reports percentage directly

// Voltage (mV) → percentage lookup table (from Solaar project)
const VOLTAGE_TABLE: [number, number][] = [
	[4186, 100], [4156, 90], [4143, 80], [4133, 70],
	[4110, 60],  [4085, 50], [4049, 40], [4008, 30],
	[3961, 20],  [3901, 10], [3827, 5],  [3750, 0],
];

function voltageToPercent(mv: number): number {
	for (let i = 0; i < VOLTAGE_TABLE.length - 1; i++) {
		const [v1, p1] = VOLTAGE_TABLE[i];
		const [v2, p2] = VOLTAGE_TABLE[i + 1];
		if (mv >= v2) {
			return Math.round(p2 + (p1 - p2) * (mv - v2) / (v1 - v2));
		}
	}
	return 0;
}

function findReceiverPath(): string | null {
	const allDevices = devices();
	for (const pid of RECEIVER_PIDS) {
		const dev = allDevices.find(d =>
			d.vendorId === VENDOR_ID &&
			d.productId === pid &&
			d.usagePage === HIDPP_USAGE_PAGE &&
			d.usage === HIDPP_USAGE
		);
		if (dev?.path) return dev.path;
	}
	return null;
}

/**
 * Writes a short HID++ request and reads back the matching response,
 * skipping any unrelated packets (e.g. mouse movement events) that arrive first.
 */
function writeAndRead(dev: HID, request: number[], timeoutMs = 2000): number[] {
	dev.write(request);
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const resp = dev.readTimeout(Math.max(1, deadline - Date.now()));
		if (resp.length === 0) break; // timed out
		// Match on report ID and echoed SW_ID in the lower nibble of byte 3
		if (resp[0] === HIDPP_SHORT && resp.length >= 4 && (resp[3] & 0x0f) === SW_ID) {
			return resp;
		}
	}
	return [];
}

/**
 * Queries IRoot (feature 0x0000) to resolve the runtime index of a feature code.
 * Returns 0 if the feature is not supported by the device.
 */
function getFeatureIndex(dev: HID, featureCode: number): number {
	// Short HID++ report: [reportId, deviceIdx, featureIdx, fn<<4|swId, param0, param1, param2]
	// Prefixed with 0x00 as required by node-hid on Windows.
	const request = [
		0x00,          // node-hid output report prefix
		HIDPP_SHORT,   // HID++ short report ID
		DEVICE_INDEX,
		FEATURE_IROOT, // feature index 0 = IRoot, always
		SW_ID,         // function 0x0 (getFeature) << 4 | sw_id
		(featureCode >> 8) & 0xff,
		featureCode & 0xff,
	];
	const resp = writeAndRead(dev, request);
	// Verify the response echoes IRoot (feature index 0x00). Any non-zero value
	// (including the error sentinel 0xFF) means the feature isn't supported.
	if (resp.length < 5 || resp[2] !== 0x00) return 0;
	return resp[4]; // runtime feature index
}

export function readG502Battery(): number | null {
	const path = findReceiverPath();
	if (!path) return null;

	let dev: HID | null = null;
	try {
		dev = new HID(path);

		// --- Try BATTERY_VOLTAGE (0x1001): primary for G502 Lightspeed ---
		const voltageIdx = getFeatureIndex(dev, FEATURE_BATTERY_VOLTAGE);
		if (voltageIdx > 0) {
			const resp = writeAndRead(dev, [
				0x00, HIDPP_SHORT, DEVICE_INDEX,
				voltageIdx,
				(0x00 << 4) | SW_ID, // getBatteryInfo = function 0
				0x00, 0x00,
			]);
			if (resp.length >= 6 && resp[2] === voltageIdx) {
				const mv = ((resp[4] & 0xff) << 8) | (resp[5] & 0xff);
				return voltageToPercent(mv);
			}
		}

		// --- Try BATTERY_STATUS (0x1000): percentage in byte 4 ---
		const statusIdx = getFeatureIndex(dev, FEATURE_BATTERY_STATUS);
		if (statusIdx > 0) {
			const resp = writeAndRead(dev, [
				0x00, HIDPP_SHORT, DEVICE_INDEX,
				statusIdx,
				(0x00 << 4) | SW_ID,
				0x00, 0x00,
			]);
			if (resp.length >= 5 && resp[2] === statusIdx) {
				return resp[4] & 0xff;
			}
		}

		// --- Try UNIFIED_BATTERY (0x1004): percentage in byte 4 ---
		const unifiedIdx = getFeatureIndex(dev, FEATURE_UNIFIED_BATTERY);
		if (unifiedIdx > 0) {
			const resp = writeAndRead(dev, [
				0x00, HIDPP_SHORT, DEVICE_INDEX,
				unifiedIdx,
				(0x01 << 4) | SW_ID, // getStatus = function 1
				0x00, 0x00,
			]);
			if (resp.length >= 5 && resp[2] === unifiedIdx) {
				return resp[4] & 0xff;
			}
		}

		return null;
	} catch {
		return null;
	} finally {
		dev?.close();
	}
}
