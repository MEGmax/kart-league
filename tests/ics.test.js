import { describe, expect, it } from "vitest";
import { buildIcs, eventUid, foldLine, escapeText } from "../supabase/functions/_shared/ics.js";
import { renderEmail } from "../supabase/functions/_shared/cupNightEmail.js";
import { localDb, addUser, as } from "../scripts/lib/localdb.js";

const EVENT = { id: "6f1c1a52-7a43-4b58-9f3e-1c2d3e4f5a6b", starts_at: "2030-01-16T01:00:00Z", cups: [], notes: "", sequence: 0 };
const NOW = new Date("2030-01-01T12:00:00Z");
const ORG = { name: "Kart Night League", email: "cup-nights@example.com" };

function field(ics, name) {
  const unfolded = ics.replace(/\r\n /g, "");
  const line = unfolded.split("\r\n").find((l) => l.startsWith(name + ":") || l.startsWith(name + ";"));
  return line ? line.slice(line.indexOf(":") + 1) : undefined;
}

describe("buildIcs", () => {
  it("writes a valid invite with UTC times and CRLF line endings", () => {
    const ics = buildIcs(EVENT, { method: "REQUEST", url: "https://site/#/events/x", organizer: ORG, now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(field(ics, "METHOD")).toBe("REQUEST");
    expect(field(ics, "UID")).toBe(`cup-night-${EVENT.id}@kart-league`);
    expect(field(ics, "SEQUENCE")).toBe("0");
    expect(field(ics, "DTSTART")).toBe("20300116T010000Z");
    expect(field(ics, "DTEND")).toBe("20300116T040000Z");
    expect(field(ics, "DTSTAMP")).toBe("20300101T120000Z");
    expect(field(ics, "SUMMARY")).toBe("Cup night: Cup TBD");
    expect(field(ics, "STATUS")).toBe("CONFIRMED");
    expect(ics).toContain('ORGANIZER;CN="Kart Night League":mailto:cup-nights@example.com');
  });

  it("keeps the UID and raises SEQUENCE across updates and cancellation", () => {
    const invite = buildIcs(EVENT, { method: "REQUEST", now: NOW });
    const update = buildIcs({ ...EVENT, cups: ["Star Cup"], sequence: 1 }, { method: "REQUEST", now: NOW });
    const cancel = buildIcs({ ...EVENT, cups: ["Star Cup"], sequence: 2 }, { method: "CANCEL", now: NOW });
    expect(new Set([invite, update, cancel].map((i) => field(i, "UID")))).toEqual(new Set([eventUid(EVENT.id)]));
    expect([invite, update, cancel].map((i) => field(i, "SEQUENCE"))).toEqual(["0", "1", "2"]);
    expect(field(cancel, "METHOD")).toBe("CANCEL");
    expect(field(cancel, "STATUS")).toBe("CANCELLED");
    expect(field(update, "SUMMARY")).toBe("Cup night: Star Cup");
  });

  it("escapes text and folds long lines at 75 octets", () => {
    const notes = "Bring controllers, snacks; and \\ a good attitude.\nDoors at 7. ".repeat(4) + "🍄🍄🍄";
    const ics = buildIcs({ ...EVENT, cups: ["Mushroom Cup", "Flower Cup"], notes }, { method: "REQUEST", now: NOW });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(field(ics, "SUMMARY")).toBe("Cup night: Mushroom Cup\\, Flower Cup");
    expect(field(ics, "DESCRIPTION")).toContain("snacks\\; and \\\\ a good attitude.\\nDoors at 7.");
    expect(field(ics, "DESCRIPTION")).toContain("🍄🍄🍄"); // multi-byte characters are never split
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(foldLine("x".repeat(75))).toBe("x".repeat(75));
  });
});

describe(".ics attached to the real email flow", () => {
  it("has a stable UID and rising SEQUENCE from invite to update to cancellation", async () => {
    const db = await localDb();
    const admin = await addUser(db, { email: "ada@test.dev", name: "Ada", role: "admin", optIn: true });
    const cfg = { mode: "log", from: "Kart Night League <cup-nights@example.com>", siteUrl: "https://site/", functionsUrl: "", leagueName: "KNL" };
    const send = async () => {
      const { rows } = await as(db, "service", "select * from public.claim_emails()");
      for (const r of rows) await as(db, "service", "select public.complete_email($1, true, null, true)", [r.id]);
      return rows.map((r) => renderEmail(r, cfg, NOW).attachments[0].content);
    };

    const { rows } = await as(db, admin, "select public.create_event('2030-01-16T01:00:00Z', '{}', '') as id");
    const id = rows[0].id;
    const [invite] = await send();
    await as(db, admin, "select public.update_event($1, '2030-01-16T02:00:00Z', '{Shell Cup}', '')", [id]);
    const [update] = await send();
    await as(db, admin, "select public.cancel_event($1)", [id]);
    const [cancel] = await send();

    expect([invite, update, cancel].map((i) => field(i, "UID"))).toEqual(Array(3).fill(eventUid(id)));
    expect([invite, update, cancel].map((i) => field(i, "SEQUENCE"))).toEqual(["0", "1", "2"]);
    expect([invite, update, cancel].map((i) => field(i, "METHOD"))).toEqual(["REQUEST", "REQUEST", "CANCEL"]);
    expect(field(update, "DTSTART")).toBe("20300116T020000Z");
    expect(invite).toContain("ATTENDEE;CN=\"Ada\";RSVP=FALSE:mailto:ada@test.dev");
  });
});
