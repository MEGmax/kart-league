// Just enough EXIF to order a night's photos and tell camera photos from screenshots: the camera make
// and model, and when the photo was taken. JPEG only; anything else (or a JPEG without EXIF) gives {}.
//
// readExif(buffer) -> { make?, model?, takenAt?: "2026-11-15T20:26:24", offset?: "-05:00" }
export function readExif(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return {};
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xda || marker === 0xd9) break; // image data starts: no EXIF before it
    if (marker === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") {
      return parseTiff(buf.subarray(i + 10, i + 2 + len));
    }
    i += 2 + len;
  }
  return {};
}

const TAGS = { 0x010f: "make", 0x0110: "model", 0x0132: "dateTime", 0x8769: "exifIfd", 0x9003: "original", 0x9011: "offset" };

function parseTiff(t) {
  if (t.length < 8) return {};
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  if (u16(2) !== 42) return {};

  function ifd(off) {
    const out = {};
    if (off + 2 > t.length) return out;
    const n = u16(off);
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12;
      if (e + 12 > t.length) break;
      const name = TAGS[u16(e)];
      if (!name) continue;
      const type = u16(e + 2), count = u32(e + 4);
      if (type === 2) { // ASCII: inline when it fits in 4 bytes
        const at = count <= 4 ? e + 8 : u32(e + 8);
        if (at + count <= t.length) out[name] = t.toString("latin1", at, at + count).replace(/\0.*$/s, "").trim();
      } else if (type === 4 || type === 13) {
        out[name] = u32(e + 8);
      }
    }
    return out;
  }

  const ifd0 = ifd(u32(4));
  const ex = ifd0.exifIfd ? ifd(ifd0.exifIfd) : {};
  const stamp = ex.original || ifd0.dateTime;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(stamp || "");
  const out = {};
  if (ifd0.make) out.make = ifd0.make;
  if (ifd0.model) out.model = ifd0.model;
  if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (ex.offset) out.offset = ex.offset;
  return out;
}
