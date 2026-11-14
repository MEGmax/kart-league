// Dry run of cup night emails on your machine; never sends anything and never touches the live database.
//
//   npm run email:preview                                   # invite → update → reminder → cancel
//   npm run email:preview -- --remind-at 2030-01-15T14:05Z  # run the reminder job as if it were this time
//
// Loads supabase/schema.sql into an in-memory Postgres (PGlite) with three sample accounts, runs each step
// through the same database functions and email code as production, logs what would be sent, and writes
// every email (HTML, plain text and .ics) to email-previews/ so you can open them.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { localDb, addUser, as, setLeague } from "./lib/localdb.js";
import { emailConfig, processBatch, renderEmail } from "../supabase/functions/_shared/cupNightEmail.js";

const OUT = new URL("../email-previews/", import.meta.url);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const remindAt = arg("--remind-at");

const db = await localDb();
const tz = "America/Toronto";
await setLeague(db, { timezone: tz });
const ada = await addUser(db, { email: "ada@example.com", name: "Ada", role: "admin", optIn: true });
const ben = await addUser(db, { email: "ben@example.com", name: "Ben", optIn: true });
const cy = await addUser(db, { email: "cy@example.com", name: "Cy", optIn: false });

const cfg = emailConfig({ ...process.env, EMAIL_MODE: "log", SUPABASE_URL: process.env.SUPABASE_URL || "https://ikbcapdpatjwozjdgcqk.supabase.co" });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let n = 0;

async function runSender(step, now) {
  const { rows } = await as(db, "service", "select * from public.claim_emails(50, coalesce($1::timestamptz, now()))", [now || null]);
  console.log(`\n== ${step}: ${rows.length} email${rows.length === 1 ? "" : "s"}`);
  for (const row of rows) {
    const m = renderEmail(row, cfg);
    const base = `${String(++n).padStart(2, "0")}-${row.kind}-${row.display_name.toLowerCase()}`;
    writeFileSync(new URL(`${base}.html`, OUT), m.html);
    writeFileSync(new URL(`${base}.txt`, OUT), `To: ${m.to}\nSubject: ${m.subject}\n${Object.entries(m.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${m.text}\n`);
    if (m.attachments[0]) writeFileSync(new URL(`${base}.ics`, OUT), m.attachments[0].content);
  }
  await processBatch(rows, {
    cfg,
    deliver: () => { throw new Error("log mode never delivers"); },
    complete: (id, ok, err, logged) => as(db, "service", "select public.complete_email($1, $2, $3, $4)", [id, ok, err, logged]),
  });
  const { rows: skipped } = await db.query(
    `select o.kind, p.display_name, o.last_error from public.email_outbox o join public.profiles p on p.id = o.user_id
     where o.status = 'skipped' and o.last_error is not null order by o.id`);
  for (const s of skipped) console.log(`[email:skip] ${s.kind} to ${s.display_name}: ${s.last_error}`);
  await db.query("update public.email_outbox set last_error = null where status = 'skipped'");
}

// A cup night three days from now at 8pm league time, with no cups yet.
const { rows: [{ at }] } = await db.query(
  "select (((now() at time zone $1)::date + 3 + time '20:00') at time zone $1) as at", [tz]);
console.log(`Ada (admin, emails on), Ben (emails on), Cy (emails off). Cup night at ${at.toISOString()} (8pm ${tz}).`);

const { rows: [{ id }] } = await as(db, ada, "select public.create_event($1, '{}', 'Bring a controller.') as id", [at]);
await runSender("Admin creates the cup night (Cup TBD)");

await as(db, ada, "select public.update_event($1, $2, $3, 'Bring a controller.')", [id, at, ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup"]]);
await runSender("Admin assigns the cups");

await as(db, ben, "select public.join_event($1)", [id]);
await as(db, cy, "select public.join_event($1)", [id]);
console.log("\nBen and Cy press I'm in.");

const { rows: [{ when }] } = await db.query(
  "select coalesce($2::timestamptz, ((($1::timestamptz at time zone $3)::date + time '09:05') at time zone $3)) as when", [at, remindAt, tz]);
const { rows: [{ queued }] } = await as(db, "service", "select public.queue_event_reminders($1) as queued", [when]);
console.log(`\nReminder job runs at ${when.toISOString()}: queued ${queued}.`);
await runSender("Reminder", when);

await as(db, ada, "select public.cancel_event($1)", [id]);
await runSender("Admin cancels");

console.log(`\nPreviews written to ${OUT.pathname}`);
