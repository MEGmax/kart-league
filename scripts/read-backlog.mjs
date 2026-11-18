// Reads a folder of results photos from one night with Gemini and groups the race screens into cups,
// ready to import on the site (+ Add results › Import a backlog file), where you check and save them.
//
//   npm run backlog                                  # data/cups_W2_results
//   npm run backlog -- data/cups_W3_results --week 3
//   npm run backlog -- --refresh                     # read every photo again instead of reusing gemini-reads.json
//   npm run backlog -- --include-screenshots         # also send images with no camera info (screenshots)
//   npm run backlog -- --who Luigi=Gerrard           # who played a character (repeatable); others are guessed on import
//
// Needs GEMINI_API_KEY in .env (or the environment); GEMINI_MODEL overrides the model. Photos are ordered
// by when they were taken (EXIF). Images without camera info are screenshots, not photos of the TV, and
// are never sent to Gemini unless you ask. iPhone HEIC photos are converted to JPEG with macOS's `sips`,
// and each cup's photo is turned upright (Gemini says how far) before it goes in the import. Writes, in the folder:
//   gemini-reads.json    what Gemini saw in each photo, reused next run so no photo is read (or billed) twice
//   backlog.md           the cups found, each human's race places and totals, and anything to double-check
//   backlog-import.json  the same plus each cup's photo, for the Add page's import (git-ignored)
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { GEMINI_MODEL, ReadError, readResultsImage } from "../src/lib/gemini.js";
import { BACKLOG_VERSION, groupBacklog } from "../src/lib/backlog.js";
import { ord } from "../src/lib/constants.js";
import { readExif } from "./lib/exif.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(["--week", "--concurrency", "--who"]);
// --who Luigi=Gerrard (repeatable, or comma-separated): who played each character tonight.
const who = {};
args.forEach((a, i) => {
  if (a !== "--who") return;
  String(args[i + 1] || "").split(",").forEach((pair) => {
    const [ch, name] = pair.split("=").map((x) => (x || "").trim());
    if (ch && name) who[ch.toLowerCase()] = name;
  });
});
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const dir = path.resolve(positional[0] || "data/cups_W2_results");
const rel = path.relative(process.cwd(), dir) || ".";

if (existsSync(".env")) process.loadEnvFile(".env");
const apiKey = process.env.GEMINI_API_KEY || "";
const model = process.env.GEMINI_MODEL || GEMINI_MODEL;
const weekMatch = /w(?:eek)?[_ -]?(\d{1,2})/i.exec(path.basename(dir));
const week = Number(opt("--week")) || (weekMatch ? Number(weekMatch[1]) : null);
const concurrency = Math.max(1, Number(opt("--concurrency")) || 2);

if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`No folder at ${rel}`); process.exit(1); }
if (!apiKey) {
  console.error("Set GEMINI_API_KEY first: add a line GEMINI_API_KEY=... to .env (git-ignored). Get a key at https://aistudio.google.com/apikey");
  process.exit(1);
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heic" };
// macOS's built-in image tool: converts HEIC, rotates and shrinks. Without it, HEIC photos are skipped.
const TMP = mkdtempSync(path.join(os.tmpdir(), "kl-backlog-"));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));
let hasSips = true;
function sips(...a) {
  if (!hasSips) return false;
  try { execFileSync("sips", a, { stdio: "ignore" }); return true; } catch (e) { if (e.code === "ENOENT") hasSips = false; return false; }
}
const CACHE = path.join(dir, "gemini-reads.json");
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { version: 1, reads: {} };
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n");

// 1. The photos, in the order they were taken.
const skipped = [];
const photos = [];
for (const file of readdirSync(dir).sort()) {
  const full = path.join(dir, file);
  const ext = path.extname(file).toLowerCase();
  if (file.startsWith(".") || !statSync(full).isFile()) continue;
  if (!MIME[ext]) {
    if (!/\.(json|md)$/i.test(file)) skipped.push({ file, reason: "not a JPEG, PNG, WebP or HEIC image" });
    continue;
  }
  const original = readFileSync(full);
  let buf = original, mime = MIME[ext], jpeg = mime === "image/jpeg" ? full : null;
  if (mime === "image/heic") {
    jpeg = path.join(TMP, `${path.basename(file, ext)}.jpg`);
    if (!sips("-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1600", full, "--out", jpeg)) {
      skipped.push({ file, reason: "HEIC photo that couldn't be converted (needs a Mac); export it as JPEG" });
      continue;
    }
    buf = readFileSync(jpeg);
    mime = "image/jpeg";
  }
  const exif = readExif(buf);
  if (!exif.make && !flag("--include-screenshots")) {
    skipped.push({ file, reason: "no camera info, so probably a screenshot rather than a photo of the TV: not sent to Gemini" });
    continue;
  }
  photos.push({ file, full, buf, mime, jpeg, sha1: createHash("sha1").update(original).digest("hex"), takenAt: exif.takenAt || statSync(full).mtime.toISOString().slice(0, 19) });
}
photos.sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.file.localeCompare(b.file));

// 2. Read each one with Gemini (or reuse what it saw last time).
const todo = photos.filter((p) => flag("--refresh") || !(cache.reads[p.file] && cache.reads[p.file].sha1 === p.sha1));
console.log(`${photos.length} photo${photos.length === 1 ? "" : "s"} in ${rel}; ${photos.length - todo.length} already read, ${todo.length} to read with ${model}.`);
const failed = [];
let stop = "";
let next = 0;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
// Free-tier keys allow only a few requests a minute: wait and retry when Google says slow down.
async function readWithRetry(p) {
  for (let attempt = 0; ; attempt++) {
    try {
      // A request that hangs gets cut off after 2 minutes and retried.
      return await readResultsImage({ apiKey, model, b64: p.buf.toString("base64"), mimeType: p.mime, keyHint: "Check GEMINI_API_KEY in .env.", signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      // status 0: no answer (timed out or the connection dropped).
      const retryable = e instanceof ReadError && (e.status === 429 || e.status >= 500 || e.status === 0);
      if (!retryable || attempt >= 5 || stop) throw e;
      const wait = Math.max(e.retryAfter || 0, 10 * 2 ** attempt);
      console.log(`  ${p.file.slice(0, 13)}  ${e.status === 429 ? "rate limited" : e.status ? `error ${e.status}` : "no answer"}; trying again in ${wait}s`);
      await sleep(wait);
    }
  }
}
async function worker() {
  while (!stop && next < todo.length) {
    const p = todo[next++];
    try {
      const out = await readWithRetry(p);
      cache.reads[p.file] = { sha1: p.sha1, model, readAt: new Date().toISOString(), ...out };
      saveCache();
      const hs = out.rows.filter((r) => r.human).length;
      console.log(`  ${p.file.slice(0, 13)}  ${out.screen.padEnd(9)} ${out.rows.length} rows, ${hs} highlighted`);
    } catch (e) {
      const msg = e instanceof ReadError ? e.message : String((e && e.message) || e);
      failed.push({ file: p.file, reason: msg });
      console.log(`  ${p.file.slice(0, 13)}  failed: ${msg}`);
      if (/rejected the Gemini API key|isn't allowed to use|isn't available to this key/.test(msg)) stop = msg;
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
if (stop) { console.error(`\nStopped: ${stop}`); process.exit(1); }

// 3. Group the race screens into cups.
const reads = photos.filter((p) => cache.reads[p.file] && cache.reads[p.file].sha1 === p.sha1)
  .map((p) => ({ file: p.file, takenAt: p.takenAt, screen: cache.reads[p.file].screen, rows: cache.reads[p.file].rows }));
const group = groupBacklog(reads);
const allSkipped = skipped.concat(failed.map((f) => ({ file: f.file, reason: `couldn't be read: ${f.reason}` })), group.skipped);
const date = group.cups.length && group.cups[0].takenAt ? group.cups[0].takenAt.slice(0, 10) : null;
const used = group.cups.reduce((a, c) => a + c.files.length, 0);

// 4. The import file (with each cup's photo) and a readable report.
const byFile = Object.fromEntries(photos.map((p) => [p.file, p]));
// A cup's photo as the site stores it: an upright JPEG, base64, under the database's size limit.
function sitePhoto(file) {
  const p = byFile[file];
  if (!p || !p.jpeg) return null;
  let src = p.jpeg;
  const turn = (cache.reads[file] && cache.reads[file].rotate) || 0;
  if (turn) {
    const out = path.join(TMP, `upright-${turn}-${path.basename(p.jpeg)}`);
    if (sips("-r", String(turn), src, "--out", out)) src = out;
  }
  let data = readFileSync(src).toString("base64");
  if (data.length >= 900000) {
    const out = path.join(TMP, `small-${path.basename(src)}`);
    if (sips("-s", "format", "jpeg", "-s", "formatOptions", "75", "-Z", "1280", src, "--out", out)) data = readFileSync(out).toString("base64");
  }
  return data.length < 900000 ? { file, data } : null;
}
const importFile = {
  version: BACKLOG_VERSION, source: rel, model, generatedAt: new Date().toISOString(), date, week,
  cups: group.cups.map((c) => {
    const racers = c.racers.map((r) => (who[(r.character || "").toLowerCase()] ? { ...r, who: who[r.character.toLowerCase()] } : r));
    return { ...c, racers, photo: c.photo ? sitePhoto(c.photo) : null };
  }),
  skipped: allSkipped, issues: group.issues,
};
writeFileSync(path.join(dir, "backlog-import.json"), JSON.stringify(importFile));

const time = (iso) => {
  if (!iso) return "?";
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const place = (p) => (p ? `${p}${ord(p)}` : "–");
const short = (f) => f.replace(/[-_].*$/, "");
const lines = [
  `# Backlog: ${rel}`,
  "",
  `Read with ${model}. ${group.cups.length} cup${group.cups.length === 1 ? "" : "s"} from ${used} results photo${used === 1 ? "" : "s"}` +
    (date ? `, raced ${date}` : "") + (week ? `, week ${week}` : "") + ".",
  "Racers are told apart by character (and by highlight color only if two humans share a character).",
  "",
];
group.cups.forEach((c) => {
  const what = `${c.files.length} photo${c.files.length === 1 ? "" : "s"}${c.standings.length ? " incl. the end-of-cup screen" : ""}`;
  lines.push(`## ${c.name} · ${time(c.takenAt)} · ${what} · ${c.complete ? "race by race" : "totals only"}`, "");
  lines.push("| Character | Player | R1 | R2 | R3 | R4 | Total |", "|---|---|---|---|---|---|---|");
  c.racers.slice().sort((a, b) => (b.total || 0) - (a.total || 0)).forEach((r) => {
    const player = who[(r.character || "").toLowerCase()] || "guessed on import";
    lines.push(`| ${r.character || "?"} (${r.highlight}) | ${player} | ${r.places.map(place).join(" | ")} | ${r.total == null ? "?" : r.total} |`);
  });
  lines.push("", `Photos, in order: ${c.files.map((f) => `\`${short(f)}\`${c.standings.includes(f) ? " (end of cup)" : ""}`).join(", ")}`, "");
});
if (group.issues.length) lines.push("## Check these", "", ...group.issues.map((x) => `- ${x}`), "");
if (allSkipped.length) lines.push("## Not used", "", ...allSkipped.map((s) => `- \`${s.file}\`: ${s.reason}`), "");
lines.push(
  "## Next",
  "",
  "On the site: **+ Add results › Import a backlog file**, pick `backlog-import.json` from this folder, then check each racer",
  "(guessed from each player's usual character, otherwise unclaimed), name the cups, and save.",
  "",
);
writeFileSync(path.join(dir, "backlog.md"), lines.join("\n"));
console.log("\n" + lines.join("\n"));
console.log(`Wrote ${rel}/backlog.md, ${rel}/backlog-import.json and ${rel}/gemini-reads.json`);
