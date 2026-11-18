// Track voting for a cup night in the real schema (supabase/schema.sql loaded into PGlite), as each role.
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as, setLeague } from "../scripts/lib/localdb.js";

let db, admin, ben, cy;

const SOON = () => new Date(Date.now() + 2 * 86400e3).toISOString();

beforeEach(async () => {
  db = await localDb();
  await setLeague(db, { timezone: "America/Toronto" });
  admin = await addUser(db, { email: "ada@test.dev", name: "Ada", role: "admin" });
  ben = await addUser(db, { email: "ben@test.dev", name: "Ben" });
  cy = await addUser(db, { email: "cy@test.dev", name: "Cy" });
});

async function night(at = SOON()) {
  const { rows } = await as(db, admin, "select public.create_event($1, '{}', '') as id", [at]);
  return rows[0].id;
}
const vote = (who, id, track) => as(db, who, "select public.vote_track($1, $2)", [id, track]);
const unvote = (who, id, track) => as(db, who, "select public.unvote_track($1, $2)", [id, track]);
const tally = async (who, id) => (await as(db, who, "select track, votes, voters, mine from public.track_vote_tally($1)", [id])).rows;
const join = (who, id) => as(db, who, "select public.join_event($1)", [id]);

describe("track votes", () => {
  it("only lets people who are in vote", async () => {
    const id = await night();
    await expect(vote(ben, id, "Coconut Mall")).rejects.toThrow(/Say you're in/);
    await join(ben, id);
    await vote(ben, id, "  Coconut Mall ");
    const rows = await tally(ben, id);
    expect(rows).toEqual([{ track: "Coconut Mall", votes: 1, voters: [{ name: "Ben", color: expect.anything() }], mine: true }]);
  });

  it("counts each person once per track and orders by votes", async () => {
    const id = await night();
    for (const u of [ben, cy, admin]) await join(u, id);
    await vote(ben, id, "DK Summit");
    await vote(ben, id, "DK Summit");
    await vote(ben, id, "Coconut Mall");
    await vote(cy, id, "Coconut Mall");
    await vote(admin, id, "Coconut Mall");
    const rows = await tally(cy, id);
    expect(rows.map((r) => [r.track, r.votes, r.mine])).toEqual([["Coconut Mall", 3, true], ["DK Summit", 1, false]]);
    expect(rows[0].voters.map((v) => v.name).sort()).toEqual(["Ada", "Ben", "Cy"]);
  });

  it("caps each person at 8 tracks, and taking one back frees a vote", async () => {
    const id = await night();
    await join(ben, id);
    for (let i = 1; i <= 8; i++) await vote(ben, id, `Track ${i}`);
    await expect(vote(ben, id, "Track 9")).rejects.toThrow(/all 8 votes/);
    await vote(ben, id, "Track 3"); // re-voting one you have is fine
    await unvote(ben, id, "Track 3");
    await vote(ben, id, "Track 9");
    expect((await tally(ben, id)).length).toBe(8);
  });

  it("drops your votes when you leave the night", async () => {
    const id = await night();
    await join(ben, id);
    await vote(ben, id, "Rainbow Road");
    await as(db, ben, "select public.leave_event($1)", [id]);
    expect(await tally(admin, id)).toEqual([]);
  });

  it("closes when the night is cancelled or over", async () => {
    const id = await night();
    await join(ben, id);
    await as(db, admin, "select public.cancel_event($1)", [id]);
    await expect(vote(ben, id, "Rainbow Road")).rejects.toThrow(/cancelled/);

    const old = await night();
    await join(ben, old);
    await db.query("update public.events set starts_at = now() - interval '5 hours' where id = $1", [old]);
    await expect(vote(ben, old, "Rainbow Road")).rejects.toThrow(/over/);
  });

  it("is members only: visitors can't read or vote, and nobody writes the table directly", async () => {
    const id = await night();
    await join(ben, id);
    await vote(ben, id, "Maple Treeway");
    await expect(as(db, null, "select * from public.track_vote_tally($1)", [id])).rejects.toThrow(/permission denied/);
    await expect(as(db, null, "select * from public.event_track_votes")).rejects.toThrow(/permission denied/);
    await expect(as(db, null, "select public.vote_track($1, 'x')", [id])).rejects.toThrow(/permission denied/);
    await expect(as(db, cy, "insert into public.event_track_votes (event_id, user_id, track) values ($1, $2, 'x')", [id, cy]))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, cy, "delete from public.event_track_votes")).rejects.toThrow(/permission denied/);
    const seen = await as(db, cy, "select track from public.event_track_votes");
    expect(seen.rows).toEqual([{ track: "Maple Treeway" }]);
  });
});
