import { useMemo, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { BUILTIN_CUPS } from "../lib/constants";
import { toLocalInput, fromLocalInput } from "../lib/events";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { colors } from "../theme";

// Next Friday at 8pm local, as a starting point for a new cup night.
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

// Admins: schedule a cup night (event null) or edit one. Cups are optional; with none it shows "Cup TBD".
export default function EventDialog({ open, event, onClose }) {
  const { state, reload } = useLeagueData();
  const flash = useFlash();
  const [when, setWhen] = useState(event ? toLocalInput(event.startsAt) : defaultStart());
  const [cups, setCups] = useState(event ? event.cups : []);
  const [notes, setNotes] = useState(event ? event.notes : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => {
    const names = BUILTIN_CUPS.map((c) => c.name).concat(((state && state.templates) || []).map((t) => t.name));
    return [...new Set(names)];
  }, [state]);

  const startsAt = fromLocalInput(when);
  const changesTimeOrCups = event && (startsAt !== new Date(event.startsAt).toISOString() || cups.join("|") !== event.cups.join("|"));

  async function save() {
    if (!startsAt) { setError("Pick a date and time."); return; }
    setBusy(true); setError("");
    try {
      if (event) {
        await q(sb.rpc("update_event", { p_id: event.id, p_starts_at: startsAt, p_cups: cups, p_notes: notes }));
        flash("Cup night updated");
      } else {
        await q(sb.rpc("create_event", { p_starts_at: startsAt, p_cups: cups, p_notes: notes }));
        flash("Cup night scheduled");
      }
      reload();
      onClose();
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>{event ? "Edit cup night" : "Schedule a cup night"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Date and time"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            helperText="In your time zone. Everyone sees it in theirs."
            InputLabelProps={{ shrink: true }}
          />
          <Autocomplete
            multiple
            freeSolo
            options={options}
            value={cups}
            onChange={(_, v) => setCups(v.map((x) => String(x).trim()).filter(Boolean).slice(0, 8))}
            renderTags={(value, getTagProps) => value.map((option, index) => {
              const { key, ...rest } = getTagProps({ index });
              return <Chip key={key} label={option} size="small" {...rest} />;
            })}
            renderInput={(params) => (
              <TextField {...params} label="Cups (optional)" placeholder={cups.length ? "" : "Cup TBD"} helperText="Pick or type up to 8, in race order. Leave empty to decide later." />
            )}
          />
          <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 500 }} />
          <Typography variant="body2" sx={{ color: colors.muted }}>
            {!event
              ? "Everyone who turned on cup night emails gets an invite with a calendar file."
              : changesTimeOrCups
                ? "Changing the time or cups emails an update to everyone who turned on cup night emails."
                : "Note changes don't send an email."}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button variant="contained" onClick={save} disabled={busy}>{busy ? "Saving…" : event ? "Save" : "Schedule"}</Button>
      </DialogActions>
    </Dialog>
  );
}
