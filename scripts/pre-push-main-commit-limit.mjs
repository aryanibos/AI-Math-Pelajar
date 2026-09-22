#!/usr/bin/env node
/**
 * Git pre-push hook: block pushes to main that would exceed the daily WIB cap.
 * Reads hook stdin lines: <local ref> <local sha> <remote ref> <remote sha>
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ZERO_SHA = "0".repeat(40);

function isZeroSha(sha) {
  return !sha || sha === ZERO_SHA;
}

function countFirstParentCommits(range) {
  const out = execFileSync(
    "git",
    ["rev-list", "--first-parent", "--count", range],
    { encoding: "utf8" },
  ).trim();
  const n = Number(out);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function pendingCommitsForMainPush(localSha, remoteSha) {
  if (isZeroSha(localSha)) return 0;
  if (isZeroSha(remoteSha)) {
    return countFirstParentCommits(localSha);
  }
  return countFirstParentCommits(`${remoteSha}..${localSha}`);
}

async function readHookLines() {
  const lines = [];
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

async function main() {
  const lines = await readHookLines();
  let pending = 0;

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const [, localSha, remoteRef, remoteSha] = parts;
    if (remoteRef !== "refs/heads/main") continue;
    pending = Math.max(pending, pendingCommitsForMainPush(localSha, remoteSha));
  }

  if (pending === 0) {
    process.exit(0);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const checkScript = path.join(scriptDir, "check-main-commit-limit.mjs");
  const result = spawnSync(process.execPath, [checkScript], {
    env: { ...process.env, PENDING_MAIN_COMMITS: String(pending) },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
