import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Paper from "@mui/material/Paper";
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
import { sb, q, dbErr } from "../lib/supabaseClient";
import { cupLabel, formatEventWhen, isGoing, isHappening, isOpen } from "../lib/events";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { colors, fontDisplay } from "../theme";
import CupIcon from "./CupIcon";
import EventDialog from "./EventDialog";

function JoinButton({ event }) {
  const { user, ready } = useAuth();
  const { reload } = useLeagueData();
  const flash = useFlash();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen(event)) return null;
  if (!ready) return null;
  if (!user) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
        <Button variant="contained" onClick={() => navigate("/account")}>Sign in to join</Button>
        <Typography variant="body2" sx={{ color: colors.muted }}>You need an account to say you're in.</Typography>
      </Stack>
    );
  }

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
      <Button variant={going ? "outlined" : "contained"} onClick={toggle} disabled={busy}>
        {busy ? "Saving…" : going ? "Leave" : "I'm in"}
      </Button>
      {going && <Typography component="span" variant="body2" sx={{ color: colors.good, ml: 1.5, fontWeight: 700 }}>You're in</Typography>}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
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
        <Button size="small" color="error" onClick={() => setConfirming(true)}>Cancel night</Button>
      </Stack>
      {editing && <EventDialog open event={event} onClose={() => setEditing(false)} />}
      <Dialog open={confirming} onClose={busy ? undefined : () => setConfirming(false)}>
        <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Cancel this cup night?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            It stays on the events page marked as cancelled, and everyone who got an invite gets a cancellation that removes it from their calendar. This can't be undone.
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

// One cup night. `prominent` is the homepage "Next Cup Night" version.
export default function EventCard({ event, prominent = false, highlight = false }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const when = formatEventWhen(event.startsAt);
  const cancelled = event.status === "cancelled";
  const open = isOpen(event);
  const live = isHappening(event);
  const n = event.going.length;

  return (
    <Paper
      id={`event-${event.id}`}
      sx={{
        p: prominent ? { xs: 2.5, sm: 3 } : 2.5,
        border: `1px solid ${highlight || prominent ? colors.accent : colors.line}`,
        opacity: cancelled ? 0.7 : 1,
        background: prominent ? `linear-gradient(135deg, ${colors.panel2} 0%, ${colors.panel} 70%)` : undefined,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap" }} useFlexGap>
        <Typography variant="overline" sx={{ color: prominent ? colors.accent : colors.muted, lineHeight: 1.6 }}>
          {prominent ? "Next cup night" : "Cup night"}
        </Typography>
        {cancelled && <Chip size="small" label="Cancelled" color="error" />}
        {live && <Chip size="small" label="Happening now" sx={{ bgcolor: colors.hot, color: "#fff", fontWeight: 700 }} />}
      </Stack>

      <Typography
        sx={{ fontFamily: prominent ? fontDisplay : "inherit", fontWeight: 800, fontSize: prominent ? { xs: "1.15rem", sm: "1.45rem" } : "1.15rem", lineHeight: 1.25, textDecoration: cancelled ? "line-through" : "none" }}
      >
        {when.date}
      </Typography>
      <Typography sx={{ color: colors.muted, mb: 2, textDecoration: cancelled ? "line-through" : "none" }}>{when.time}</Typography>

      {event.cups.length ? (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }} useFlexGap>
          {event.cups.map((c, i) => (
            <Chip key={i} icon={<CupIcon cup={c} size={22} />} label={c} variant="outlined" sx={{ pl: 0.5 }} />
          ))}
        </Stack>
      ) : (
        <Chip label={cupLabel(event.cups)} variant="outlined" sx={{ mb: 2, borderStyle: "dashed", color: colors.muted }} />
      )}

      {event.notes && <Typography variant="body2" sx={{ mb: 2, whiteSpace: "pre-line" }}>{event.notes}</Typography>}

      {!cancelled && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
            {n === 0 ? (open ? "Nobody's in yet. Be the first." : "Nobody signed up.") : `${n} ${n === 1 ? "person" : "people"} in`}
          </Typography>
          {n > 0 && (
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }} useFlexGap>
              {event.going.map((g) => (
                <Chip
                  key={g.userId}
                  size="small"
                  label={g.name}
                  avatar={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: g.color || colors.muted, ml: 0.75 }} />}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}>
        <JoinButton event={event} />
        <Stack direction="row" spacing={1} alignItems="center">
          {prominent && <Button size="small" onClick={() => navigate("/events")}>All cup nights</Button>}
          {isAdmin && open && <AdminActions event={event} />}
        </Stack>
      </Stack>
    </Paper>
  );
}
