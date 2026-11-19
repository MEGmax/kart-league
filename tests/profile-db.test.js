// Profile fields in the real schema (supabase/schema.sql loaded into PGlite).
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as } from "../scripts/lib/localdb.js";

let db, ben, cy;

beforeEach(async () => {
  db = await localDb();
  ben = await addUser(db, { email: "ben@test.dev", name: "Ben" });
  cy = await addUser(db, { email: "cy@test.dev", name: "Cy" });
});

describe("favourite tracks", () => {
  it("can be set on your own profile, up to 3", async () => {
    await as(db, ben, "update public.profiles set favorite_tracks = $1 where id = $2", [["Coconut Mall", "DK Summit", "Rainbow Road"], ben]);
    const { rows } = await as(db, ben, "select favorite_tracks from public.profiles where id = $1", [ben]);
    expect(rows[0].favorite_tracks).toEqual(["Coconut Mall", "DK Summit", "Rainbow Road"]);
    await expect(as(db, ben, "update public.profiles set favorite_tracks = $1 where id = $2", [["A", "B", "C", "D"], ben]))
      .rejects.toThrow(/check constraint/);
  });

  it("can't be changed on someone else's profile", async () => {
    await as(db, cy, "update public.profiles set favorite_tracks = $1 where id = $2", [["Koopa Cape"], ben]);
    const { rows } = await db.query("select favorite_tracks from public.profiles where id = $1", [ben]);
    expect(rows[0].favorite_tracks).toEqual([]);
  });
});
