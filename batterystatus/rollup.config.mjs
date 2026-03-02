import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.ash-matheson.batterystatus.sdPlugin";

// Native addon packages that cannot be bundled — they must exist on disk
// at runtime alongside the plugin. We copy them into the plugin's node_modules.
const nativePackages = ["cue-sdk", "node-gyp-build", "koffi", "node-hid", "pkg-prebuilds"];

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	external: nativePackages,
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			}
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		},
		{
			name: "copy-native-modules",
			writeBundle() {
				const dest = `${sdPlugin}/node_modules`;
				mkdirSync(dest, { recursive: true });
				for (const pkg of nativePackages) {
					try {
						cpSync(`node_modules/${pkg}`, `${dest}/${pkg}`, { recursive: true, force: true });
					} catch (err) {
						// A file may be locked if the plugin is currently running in Stream Deck.
						// The existing copy is still valid; skip and continue.
						console.warn(`[copy-native-modules] Skipped ${pkg}: ${err.message}`);
					}
				}
			}
		}
	]
};

export default config;
