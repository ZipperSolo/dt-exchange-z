import * as esbuild from "esbuild"

await esbuild.build({
	entryPoints: ["./src/server.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	outfile: "server.mjs",
})
