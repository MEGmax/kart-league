// Profile pictures (v11 in supabase/schema.sql): your own path on your profile, your own folder in Storage.
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as } from "../scripts/lib/localdb.js";

let db, ada, ben;

beforeEach(async () => {
  db = await localDb();
  ada = await addUser(db, { email: "ada@test.dev", name: "Ada" });
  ben = await addUser(db, { email: "ben@test.dev", name: "Ben" });
});

const put = (who, name) => as(db, who, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [name]);
const setPath = (who, path) => as(db, who, "update public.profiles set avatar_path = $1 where id = auth.uid()", [path]);

describe("profile pictures", () => {
  it("lets you upload to your own folder and point your profile at it", async () => {
    await put(ben, `${ben}/a1.jpg`);
    await setPath(ben, `${ben}/a1.jpg`);
    const { rows } = await db.query("select avatar_path from public.profiles where id = $1", [ben]);
    expect(rows[0].avatar_path).toBe(`${ben}/a1.jpg`);
    await setPath(ben, null);
  });

  it("won't let you write in someone else's folder or use their picture", async () => {
    await expect(put(ben, `${ada}/a1.jpg`)).rejects.toThrow(/row-level security/);
    await expect(setPath(ben, `${ada}/a1.jpg`)).rejects.toThrow(/profiles_avatar_own/);
  });

  it("is readable by signed-in members only, and only the owner can delete it", async () => {
    await put(ben, `${ben}/a1.jpg`);
    expect((await as(db, ada, "select name from storage.objects where bucket_id = 'avatars'")).rows).toHaveLength(1);
    expect((await as(db, null, "select name from storage.objects where bucket_id = 'avatars'")).rows).toHaveLength(0);
    await as(db, ada, "delete from storage.objects where bucket_id = 'avatars'");
    expect((await db.query("select name from storage.objects where bucket_id = 'avatars'")).rows).toHaveLength(1);
    await as(db, ben, "delete from storage.objects where bucket_id = 'avatars'");
    expect((await db.query("select name from storage.objects where bucket_id = 'avatars'")).rows).toHaveLength(0);
  });
});
