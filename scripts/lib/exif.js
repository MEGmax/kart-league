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

// ---- removing location ----
// Bytes per value for each TIFF type (BYTE, ASCII, SHORT, LONG, RATIONAL, UNDEFINED, SLONG, SRATIONAL, FLOAT, DOUBLE).
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

function gpsIfd(t) {
  if (t.length < 8) return null;
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const w16 = (o, v) => (le ? t.writeUInt16LE(v, o) : t.writeUInt16BE(v, o));
  if (u16(2) !== 42) return null;
  const ifd0 = u32(4);
  if (ifd0 + 2 > t.length) return null;
  for (let k = 0; k < u16(ifd0); k++) {
    const e = ifd0 + 2 + k * 12;
    if (e + 12 > t.length) break;
    if (u16(e) === 0x8825) {
      const at = u32(e + 8);
      return at + 2 <= t.length ? { at, u16, u32, w16 } : null;
    }
  }
  return null;
}

function exifSegment(buf, fn) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") return fn(i, len);
    i += 2 + len;
  }
  return undefined;
}

// Does this JPEG say where it was taken?
export function hasGps(buf) {
  return !!exifSegment(buf, (i, len) => {
    const g = gpsIfd(buf.subarray(i + 10, i + 2 + len));
    return g && g.u16(g.at) > 0;
  });
}

// A copy of a JPEG with no location in it, without re-encoding the image: the EXIF GPS block is emptied
// (with the coordinates it points to) and XMP is dropped. Capture time and camera stay. Other files are
// returned as they are.
export function stripGps(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // image data from here on
    const len = buf.readUInt16BE(i + 2);
    const seg = Buffer.from(buf.subarray(i, i + 2 + len));
    const isExif = marker === 0xe1 && seg.toString("latin1", 4, 10) === "Exif\0\0";
    const isXmp = marker === 0xe1 && seg.toString("latin1", 4, 33) === "http://ns.adobe.com/xap/1.0/\0";
    if (isExif) {
      const t = seg.subarray(10);
      const g = gpsIfd(t);
      if (g) {
        const n = g.u16(g.at);
        for (let k = 0; k < n; k++) {
          const e = g.at + 2 + k * 12;
          if (e + 12 > t.length) break;
          const size = (TYPE_SIZE[g.u16(e + 2)] || 1) * g.u32(e + 4);
          if (size > 4) { const off = g.u32(e + 8); if (off + size <= t.length) t.fill(0, off, off + size); }
          t.fill(0, e, e + 12);
        }
        g.w16(g.at, 0);
      }
    }
    if (!isXmp) parts.push(seg);
    i += 2 + len;
  }
  parts.push(buf.subarray(i));
  return Buffer.concat(parts);
}
