// Cup nights in the real schema (supabase/schema.sql loaded into PGlite), exercised as each role.
import { beforeEach, describe, expect, it } from "vitest";
import { localDb, addUser, as, setLeague } from "../scripts/lib/localdb.js";

let db, admin, member, outsider;

// 8pm Toronto on Jan 15 2030 is 01:00 UTC on Jan 16, so "the day" depends on the league's time zone.
const NIGHT = "2030-01-16T01:00:00Z";

beforeEach(async () => {
  db = await localDb();
  await setLeague(db, { timezone: "America/Toronto" });
  admin = await addUser(db, { email: "ada@test.dev", name: "Ada", role: "admin", optIn: true });
  member = await addUser(db, { email: "ben@test.dev", name: "Ben", optIn: true });
  outsider = await addUser(db, { email: "cy@test.dev", name: "Cy", optIn: false });
});

async function createEvent(who = admin, cups = [], notes = "", at = NIGHT) {
  const { rows } = await as(db, who, "select public.create_event($1, $2, $3) as id", [at, cups, notes]);
  return rows[0].id;
}

async function outbox(eventId) {
  const { rows } = await db.query(
    `select o.kind, o.sequence, o.status, o.last_error, p.display_name as name
     from public.email_outbox o join public.profiles p on p.id = o.user_id
     where o.event_id = $1 order by o.id`, [eventId]);
  return rows;
}

const claim = (now) => as(db, "service", "select * from public.claim_emails(50, coalesce($1::timestamptz, now()))", [now || null]);
const completeAll = async (rows) => {
  for (const r of rows) await as(db, "service", "select public.complete_email($1, true, null, true)", [r.id]);
};

describe("events without a cup", () => {
  it("can be created, read by anyone and assigned cups later", async () => {
    const id = await createEvent(admin, []);
    const anon = await as(db, null, "select cups, status, sequence from public.events where id = $1", [id]);
    expect(anon.rows[0]).toEqual({ cups: [], status: "scheduled", sequence: 0 });

    await as(db, admin, "select public.update_event($1, $2, $3, '')", [id, NIGHT, ["Mushroom Cup", " Cursed Cup ", ""]]);
    const { rows } = await db.query("select cups, sequence from public.events where id = $1", [id]);
    expect(rows[0]).toEqual({ cups: ["Mushroom Cup", "Cursed Cup"], sequence: 1 });
  });

  it("treats blank cup names as no cup", async () => {
    const id = await createEvent(admin, ["  ", ""]);
    const { rows } = await db.query("select cups from public.events where id = $1", [id]);
    expect(rows[0].cups).toEqual([]);
  });
});

describe("I'm in / Leave", () => {
  it("is idempotent in both directions", async () => {
    const id = await createEvent();
    await as(db, member, "select public.join_event($1)", [id]);
    await as(db, member, "select public.join_event($1)", [id]);
    let n = await db.query("select count(*)::int as n from public.event_commitments where event_id = $1", [id]);
    expect(n.rows[0].n).toBe(1);

    await as(db, member, "select public.leave_event($1)", [id]);
    await as(db, member, "select public.leave_event($1)", [id]);
    n = await db.query("select count(*)::int as n from public.event_commitments where event_id = $1", [id]);
    expect(n.rows[0].n).toBe(0);
  });

  it("enforces one commitment per person per event in the table itself", async () => {
    const id = await createEvent();
    await db.query("insert into public.event_commitments (event_id, user_id) values ($1, $2)", [id, member]);
    await expect(db.query("insert into public.event_commitments (event_id, user_id) values ($1, $2)", [id, member]))
      .rejects.toThrow(/duplicate key/);
  });

  it("shows display names publicly, but only through event_attendees", async () => {
    const id = await createEvent();
    await as(db, member, "select public.join_event($1)", [id]);
    await as(db, admin, "select public.join_event($1)", [id]);
    const { rows } = await as(db, null, "select display_name from public.event_attendees() where event_id = $1", [id]);
    expect(rows.map((r) => r.display_name)).toEqual(["Ben", "Ada"]);
    expect((await as(db, null, "select display_name from public.profiles")).rows).toEqual([]); // RLS hides profiles
  });

  it("needs a signed-in user and an open, scheduled event", async () => {
    const id = await createEvent();
    await expect(as(db, null, "select public.join_event($1)", [id])).rejects.toThrow(/permission denied/);
    await expect(as(db, member, "insert into public.event_commitments (event_id, user_id) values ($1, $2)", [id, member]))
      .rejects.toThrow(/permission denied/);

    await as(db, admin, "select public.cancel_event($1)", [id]);
    await expect(as(db, member, "select public.join_event($1)", [id])).rejects.toThrow(/cancelled/);

    const { rows } = await db.query("insert into public.events (starts_at) values (now() - interval '5 hours') returning id");
    await expect(as(db, member, "select public.join_event($1)", [rows[0].id])).rejects.toThrow(/over/);
  });
});

describe("admin-only management", () => {
  it("rejects members and signed-out visitors", async () => {
    await expect(createEvent(member)).rejects.toThrow(/Only admins/);
    await expect(createEvent(null)).rejects.toThrow(/permission denied/);
    const id = await createEvent(admin);
    await expect(as(db, member, "select public.update_event($1, $2, '{}', 'x')", [id, NIGHT])).rejects.toThrow(/Only admins/);
    await expect(as(db, member, "select public.cancel_event($1)", [id])).rejects.toThrow(/Only admins/);
  });

  it("blocks direct table writes, even for admins", async () => {
    await expect(as(db, admin, "insert into public.events (starts_at) values ($1)", [NIGHT])).rejects.toThrow(/permission denied/);
    const id = await createEvent(admin);
    await expect(as(db, admin, "update public.events set notes = 'x' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, "delete from public.events where id = $1", [id])).rejects.toThrow(/permission denied/);
  });

  it("keeps the email queue and background functions away from users", async () => {
    for (const who of [null, member, admin]) {
      await expect(as(db, who, "select * from public.email_outbox")).rejects.toThrow(/permission denied/);
      await expect(as(db, who, "select * from public.email_tokens")).rejects.toThrow(/permission denied/);
      await expect(as(db, who, "select * from public.claim_emails()")).rejects.toThrow(/permission denied/);
      await expect(as(db, who, "select public.queue_event_reminders()")).rejects.toThrow(/permission denied/);
    }
  });

  it("refuses times in the past and edits to cancelled nights", async () => {
    await expect(createEvent(admin, [], "", "2001-01-01T00:00:00Z")).rejects.toThrow(/already passed/);
    const id = await createEvent();
    await as(db, admin, "select public.cancel_event($1)", [id]);
    await expect(as(db, admin, "select public.update_event($1, $2, '{}', '')", [id, NIGHT])).rejects.toThrow(/cancelled/);
  });
});

describe("who gets which emails", () => {
  it("invites only people who opted in", async () => {
    const id = await createEvent();
    expect(await outbox(id)).toEqual([
      { kind: "invite", sequence: 0, status: "pending", last_error: null, name: "Ada" },
      { kind: "invite", sequence: 0, status: "pending", last_error: null, name: "Ben" },
    ]);
  });

  it("sends updates for date/time or cup changes, nothing for notes, and cancellations", async () => {
    const id = await createEvent(admin, [], "bring snacks");
    await as(db, admin, "select public.update_event($1, $2, '{}', 'bring drinks')", [id, NIGHT]);
    expect((await outbox(id)).length).toBe(2);

    await as(db, admin, "select public.update_event($1, $2, $3, 'bring drinks')", [id, NIGHT, ["Star Cup"]]);
    await as(db, admin, "select public.update_event($1, $2, $3, 'bring drinks')", [id, "2030-01-17T01:00:00Z", ["Star Cup"]]);
    await as(db, admin, "select public.cancel_event($1)", [id]);
    await as(db, admin, "select public.cancel_event($1)", [id]); // second cancel: no-op

    const rows = await outbox(id);
    expect(rows.filter((r) => r.name === "Ben").map((r) => `${r.kind}:${r.sequence}`))
      .toEqual(["invite:0", "update:1", "update:2", "cancel:3"]);
    expect(rows.some((r) => r.name === "Cy")).toBe(false);
  });

  it("drops emails that no longer apply when the sender picks them up", async () => {
    const id = await createEvent();
    await as(db, admin, "select public.update_event($1, $2, $3, '')", [id, NIGHT, ["Leaf Cup"]]); // invite superseded
    await db.query("update public.profiles set email_cup_nights = false where id = $1", [member]); // Ben opts out

    const claimed = (await claim()).rows;
    expect(claimed.map((r) => `${r.kind}:${r.seq}:${r.display_name}`)).toEqual(["update:1:Ada"]);
    const rows = await outbox(id);
    expect(rows.find((r) => r.name === "Ada" && r.kind === "invite").last_error).toBe("replaced by a newer update");
    expect(rows.find((r) => r.name === "Ben" && r.kind === "update").last_error).toBe("opted out");
  });

  it("only sends a cancellation to people who were actually invited", async () => {
    const id = await createEvent();
    await completeAll((await claim()).rows); // Ada and Ben get the invite
    await db.query("update public.profiles set email_cup_nights = true where id = $1", [outsider]); // Cy opts in late
    await as(db, admin, "select public.cancel_event($1)", [id]);

    const claimed = (await claim()).rows;
    expect(claimed.map((r) => r.display_name).sort()).toEqual(["Ada", "Ben"]);
    expect((await outbox(id)).find((r) => r.name === "Cy").last_error).toBe("never invited");
  });

  it("claims each email once, even if the sender runs again", async () => {
    await createEvent();
    expect((await claim()).rows.length).toBe(2);
    expect((await claim()).rows).toEqual([]);
    // Creating more events or re-running the queue functions never duplicates a queued email.
    const again = await db.query("select count(*)::int as n from public.email_outbox");
    expect(again.rows[0].n).toBe(2);
  });

  it("re-claims an email whose sender died mid-send, after 10 minutes", async () => {
    await createEvent();
    const first = (await claim()).rows;
    expect((await claim(new Date(Date.now() + 5 * 60e3).toISOString())).rows).toEqual([]);
    const retried = (await claim(new Date(Date.now() + 11 * 60e3).toISOString())).rows;
    expect(retried.map((r) => r.id)).toEqual(first.map((r) => r.id)); // same rows, so the same idempotency keys
  });

  it("retries failures with backoff, then gives up", async () => {
    await createEvent();
    await db.query("update public.profiles set email_cup_nights = false where id = $1", [member]); // just Ada's email
    for (let i = 1; i <= 5; i++) {
      const rows = (await claim()).rows;
      expect(rows.length).toBe(1);
      await as(db, "service", "select public.complete_email($1, false, 'boom')", [rows[0].id]);
      const o = (await db.query(
        "select status, attempts, last_error, next_attempt_at > now() as later from public.email_outbox where id = $1", [rows[0].id])).rows[0];
      expect(o).toMatchObject({ status: i < 5 ? "pending" : "failed", attempts: i, last_error: "boom" });
      if (i < 5) {
        expect(o.later).toBe(true);
        expect((await claim()).rows).toEqual([]); // not due yet
        await db.query("update public.email_outbox set next_attempt_at = now() where id = $1", [rows[0].id]);
      }
    }
  });

  describe("day-of reminders", () => {
    async function setup() {
      const id = await createEvent(admin, ["Mushroom Cup"]);
      await as(db, member, "select public.join_event($1)", [id]); // Ben: in + opted in
      await as(db, outsider, "select public.join_event($1)", [id]); // Cy: in, not opted in
      // Ada: opted in but not in
      return id;
    }
    const remind = async (at) => (await as(db, "service", "select public.queue_event_reminders($1) as n", [at])).rows[0].n;

    it("go only to people who are in and opted in, on the day in league time", async () => {
      const id = await setup();
      expect(await remind("2030-01-14T15:00:00Z")).toBe(0); // the day before
      expect(await remind("2030-01-15T13:30:00Z")).toBe(0); // 8:30am Toronto, before reminder hour
      expect(await remind("2030-01-15T14:05:00Z")).toBe(1); // 9:05am Toronto
      expect(await remind("2030-01-15T20:00:00Z")).toBe(0); // re-run: already queued
      const rem = (await outbox(id)).filter((r) => r.kind === "reminder");
      expect(rem.map((r) => r.name)).toEqual(["Ben"]);
    });

    it("are skipped if the person leaves before it goes out", async () => {
      const id = await setup();
      await remind("2030-01-15T14:05:00Z");
      await completeAll((await claim()).rows.filter((r) => r.kind !== "reminder"));
      await as(db, member, "select public.leave_event($1)", [id]);
      expect((await claim("2030-01-15T14:06:00Z")).rows).toEqual([]);
      expect((await outbox(id)).find((r) => r.kind === "reminder").last_error).toBe("no longer applies");
    });

    it("respect the league's reminder hour", async () => {
      await setLeague(db, { timezone: "America/Toronto", reminderHour: 12 });
      await setup();
      expect(await remind("2030-01-15T14:05:00Z")).toBe(0);
      expect(await remind("2030-01-15T17:05:00Z")).toBe(1);
    });
  });
});

describe("unsubscribe", () => {
  it("turns the setting off with just the token, and ignores unknown tokens", async () => {
    await createEvent();
    const [row] = (await claim()).rows.filter((r) => r.display_name === "Ben");
    const ok = await as(db, null, "select public.unsubscribe_email($1) as ok", [row.unsubscribe_token]);
    expect(ok.rows[0].ok).toBe(true);
    const bad = await as(db, null, "select public.unsubscribe_email(gen_random_uuid()) as ok");
    expect(bad.rows[0].ok).toBe(false);
    const { rows } = await db.query("select email_cup_nights from public.profiles where id = $1", [member]);
    expect(rows[0].email_cup_nights).toBe(false);
  });

  it("lets people change their own setting but not anyone else's", async () => {
    await as(db, outsider, "update public.profiles set email_cup_nights = true where id = $1", [outsider]);
    await as(db, outsider, "update public.profiles set email_cup_nights = false where id = $1", [member]);
    const { rows } = await db.query("select display_name, email_cup_nights from public.profiles order by display_name");
    expect(rows).toEqual([
      { display_name: "Ada", email_cup_nights: true },
      { display_name: "Ben", email_cup_nights: true },
      { display_name: "Cy", email_cup_nights: true },
    ]);
  });
});
