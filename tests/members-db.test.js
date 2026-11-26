// The Stats page's list of everyone who has signed up (league_members() in supabase/schema.sql), as each role.
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as } from "../scripts/lib/localdb.js";

let db, ada, ben;

beforeEach(async () => {
  db = await localDb();
  ada = await addUser(db, { email: "ada@test.dev", name: "Ada", role: "owner" });
  ben = await addUser(db, { email: "ben@test.dev", name: "Ben" });
});

const members = async (who) => (await as(db, who, "select * from public.league_members()")).rows;

describe("league members", () => {
  it("lists confirmed accounts in sign-up order, with their player and no emails", async () => {
    await db.query("insert into public.players (id, name, user_id) values ('p1', 'Benny', $1)", [ben]);
    // Signed up but never confirmed the email: not a member yet.
    await db.query("insert into auth.users (email, raw_user_meta_data) values ('zed@test.dev', '{\"display_name\":\"Zed\"}')");
    const rows = await members(ben);
    expect(rows.map((r) => [r.display_name, r.role, r.player_id, r.is_me])).toEqual([
      ["Ada", "owner", null, false],
      ["Ben", "member", "p1", true],
    ]);
    expect(Object.keys(rows[0])).not.toContain("email");
    expect(JSON.stringify(rows)).not.toMatch(/@test\.dev/);
  });

  it("gives each member's profile picture path and account id, so the site can show their picture", async () => {
    await db.query("update public.profiles set avatar_path = $1 || '/abc.jpg' where id = $1", [ben]);
    const rows = await members(ada);
    expect(rows.map((r) => [r.display_name, r.user_id, r.avatar_path])).toEqual([
      ["Ada", ada, null],
      ["Ben", ben, `${ben}/abc.jpg`],
    ]);
  });

  it("is for signed-in members only", async () => {
    await expect(members(null)).rejects.toThrow(/permission denied/);
    expect((await members(ada)).length).toBe(2);
  });
});
