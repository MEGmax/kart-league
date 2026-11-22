// When a photo was taken, from its EXIF (so a night's photos can be put in order), read in the browser.
// The EXIF reader is the one the backlog script uses (scripts/lib/exif.js); it expects a Node Buffer, so
// this gives it the few Buffer methods it needs over plain bytes.
import { readExif } from "../../scripts/lib/exif.js";

class Bytes extends Uint8Array {
  readUInt16BE(o) { return (this[o] << 8) | this[o + 1]; }
  readUInt16LE(o) { return this[o] | (this[o + 1] << 8); }
  readUInt32BE(o) { return ((this[o] << 24) | (this[o + 1] << 16) | (this[o + 2] << 8) | this[o + 3]) >>> 0; }
  readUInt32LE(o) { return ((this[o + 3] << 24) | (this[o + 2] << 16) | (this[o + 1] << 8) | this[o]) >>> 0; }
  toString(enc, start = 0, end = this.length) {
    if (enc !== "latin1") return super.toString();
    let s = "";
    for (let i = start; i < Math.min(end, this.length); i++) s += String.fromCharCode(this[i]);
    return s;
  }
}

function localStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Resolves with { takenAt: "2026-11-15T20:26:24" (local time), exact: true when it came from the camera }.
export async function photoTakenAt(file) {
  try {
    const head = new Bytes(await file.slice(0, 256 * 1024).arrayBuffer());
    const e = readExif(head);
    if (e.takenAt) return { takenAt: e.takenAt, exact: true };
  } catch {
    // not a JPEG, or unreadable EXIF: fall back to the file's date
  }
  return { takenAt: localStamp(new Date(file.lastModified || Date.now())), exact: false };
}
