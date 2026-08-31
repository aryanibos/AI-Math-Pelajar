#!/usr/bin/env node
/**
 * Enforce max first-parent commits/day to main (Asia/Jakarta).
 *
 * Env:
 *   GIT_BRANCH          ref to count (default: origin/main)
 *   MAX_MAIN_COMMITS    daily limit (default: 5)
 *   STOP_WHEN_AT_LIMIT  exit 1 when count >= limit (cron gate)
 *   PENDING_MAIN_COMMITS  add N to count before check (pre-push/merge)
 *   RETROSPECTIVE_CHECK allow exactly-at-quota (count == limit passes)
 */

import { execFileSync } from "node:child_process";

function parsePositiveInt(raw, name, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`Invalid ${name}: ${raw}`);
    process.exit(2);
  }
  return n;
}

const MAX = parsePositiveInt(process.env.MAX_MAIN_COMMITS, "MAX_MAIN_COMMITS", 5);
const BRANCH_RAW = process.env.GIT_BRANCH ?? "origin/main";
const PENDING = parsePositiveInt(
  process.env.PENDING_MAIN_COMMITS,
  "PENDING_MAIN_COMMITS",
  0,
);
const STOP = process.env.STOP_WHEN_AT_LIMIT === "1";
const RETRO = process.env.RETROSPECTIVE_CHECK === "1";

const REF_RE = /^[A-Za-z0-9._~^:/-]+$/;
if (!REF_RE.test(BRANCH_RAW) || BRANCH_RAW.includes("..")) {
  console.error(`Invalid GIT_BRANCH: ${BRANCH_RAW}`);
  process.exit(2);
}

function wibDayBounds(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(now);
  const start = new Date(`${today}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, label: today };
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`git ${args.join(" ")} failed: ${msg}`);
    process.exit(2);
  }
}

function countTodayFirstParentCommits(branch) {
  const { start, end } = wibDayBounds();
  const since = start.toISOString();
  const until = end.toISOString();
  const log = git([
    "log",
    "--first-parent",
    `--since=${since}`,
    `--until=${until}`,
    "--format=%H",
    branch,
  ]);
  return log ? log.split("\n").filter(Boolean).length : 0;
}

const branch = BRANCH_RAW;
const todayCount = countTodayFirstParentCommits(branch);
const projected = todayCount + PENDING;

console.log(
  `Main commits today (WIB): ${todayCount}/${MAX}` +
    (PENDING ? ` (+${PENDING} pending → ${projected})` : ""),
);

// Cron gate: already at quota — stop without doing anything.
if (STOP && !RETRO && todayCount >= MAX) {
  console.error("Daily main commit limit reached — stopping.");
  process.exit(1);
}

// Pre-push: block only when the pending commit would exceed the daily cap.
if (projected > MAX) {
  console.error("Would exceed daily main commit limit.");
  process.exit(1);
}

process.exit(0);
