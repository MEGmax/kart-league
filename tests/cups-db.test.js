// Recording cup nights in the real schema (supabase/schema.sql in PGlite), as each role.
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as } from "../scripts/lib/localdb.js";

let db, admin, member;

beforeEach(async () => {
  db = await localDb();
  admin = await addUser(db, { email: "ada@test.dev", name: "Ada", role: "admin" });
  member = await addUser(db, { email: "ben@test.dev", name: "Ben" });
  await db.query("insert into public.players (id, name, color) values ('pa', 'Ada', '#E5484D'), ('pb', 'Ben', '#0090FF')");
});

const MUSHROOM = ["Luigi Circuit", "Moo Moo Meadows", "Mushroom Gorge", "Toad's Factory"];
const races = (pid, ch, positions) => positions.map((p, i) => ({ player_id: pid, race: i + 1, position: p, character: ch }));

function night(over = {}) {
  return [
    {
      id: "c1", cup: "Mushroom Cup", date: "2026-11-14", week: 2, max: 60, notes: "", maps: MUSHROOM, has_photo: false, added_at: 1,
      results: [
        { rid: "p_pa", p: "pa", pts: 57, character: "Mario", raw: "" },
        { rid: "p_pb", p: "pb", pts: 49, character: "Yoshi", raw: "" },
        { rid: "u1", p: null, pts: 30, character: "Toad", raw: "" },
      ],
      races: races("pa", "Mario", [1, 2, 1, 1]).concat(races("pb", "Yoshi", [2, 1, 3, 2])),
      ...over,
    },
    {
      id: "c2", cup: "Flower Cup", date: "2026-11-14", week: 2, max: 60, notes: "", maps: [], has_photo: false, added_at: 2,
      results: [{ rid: "p_pnew", p: "pnew", pts: 40, character: "Bowser", raw: "" }, { rid: "p_pa", p: "pa", pts: 38, character: "Mario", raw: "" }],
    },
  ];
}

const save = (who, cups, players = [{ id: "pnew", name: "Cy", color: "#30A46C" }]) =>
  as(db, who, "select public.save_cup_night($1, $2)", [JSON.stringify(cups), JSON.stringify(players)]);

describe("save_cup_night", () => {
  it("saves a whole night: complete cups, new players, race-by-race rows", async () => {
    await save(admin, night());
    const cups = await db.query("select id, status, week, maps, jsonb_array_length(results) as n from public.cups order by id");
    expect(cups.rows).toEqual([
      { id: "c1", status: "complete", week: 2, maps: MUSHROOM, n: 3 },
      { id: "c2", status: "complete", week: 2, maps: [], n: 2 },
    ]);
    const p = await db.query("select name from public.players where id = 'pnew'");
    expect(p.rows[0].name).toBe("Cy");
    const rr = await db.query("select player_id, sum(points)::int as pts, count(*)::int as n from public.race_results where cup_id = 'c1' group by 1 order by 1");
    expect(rr.rows).toEqual([{ player_id: "pa", pts: 57, n: 4 }, { player_id: "pb", pts: 49, n: 4 }]);
  });

  it("is for admins only", async () => {
    await expect(save(member, night())).rejects.toThrow(/Only admins/);
    await expect(save(null, night())).rejects.toThrow(/permission denied/);
  });

  it("rejects race rows that don't add up to the totals", async () => {
    const bad = night();
    bad[0].results[0].pts = 50;
    await expect(save(admin, bad)).rejects.toThrow(/don't match the totals/);
    const n = await db.query("select count(*)::int as n from public.cups");
    expect(n.rows[0].n).toBe(0); // nothing half-saved
  });

  it("rejects two racers in the same place in one race", async () => {
    const bad = night();
    bad[0].races = races("pa", "Mario", [1, 2, 1, 1]).concat(races("pb", "Yoshi", [1, 1, 3, 2]));
    bad[0].results[1].pts = 15 + 15 + 10 + 12;
    await expect(save(admin, bad)).rejects.toThrow(/two racers finished in place 1/);
  });

  it("rejects points above the max and duplicate players", async () => {
    const over = night();
    over[1].results[0].pts = 61;
    await expect(save(admin, over)).rejects.toThrow(/whole numbers from 0 to 60/);
    const dup = night();
    dup[1].results[1].p = "pnew";
    await expect(save(admin, dup)).rejects.toThrow(/same player appears twice/);
  });

  it("edits a cup in place: keeps its tracks, added time and photo flag, and replaces race rows", async () => {
    await save(admin, night());
    await db.query("update public.cups set has_photo = true where id = 'c1'");
    const edit = night()[0];
    edit.maps = ["Rainbow Road", "Rainbow Road", "Rainbow Road", "Rainbow Road"];
    edit.added_at = 999;
    edit.results = [{ rid: "p_pa", p: "pa", pts: 50, character: "Mario", raw: "" }];
    edit.races = [];
    await save(admin, [edit], []);
    const c = await db.query("select maps, added_at, has_photo, results from public.cups where id = 'c1'");
    expect(c.rows[0].maps).toEqual(MUSHROOM);
    expect(Number(c.rows[0].added_at)).toBe(1);
    expect(c.rows[0].has_photo).toBe(true);
    expect(c.rows[0].results).toHaveLength(1);
    const rr = await db.query("select count(*)::int as n from public.race_results where cup_id = 'c1'");
    expect(rr.rows[0].n).toBe(0);
  });

  it("won't overwrite a cup that's still being raced", async () => {
    await as(db, admin, "select public.create_cup($1)", [JSON.stringify({ id: "c1", cup: "Mushroom Cup", date: "2026-11-14", maps: MUSHROOM })]);
    await expect(save(admin, night())).rejects.toThrow(/still being raced/);
  });
});

describe("member submissions of a night", () => {
  it("are stored per cup with a shared batch and tracks, and approved together", async () => {
    for (const [id, cup] of [["s1", "Mushroom Cup"], ["s2", "Flower Cup"]]) {
      await as(db, member, "select public.submit_cup($1, $2)", [JSON.stringify({
        id, batch: "b1", cup, date: "2026-11-14", week: 2, max: 60, maps: cup === "Mushroom Cup" ? MUSHROOM : [],
        rows: [{ rid: "r1", raw: "Ben", character: "Yoshi", pts: 44, assign: "pb", newName: "", races: null }],
      }), id === "s1" ? "aGVsbG8=" : null]);
    }
    const subs = await as(db, member, "select id, batch, maps, has_photo from public.submissions order by id");
    expect(subs.rows).toEqual([
      { id: "s1", batch: "b1", maps: MUSHROOM, has_photo: true },
      { id: "s2", batch: "b1", maps: [], has_photo: false },
    ]);

    const cups = night();
    cups[0].submission = "s1";
    cups[1].submission = "s2";
    await save(admin, cups);
    const after = await db.query("select id, status, cup_id from public.submissions order by id");
    expect(after.rows).toEqual([{ id: "s1", status: "approved", cup_id: "c1" }, { id: "s2", status: "approved", cup_id: "c2" }]);
    const photos = await db.query("select count(*)::int as n from public.submission_photos");
    expect(photos.rows[0].n).toBe(0);

    // Approving the same submission twice fails, and rolls back the whole save.
    const again = night();
    again[0].id = "c9"; again[1].id = "c10";
    again[0].submission = "s1";
    await expect(save(admin, again)).rejects.toThrow(/already reviewed/);
    const n = await db.query("select count(*)::int as n from public.cups where id in ('c9', 'c10')");
    expect(n.rows[0].n).toBe(0);
  });
});

describe("finish_cup on a reopened cup", () => {
  it("keeps the unclaimed results it already had", async () => {
    await save(admin, night());
    await as(db, admin, "select public.reopen_cup('c1')");
    await as(db, admin, "select public.finish_cup('c1', null, '[]'::jsonb)");
    const { rows } = await db.query("select results from public.cups where id = 'c1'");
    const res = rows[0].results;
    expect(res.filter((r) => r.p === null)).toEqual([{ rid: "u1", p: null, pts: 30, character: "Toad", raw: "" }]);
    expect(res.filter((r) => r.p).map((r) => [r.p, r.pts])).toEqual([["pa", 57], ["pb", 49]]);
  });
});

describe("seasons (v10)", () => {
  const setSeason = (n) => db.query(`update public.league set settings = settings || '{"currentSeason": ${n}}'::jsonb where id = 1`);
  const seasons = async () => (await db.query("select id, season from public.cups order by id")).rows;

  beforeEach(async () => {
    await db.query("insert into public.league (id, settings) values (1, '{}'::jsonb) on conflict (id) do nothing");
  });

  it("files cups in Season 1 until the league moves on", async () => {
    await save(admin, night());
    expect(await seasons()).toEqual([{ id: "c1", season: 1 }, { id: "c2", season: 1 }]);
  });

  it("puts new cups in the current season and keeps an edited cup's season", async () => {
    await save(admin, night());
    await setSeason(2);
    const edit = night();
    edit[1].results[0].pts = 41;
    await save(admin, [edit[1]]);
    await as(db, admin, "select public.create_cup($1)", [JSON.stringify({ id: "c3", cup: "Star Cup", date: "2026-12-01", week: 1, maps: MUSHROOM })]);
    expect(await seasons()).toEqual([{ id: "c1", season: 1 }, { id: "c2", season: 1 }, { id: "c3", season: 2 }]);
  });

  it("approves a submission into the season it was sent in", async () => {
    await as(db, member, "select public.submit_cup($1, $2)", [JSON.stringify({
      id: "s1", cup: "Mushroom Cup", date: "2026-11-29", week: 5, max: 60, maps: MUSHROOM,
      rows: [{ rid: "r1", raw: "Ben", character: "Yoshi", pts: 44, assign: "pb", newName: "", races: null }],
    }), null]);
    await setSeason(2);
    const cups = night();
    cups[0].submission = "s1";
    await save(admin, cups);
    expect(await seasons()).toEqual([{ id: "c1", season: 1 }, { id: "c2", season: 2 }]);
  });

  it("lets signed-out visitors read a cup's season", async () => {
    await save(admin, night());
    const r = await as(db, null, "select season from public.cups where id = 'c1'");
    expect(r.rows).toEqual([{ season: 1 }]);
  });
});
