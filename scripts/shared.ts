import * as core from "@actions/core";

export const handleError: (error: unknown) => never = (error) => {
	console.error(error);
	core.setFailed(typeof error === "string" ? error : `Error: ${String(error)}`);
	process.exit(1);
};

export type UnwrappedUmamiResponseData<T> = T extends (
	...parameters: never[]
) => Promise<infer U>
	? U extends UmamiApiResponseFixed<infer V>
		? V
		: never
	: never;

// fixed version of `umami-api-client`'s `ApiResponse`, since they typed `error`
// as `any` even though it's reliably a string
export interface UmamiApiResponseFixed<T> {
	ok: boolean;
	status: number;
	data?: T;
	error?: string;
}

interface UmamiApiResponseOk<T> {
	ok: true;
	status: number;
	data: T;
	error?: undefined;
}

interface UmamiApiResponseError {
	ok: false;
	status: number;
	data?: undefined;
	error: string;
}

// our own version of `umami-api-client`'s `ApiResponse` as a discriminated union
export type UmamiApiResponse<T> = UmamiApiResponseOk<T> | UmamiApiResponseError;
