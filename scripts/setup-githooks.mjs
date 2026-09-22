#!/usr/bin/env node
/** Point this repo at `.githooks/` (pre-push daily main commit cap). */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(path.join(root, ".git"))) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  // Non-fatal (e.g. read-only git config in some CI sandboxes).
  process.exit(0);
}
