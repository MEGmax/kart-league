// iCalendar (.ics, RFC 5545) for cup night emails. Plain JS with no imports, so the Edge Function
// (Deno) and the tests (Node) share it.
//
// Every email about a cup night carries the same UID, so calendar apps update or remove the one entry
// instead of adding duplicates. SEQUENCE is events.sequence: it goes up when the date/time or cups
// change, and on cancellation (METHOD:CANCEL + STATUS:CANCELLED).

export const EVENT_HOURS = 3; // how long a cup night blocks out in the calendar

export function eventUid(eventId) {
  return `cup-night-${eventId}@kart-league`;
}

export function cupsLabel(cups) {
  return cups && cups.length ? cups.join(", ") : "Cup TBD";
}

function stamp(d) {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Lines longer than 75 octets continue on the next line after CRLF + space (RFC 5545 §3.1).
export function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = "", len = 0, limit = 75;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > limit) {
      out.push(cur);
      cur = ""; len = 0; limit = 74; // continuation lines start with a space
    }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// Parameter values (CN=...) are quoted, not backslash-escaped; quotes and line breaks aren't allowed in them.
function param(s) {
  return '"' + String(s || "").replace(/["\r\n]/g, "") + '"';
}

function mailto(addr) {
  return "mailto:" + String(addr || "").trim();
}

// event: { id, starts_at, cups, notes, sequence }
// opts: { method: "REQUEST" | "CANCEL" | "PUBLISH", url, organizer: { name, email }, attendee: { name, email }, now }
// PUBLISH is the site's "Add to calendar" file: an entry, not an invite, with the same UID as the
// emails so a later update moves the same entry.
export function buildIcs(event, opts) {
  const method = opts.method === "CANCEL" ? "CANCEL" : opts.method === "PUBLISH" ? "PUBLISH" : "REQUEST";
  const start = new Date(event.starts_at);
  const end = new Date(start.getTime() + EVENT_HOURS * 3600 * 1000);
  const summary = `Cup night: ${cupsLabel(event.cups)}`;
  const description = [cupsLabel(event.cups), event.notes || "", opts.url && method !== "CANCEL" ? `I'm in: ${opts.url}` : ""]
    .filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kart Night League//Cup Nights//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${eventUid(event.id)}`,
    `SEQUENCE:${Number(event.sequence) || 0}`,
    `DTSTAMP:${stamp(opts.now || new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    opts.url ? `URL:${opts.url}` : null,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    opts.organizer && opts.organizer.email
      ? `ORGANIZER;CN=${param(opts.organizer.name || "Kart Night League")}:${mailto(opts.organizer.email)}` : null,
    opts.attendee && opts.attendee.email
      ? `ATTENDEE;CN=${param(opts.attendee.name || opts.attendee.email)};RSVP=FALSE:${mailto(opts.attendee.email)}` : null,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
