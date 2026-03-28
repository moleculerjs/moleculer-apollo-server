const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const globals = require("globals");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
	js.configs.recommended,
	eslintPluginPrettierRecommended,
	{
		files: ["**/*.js", "**/*.mjs"],
		languageOptions: {
			parserOptions: {
				sourceType: "module",
				ecmaVersion: 2023
			},
			globals: {
				...globals.node,
				...globals.es2020,
				...globals.commonjs,
				...globals.es6,
				...globals.jquery,
				...globals.jest,
				...globals.jasmine,
				process: "readonly",
				fetch: "readonly"
			}
		},
		rules: {
			"no-var": ["error"],
			"no-console": ["error"],
			"no-unused-vars": ["warn"],
			"no-trailing-spaces": ["error"]
		}
	},
	{
		files: ["test/**/*.js"],
		rules: {
			"no-console": ["off"],
			"no-unused-vars": ["off"]
		}
	},
	{
		files: ["benchmarks/**/*.js", "examples/**/*.js"],
		rules: {
			"no-console": ["off"],
			"no-unused-vars": ["off"]
		}
	}
]);
