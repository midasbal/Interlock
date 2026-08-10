import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "docs", "audit-trail.jsonl");
const destDir = join(here, "..", "public");
const dest = join(destDir, "audit-trail.jsonl");

if (!existsSync(source)) {
  console.error(
    `docs/audit-trail.jsonl not found at ${source}. The viewer renders only the real trail, there is nothing to fall back to.`
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log(`copied ${source} -> ${dest}`);
