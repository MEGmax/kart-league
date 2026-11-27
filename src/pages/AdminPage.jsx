// Admin: point requests, submitted cup nights, players and invites, league settings, member roles.
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { compute, currentSeason } from "../lib/standings";
import { RATING_DEFAULTS } from "../lib/rating";
import { fmtDate, fmtDay, nextColor, ord } from "../lib/constants";
import { groupBatches, useAdminData } from "../lib/accountData";
import { uid } from "../lib/night";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { legacyPhotoIds, moveLegacyPhoto } from "../lib/cupPhotos";
import { colors } from "../theme";
import CupIcon from "../components/CupIcon";
import CharacterChip from "../components/CharacterChip";
import { Loading, PageTitle, SectionTitle, PlayerDot, plural } from "../components/PageBits";

function fmtWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function useAction() {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(call, msg) {
    setBusy(true); setError("");
    try {
      await q(call);
      if (msg) flash(msg);
      reload();
      return true;
    } catch (e) {
      setError(dbErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function RejectBox({ label, onReject, onCancel, busy }) {
  const [note, setNote] = useState("");
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
      <TextField size="small" label="Reason (they'll see it)" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 200 }} sx={{ flex: 1 }} />
      <Button size="small" color="error" variant="contained" disabled={busy} onClick={() => onReject(note.trim())}>{label}</Button>
      <Button size="small" onClick={onCancel}>Cancel</Button>
    </Stack>
  );
}

function ClaimCard({ c, state, m, users, claims }) {
  const { busy, error, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const cup = state.cups.find((x) => x.id === c.cupId);
  const info = cup && m.cupInfo.get(cup.id);
  const r = info && info.res.find((x) => x.rid === c.rid && !x.p);
  const who = users.find((u) => u.id === c.userId);
  const pl = state.players.find((p) => p.userId === c.userId);
  const others = claims.filter((x) => x.id !== c.id && x.cupId === c.cupId && x.rid === c.rid).length;
  return (
    <Box sx={{ py: 1.5, borderBottom: `1px solid ${colors.line}`, display: "grid", gap: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography sx={{ fontWeight: 800 }}>{who ? who.displayName || who.email : "A member"}</Typography>
        <Typography variant="body2" sx={{ color: colors.muted }}>asks for</Typography>
        {cup && <CupIcon cup={cup.cup} size={24} />}
        <Typography sx={{ fontWeight: 700 }}>{cup ? cup.cup : "a deleted cup"}</Typography>
        {cup && <Typography variant="body2" sx={{ color: colors.muted }}>week {cup.week} · {fmtDate(cup.date)}</Typography>}
      </Stack>
      {r ? (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="body2"><b>{r.pts}/{info.max}</b> pts · {r.rank}{ord(r.rank)} of {info.res.length} · photo says</Typography>
          {r.character ? <CharacterChip name={r.character} /> : <Typography variant="body2">unknown</Typography>}
          {c.character && c.character !== r.character && <><Typography variant="body2">they say</Typography><CharacterChip name={c.character} /></>}
          {c.note && <Typography variant="body2" sx={{ color: colors.muted }}>“{c.note}”</Typography>}
        </Stack>
      ) : <Alert severity="warning">These points are no longer unclaimed. Decline the request.</Alert>}
      <Typography variant="body2" sx={{ color: colors.muted }}>
        {pl ? <>Points go to their player <b>{pl.name}</b>.</> : "They don't have a player yet; approving creates one."}
        {others ? ` ${plural(others, "other request")} for the same result will be declined.` : ""}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {rejecting ? (
        <RejectBox label="Decline" busy={busy} onCancel={() => setRejecting(false)}
          onReject={(note) => run(sb.rpc("reject_claim", { p_claim: c.id, p_note: note }), "Request declined")} />
      ) : (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={busy || !r} onClick={() => run(sb.rpc("approve_claim", { p_claim: c.id }), "Approved. Points added.")}>Approve</Button>
          <Button size="small" onClick={() => setRejecting(true)}>Decline</Button>
        </Stack>
      )}
    </Box>
  );
}

function BatchCard({ subs, state }) {
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const first = subs[0];
  const playerName = (id) => (state.players.find((p) => p.id === id) || {}).name || "Unknown player";

  async function rejectAll(note) {
    for (const s of subs) {
      const ok = await run(sb.rpc("reject_submission", { p_id: s.id, p_note: note }), null);
      if (!ok) return;
    }
    setRejecting(false);
  }

  return (
    <Box sx={{ py: 1.5, borderBottom: `1px solid ${colors.line}`, display: "grid", gap: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap">
        <Typography sx={{ fontWeight: 800 }}>{plural(subs.length, "cup")} from {first.submitterName || "a member"}</Typography>
        <Typography variant="body2" sx={{ color: colors.muted }}>
          week {first.week} · raced {fmtDate(first.date)} · sent {fmtWhen(first.submittedAt)}
          {subs.some((s) => s.hasPhoto) ? ` · ${subs.filter((s) => s.hasPhoto).length} photo${subs.filter((s) => s.hasPhoto).length === 1 ? "" : "s"}` : ""}
        </Typography>
      </Stack>
      {subs.map((s) => (
        <Stack key={s.id} direction="row" spacing={1} alignItems="flex-start">
          <CupIcon cup={s.cup} size={26} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.cup}</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>
              {(s.rows || []).filter((r) => r.assign !== "ignore").map((r) => {
                const who = r.assign === "new" ? `${r.newName || r.raw} (new)` : r.assign === "unclaimed" ? `Unclaimed${r.character ? " " + r.character : ""}` : playerName(r.assign);
                return `${who} ${r.pts}`;
              }).join(" · ")}
            </Typography>
          </Box>
        </Stack>
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      {rejecting ? (
        <RejectBox label={`Reject ${subs.length === 1 ? "it" : "all " + subs.length}`} busy={busy} onCancel={() => setRejecting(false)} onReject={rejectAll} />
      ) : (
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" onClick={() => navigate(`/add?review=${encodeURIComponent(first.batch)}`)}>Review and approve</Button>
          <Button size="small" onClick={() => setRejecting(true)}>Reject</Button>
        </Stack>
      )}
    </Box>
  );
}

function PlayersEditor({ state, m, admin }) {
  const { busy, error, setError, run } = useAction();
  const [draft, setDraft] = useState(null);
  const rows = draft || state.players.map((p) => {
    const inv = admin.invites.find((i) => i.playerId === p.id);
    return { id: p.id, name: p.name, color: p.color, email: inv ? inv.email : "", userId: p.userId || "", registeredAt: p.registeredAt, remove: false };
  });
  function patch(i, p) { setDraft(rows.map((r, k) => (k === i ? { ...r, ...p } : r))); }

  async function save() {
    const emails = {}, accts = {};
    for (const p of rows) {
      if (p.remove) continue;
      const nm = p.name.trim(), em = p.email.trim().toLowerCase();
      if (!nm || nm.length > 40) { setError("Every player needs a name of up to 40 characters."); return; }
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError(`“${em}” doesn't look like an email address.`); return; }
      if (em && emails[em]) { setError(`The email ${em} is on two players.`); return; }
      if (p.userId && accts[p.userId]) { setError("The same account is linked to two players."); return; }
      if (em) emails[em] = 1;
      if (p.userId) accts[p.userId] = 1;
    }
    const ok = await run(sb.rpc("save_players", {
      p_players: rows.map((p) => ({ id: p.id, name: p.name.trim(), color: p.color, email: p.email.trim().toLowerCase(), user_id: p.userId || "", remove: !!p.remove })),
    }), "Players saved");
    if (ok) setDraft(null);
  }

  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}`, display: "grid", gap: 2 }}>
      <Typography variant="body2" sx={{ color: colors.muted, maxWidth: "75ch" }}>
        Add people before they sign up. Put their email on the player: when they create an account with that email and confirm it, it links automatically and their registration date shows as a badge. You can also link an existing account by hand.
      </Typography>
      {rows.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Invite email</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Cups</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p, i) => {
                const cups = (m.byId.get(p.id) || { cp: 0 }).cp;
                const racing = state.cups.some((c) => c.results.some((r) => r.p === p.id));
                return (
                  <TableRow key={p.id} sx={{ opacity: p.remove ? 0.45 : 1 }}>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PlayerDot player={p} size={22} />
                        <TextField size="small" value={p.name} inputProps={{ maxLength: 40, "aria-label": "Player name" }} onChange={(e) => patch(i, { name: e.target.value })} />
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 200 }}>
                      <TextField size="small" type="email" fullWidth placeholder="their@email.com" value={p.email} inputProps={{ "aria-label": "Invite email" }} onChange={(e) => patch(i, { email: e.target.value })} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 200 }}>
                      <TextField select size="small" fullWidth value={p.userId} onChange={(e) => patch(i, { userId: e.target.value })} inputProps={{ "aria-label": "Linked account" }}>
                        <MenuItem value="">— Not linked —</MenuItem>
                        {admin.users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName} · {u.email}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      {p.userId ? <Chip size="small" color="success" variant="outlined" label={p.registeredAt ? `Joined ${fmtDay(p.registeredAt)}` : "Linked"} />
                        : p.email ? <Chip size="small" variant="outlined" label="Invited" />
                        : <Chip size="small" variant="outlined" label="No account" sx={{ color: colors.muted }} />}
                    </TableCell>
                    <TableCell align="right">{cups}</TableCell>
                    <TableCell>
                      {!racing && <Button size="small" onClick={() => patch(i, { remove: !p.remove })}>{p.remove ? "Undo" : "Remove"}</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={() => setDraft(rows.concat({ id: "p" + uid(), name: "", color: nextColor(rows), email: "", userId: "", registeredAt: null, remove: false }))}>+ Add player</Button>
        <Button size="small" variant="contained" disabled={busy || !draft} onClick={save}>{busy ? "Saving…" : "Save players"}</Button>
        {draft && <Button size="small" onClick={() => { setDraft(null); setError(""); }}>Discard changes</Button>}
      </Stack>
    </Box>
  );
}

const TIMEZONES = (() => {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return ["America/Toronto"]; }
})();

// The settings form starts from the saved settings with every key filled in, so a save never drops one.
function settingsDraft(league) {
  return {
    ...RATING_DEFAULTS, playoffCupsPerRound: 2, rankBy: "pct", ...league,
    currentSeason: currentSeason(league), timezone: league.timezone || "America/Toronto", reminderHour: league.reminderHour ?? 9,
  };
}

// Checks and tidies the settings before save_settings (which replaces the whole object). "" when they're fine.
function checkSettings(cur) {
  const n = {
    ...cur, name: String(cur.name || "").trim(), season: String(cur.season || "").trim(), seasonWeeks: Number(cur.seasonWeeks),
    cupsPerWeek: Number(cur.cupsPerWeek), playoffSpots: Number(cur.playoffSpots), minParticipation: Number(cur.minParticipation),
    defaultMax: Number(cur.defaultMax), reminderHour: Number(cur.reminderHour), timezone: cur.timezone,
    currentSeason: Number(cur.currentSeason), rankBy: cur.rankBy === "rating" ? "rating" : "pct",
    ratingStart: Number(cur.ratingStart), ratingK: Number(cur.ratingK), ratingKProvisional: Number(cur.ratingKProvisional),
    provisionalCups: Number(cur.provisionalCups), marginCap: Number(cur.marginCap), carryOver: Number(cur.carryOver),
    playoffCupsPerRound: Number(cur.playoffCupsPerRound), playInRacers: Number(cur.playInRacers),
  };
  const whole = (v, lo, hi) => v >= lo && v <= hi && Math.round(v) === v;
  let err = "";
  if (!n.name) err = "Give the league a name.";
  else if (!n.season) err = "Give the season a name.";
  else if (!whole(n.seasonWeeks, 1, 52)) err = "Weeks must be a whole number from 1 to 52.";
  else if (!whole(n.cupsPerWeek, 1, 20)) err = "Cups per week must be a whole number from 1 to 20.";
  else if (!whole(n.playoffSpots, 2, 32)) err = "Playoff spots must be a whole number from 2 to 32.";
  else if (!(n.minParticipation >= 0 && n.minParticipation <= 100)) err = "Qualifying % must be between 0 and 100.";
  else if (!whole(n.defaultMax, 1, 1000)) err = "Default max points must be a whole number above 0.";
  else if (!whole(n.reminderHour, 0, 23)) err = "Reminder hour must be from 0 to 23.";
  else if (!whole(n.currentSeason, 1, 99)) err = "The current season must be a whole number from 1 to 99.";
  else if (!whole(n.ratingStart, 0, 5000)) err = "Starting rating must be a whole number from 0 to 5000.";
  else if (!(n.ratingK > 0 && n.ratingK <= 200) || !(n.ratingKProvisional > 0 && n.ratingKProvisional <= 200)) err = "K values must be above 0 and at most 200.";
  else if (!whole(n.provisionalCups, 0, 50)) err = "Provisional cups must be a whole number from 0 to 50.";
  else if (!(n.marginCap >= 1 && n.marginCap <= 1000)) err = "The margin cap must be at least 1 point.";
  else if (!(n.carryOver >= 0 && n.carryOver <= 1)) err = "Carry-over must be between 0 and 1 (0.5 = halfway).";
  else if (!whole(n.playoffCupsPerRound, 1, 10)) err = "Playoff cups per round must be a whole number from 1 to 10.";
  else if (!whole(n.playInRacers, 0, 12) || n.playInRacers === 1) err = "Wild card play-in racers must be 0 (no play-in) or a whole number from 2 to 12.";
  return { n, err };
}

function StartSeason({ league }) {
  const { busy, error, setError, run } = useAction();
  const [open, setOpen] = useState(false);
  const now = currentSeason(league);
  const [rankBy, setRankBy] = useState("rating");
  async function start() {
    const { n, err } = checkSettings({
      ...settingsDraft(league),
      currentSeason: now + 1, season: `Season ${now + 1}`, rankBy,
      // The season that's ending keeps the ranking rule it was played under.
      seasonRankBy: { ...(league.seasonRankBy || {}), [now]: league.rankBy === "rating" ? "rating" : "pct" },
    });
    if (err) { setError(err); return; }
    if (await run(sb.rpc("save_settings", { p_settings: n }), `Season ${now + 1} has started`)) setOpen(false);
  }
  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)}>Start Season {now + 1}…</Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Start Season {now + 1}?</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <Typography variant="body2">
            New cups go into Season {now + 1} and the standings start empty. Season {now}'s cups, standings and records stay on Schedule and Stats under its season.
            {" "}Ratings carry over: everyone starts {Math.round((1 - (Number(league.carryOver ?? RATING_DEFAULTS.carryOver))) * 100)}% of the way back to {league.ratingStart || RATING_DEFAULTS.ratingStart}.
          </Typography>
          <TextField select size="small" label={`Rank Season ${now + 1} by`} value={rankBy} onChange={(e) => setRankBy(e.target.value)}>
            <MenuItem value="rating">Skill rating</MenuItem>
            <MenuItem value="pct">Points percentage</MenuItem>
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setError(""); }} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={start} disabled={busy}>{busy ? "Starting…" : `Start Season ${now + 1}`}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SettingsEditor({ league }) {
  const { busy, error, setError, run } = useAction();
  const [s, setS] = useState(null);
  const cur = s || settingsDraft(league);
  function set(k) { return (e) => setS({ ...cur, [k]: e.target.value }); }

  async function save() {
    // save_settings replaces the whole object, so every key (including timezone and reminderHour) goes back.
    const { n, err } = checkSettings(cur);
    if (err) { setError(err); return; }
    const ok = await run(sb.rpc("save_settings", { p_settings: n }), "Settings saved");
    if (ok) setS(null);
  }

  const num = (label, k, step = 1) => <TextField size="small" type="number" label={label} value={cur[k]} onChange={set(k)} inputProps={{ min: 0, step }} />;
  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}`, display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, minmax(0,1fr))" } }}>
        <TextField size="small" label="League name" value={cur.name} onChange={set("name")} inputProps={{ maxLength: 60 }} />
        <TextField size="small" label="Season" value={cur.season} onChange={set("season")} inputProps={{ maxLength: 40 }} />
        {num("Weeks in regular season", "seasonWeeks")}
        {num("Cups per week", "cupsPerWeek")}
        {num("Playoff spots", "playoffSpots")}
        {num("Qualifying % of cups", "minParticipation")}
        {num("Default max points per cup", "defaultMax")}
        <TextField select size="small" label="League time zone (emails)" value={cur.timezone} onChange={set("timezone")}>
          {TIMEZONES.map((z) => <MenuItem key={z} value={z}>{z}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Day-of reminder at" value={cur.reminderHour} onChange={set("reminderHour")}>
          {Array.from({ length: 24 }, (_, h) => <MenuItem key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" })}</MenuItem>)}
        </TextField>
        {num("Playoff cups per round", "playoffCupsPerRound")}
        <TextField size="small" type="number" label="Wild card play-in racers" value={cur.playInRacers} onChange={set("playInRacers")} inputProps={{ min: 0, step: 1 }}
          helperText={Number(cur.playInRacers) >= 2 ? `Top ${Number(cur.playoffSpots) - 1} are in; ${cur.playoffSpots}–${Number(cur.playoffSpots) + Number(cur.playInRacers) - 1} race for the last spot` : "0 = no play-in"} />
      </Box>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.125rem", color: colors.muted }}>Ranking and rating (season {cur.currentSeason})</Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, minmax(0,1fr))" } }}>
        <TextField select size="small" label="Rank this season by" value={cur.rankBy} onChange={set("rankBy")}>
          <MenuItem value="pct">Points percentage</MenuItem>
          <MenuItem value="rating">Skill rating</MenuItem>
        </TextField>
        {num("Starting rating", "ratingStart")}
        {num("Provisional cups (and minimum to rank)", "provisionalCups")}
        {num("K (cup weight)", "ratingK")}
        {num("Provisional K", "ratingKProvisional")}
        {num("Margin cap (points)", "marginCap")}
        {num("Season carry-over (0–1)", "carryOver", 0.05)}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={busy || !s} onClick={save}>{busy ? "Saving…" : "Save settings"}</Button>
        {s && <Button onClick={() => { setS(null); setError(""); }}>Discard changes</Button>}
        <Box sx={{ flex: 1 }} />
        {!s && <StartSeason league={league} />}
      </Stack>
    </Box>
  );
}

function RoleSelect({ u }) {
  const { busy, error, run } = useAction();
  if (u.role === "owner") return <Chip size="small" label="Owner" color="primary" />;
  return (
    <Box>
      <TextField select size="small" value={u.role} disabled={busy} onChange={(e) => run(sb.rpc("set_role", { p_user: u.id, p_role: e.target.value }), "Role updated")}
        inputProps={{ "aria-label": `Role for ${u.displayName}` }}>
        <MenuItem value="member">Member</MenuItem>
        <MenuItem value="admin">Admin</MenuItem>
      </TextField>
      {error && <Typography variant="caption" sx={{ color: colors.bad, display: "block" }}>{error}</Typography>}
    </Box>
  );
}

// Photos uploaded before they moved to Storage sit in the photos table with their EXIF (some with GPS).
// Moving re-encodes each one in this browser (dropping the EXIF), uploads it, and deletes the old copy.
function PhotoMover({ cups }) {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [ids, setIds] = useState(null);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { legacyPhotoIds().then(setIds).catch(() => setIds([])); }, []);
  if (!ids || !ids.length) return null;

  async function move() {
    setBusy(true); setError(""); setDone(0);
    const left = [];
    for (const id of ids) {
      try { await moveLegacyPhoto(id); setDone((n) => n + 1); } catch (e) { left.push(id); setError(e && e.message ? e.message : dbErr(e)); }
    }
    setIds(left);
    setBusy(false);
    reload();
    if (!left.length) flash("Every results photo is in Storage now, without location data.");
  }

  const name = (id) => (cups.find((c) => c.id === id) || {}).cup || id;
  return (
    <>
      <SectionTitle title="Results photos" count={`${ids.length} to move`} />
      <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}`, display: "grid", gap: 1.5 }}>
        <Typography variant="body2">
          {ids.length} photo{ids.length === 1 ? " is" : "s are"} still stored the old way, with the phone's metadata, including GPS location for
          some. Moving them strips that, makes thumbnails, and puts them in Storage, where only signed-in members can see them.
          Run the latest <code>supabase/schema.sql</code> first.
        </Typography>
        <Typography variant="caption" sx={{ color: colors.muted }}>{ids.map(name).join(", ")}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button variant="contained" size="small" disabled={busy} onClick={move}>{busy ? `Moving… ${done}/${ids.length}` : `Move ${ids.length} photo${ids.length === 1 ? "" : "s"}`}</Button>
        </Stack>
      </Box>
    </>
  );
}

export default function AdminPage() {
  const { state, loadError } = useLeagueData();
  const { user, ready, isAdmin } = useAuth();
  const admin = useAdminData();
  const m = useMemo(() => (state ? compute(state, { season: "all" }) : null), [state]);

  if (!state || !ready) return <Loading error={loadError} />;
  if (!user || !isAdmin) {
    return (
      <Container maxWidth="md">
        <PageTitle title="Admin" />
        <Alert severity="info" action={!user ? <Button component={RouterLink} to="/account" color="inherit" size="small">Sign in</Button> : null}>
          This page is for league admins.
        </Alert>
      </Container>
    );
  }
  if (!admin.loaded) return <Loading />;

  const batches = groupBatches(admin.pending);
  const users = admin.users.slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

  return (
    <Container maxWidth="lg" sx={{ pt: 1, pb: 4 }}>
      <PageTitle title="Admin" sub={state.league.name}
        action={<Stack direction="row" spacing={1}><Button component={RouterLink} to="/add" variant="contained" size="small">Record a cup night</Button><Button component={RouterLink} to="/build" variant="outlined" size="small">Build a cup</Button></Stack>} />
      {admin.error && <Alert severity="error" sx={{ mb: 2 }}>{admin.error}</Alert>}

      <SectionTitle title="Point requests" count={`${admin.claims.length} waiting`} sx={{ mt: 1 }} />
      {admin.claims.length ? (
        <Stack spacing={1.5}>{admin.claims.map((c) => <ClaimCard key={c.id} c={c} state={state} m={m} users={admin.users} claims={admin.claims} />)}</Stack>
      ) : <Typography variant="body2" sx={{ color: colors.muted }}>Nothing waiting. Requests for unclaimed points appear here.</Typography>}

      <SectionTitle title="Submitted cup nights" count={`${batches.length} waiting`} />
      {batches.length ? (
        <Stack spacing={1.5}>{batches.map((b) => <BatchCard key={b[0].batch} subs={b} state={state} />)}</Stack>
      ) : <Typography variant="body2" sx={{ color: colors.muted }}>Nothing waiting. Results that members submit appear here.</Typography>}

      <PhotoMover cups={state.cups} />

      <SectionTitle title="Players and accounts" count={plural(state.players.length, "player")} />
      <PlayersEditor key={admin.invites.map((i) => i.playerId + i.email).join() + state.players.length} state={state} m={m} admin={admin} />

      <SectionTitle title="League settings" />
      <SettingsEditor key={JSON.stringify(state.league)} league={state.league} />

      <SectionTitle title="Members and roles" count={plural(users.length, "account")} />
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Player</TableCell>
              <TableCell>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => {
              const pl = state.players.find((p) => p.userId === u.id);
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: u.color || colors.muted }} />
                      <span>{u.displayName || "—"}{u.id === user.id ? <Typography component="span" variant="caption" sx={{ color: colors.muted }}> (you)</Typography> : null}</span>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: colors.muted }}>{u.email}</TableCell>
                  <TableCell>{pl ? pl.name : <span style={{ color: colors.muted }}>—</span>}</TableCell>
                  <TableCell><RoleSelect u={u} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
