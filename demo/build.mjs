/*
 * Builds the demo page, and serves it with --serve.
 *
 * React, MUI, Emotion and dayjs are resolved out of the portal's own
 * node_modules rather than installed here, through esbuild's `nodePaths`. That
 * is a deliberate trade: MAHLER is an ExFAT volume with no hardlink support, so
 * every install copies rather than links, and the volume is at 94%. A second
 * copy of MUI, Emotion and React just to render a comparison page is about
 * 150MB we do not have and do not need, since the portal is checked out two
 * directories away and already has the exact versions we are comparing against.
 *
 * The cost is that the demo will not build on a machine without the portal
 * checked out. The library itself has no such dependency: it has no build step
 * and no runtime dependencies at all. If this ever needs to run in CI, point
 * PORTAL_MODULES at an install of react + react-dom + the MUI packages, or drop
 * the comparison panel and the demo needs nothing but React.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const portalModules =
	process.env.PORTAL_MODULES ||
	resolve(root, "../dzined-cloud/work/node_modules");

if (!existsSync(portalModules)) {
	console.error(
		`\nCannot find React and MUI.\n` +
			`Looked in: ${portalModules}\n\n` +
			`The demo borrows them from the portal's install so this repo does not ` +
			`need its own copy. Set PORTAL_MODULES to a node_modules containing ` +
			`react, react-dom, @mui/material, @mui/x-date-pickers, @emotion/react, ` +
			`@emotion/styled and dayjs.\n`
	);
	process.exit(1);
}

// Report what we are comparing against, so a screenshot can be dated.
const req = createRequire(resolve(portalModules, "noop.js"));
for (const name of ["react", "@mui/material", "@mui/x-date-pickers", "dayjs"]) {
	try {
		console.log(`  ${name.padEnd(22)} ${req(`${name}/package.json`).version}`);
	} catch {
		console.log(`  ${name.padEnd(22)} not found`);
	}
}

const options = {
	entryPoints: [resolve(here, "demo.jsx")],
	bundle: true,
	outfile: resolve(here, "dist/demo.js"),
	format: "esm",
	target: "es2020",
	jsx: "automatic",
	jsxImportSource: "react",
	nodePaths: [portalModules],
	/*
	 * React, react-dom and the JSX runtime are pinned to one absolute path each.
	 * Without this, esbuild resolves `react` once from the demo's own imports and
	 * again from inside MUI, and even though both land on the same file on disk
	 * it bundles two module instances. The second one has a null hook dispatcher,
	 * so the first MUI component to call useMemo throws "Invalid hook call" and
	 * the page renders nothing at all.
	 */
	alias: {
		react: req.resolve("react"),
		"react-dom": req.resolve("react-dom"),
		"react-dom/client": req.resolve("react-dom/client"),
		"react/jsx-runtime": req.resolve("react/jsx-runtime"),
		"react/jsx-dev-runtime": req.resolve("react/jsx-dev-runtime"),
	},
	define: { "process.env.NODE_ENV": '"development"' },
	sourcemap: true,
	logLevel: "info",
};

if (process.argv.includes("--serve")) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	const { host, port } = await ctx.serve({
		servedir: here,
		port: 5181,
		host: "127.0.0.1",
	});
	console.log(`\n  Demo on http://${host}:${port}/\n`);
} else {
	await esbuild.build(options);
	console.log("\n  Built demo/dist/demo.js\n");
}
