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
import { colors } from "../theme";
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

// The date at the start of each schedule row: weekday, a big day number, month.
export function DateBlock({ date, tone = "default", struck = false }) {
  const past = tone === "past";
  return (
    <Box aria-hidden sx={{ width: { xs: 48, sm: 56 }, textAlign: "center", alignSelf: "start", opacity: struck ? 0.6 : 1 }}>
      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: colors.muted, lineHeight: 1.2 }}>
        {date.toLocaleDateString(undefined, { weekday: "short" })}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.75rem", sm: "2rem" }, lineHeight: 1.05, textDecoration: struck ? "line-through" : "none", color: past ? colors.muted : colors.ink }}>
        {date.getDate()}
      </Typography>
      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: colors.muted, lineHeight: 1.2 }}>
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
        display: "grid", columnGap: 2, rowGap: 1.25, px: highlight ? 1.5 : 0, py: 2, scrollMarginTop: 80,
        gridTemplateColumns: { xs: "auto minmax(0,1fr)", sm: "auto minmax(0,1fr) auto" },
        bgcolor: highlight ? colors.raised : "transparent",
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

// Who's in, or who raced: a label and the names.
export function PeopleLine({ people, label }) {
  return (
    <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>
      {label && <Box component="span" sx={{ fontWeight: 700, color: colors.ink, mr: 1 }}>{label}</Box>}
      {people.map((g) => g.name).join(", ")}
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
        <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", textDecoration: cancelled ? "line-through" : "none" }}>{when.time}</Typography>
        {live && <Chip size="small" variant="outlined" label="Happening now" sx={{ color: colors.good, borderColor: colors.good, height: 24 }} />}
        {isNext && !live && <Chip size="small" variant="outlined" label="Next up" sx={{ borderColor: colors.rule, height: 24 }} />}
        {cancelled && <Chip size="small" variant="outlined" label="Cancelled" color="error" sx={{ height: 24 }} />}
      </Stack>

      {event.cups.length ? (
        <Stack direction="row" columnGap={2} rowGap={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
          {event.cups.map((c, i) => (
            <Stack key={i} direction="row" spacing={0.75} alignItems="center">
              <CupIcon cup={c} size={20} />
              <Typography sx={{ fontWeight: 600 }}>{c}</Typography>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: colors.muted, mb: 0.75 }}>
          <Box component="span" sx={{ color: colors.ink, fontWeight: 600, mr: 0.75 }}>{cupLabel(event.cups)}</Box>
          · cups picked before the night
        </Typography>
      )}

      {event.notes && <Typography sx={{ mb: 0.75, whiteSpace: "pre-line" }}>{event.notes}</Typography>}

      {!cancelled && (n
        ? <PeopleLine label={`${n} in`} people={event.going.map((g, i) => ({ key: g.userId || `${g.name}-${i}`, name: g.name }))} />
        : <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{open ? "Nobody's in yet. Be the first." : "Nobody signed up."}</Typography>)}
    </ScheduleRow>
  );
}
