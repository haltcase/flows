import { getEslintConfig } from "@haltcase/style/eslint";

export default [
	...getEslintConfig({
		node: true
	}),
	{
		rules: {
			"unicorn/no-process-exit": "off"
		}
	}
];
