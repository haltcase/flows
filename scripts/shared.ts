import * as core from "@actions/core";

export const handleError: (error: unknown) => never = (error) => {
	console.error(error);
	core.setFailed(typeof error === "string" ? error : `Error: ${error}`);
	process.exit(1);
};
