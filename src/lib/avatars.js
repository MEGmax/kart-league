// Profile pictures. Each lives in the private "avatars" Storage bucket as <user id>/<version>.jpg, and
// profiles.avatar_path points at it (v11 in supabase/schema.sql). The picked image is cropped to a centred
// square and redrawn at 256px on a canvas before upload, which drops all EXIF (GPS location, camera).
// Signed-in members can read pictures through short-lived signed URLs; no picture shows your initials.
import { sb, q } from "./supabaseClient";

export const AVATAR_BUCKET = "avatars";
const SIZE = 256;

function loadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn't be opened. Try a JPEG or PNG.")); };
    img.src = url;
  });
}

// The middle square of the image, SIZE px, as a JPEG with no metadata.
export async function squareJpeg(file) {
  const img = await loadFile(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("That picture couldn't be saved."))), "image/jpeg", 0.85));
}

const needsUpdate = (e) => /bucket not found|avatar_path/i.test((e && e.message) || "");
const UPDATE_MSG = "Profile pictures need the latest database update: an admin pastes supabase/schema.sql into Supabase › SQL Editor and runs it.";

// Uploads a new picture for this user, points the profile at it, and removes the old one.
export async function setAvatar(userId, file, oldPath) {
  const blob = await squareJpeg(file);
  const path = `${userId}/${Date.now().toString(36)}.jpg`;
  const store = sb.storage.from(AVATAR_BUCKET);
  const up = await store.upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(needsUpdate(up.error) ? UPDATE_MSG : up.error.message);
  try {
    await q(sb.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", userId));
  } catch (e) {
    await store.remove([path]).catch(() => {});
    throw new Error(needsUpdate(e) ? UPDATE_MSG : e.message);
  }
  if (oldPath) await store.remove([oldPath]).catch(() => {});
  return path;
}

// Back to initials: clears the profile's path, then deletes the file.
export async function clearAvatar(userId, path) {
  await q(sb.from("profiles").update({ avatar_path: null, updated_at: new Date().toISOString() }).eq("id", userId));
  if (path) await sb.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
}

// Every picture in this user's folder (before deleting the account: Storage files aren't removed by SQL).
export async function removeAllAvatars(userId) {
  const { data } = await sb.storage.from(AVATAR_BUCKET).list(userId);
  if (data && data.length) await sb.storage.from(AVATAR_BUCKET).remove(data.map((f) => `${userId}/${f.name}`));
}

// A signed URL for showing a picture (a day long; the profile reloads well before then).
export async function avatarUrl(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(AVATAR_BUCKET).createSignedUrl(path, 24 * 3600);
  return error ? null : data.signedUrl;
}
