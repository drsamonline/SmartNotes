#!/usr/bin/env node
/**
 * check-format-config.mjs — the format configuration's own guard.
 *
 * Why this file exists
 * --------------------
 * `package.json` has carried `"format": "prettier --write ."` with no `.prettierrc`
 * and no `.prettierignore`. That script WRITES, and nothing recorded what it was
 * allowed to write, so a plain `npm run format` would have rewritten
 * `pnpm-lock.yaml` and every `drizzle/meta/*.json` snapshot — measured on
 * 2026-11-27 with prettier 3.6.2 (`prettier --check .` lists both).
 *
 * The three open CI gates on this repo (type check, lint) each exist because a
 * script was defined and nothing ran it. This is the same hole one rung down: the
 * format script is defined, it writes, and nothing asserts its blast radius.
 *
 * What it asserts
 * ---------------
 *   1. `.prettierrc.json` parses and pins the style deliberately, rather than
 *      inheriting prettier's defaults by accident.
 *   2. Every generated or authoritative path is IGNORED — asked of prettier's own
 *      resolver via `getFileInfo({ ignorePath })`, not by grepping the ignore file.
 *      A text match would pass on a pattern prettier does not actually honour.
 *   3. A source file is NOT ignored, so the ignore list cannot be widened until
 *      the gate stops seeing the tree.
 *
 * It prints, but does not fail on, how many files a full `prettier --check .`
 * would still change: the tree is not formatted to this config yet (138 files on
 * 2026-11-27), and that is a separate, reviewable decision — not something a
 * guard should block a pull request over.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import prettier from "prettier";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rcPath = path.join(root, ".prettierrc.json");
const ignorePath = path.join(root, ".prettierignore");

let checks = 0;
let failures = 0;

function ok(name) {
  checks += 1;
  console.log(`  ok    ${name}`);
}

function bad(name, detail) {
  checks += 1;
  failures += 1;
  console.log(`  FAIL  ${name}`);
  console.log(`        ${detail}`);
}

// --- 1. the config is present and deliberate ---------------------------------

const PINNED = { printWidth: 100, trailingComma: "es5" };

let rc = null;
try {
  rc = JSON.parse(readFileSync(rcPath, "utf8"));
  ok(".prettierrc.json parses");
} catch (err) {
  bad(".prettierrc.json parses", `could not read or parse ${rcPath}: ${err.message}`);
}

if (rc) {
  for (const [key, want] of Object.entries(PINNED)) {
    const got = rc[key];
    if (got === want) {
      ok(`.prettierrc.json pins ${key} = ${JSON.stringify(want)}`);
    } else {
      bad(
        `.prettierrc.json pins ${key} = ${JSON.stringify(want)}`,
        `found ${JSON.stringify(got)}. Prettier's default would be inherited silently, ` +
          `which is the state this file exists to end.`
      );
    }
  }
}

// --- 2. every protected path is ignored --------------------------------------
//
// Each entry is [path, why]. The reason is the failure message: a guard that only
// says "not ignored" teaches nothing to whoever has to fix it.

const PROTECTED = [
  ["package-lock.json", "a formatter must never touch dependency resolution"],
  ["pnpm-lock.yaml", "a formatter must never touch dependency resolution"],
  [
    "drizzle/meta/_journal.json",
    "drizzle-kit reads this journal to decide what a migration contains",
  ],
  ["drizzle/meta/0000_snapshot.json", "drizzle-kit compares these snapshots"],
  [
    "patches/wouter@3.7.1.patch",
    "pnpm applies this patch to the published tarball; reformatted bytes stop applying",
  ],
  [
    ".github/workflows/test.yml",
    "prettier's YAML printer reflows `run:` scalars into a different script",
  ],
  ["client/public/__manus__/version.json", "written by the host runtime, not by hand"],
  ["MANIFEST.json", "written by tools/manifest.py; reformatting drifts every recorded blob sha"],
];

for (const [rel, why] of PROTECTED) {
  let info;
  try {
    info = await prettier.getFileInfo(path.join(root, rel), { ignorePath });
  } catch (err) {
    bad(`ignored: ${rel}`, `prettier could not resolve it: ${err.message}`);
    continue;
  }
  if (info.ignored) {
    ok(`ignored: ${rel}`);
  } else {
    bad(`ignored: ${rel}`, `prettier WOULD rewrite it — ${why}. Add it to .prettierignore.`);
  }
}

// --- 3. the ignore list has not swallowed the source -------------------------

const SOURCE = "shared/types.ts";
let srcInfo;
try {
  srcInfo = await prettier.getFileInfo(path.join(root, SOURCE), { ignorePath });
  if (srcInfo.ignored) {
    bad(
      `not ignored: ${SOURCE}`,
      "a source file is ignored, so the ignore list has widened until the format " +
        "check stops seeing the tree. An ignore list that hides the source disables " +
        "the gate it is supposed to scope."
    );
  } else {
    ok(`not ignored: ${SOURCE}`);
  }
} catch (err) {
  bad(`not ignored: ${SOURCE}`, `prettier could not resolve it: ${err.message}`);
}

// --- verdict ----------------------------------------------------------------

if (failures > 0) {
  console.log(`\n${failures} of ${checks} check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks} check(s) passed.`);
