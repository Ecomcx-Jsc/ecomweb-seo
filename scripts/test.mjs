// Unit tests: bundle test/*.test.ts with esbuild, run with node --test.
import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const out = ".test-build";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tests = readdirSync("test").filter((f) => f.endsWith(".test.ts"));
await build({ entryPoints: tests.map((f) => `test/${f}`), outdir: out, bundle: true, platform: "node", format: "esm", outExtension: { ".js": ".mjs" }, loader: { ".json": "json" }, logLevel: "warning" });
const r = spawnSync(process.execPath, ["--test", ...tests.map((f) => `${out}/${f.replace(/\.ts$/, ".mjs")}`)], { stdio: "inherit" });
process.exit(r.status ?? 1);
