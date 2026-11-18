// Cup nights: pure helpers shared by the events page and the homepage card.

// A cup night stays open ("I'm in" works, it counts as upcoming) until this long after it starts.
// Matches join_event in supabase/schema.sql.
export const EVENT_OPEN_HOURS = 3;

export function mapEvents(rows, attendees) {
  const going = {};
  (attendees || []).forEach((a) => {
    (going[a.event_id] = going[a.event_id] || []).push({ userId: a.user_id, name: a.display_name, color: a.color });
  });
  return (rows || []).map((e) => ({
    id: e.id, startsAt: e.starts_at, cups: e.cups || [], notes: e.notes || "",
    status: e.status || "scheduled", sequence: e.sequence || 0, going: going[e.id] || [],
  })).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

export function cupLabel(cups) {
  return cups && cups.length ? cups.join(", ") : "Cup TBD";
}

export function isOver(ev, now = Date.now()) {
  return new Date(ev.startsAt).getTime() + EVENT_OPEN_HOURS * 3600e3 <= now;
}

export function isOpen(ev, now = Date.now()) {
  return ev.status === "scheduled" && !isOver(ev, now);
}

export function isHappening(ev, now = Date.now()) {
  return isOpen(ev, now) && new Date(ev.startsAt).getTime() <= now;
}

// Upcoming includes cancelled nights that haven't happened yet, so people see the cancellation.
export function splitEvents(events, now = Date.now()) {
  const upcoming = events.filter((e) => !isOver(e, now));
  const past = events.filter((e) => isOver(e, now)).reverse();
  return { upcoming, past };
}

export function nextEvent(events, now = Date.now()) {
  return events.find((e) => isOpen(e, now)) || null;
}

export function isGoing(ev, userId) {
  return !!userId && ev.going.some((g) => g.userId === userId);
}

// Shown in the visitor's own time zone.
export function formatEventWhen(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  };
}

// <input type="datetime-local"> works in local wall-clock time; the database stores UTC.
export function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  const d = new Date(value);
  return isNaN(d) ? null : d.toISOString();
}

// The calendar date of a moment in the league's time zone (or this browser's), as YYYY-MM-DD.
export function localDate(iso, timeZone) {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", timeZone ? { ...opts, timeZone } : opts).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-CA", opts).format(new Date(iso));
  }
}

// Past cup nights as they actually happened: each finished cup belongs to the night on its date, and a
// date with cups but no scheduled night still shows up. Newest first.
//   cups: finished cups in race order ([{ id, date, ... }]); returns [{ date, event|null, cups }]
export function pastNights(pastEvents, cups, timeZone) {
  const byDate = new Map();
  pastEvents.filter((e) => e.status !== "cancelled").forEach((e) => {
    const date = localDate(e.startsAt, timeZone);
    if (!byDate.has(date)) byDate.set(date, { date, event: e, cups: [] });
  });
  cups.forEach((c) => {
    if (!c.date) return;
    if (!byDate.has(c.date)) byDate.set(c.date, { date: c.date, event: null, cups: [] });
    byDate.get(c.date).cups.push(c);
  });
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}
