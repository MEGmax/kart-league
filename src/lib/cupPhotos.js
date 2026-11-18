// Results photos. They live in the private "cup-photos" Storage bucket (signed-in members only; admins
// write) as cups/<cup id>/<version>.jpg plus a 600px-wide <version>-thumb.jpg, and cups.photo_path holds
// the full-size path. Every photo is redrawn on a canvas and re-encoded in the browser before it's
// uploaded, which drops all EXIF (GPS location, camera) and bakes in the photo's orientation.
import { sb, q } from "./supabaseClient";

export const PHOTO_BUCKET = "cup-photos";
export const thumbOf = (path) => String(path).replace(/\.jpg$/, "-thumb.jpg");

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This photo couldn't be opened."));
    img.src = src;
  });
}

function toJpeg(img, { maxWidth = Infinity, maxSide = Infinity, quality }) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, maxWidth / w, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// A base64 JPEG (as the Add page and Join hold photos) as clean JPEGs with no metadata.
export async function cleanPhoto(b64) {
  const img = await loadImage("data:image/jpeg;base64," + b64);
  return {
    full: await toJpeg(img, { maxSide: 1600, quality: 0.82 }),
    thumb: await toJpeg(img, { maxWidth: 600, quality: 0.75 }),
  };
}

// Saves (or replaces) a cup's photo; admins only. Returns the Storage path, or null when the database
// hasn't been upgraded to Storage yet (no bucket), in which case the clean photo goes in the old table.
export async function saveCupPhoto(cupId, b64) {
  const { full, thumb } = await cleanPhoto(b64);
  const store = sb.storage.from(PHOTO_BUCKET);
  const path = `cups/${cupId}/${Date.now().toString(36)}.jpg`;
  const up = await store.upload(path, full, { contentType: "image/jpeg", upsert: true });
  if (up.error) {
    if (!/bucket not found/i.test(up.error.message || "")) throw up.error;
    await q(sb.from("photos").upsert({ cup_id: cupId, data: await blobToBase64(full) }));
    await q(sb.from("cups").update({ has_photo: true }).eq("id", cupId));
    return null;
  }
  const t = await store.upload(thumbOf(path), thumb, { contentType: "image/jpeg", upsert: true });
  if (t.error) throw t.error;
  const before = await q(sb.from("cups").select("photo_path").eq("id", cupId).maybeSingle()).catch(() => null);
  await q(sb.from("cups").update({ photo_path: path, has_photo: true }).eq("id", cupId));
  if (before && before.photo_path && before.photo_path !== path) await store.remove([before.photo_path, thumbOf(before.photo_path)]);
  await q(sb.from("photos").delete().eq("cup_id", cupId)).catch(() => {});
  return path;
}

// When a cup is deleted (admins only).
export async function deleteCupPhoto(path) {
  if (path) await sb.storage.from(PHOTO_BUCKET).remove([path, thumbOf(path)]);
}

// A short-lived link to a photo for a signed-in member, or null.
export async function photoUrl(path) {
  const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return error || !data ? null : data.signedUrl;
}

// Photos still in the old table (stored as base64 text with their EXIF): members can read them until
// an admin moves them.
const legacy = new Map();
export async function legacyPhoto(cupId) {
  if (!legacy.has(cupId)) {
    legacy.set(cupId, q(sb.from("photos").select("data").eq("cup_id", cupId).maybeSingle())
      .then((r) => (r && r.data ? "data:image/jpeg;base64," + r.data : null))
      .catch(() => null));
  }
  return legacy.get(cupId);
}

export async function legacyPhotoIds() {
  return (await q(sb.from("photos").select("cup_id"))).map((r) => r.cup_id);
}

// Admin › Results photos: re-encode an old photo (dropping its EXIF) into Storage and remove the old copy.
export async function moveLegacyPhoto(cupId) {
  const r = await q(sb.from("photos").select("data").eq("cup_id", cupId).maybeSingle());
  if (!r || !r.data) return;
  const path = await saveCupPhoto(cupId, r.data);
  if (!path) throw new Error("Run the latest supabase/schema.sql first: there's no cup-photos bucket yet.");
}
