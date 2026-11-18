import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import { buildIcs, EVENT_HOURS } from "../../supabase/functions/_shared/ics.js";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { cupLabel, formatEventWhen, isGoing, isHappening, isOpen, isOver } from "../lib/events";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { colors, fontDisplay } from "../theme";
import CupIcon from "./CupIcon";
import EventDialog from "./EventDialog";

const eventUrl = (id) => `${window.location.origin}${import.meta.env.BASE_URL}#/schedule/${id}`;
const gStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Add to calendar: a Google Calendar link, or an .ics file (Apple Calendar, Outlook). The file has the
// same UID as the invite emails, so an update moves the same entry.
function CalendarButton({ event, leagueName }) {
  const [at, setAt] = useState(null);
  const title = `${leagueName || "Cup night"}: ${cupLabel(event.cups)}`;
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + EVENT_HOURS * 3600 * 1000);

  function google() {
    const qs = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${gStamp(start)}/${gStamp(end)}`, details: `${event.notes ? event.notes + "\n\n" : ""}${eventUrl(event.id)}` });
    window.open(`https://calendar.google.com/calendar/render?${qs}`, "_blank", "noopener");
    setAt(null);
  }
  function ics() {
    const text = buildIcs({ id: event.id, starts_at: event.startsAt, cups: event.cups, notes: event.notes, sequence: event.sequence }, { method: "PUBLISH", url: eventUrl(event.id) });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    a.download = `cup-night-${start.toISOString().slice(0, 10)}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setAt(null);
  }
  return (
    <>
      <Button size="small" startIcon={<EventAvailableOutlinedIcon />} onClick={(e) => setAt(e.currentTarget)} aria-haspopup="menu">Add to calendar</Button>
      <Menu anchorEl={at} open={!!at} onClose={() => setAt(null)}>
        <MenuItem onClick={google}>Google Calendar</MenuItem>
        <MenuItem onClick={ics}>Apple Calendar, Outlook (.ics)</MenuItem>
      </Menu>
    </>
  );
}

// Compact for a schedule row: "I'm in", or a "You're in" tick with Leave.
function JoinButton({ event }) {
  const { user, ready } = useAuth();
  const { reload } = useLeagueData();
  const flash = useFlash();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen(event)) return null;
  if (!ready) return null;
  if (!user) return <Button size="small" variant="outlined" onClick={() => navigate("/account")}>Sign in to join</Button>;

  const going = isGoing(event, user.id);
  async function toggle() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc(going ? "leave_event" : "join_event", { p_id: event.id }));
      flash(going ? "You're out for this one" : "You're in!");
      reload();
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      {going ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="body2" sx={{ color: colors.good, fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckCircleIcon sx={{ fontSize: 18 }} />You're in
          </Typography>
          <Button size="small" onClick={toggle} disabled={busy} sx={{ color: colors.muted }}>{busy ? "Saving…" : "Leave"}</Button>
        </Stack>
      ) : (
        <Button size="small" variant="contained" onClick={toggle} disabled={busy}>{busy ? "Saving…" : "I'm in"}</Button>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}

function AdminActions({ event }) {
  const { reload } = useLeagueData();
  const flash = useFlash();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancelEvent() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc("cancel_event", { p_id: event.id }));
      flash("Cup night cancelled");
      setConfirming(false);
      reload();
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => setEditing(true)}>{event.cups.length ? "Edit" : "Edit / assign cups"}</Button>
        <Button size="small" color="error" onClick={() => setConfirming(true)}>Cancel</Button>
      </Stack>
      {editing && <EventDialog open event={event} onClose={() => setEditing(false)} />}
      <Dialog open={confirming} onClose={busy ? undefined : () => setConfirming(false)}>
        <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Cancel this cup night?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            It stays on the schedule marked as cancelled, and everyone who got an invite gets a cancellation that removes it from their calendar. This can't be undone.
          </Typography>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} disabled={busy}>Keep it</Button>
          <Button color="error" variant="contained" onClick={cancelEvent} disabled={busy}>{busy ? "Cancelling…" : "Cancel night"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

// Group dated items under month headings ("November 2026"), keeping their order.
export function byMonth(items, dateOf) {
  const groups = [];
  items.forEach((it) => {
    const d = dateOf(it);
    const key = monthKey(d);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }), items: [] };
      groups.push(g);
    }
    g.items.push(it);
  });
  return groups;
}

// The tear-off calendar square at the start of each schedule row.
export function DateBlock({ date, tone = "default", struck = false }) {
  const accent = tone === "next" ? colors.accent : tone === "live" ? colors.hot : null;
  return (
    <Box
      aria-hidden
      sx={{
        width: { xs: 52, sm: 60 }, borderRadius: 1.5, overflow: "hidden", textAlign: "center", alignSelf: "start",
        border: `1px solid ${accent || colors.line}`, bgcolor: tone === "past" ? "transparent" : colors.bg2,
        opacity: struck ? 0.6 : 1,
      }}
    >
      <Box sx={{ bgcolor: accent || (tone === "past" ? colors.panel : colors.navy), color: accent ? colors.accentInk : colors.ink, fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", py: 0.25 }}>
        {date.toLocaleDateString(undefined, { weekday: "short" })}
      </Box>
      <Typography sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.25rem", sm: "1.45rem" }, lineHeight: 1.15, pt: 0.5, textDecoration: struck ? "line-through" : "none", color: tone === "past" ? colors.muted : colors.ink }}>
        {date.getDate()}
      </Typography>
      <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.muted, pb: 0.5 }}>
        {date.toLocaleDateString(undefined, { month: "short" })}
      </Typography>
    </Box>
  );
}

// One schedule row: date square, details, actions (beside on wide screens, underneath on phones).
export function ScheduleRow({ id, date, tone, struck, highlight, children, actions }) {
  return (
    <Box
      id={id}
      sx={{
        display: "grid", columnGap: 2, rowGap: 1.25, px: { xs: 1.5, sm: 2 }, py: 2, scrollMarginTop: 80,
        gridTemplateColumns: { xs: "auto minmax(0,1fr)", sm: "auto minmax(0,1fr) auto" },
        bgcolor: highlight ? "rgba(255,210,63,.06)" : "transparent",
        boxShadow: highlight ? `inset 3px 0 0 ${colors.accent}` : "none",
      }}
    >
      <DateBlock date={date} tone={tone} struck={struck} />
      <Box sx={{ minWidth: 0 }}>{children}</Box>
      {actions && (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap
          sx={{ gridColumn: { xs: "2", sm: "3" }, flexWrap: "wrap", justifyContent: { xs: "flex-start", sm: "flex-end" }, alignSelf: { sm: "center" }, maxWidth: { sm: 300 } }}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}

// A row of colored dots and names: who's in, or who raced.
export function PeopleLine({ people, label }) {
  return (
    <Typography variant="body2" sx={{ color: colors.muted, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1, rowGap: 0.25 }}>
      {label && <Box component="span" sx={{ fontWeight: 700, color: colors.ink }}>{label}</Box>}
      {people.map((g, i) => (
        <Box key={g.key || i} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
          <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: g.color || colors.muted, flexShrink: 0 }} />
          {g.name}
        </Box>
      ))}
    </Typography>
  );
}

// An upcoming (or cancelled) cup night on the schedule. `isNext` marks the next open night.
export default function EventCard({ event, isNext = false, highlight = false }) {
  const { user, isAdmin } = useAuth();
  const { state } = useLeagueData();
  const navigate = useNavigate();
  const when = formatEventWhen(event.startsAt);
  const cancelled = event.status === "cancelled";
  const open = isOpen(event);
  const live = isHappening(event);
  const n = event.going.length;

  const actions = (
    <>
      <JoinButton event={event} />
      {open && <CalendarButton event={event} leagueName={state && state.league.name} />}
      {isAdmin && open && <AdminActions event={event} />}
      {user && !cancelled && (live || isOver(event)) && (
        <Button size="small" variant={live ? "outlined" : "contained"} onClick={() => navigate(`/add?event=${event.id}`)}>
          {isAdmin ? "Record results" : "Submit results"}
        </Button>
      )}
    </>
  );

  return (
    <ScheduleRow
      id={`event-${event.id}`}
      date={new Date(event.startsAt)}
      tone={live ? "live" : isNext ? "next" : "default"}
      struck={cancelled}
      highlight={highlight}
      actions={actions}
    >
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
        <Typography sx={{ fontWeight: 800, textDecoration: cancelled ? "line-through" : "none" }}>{when.time}</Typography>
        {live && <Chip size="small" label="Happening now" sx={{ bgcolor: colors.hot, color: "#fff", fontWeight: 700, height: 22 }} />}
        {isNext && !live && <Chip size="small" label="Next up" sx={{ bgcolor: colors.accent, color: colors.accentInk, fontWeight: 800, height: 22 }} />}
        {cancelled && <Chip size="small" label="Cancelled" color="error" sx={{ height: 22 }} />}
      </Stack>

      {event.cups.length ? (
        <Stack direction="row" columnGap={2} rowGap={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
          {event.cups.map((c, i) => (
            <Stack key={i} direction="row" spacing={0.75} alignItems="center">
              <CupIcon cup={c} size={20} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{c}</Typography>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: colors.muted, mb: 0.75 }}>
          <Box component="span" sx={{ px: 0.75, py: 0.1, border: `1px dashed ${colors.line}`, borderRadius: 1, mr: 0.75 }}>{cupLabel(event.cups)}</Box>
          Cups picked before the night
        </Typography>
      )}

      {event.notes && <Typography variant="body2" sx={{ mb: 0.75, whiteSpace: "pre-line" }}>{event.notes}</Typography>}

      {!cancelled && (n
        ? <PeopleLine label={`${n} in`} people={event.going.map((g, i) => ({ key: g.userId || `${g.name}-${i}`, name: g.name, color: g.color }))} />
        : <Typography variant="body2" sx={{ color: colors.muted }}>{open ? "Nobody's in yet. Be the first." : "Nobody signed up."}</Typography>)}
    </ScheduleRow>
  );
}
