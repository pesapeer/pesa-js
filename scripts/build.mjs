// Builds dist/pesa.js (IIFE, global Pesa), dist/pesa.<hash>.js (the same
// bytes under an immutable name the edge can cache for a year),
// dist/pesa.esm.js for bundlers, and dist/pesa.d.ts.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const outdir = "dist";
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  target: "es2018",
  minify: true,
  sourcemap: true,
  legalComments: "none",
};

await build({ ...common, format: "iife", globalName: "Pesa", outfile: `${outdir}/pesa.js`, footer: { js: "Pesa=Object.assign(Pesa.default,Pesa);" } });
await build({ ...common, format: "esm", outfile: `${outdir}/pesa.esm.js` });

const iife = await readFile(`${outdir}/pesa.js`);
const hash = createHash("sha256").update(iife).digest("hex").slice(0, 16);
await copyFile(`${outdir}/pesa.js`, `${outdir}/pesa.${hash}.js`);
await copyFile(`${outdir}/pesa.js.map`, `${outdir}/pesa.${hash}.js.map`);
await writeFile(`${outdir}/manifest.json`, JSON.stringify({ "pesa.js": `pesa.${hash}.js`, hash }, null, 2) + "\n");

execFileSync("npx", ["tsc", "--emitDeclarationOnly", "--noEmit", "false", "--declaration", "--outDir", outdir, "--rootDir", "src", "-p", "tsconfig.json"], { stdio: "inherit" });
// tsc emits index.d.ts plus one file per module; callers want one entry.
await writeFile(`${outdir}/pesa.d.ts`, 'export * from "./index";\nexport { default } from "./index";\n');

console.log(`built ${outdir}/pesa.js (${iife.length} bytes), hash ${hash}`);
