// Removes location (GPS) from the photos in one or more folders, in place, so they're safe to commit
// to a public repo. JPEGs keep their image data untouched (only the GPS block and XMP go); HEIC photos
// become JPEGs (converted with macOS's sips). Capture time and camera stay, so `npm run backlog` still
// orders them, and its saved readings (gemini-reads.json) are updated so nothing is read again.
//
//   npm run strip-gps -- data/cups_W1_results data/cups_W2_results
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasGps, readExif, stripGps } from "./lib/exif.js";

const sha1 = (b) => createHash("sha1").update(b).digest("hex");
const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!dirs.length) { console.error("Usage: npm run strip-gps -- <folder> [more folders]"); process.exit(1); }

for (const dir of dirs) {
  const cachePath = path.join(dir, "gemini-reads.json");
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : null;
  let changed = 0, clean = 0;
  for (const file of readdirSync(dir).sort()) {
    const full = path.join(dir, file);
    const ext = path.extname(file).toLowerCase();
    let target = file;
    if (ext === ".heic" || ext === ".heif") {
      target = path.basename(file, path.extname(file)) + ".jpg";
      try {
        execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", full, "--out", path.join(dir, target)], { stdio: "ignore" });
      } catch {
        console.log(`  ${file}: HEIC needs macOS's sips to convert; skipped`);
        continue;
      }
      rmSync(full);
    } else if (ext !== ".jpg" && ext !== ".jpeg") continue;
    const p = path.join(dir, target);
    const before = readFileSync(p);
    if (!hasGps(before) && target === file) { clean++; continue; }
    const after = stripGps(before);
    writeFileSync(p, after);
    if (hasGps(after) || !readExif(after).takenAt && readExif(before).takenAt) throw new Error(`${target}: stripping failed`);
    if (cache && cache.reads[file]) {
      cache.reads[target] = { ...cache.reads[file], sha1: sha1(after) };
      if (target !== file) delete cache.reads[file];
    }
    changed++;
    console.log(`  ${target}: location removed${target !== file ? ` (was ${file})` : ""}`);
  }
  if (cache) writeFileSync(cachePath, JSON.stringify(cache, null, 1) + "\n");
  console.log(`${dir}: ${changed} photo${changed === 1 ? "" : "s"} cleaned, ${clean} already had no location`);
}
