// Every bare import the deployed function (and the bundles it loads) makes at runtime must be in the function's import map,
// and every mapped file must exist. Run after `pnpm run build` (domain-packs/healthcare/dist is a build output).
// Usage: node scripts/ci/check-import-map.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mapFile = path.join(root, "supabase/functions/orchestrator/deno.json");
const imports = JSON.parse(fs.readFileSync(mapFile, "utf8")).imports ?? {};

const entries = [{ label: "function", file: "supabase/functions/orchestrator/index.ts" }];

for (const name of fs.readdirSync(path.join(root, "packages")).sort()) {
  const edge = `packages/${name}/edge/index.js`;

  if (fs.existsSync(path.join(root, edge))) {
    entries.push({ label: `edge:${name}`, file: edge });
  }
}

entries.push({ label: "healthcare-dist", file: "domain-packs/healthcare/dist/index.js" });

const problems = [];
const used = new Map();

for (const entry of entries) {
  if (!fs.existsSync(path.join(root, entry.file))) {
    problems.push(`missing build input: ${entry.file}${entry.label === "healthcare-dist" ? " (run pnpm run build first)" : ""}`);
    continue;
  }

  // Bundling with packages external reports exactly the bare specifiers that remain at runtime; type-only imports are already erased.
  const result = await build({
    entryPoints: [path.join(root, entry.file)],
    bundle: true,
    packages: "external",
    treeShaking: false,
    platform: "neutral",
    format: "esm",
    write: false,
    metafile: true,
    outdir: path.join(root, "node_modules/.cache/check-import-map"),
    logLevel: "silent",
  });

  for (const output of Object.values(result.metafile.outputs)) {
    for (const item of output.imports) {
      if (!used.has(item.path)) {
        used.set(item.path, new Set());
      }

      used.get(item.path).add(entry.label);
    }
  }
}

const ignored = (specifier) => ["node:", "npm:", "jsr:", "https:", "http:"].some((prefix) => specifier.startsWith(prefix));
const mapped = (specifier) =>
  Object.prototype.hasOwnProperty.call(imports, specifier) ||
  Object.keys(imports).some((key) => key.endsWith("/") && specifier.startsWith(key));

const runtime = [...used.keys()].filter((specifier) => !ignored(specifier)).sort();
let unmapped = 0;

for (const specifier of runtime) {
  const ok = mapped(specifier);
  console.log(`${ok ? "mapped   " : "UNMAPPED "} ${specifier}   (${[...used.get(specifier)].join(", ")})`);

  if (!ok) {
    unmapped++;
    problems.push(`unmapped runtime import: ${specifier}`);
  }
}

let targets = 0;

for (const [key, value] of Object.entries(imports)) {
  if (typeof value !== "string" || !(value.startsWith(".") || value.startsWith("/"))) {
    continue;
  }

  targets++;
  const resolved = path.resolve(path.dirname(mapFile), value);
  const exists = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  console.log(`${exists ? "exists   " : "ABSENT   "} ${key} -> ${path.relative(root, resolved)}`);

  if (!exists) {
    problems.push(`import map target is not a file: ${key} -> ${path.relative(root, resolved)}`);
  }
}

console.log(`\n${runtime.length} runtime specifiers checked, ${unmapped} unmapped; ${targets} file targets checked`);

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`check-import-map: ${problem}`);
  }

  process.exit(1);
}
