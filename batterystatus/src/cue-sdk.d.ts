declare module "cue-sdk" {
	interface CorsairDeviceInfo {
		id: string;
		type: number;
		serial: string;
		model: string;
		ledCount: number;
		channelCount: number;
	}

	interface CorsairResult<T = undefined> {
		error: number;
		data: T;
	}

	interface CorsairSessionEvent {
		data?: {
			state?: number;
			details?: unknown;
		};
	}

	const cue: {
		CorsairConnect(callback: (evt: CorsairSessionEvent) => void): CorsairResult;
		CorsairDisconnect(): CorsairResult;
		CorsairGetDevices(filter: { deviceTypeMask: number }): CorsairResult<CorsairDeviceInfo[] | null>;
	};

	export default cue;
}
