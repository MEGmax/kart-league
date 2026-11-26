// Profile pictures. Each lives in the private "avatars" Storage bucket as <user id>/<version>.jpg (a 256px
// square), next to the original it was cut from (<version>-orig.jpg, at most 1024px). profiles.avatar_path
// points at the square and profiles.avatar_crop says how it was cut ({ source, cx, cy, zoom }, see
// avatarCrop.js), so the editor (components/AvatarEditor.jsx) can re-centre it later. Both images are redrawn
// on a canvas before upload, which drops all EXIF (GPS location, camera). Signed-in members read pictures
// through short-lived signed URLs; no picture shows your initials. Schema: v11/v12 in supabase/schema.sql.
import { sb, q } from "./supabaseClient";
import { cropRect } from "./avatarCrop";

export const AVATAR_BUCKET = "avatars";
const SIZE = 256;
const ORIGINAL_MAX = 1024;
const store = () => sb.storage.from(AVATAR_BUCKET);

function loadSrc(src, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture couldn't be opened. Try a JPEG or PNG."));
    img.src = src;
  });
}

// A picked file as an image (the object URL stays alive while the editor shows it).
export async function imageFromFile(file) {
  return loadSrc(URL.createObjectURL(file), false);
}

// Your saved original (or, for a picture saved before originals were kept, the square itself).
export async function imageFromProfile(profile) {
  const path = (profile.avatarCrop && profile.avatarCrop.source) || profile.avatarPath;
  if (!path) return null;
  const url = await avatarUrl(path);
  return url ? loadSrc(url, true) : null;
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("That picture couldn't be saved."))), "image/jpeg", quality));
}

function squareBlob(img, crop) {
  const r = cropRect(crop, img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  c.getContext("2d").drawImage(img, r.x, r.y, r.side, r.side, 0, 0, SIZE, SIZE);
  return toJpeg(c, 0.85);
}

function originalBlob(img) {
  const s = Math.min(1, ORIGINAL_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return toJpeg(c, 0.85);
}

const needsUpdate = (e) => /bucket not found|avatar_path|avatar_crop/i.test((e && e.message) || "");
const UPDATE_MSG = "Profile pictures need the latest database update: an admin pastes supabase/schema.sql into Supabase › SQL Editor and runs it.";

async function upload(path, blob) {
  const up = await store().upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(needsUpdate(up.error) ? UPDATE_MSG : up.error.message);
}

// Deletes everything in the user's folder except `keep`.
async function prune(userId, keep) {
  const { data } = await store().list(userId);
  const gone = (data || []).map((f) => `${userId}/${f.name}`).filter((p) => keep.indexOf(p) < 0);
  if (gone.length) await store().remove(gone);
}

// Saves the picture as cut in the editor. `img` is the original; `fresh` says it's a newly picked file (so
// the original is uploaded too), otherwise the saved original in `source` is reused.
export async function saveAvatar(userId, { img, crop, fresh, source }) {
  const v = Date.now().toString(36);
  const path = `${userId}/${v}.jpg`;
  const src = fresh || !source ? `${userId}/${v}-orig.jpg` : source;
  if (src !== source) await upload(src, await originalBlob(img));
  await upload(path, await squareBlob(img, crop));
  const cut = cropRect(crop, img.naturalWidth, img.naturalHeight).crop;
  try {
    await q(sb.from("profiles").update({ avatar_path: path, avatar_crop: { source: src, ...cut }, updated_at: new Date().toISOString() }).eq("id", userId));
  } catch (e) {
    await store().remove(src !== source ? [path, src] : [path]).catch(() => {});
    throw new Error(needsUpdate(e) ? UPDATE_MSG : e.message);
  }
  await prune(userId, [path, src]).catch(() => {});
  return path;
}

// Back to initials: clears the profile, then deletes the files.
export async function clearAvatar(userId) {
  await q(sb.from("profiles").update({ avatar_path: null, avatar_crop: null, updated_at: new Date().toISOString() }).eq("id", userId));
  await prune(userId, []).catch(() => {});
}

// Every picture in this user's folder (before deleting the account: Storage files aren't removed by SQL).
export async function removeAllAvatars(userId) {
  await prune(userId, []);
}

// A signed URL for showing a picture (a day long; the profile reloads well before then).
export async function avatarUrl(path) {
  if (!path) return null;
  const { data, error } = await store().createSignedUrl(path, 24 * 3600);
  return error ? null : data.signedUrl;
}

// Signed URLs for several pictures in one request: { path: url } (paths that fail are left out).
export async function avatarUrls(paths) {
  if (!paths.length) return {};
  const { data, error } = await store().createSignedUrls(paths, 24 * 3600);
  if (error || !data) return {};
  const out = {};
  data.forEach((d) => { if (d && d.signedUrl && !d.error) out[d.path] = d.signedUrl; });
  return out;
}
