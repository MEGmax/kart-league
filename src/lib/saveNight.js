// An admin saving a night straight to the standings: every cup in one transaction (save_cup_night), then
// each new photo, re-encoded without EXIF, into Storage. A photo that fails doesn't undo the results.
// Returns the names of cups whose photo didn't upload.
import { sb, q } from "./supabaseClient";
import { buildSave } from "./night";
import { saveCupPhoto } from "./cupPhotos";

export async function saveNightAsAdmin(night, state) {
  const payload = buildSave(night, state);
  await q(sb.rpc("save_cup_night", { p_cups: payload.cups, p_players: payload.players }));
  const failed = [];
  for (let i = 0; i < night.cups.length; i++) {
    const c = night.cups[i];
    if (!c.photo || !c.photoChanged) continue;
    try {
      await saveCupPhoto(payload.cups[i].id, c.photo);
    } catch {
      failed.push(c.name);
      await q(sb.from("cups").update({ has_photo: c.hasPhoto }).eq("id", payload.cups[i].id)).catch(() => {});
    }
  }
  return failed;
}
