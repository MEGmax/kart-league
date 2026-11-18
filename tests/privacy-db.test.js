// What a signed-out visitor, a member and an admin can read and write: the public pages' data and
// nothing more (no account ids, emails, RSVPs or photos for visitors, and no writes at all).
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, as, localDb } from "../scripts/lib/localdb.js";

let db, admin, member, eventId;

beforeAll(async () => {
  db = await localDb();
  admin = await addUser(db, { email: "ada@example.com", name: "Ada", role: "admin" });
  member = await addUser(db, { email: "ben@example.com", name: "Ben" });
  await db.query("insert into public.players (id, name, color, user_id, registered_at) values ('pa', 'Ada', '#E5484D', $1, now())", [admin]);
  await db.query(`insert into public.cups (id, cup, date, week, max, results, added_at, added_by, status, maps)
    values ('c1', 'Mushroom Cup', '2026-11-15', 2, 60, '[{"rid":"p_pa","p":"pa","pts":42,"character":"Luigi"}]', 1, $1, 'complete', '{}')`, [admin]);
  await db.query("insert into public.race_results (cup_id, race, player_id, position, points, character, entered_by, entered_at) values ('c1', 1, 'pa', 1, 15, 'Luigi', $1, 1)", [admin]);
  await db.query("insert into public.photos (cup_id, data) values ('c1', 'QUJD')");
  const { rows } = await as(db, admin, "select public.create_event(now() + interval '2 days', '{}', '') as id");
  eventId = rows[0].id;
  await as(db, member, "select public.join_event($1)", [eventId]);
});

const denied = /permission denied|row-level security|violates row-level/i;

describe("signed-out visitors", () => {
  it("read the public pages' columns", async () => {
    const p = await as(db, null, "select id, name, color, aliases, registered_at from public.players");
    expect(p.rows.map((r) => r.name)).toEqual(["Ada"]);
    const c = await as(db, null, "select id, cup, results, has_photo, photo_path, maps from public.cups");
    expect(c.rows).toHaveLength(1);
    const r = await as(db, null, "select cup_id, race, player_id, position, points, character from public.race_results");
    expect(r.rows).toHaveLength(1);
    const e = await as(db, null, "select id, starts_at, cups, status from public.events");
    expect(e.rows).toHaveLength(1);
    const l = await as(db, null, "select settings from public.league");
    expect(l.rows.length).toBeLessThanOrEqual(1);
  });

  it("can't read account ids, emails, RSVPs or photos", async () => {
    await expect(as(db, null, "select user_id from public.players")).rejects.toThrow(denied);
    await expect(as(db, null, "select * from public.players")).rejects.toThrow(denied);
    await expect(as(db, null, "select added_by from public.cups")).rejects.toThrow(denied);
    await expect(as(db, null, "select entered_by from public.race_results")).rejects.toThrow(denied);
    await expect(as(db, null, "select created_by from public.events")).rejects.toThrow(denied);
    await expect(as(db, null, "select created_by from public.cup_templates")).rejects.toThrow(denied);
    await expect(as(db, null, "select * from public.event_commitments")).rejects.toThrow(denied);
    await expect(as(db, null, "select data from public.photos")).rejects.toThrow(denied);
    const prof = await as(db, null, "select count(*)::int as n from public.profiles").catch(() => ({ rows: [{ n: 0 }] }));
    expect(prof.rows[0].n).toBe(0);
    const att = await as(db, null, "select user_id, display_name from public.event_attendees()");
    expect(att.rows).toEqual([{ user_id: null, display_name: "Ben" }]);
  });

  it("can't write anything", async () => {
    await expect(as(db, null, "insert into public.players (id, name) values ('px', 'X')")).rejects.toThrow(denied);
    await expect(as(db, null, "update public.cups set cup = 'X'")).rejects.toThrow(denied);
    await expect(as(db, null, "delete from public.race_results")).rejects.toThrow(denied);
    await expect(as(db, null, "update public.league set settings = '{}'")).rejects.toThrow(denied);
    await expect(as(db, null, "insert into public.photos (cup_id, data) values ('c1', 'x')")).rejects.toThrow(denied);
    await expect(as(db, null, "insert into storage.objects (bucket_id, name) values ('cup-photos', 'cups/c1/x.jpg')")).rejects.toThrow(denied);
  });
});

describe("members and admins", () => {
  it("members see photos and who's in, with their account id", async () => {
    const ph = await as(db, member, "select data from public.photos");
    expect(ph.rows).toEqual([{ data: "QUJD" }]);
    const att = await as(db, member, "select user_id from public.event_attendees()");
    expect(att.rows).toEqual([{ user_id: member }]);
    const p = await as(db, member, "select user_id from public.players");
    expect(p.rows).toEqual([{ user_id: admin }]);
  });

  it("only admins write results photos, and only into the cup-photos bucket", async () => {
    await expect(as(db, member, "insert into storage.objects (bucket_id, name) values ('cup-photos', 'cups/c1/a.jpg')")).rejects.toThrow(denied);
    await as(db, admin, "insert into storage.objects (bucket_id, name) values ('cup-photos', 'cups/c1/a.jpg')");
    const seen = await as(db, member, "select name from storage.objects where bucket_id = 'cup-photos'");
    expect(seen.rows).toEqual([{ name: "cups/c1/a.jpg" }]);
    expect((await as(db, null, "select name from storage.objects")).rows).toEqual([]);
    await as(db, admin, "update public.cups set photo_path = 'cups/c1/a.jpg' where id = 'c1'");
    await expect(as(db, member, "update public.cups set photo_path = null where id = 'c1'")).resolves.toMatchObject({ affectedRows: 0 });
    const bucket = await db.query("select public, allowed_mime_types from storage.buckets where id = 'cup-photos'");
    expect(bucket.rows).toEqual([{ public: false, allowed_mime_types: ["image/jpeg"] }]);
  });
});
