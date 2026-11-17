// Record a cup night: the specific cups that were raced, each racer's character for the whole night,
// and everyone's points (or race-by-race finishes) in every cup. Admins save straight to the standings;
// members submit for review. Also used to review a member's submission (?review=<batch>) and to edit
// one finished cup (?edit=<cupId>). ?event=<id> starts from a scheduled cup night.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { mapSub } from "../lib/accountData";
import { isOver, formatEventWhen, cupLabel } from "../lib/events";
import {
  buildSave, buildSubmissions, cellOf, cellPoints, draftForStorage, newNight, nightFromCup, nightFromEvent,
  nightFromSubmissions, positionClashes, uid, validateNight,
} from "../lib/night";
import { colors } from "../theme";
import { Loading, PageTitle } from "../components/PageBits";
import LineupEditor from "../components/night/LineupEditor";
import CupsPicker from "../components/night/CupsPicker";
import CupResults from "../components/night/CupResults";

const DRAFT_KEY = "kl.nightDraft";

function loadDraft(mode) {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return d && d.mode === mode && Array.isArray(d.cups) && Array.isArray(d.racers) ? d : null;
  } catch {
    return null;
  }
}
function saveDraft(night) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draftForStorage(night))); } catch { /* storage blocked */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
}
function isPristine(night) {
  return !night.cups.length && night.racers.every((r) => !r.assign && !r.character);
}

const TITLES = { add: "Record a cup night", submit: "Submit a cup night", review: "Review a submitted night", edit: "Edit cup results" };

export default function AddPage() {
  const { state, events, loadError } = useLeagueData();
  const { user, ready, isAdmin, profile } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const flash = useFlash();
  const { reload } = useLeagueData();

  const editId = params.get("edit");
  const reviewId = params.get("review");
  const eventId = params.get("event");
  const mode = editId ? "edit" : reviewId ? "review" : isAdmin ? "add" : "submit";
  const initKey = `${mode}|${editId || reviewId || eventId || ""}|${user ? user.id : ""}`;

  const [night, setNight] = useState(null);
  const [notice, setNotice] = useState("");
  const [initError, setInitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inited = useRef("");

  // Build the starting night once the data (and, for admins, the profile) is in.
  useEffect(() => {
    if (!state || !ready || !user || (user && !profile)) return;
    if (inited.current === initKey) return;
    if ((mode === "edit" || mode === "review") && !isAdmin) return;
    inited.current = initKey;
    setNotice(""); setInitError(""); setError("");

    if (mode === "edit") {
      const cup = state.cups.find((c) => c.id === editId);
      if (!cup) { setInitError("That cup doesn't exist anymore."); return; }
      if (cup.status === "racing") { setInitError(`${cup.cup} is still being raced. Fix its entries on Race night instead.`); return; }
      setNight(nightFromCup(cup, state));
      return;
    }
    if (mode === "review") {
      setNight(null);
      (async () => {
        try {
          const rows = await q(sb.from("submissions").select("*").or(`batch.eq.${reviewId},id.eq.${reviewId}`).eq("status", "pending"));
          const subs = rows.map(mapSub).sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));
          if (!subs.length) { setInitError("Nothing to review: that submission was already approved, rejected or withdrawn."); return; }
          const n = nightFromSubmissions(subs, state);
          const withPhoto = subs.filter((s) => s.hasPhoto).map((s) => s.id);
          if (withPhoto.length) {
            const photos = await q(sb.from("submission_photos").select("id,data").in("id", withPhoto)).catch(() => []);
            n.cups = n.cups.map((c) => {
              const ph = photos.find((p) => p.id === c.submission);
              return ph ? { ...c, photo: ph.data, photoChanged: true } : c;
            });
          }
          setNotice(`Sent by ${subs[0].submitterName || "a member"}. Check the numbers against the photos, fix anything, then approve.`);
          setNight(n);
        } catch (e) {
          setInitError(dbErr(e));
        }
      })();
      return;
    }
    if (eventId) {
      const ev = (events || []).find((e) => e.id === eventId);
      if (ev) {
        setNight(nightFromEvent(ev, state, mode));
        setNotice(`Started from the cup night on ${formatEventWhen(ev.startsAt).date}: its cups${ev.going.length ? " and everyone who was in" : ""}. Add each racer's character, then the points.`);
        return;
      }
    }
    const draft = loadDraft(mode);
    if (draft && !isPristine(draft)) {
      setNight(draft);
      setNotice("Picked up your unsaved draft from this browser. Photos aren't kept in drafts, so add them again.");
      return;
    }
    setNight(newNight(state, mode));
  }, [state, events, ready, user, profile, isAdmin, mode, initKey, editId, reviewId, eventId]);

  // Keep an in-progress night in this browser, so a stray tap doesn't lose it.
  useEffect(() => {
    if (!night || (night.mode !== "add" && night.mode !== "submit")) return;
    const t = setTimeout(() => { if (isPristine(night)) clearDraft(); else saveDraft(night); }, 400);
    return () => clearTimeout(t);
  }, [night]);

  const players = state ? state.players : [];
  const templates = state ? state.templates : [];
  const clashes = useMemo(() => (night ? positionClashes(night, players) : []), [night, players]);
  const pastNights = useMemo(
    () => (events || []).filter((e) => e.status !== "cancelled" && (isOver(e) || new Date(e.startsAt) <= new Date())).slice().reverse().slice(0, 12),
    [events],
  );

  if (!ready || (user && !state)) return <Loading error={loadError} />;
  if (!user) {
    return (
      <Container maxWidth="md">
        <PageTitle title="Record a cup night" />
        <Paper sx={{ p: 3, display: "grid", gap: 1.5, justifyItems: "start" }}>
          <Typography sx={{ fontWeight: 700 }}>Sign in to add results.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            Members submit a night's results for an admin to check; admins save them straight to the standings.
          </Typography>
          <Button component={RouterLink} to="/account" variant="contained">Sign in</Button>
        </Paper>
      </Container>
    );
  }
  if ((mode === "edit" || mode === "review") && profile && !isAdmin) {
    return <Container maxWidth="md"><Alert severity="info">Only admins can {mode === "edit" ? "edit cups" : "review submissions"}.</Alert></Container>;
  }
  if (initError) {
    return (
      <Container maxWidth="md">
        <PageTitle title={TITLES[mode]} />
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => navigate(mode === "review" ? "/admin" : "/cups")}>Back</Button>}>{initError}</Alert>
      </Container>
    );
  }
  if (!night) return <Loading />;

  const L = state.league;
  const singleCup = mode === "edit";
  const weeks = Array.from({ length: Math.max(L.seasonWeeks, Number(night.week) || 1) }, (_, i) => i + 1);
  const totalResults = night.cups.reduce((a, c) => a + night.racers.filter((r) => cellPoints(cellOf(c, r.key), night.entry) !== null).length, 0);
  const n = night.cups.length;

  function set(p) { setNight((x) => ({ ...x, ...p })); }

  function switchEntry(entry) {
    if (!entry || entry === night.entry) return;
    setNight((x) => ({
      ...x,
      entry,
      // Going to totals keeps every result: race-by-race finishes become their total.
      cups: entry === "totals" ? x.cups.map((c) => {
        const cells = {};
        Object.keys(c.cells).forEach((k) => {
          const pts = cellPoints(c.cells[k], "races");
          cells[k] = { ...c.cells[k], pos: ["", "", "", ""], pts: pts === null ? "" : String(pts) };
        });
        return { ...c, cells };
      }) : x.cups,
    }));
  }

  function startFromEvent(id) {
    const ev = pastNights.find((e) => e.id === id);
    if (!ev) return;
    const fresh = nightFromEvent(ev, state, night.mode);
    setNight({ ...fresh, entry: night.entry });
    setNotice(`Started from the cup night on ${formatEventWhen(ev.startsAt).date}. Add each racer's character, then the points.`);
  }

  function startOver() {
    clearDraft();
    setNight(newNight(state, mode));
    setNotice(""); setError("");
  }

  async function save() {
    const err = validateNight(night, players);
    if (err) { setError(err); return; }
    setSaving(true); setError("");
    try {
      if (night.mode === "submit") {
        const subs = buildSubmissions(night, players, "b" + uid());
        for (const { sub, photo } of subs) await q(sb.rpc("submit_cup", { p_sub: sub, p_photo: photo }));
        clearDraft();
        flash(`Submitted ${subs.length} cup${subs.length === 1 ? "" : "s"}. An admin will review ${subs.length === 1 ? "it" : "them"}.`);
        reload();
        navigate("/account");
        return;
      }
      const payload = buildSave(night, state);
      await q(sb.rpc("save_cup_night", { p_cups: payload.cups, p_players: payload.players }));
      // Photos go up one at a time after the results are safely saved.
      const failed = [];
      for (let i = 0; i < night.cups.length; i++) {
        const c = night.cups[i];
        if (!c.photo || !c.photoChanged) continue;
        try {
          await q(sb.from("photos").upsert({ cup_id: payload.cups[i].id, data: c.photo }));
        } catch {
          failed.push(c.name);
          await q(sb.from("cups").update({ has_photo: c.hasPhoto }).eq("id", payload.cups[i].id)).catch(() => {});
        }
      }
      clearDraft();
      const what = night.mode === "edit" ? "Cup updated" : night.mode === "review" ? `Approved ${n} cup${n === 1 ? "" : "s"}` : `Saved ${n} cup${n === 1 ? "" : "s"}`;
      flash(failed.length ? `${what}, but the photo for ${failed.join(", ")} didn't upload. Edit the cup to try again.` : `${what}. Standings updated.`);
      reload();
      navigate(night.mode === "review" ? "/admin" : "/cups");
    } catch (e) {
      setError(dbErr(e));
      setSaving(false);
    }
  }

  const saveLabel = saving ? "Saving…"
    : night.mode === "submit" ? `Submit ${n || ""} cup${n === 1 ? "" : "s"} for review`
    : night.mode === "review" ? `Approve ${n || ""} cup${n === 1 ? "" : "s"}`
    : night.mode === "edit" ? "Save changes"
    : `Save ${n || ""} cup${n === 1 ? "" : "s"} to the standings`;

  return (
    <Container maxWidth="lg" sx={{ pt: 1, pb: 4 }}>
      <PageTitle
        title={TITLES[night.mode]}
        sub={night.mode === "submit" ? "An admin checks your numbers against the photos before they count." : night.mode === "add" ? "Specific cups, one character per racer all night." : null}
        action={(night.mode === "add" || night.mode === "submit") && !isPristine(night) ? <Button size="small" onClick={startOver}>Start over</Button> : null}
      />
      {notice && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Stack spacing={2.5}>
        <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 2 }}>
          <Typography variant="overline" sx={{ color: colors.accent, lineHeight: 1.4 }}>The night</Typography>
          {(night.mode === "add" || night.mode === "submit") && pastNights.length > 0 && (
            <TextField select size="small" label="Start from a scheduled cup night (optional)" value="" onChange={(e) => startFromEvent(e.target.value)} sx={{ maxWidth: 460 }}>
              {pastNights.map((e) => {
                const w = formatEventWhen(e.startsAt);
                return <MenuItem key={e.id} value={e.id}>{w.date} · {cupLabel(e.cups)}{e.going.length ? ` · ${e.going.length} in` : ""}</MenuItem>;
              })}
            </TextField>
          )}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" } }}>
            <TextField size="small" type="date" label="Date raced" value={night.date} onChange={(e) => set({ date: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField select size="small" label="Season week" value={night.week} onChange={(e) => set({ week: Number(e.target.value) })}>
              {weeks.map((w) => <MenuItem key={w} value={w}>Week {w}</MenuItem>)}
            </TextField>
            {night.entry === "totals" && (
              <TextField size="small" type="number" label="Max points per cup" value={night.max} onChange={(e) => set({ max: e.target.value })}
                inputProps={{ min: 1, step: 1 }} helperText={Number(night.max) === 60 ? "4 races × 15" : " "} />
            )}
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>What are you entering?</Typography>
            <ToggleButtonGroup exclusive size="small" value={night.entry} onChange={(_, v) => switchEntry(v)}>
              <ToggleButton value="totals" sx={{ textTransform: "none", px: 2 }}>Cup totals (from the results screen)</ToggleButton>
              <ToggleButton value="races" sx={{ textTransform: "none", px: 2 }}>Race by race (finishing places)</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
              {night.entry === "totals"
                ? "Each racer's points for the whole cup. Quickest, and what a results photo shows."
                : "Each racer's place in all 4 races; points add up automatically and track stats fill in. A racer with only a total (e.g. read from a photo) still counts."}
            </Typography>
          </Box>
          <TextField size="small" label="Notes (optional)" value={night.notes} onChange={(e) => set({ notes: e.target.value })} inputProps={{ maxLength: 500 }}
            placeholder="Anything worth remembering about tonight" multiline minRows={1} />
        </Paper>

        <CupsPicker night={night} setNight={setNight} templates={templates} singleCup={singleCup} />
        <LineupEditor night={night} setNight={setNight} players={players} />

        {night.cups.length > 0 && night.racers.some((r) => r.assign) ? (
          <Stack spacing={2}>
            <Typography variant="overline" sx={{ color: colors.accent }}>3 · Results</Typography>
            {night.cups.map((c, i) => (
              <CupResults key={c.key} night={night} cup={c} index={i} setNight={setNight} players={players} clashes={clashes} />
            ))}
          </Stack>
        ) : (
          <Paper sx={{ p: 2.5, border: `1px dashed ${colors.line}` }}>
            <Typography variant="overline" sx={{ color: colors.muted }}>3 · Results</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>Add the cups and racers above, then enter everyone's points here.</Typography>
          </Paper>
        )}

        <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 1.5, position: { md: "sticky" }, bottom: { md: 12 }, zIndex: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Button variant="contained" size="large" disabled={saving || !n} onClick={save}>{saveLabel}</Button>
            <Typography variant="body2" sx={{ color: colors.muted, flex: 1 }}>
              {n} cup{n === 1 ? "" : "s"} · {night.racers.length} racer{night.racers.length === 1 ? "" : "s"} · {totalResults} result{totalResults === 1 ? "" : "s"} entered.{" "}
              {night.mode === "submit" ? "You can withdraw it from your Account page while it's pending." : "Unclaimed results show on the Unclaimed page for people to request."}
            </Typography>
            <Button onClick={() => navigate(night.mode === "review" ? "/admin" : night.mode === "submit" ? "/account" : "/cups")} disabled={saving}>Cancel</Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
