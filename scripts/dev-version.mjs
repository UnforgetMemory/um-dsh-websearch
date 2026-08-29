// Dev-version chain CLI: bump (`node scripts/dev-version.mjs`) or reset
// (`--reset`) the dev version across every versioned constant the hardcode
// index tracks. Never touches git; history lands in the local memory file.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nextVersion, baseVersion } from "./dev-version-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const TARGETS = [
	{ file: "lib/index.js", needle: /const VERSION = "([^"]+)"/u, prefix: 'const VERSION = "' },
	{ file: "lib/client.js", needle: /const ABOUT_VERSION = "([^"]+)"/u, prefix: 'const ABOUT_VERSION = "' }
];
const historyPath = join(root, ".um.agents", "memory", "dev-versions.local.md");

const pkgRaw = readFileSync(pkgPath, "utf8");
const current = JSON.parse(pkgRaw).version;
const reset = process.argv.includes("--reset");
const next = reset ? baseVersion(current) : nextVersion(current);

// Every tracked constant must currently match package.json; a mismatch means
// someone edited a version by hand and the chain must not paper over it.
for (const target of TARGETS) {
	const path = join(root, target.file);
	const raw = readFileSync(path, "utf8");
	const match = target.needle.exec(raw);
	if (match === null) throw new Error(`${target.file}: versioned constant not found`);
	if (match[1] !== current) throw new Error(`${target.file}: constant "${match[1]}" is out of sync with package.json "${current}" — fix manually before re-running`);
	writeFileSync(path, raw.replace(target.needle, target.prefix + next + '"'), "utf8");
}
writeFileSync(pkgPath, pkgRaw.replace(/"version":\s*"[^"]+"/u, `"version": "${next}"`), "utf8");

if (!reset) {
	const dir = dirname(historyPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const entry = `base|${baseVersion(current)}|${next}|${new Date().toISOString()}`;
	const history = existsSync(historyPath) ? readFileSync(historyPath, "utf8") : "# dev 版本历史（本地，不 sync）\n# base|version|iso-time\n";
	writeFileSync(historyPath, history + entry + "\n", "utf8");
}
console.log(reset ? `reset → ${next}` : `dev ${current} → ${next}`);
