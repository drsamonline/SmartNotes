#!/usr/bin/env node
 
/**
 * Portable zip packaging script (Stage 1 — Enhancements #13 / #15 / #16).
 *
 * Builds a self-contained, "unzip and run" bundle for Windows or Linux:
 *   SmartNote-<version>-<platform>-x64-portable/
 *   ├── runtime/            bundled Node.js runtime
 *   │   ├── node(.exe)      + icudt*.dat etc. (copied from the source distro)
 *   │   └── LICENSE.txt     (when available)
 *   ├── app/
 *   │   ├── dist/           server bundle (dist/index.js) + client assets (dist/public)
 *   │   ├── node_modules/   production dependencies only
 *   │   └── package.json
 *   ├── Start.bat | start.sh    double-click launcher (first-run wizard on fresh copies)
 *   ├── Data/               created at runtime (db, .env, backups/)
 *   └── README.txt          quick start
 *
 * Usage:
 *   pnpm package:portable -- --platform win|linux [--node-version v20.18.1] [--skip-build]
 *
 * Notes:
 *   - The Node runtime is downloaded from nodejs.org (official dist archives).
 *     Cache lives in `build-cache/` so repeat builds are offline-friendly.
 *   - Archives are created with system tools (`tar`, and `zip` if present;
 *     otherwise a stored (uncompressed) ZIP writer built into this script keeps
 *     zero-dependency output valid for both Windows Explorer and `unzip`).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = path.resolve(import.meta.dirname, ".."); // repo root (scripts/../)
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = PKG.version ?? "0.0.0";

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return fallback;
  const arg = argv[i];
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[i + 1];
}

const platform = flag("platform", process.platform === "win32" ? "win" : "linux"); // win | linux
const nodeVersion = flag("node-version", "v20.18.1");
const skipBuild = argv.includes("--skip-build");
const keepStage = argv.includes("--keep-stage");

if (!["win", "linux"].includes(platform)) {
  console.error(`Unknown --platform "${platform}" (expected win|linux)`);
  process.exit(1);
}

const arch = process.arch === "arm64" ? "arm64" : "x64";
const distTag = `${nodeVersion}-node-${platform}-${arch}`;
const ext = platform === "win" ? "zip" : "tar.xz";
const archiveUrl = `https://nodejs.org/dist/${nodeVersion}/${distTag}.${ext}`;

const BUILD_DIR = path.join(ROOT, "build");
const CACHE_DIR = path.join(ROOT, "build-cache");
const RUNTIME_DIR = path.join(BUILD_DIR, `runtime-${platform}-${arch}`);
const APP_NAME = "SmartNote";
const bundleName = `${APP_NAME}-${VERSION}-${platform}-${arch}-portable`;
const stageDir = path.join(BUILD_DIR, bundleName);
const outDir = path.join(BUILD_DIR, "release");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) {
  console.log(`\n[package:portable] ${msg}`);
}
function exists(p) {
  return fs.existsSync(p);
}
function rmrf(p) {
  if (exists(p)) fs.rmSync(p, { recursive: true, force: true });
}
function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}
function copy(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function cpTree(src, dest, { exclude = [] } = {}) {
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) cpTree(s, d, { exclude });
    else if (entry.isSymbolicLink()) {
      // pnpm's node_modules is symlink-heavy — materialize real files so the
      // portable bundle works on stock Windows without developer mode.
      try {
        const st = fs.statSync(s); // follows the link; throws if broken
        if (st.isDirectory()) cpTree(s, d, { exclude });
        else copy(s, d);
      } catch {
        /* dangling symlink inside a package — skip */
      }
    } else copy(s, d);
  }
}
async function download(url, dest) {
  if (exists(dest)) {
    log(`Using cached ${path.basename(dest)}`);
    return;
  }
  mkdirp(path.dirname(dest));
  log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log(`Saved ${Math.round(buf.length / 1e6)} MB → ${dest}`);
}

// Minimal stored (no-compression) ZIP writer — used when system `zip` is absent.
function writeStoredZip(entries, zipPath) {
  // entries: [{ name, data:Buffer }]
  const chunks = [];
  const central = [];
  let offset = 0;
  const crc32 = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return (buf) => {
      let c = -1;
      for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
  })();

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name.replaceAll("\\", "/"), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x2100, 12); // date (fixed)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x2100, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuf, end]));
}

function zipDir(dir, zipPath) {
  try {
    execFileSync("zip", ["-qr9", zipPath, path.basename(dir)], {
      cwd: path.dirname(dir),
      stdio: "inherit",
    });
    return;
  } catch {
    log("System `zip` not available — writing stored (uncompressed) ZIP instead");
  }
  const entries = [];
  const walk = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, rel);
      else entries.push({ name: `${path.basename(dir)}/${rel}`, data: fs.readFileSync(full) });
    }
  };
  walk(dir, "");
  writeStoredZip(entries, zipPath);
}

function tarGz(dir, tgzPath) {
  execFileSync("tar", ["-czf", tgzPath, "-C", path.dirname(dir), path.basename(dir)], {
    stdio: "inherit",
  });
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
async function ensureRuntime() {
  if (
    exists(path.join(RUNTIME_DIR, platform === "win" ? "node.exe" : "bin/node")) &&
    !argv.includes("--refresh-runtime")
  ) {
    log(`Node runtime already staged: ${RUNTIME_DIR}`);
    return;
  }
  rmrf(RUNTIME_DIR);
  mkdirp(RUNTIME_DIR);
  const archive = path.join(CACHE_DIR, `${distTag}.${ext}`);
  await download(archiveUrl, archive);

  const tmp = path.join(CACHE_DIR, `extract-${distTag}`);
  rmrf(tmp);
  mkdirp(tmp);
  if (ext === "zip") {
    // Official node windows zip — use PowerShell/unzip as available.
    try {
      execFileSync("unzip", ["-q", archive, "-d", tmp], { stdio: "inherit" });
    } catch {
      execFileSync("powershell", [
        "-NoProfile", "-Command",
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${tmp}'`,
      ], { stdio: "inherit" });
    }
  } else {
    execFileSync("tar", ["-xJf", archive, "-C", tmp], { stdio: "inherit" });
  }
  const inner = path.join(tmp, distTag);
  cpTree(inner, RUNTIME_DIR); // win: node.exe + LICENSE at root · linux: bin/, lib/, share/
  rmrf(tmp);
  log(`Node runtime staged → ${RUNTIME_DIR}`);
}

function buildApp() {
  if (!skipBuild) {
    log("Building app (vite + esbuild)…");
    execFileSync("pnpm", ["build"], { cwd: ROOT, stdio: "inherit" });
  }
  const distDir = path.join(ROOT, "dist");
  if (!exists(path.join(distDir, "index.js")) || !exists(path.join(distDir, "public", "index.html"))) {
    throw new Error("dist/ incomplete — run `pnpm build` first (or drop --skip-build)");
  }

  rmrf(stageDir);
  mkdirp(path.join(stageDir, "app"));

  log("Copying dist/ → app/dist");
  cpTree(distDir, path.join(stageDir, "app", "dist"));

  // Build a production node_modules in an isolated dir so the working tree's
  // pnpm symlink store is never mutated.
  const nmStage = path.join(BUILD_DIR, "prod-node-modules");
  rmrf(nmStage);
  mkdirp(nmStage);
  const prodPkg = {
    name: PKG.name,
    version: PKG.version,
    type: PKG.type,
    dependencies: PKG.dependencies,
  };
  fs.writeFileSync(path.join(nmStage, "package.json"), JSON.stringify(prodPkg, null, 2));

  log("Installing production dependencies (isolated, hoisted layout)…");
  let installed = false;
  for (const cmd of [
    ["npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--ignore-scripts=false"]],
    ["pnpm", ["install", "--prod", "--node-linker=hoisted", "--ignore-scripts=false"]],
  ]) {
    try {
      execFileSync(cmd[0], cmd[1], { cwd: nmStage, stdio: "inherit", timeout: 15 * 60 * 1000 });
      installed = true;
      break;
    } catch (e) {
      console.warn(`\`${cmd[0]} install\` failed, trying next fallback… (${String(e).slice(0, 160)})`);
    }
  }
  if (!installed) throw new Error("Could not install production dependencies into staging dir");

  // Native modules (better-sqlite3) must be built for the shipped runtime.
  // Smoke-test the binding with the host node (same ABI unless --node-version differs).
  const bs3Main = path.join(nmStage, "node_modules", "better-sqlite3");
  if (exists(bs3Main)) {
    log("Verifying better-sqlite3 native binding…");
    try {
      require_(path.join(bs3Main, "lib", "index.js"));
      log("better-sqlite3 loads on this ABI ✔");
    } catch {
      console.warn(
        "better-sqlite3 prebuilt did not load locally — run `npm rebuild better-sqlite3` inside\n" +
          `${nmStage} before copying, or let the target machine fetch it on first launch (see docs/PORTABLE_APPS.md §Risks)`,
      );
    }
  }

  log("Copying prod node_modules → app/node_modules (this is the slow part)");
  cpTree(path.join(nmStage, "node_modules"), path.join(stageDir, "app", "node_modules"));

  // Ship a minimal manifest: correct name/version/type for ESM resolution of
  // dist/index.js, and production deps only (accurate record of what's bundled).
  fs.writeFileSync(
    path.join(stageDir, "app", "package.json"),
    JSON.stringify({ ...prodPkg, description: `${APP_NAME} Scheduler — portable build` }, null, 2),
  );
}

function writeLaunchers() {
  const readme = `${APP_NAME} Scheduler ${VERSION} — portable build
=============================================================

GET STARTED
  Windows: double-click  Start.bat
  Linux:   chmod +x start.sh && ./start.sh

First launch runs a short setup wizard (fully optional — press Enter
through it to stay 100% offline). Your notes, settings and backups
live in the "Data" folder next to these files, so you can move the
whole folder to another machine and keep everything.

USAGE
  Open http://localhost:3000 (the launcher prints the exact URL).
  Create a note -> SmartNote detects tasks/deadlines and schedules
  reminders while the app is running. Keep the browser tab open to
  receive in-app notifications.

CLI (from the launcher's directory)
  runtime\\node app\\dist\\index.js --help       (Windows)
  runtime/bin/node app/dist/index.js --help    (Linux)
  ... --backup          create a backup ZIP in Data/backups
  ... --setup           re-run configuration wizard
  ... --open            auto-open the browser on start
  ... --data-dir PATH   store data somewhere else

SECURITY NOTE
  The app binds to localhost only; your data never leaves this
  machine unless you configure AI/email integrations in setup.
`;
  fs.writeFileSync(path.join(stageDir, "README.txt"), readme);

  if (platform === "win") {
    const bat = [
      "@echo off",
      "rem SmartNote Scheduler portable launcher (Windows)",
      "cd /d \"%~dp0\"",
      "if not exist \"Data\\.env\" (",
      "  echo First run - starting setup wizard...",
      "  runtime\\node.exe app\\dist\\index.js --setup",
      ")",
      "runtime\\node.exe app\\dist\\index.js --open",
      "",
    ].join("\r\n");
    fs.writeFileSync(path.join(stageDir, "Start.bat"), bat);
  } else {
    const sh = [
      "#!/usr/bin/env bash",
      "# SmartNote Scheduler portable launcher (Linux)",
      'cd "$(dirname "$0")"',
      'if [ ! -f "Data/.env" ]; then',
      '  echo "First run - starting setup wizard..."',
      '  runtime/bin/node app/dist/index.js --setup',
      "fi",
      'exec runtime/bin/node app/dist/index.js --open "$@"',
      "",
    ].join("\n");
    const shPath = path.join(stageDir, "start.sh");
    fs.writeFileSync(shPath, sh, { mode: 0o755 });
  }
}

function makeArchive() {
  mkdirp(outDir);
  if (platform === "win") {
    const zipPath = path.join(outDir, `${bundleName}.zip`);
    rmrf(zipPath);
    zipDir(stageDir, zipPath);
    return zipPath;
  }
  const tgzPath = path.join(outDir, `${bundleName}.tar.gz`);
  rmrf(tgzPath);
  tarGz(stageDir, tgzPath);
  return tgzPath;
}

// ---------------------------------------------------------------------------
async function main() {
  const started = Date.now();
  log(`Target: ${bundleName} (node ${nodeVersion}, arch ${arch})`);

  await ensureRuntime();
  buildApp();
  cpTree(RUNTIME_DIR, path.join(stageDir, "runtime"));
  if (!keepStage) rmrf(RUNTIME_DIR); // drop the duplicate outside the stage (saves disk)
  mkdirp(path.join(stageDir, "Data"));
  fs.writeFileSync(path.join(stageDir, "Data", ".gitkeep"), "");
  writeLaunchers();
  const artifact = makeArchive();

  const sizeMB = (fs.statSync(artifact).size / 1e6).toFixed(1);
  log(`✅ Done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  log(`Artifact: ${artifact} (${sizeMB} MB)`);
  // sha256 sidecar for release integrity
  const hash = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  fs.writeFileSync(`${artifact}.sha256`, `${hash}  ${path.basename(artifact)}\n`);
  log(`SHA-256: ${hash}`);
}

main().catch((e) => {
  console.error("\n[package:portable] FAILED:", e);
  process.exit(1);
});
