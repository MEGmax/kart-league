// Cup builder: an admin picks the 4 tracks before the first race (by hand, from a template, or at
// random) and locks them in; Join then opens for results. Also manages saved track templates.
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { BUILTIN_CUPS, TRACKS } from "../lib/constants";
import { suggestWeek, today, uid } from "../lib/night";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { colors } from "../theme";
import CupIcon from "../components/CupIcon";
import { TrackSelect } from "../components/night/CupsPicker";
import { Loading, PageTitle, SectionTitle } from "../components/PageBits";

const NITRO = TRACKS.slice(0, 16);
const RETRO = TRACKS.slice(16);

function pickRandom(pool) {
  const a = pool.slice(), out = [];
  while (out.length < 4 && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  return out;
}

export default function BuildPage() {
  const { state, loadError, reload } = useLeagueData();
  const { user, ready, isAdmin } = useAuth();
  const navigate = useNavigate();
  const flash = useFlash();
  const [b, setB] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);

  if (!state || !ready) return <Loading error={loadError} />;
  if (!user || !isAdmin) {
    return (
      <Container maxWidth="md">
        <PageTitle title="Cup builder" />
        <Alert severity="info" action={!user ? <Button component={RouterLink} to="/account" color="inherit" size="small">Sign in</Button> : null}>
          Admins build each cup before the first race. {user ? "Ask an admin to open the next one." : "Sign in if you're an admin."}
        </Alert>
      </Container>
    );
  }

  const build = b || { name: `Cup ${state.cups.length + 1}`, week: suggestWeek(state), date: today(), maps: ["", "", "", ""], templateId: "" };
  const templates = state.templates || [];
  function set(p) { setB({ ...build, ...p }); setConfirm(false); setError(""); }
  function applyTemplate(id) {
    const t = BUILTIN_CUPS.concat(templates).find((x) => x.id === id);
    if (!t) { set({ templateId: "" }); return; }
    set({ templateId: t.id, name: t.name, maps: t.maps.slice() });
  }
  const weeks = Array.from({ length: Math.max(state.league.seasonWeeks, build.week) }, (_, i) => i + 1);
  const dup = build.maps.filter((m, i) => m && build.maps.indexOf(m) !== i);

  function lock() {
    if (!build.name.trim()) { setError("Give the cup a name."); return; }
    if (build.maps.some((m) => !m)) { setError("Pick all 4 tracks first."); return; }
    if (!build.date) { setError("Pick the date."); return; }
    setConfirm(true);
  }

  async function go() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc("create_cup", { p_cup: {
        id: "c" + uid(), cup: build.name.trim(), date: build.date, week: Number(build.week), max: 60, maps: build.maps,
        template_id: build.templateId && !build.templateId.startsWith("g") ? build.templateId : "",
      } }));
      flash(`${build.name.trim()} is locked in. Enter results on Join.`);
      reload();
      navigate("/join");
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  async function saveTemplate() {
    const name = tplName.trim();
    if (!name) { setError("Name the template first, e.g. Cursed Cup."); return; }
    if (build.maps.some((m) => !m)) { setError("Pick all 4 tracks before saving them as a template."); return; }
    setTplBusy(true); setError("");
    try {
      await q(sb.from("cup_templates").insert({ id: "t" + uid(), name, maps: build.maps, created_at: Date.now(), created_by: user.id }));
      setTplName("");
      flash(`Saved ${name} as a template`);
      reload();
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setTplBusy(false);
    }
  }

  async function deleteTemplate(t) {
    try {
      await q(sb.from("cup_templates").delete().eq("id", t.id));
      flash(`Deleted ${t.name}`);
      reload();
    } catch (e) {
      setError(dbErr(e));
    }
  }

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle
        title="Cup builder"
        sub="Pick the 4 tracks before the first race. Once locked in they can't change, and the cup opens on Join for results."
        action={<Button component={RouterLink} to="/join" size="small" variant="outlined">Join</Button>}
      />

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 2 }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" } }}>
          <TextField select size="small" label="Start from" value={build.templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <MenuItem value="">Scratch</MenuItem>
            <ListSubheader>Game cups</ListSubheader>
            {BUILTIN_CUPS.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            {templates.length > 0 && <ListSubheader>Your templates</ListSubheader>}
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Cup name" value={build.name} inputProps={{ maxLength: 40 }} onChange={(e) => set({ name: e.target.value })} />
          <TextField select size="small" label="Week" value={build.week} onChange={(e) => set({ week: Number(e.target.value) })}>
            {weeks.map((w) => <MenuItem key={w} value={w}>Week {w}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Date" value={build.date} onChange={(e) => set({ date: e.target.value })} InputLabelProps={{ shrink: true }} />
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="overline" sx={{ color: colors.muted, mr: 1 }}>Random</Typography>
          <Button size="small" variant="outlined" onClick={() => set({ maps: pickRandom(TRACKS), templateId: "" })}>Any 4 tracks</Button>
          <Button size="small" variant="outlined" onClick={() => set({ maps: pickRandom(NITRO), templateId: "" })}>Nitro only</Button>
          <Button size="small" variant="outlined" onClick={() => set({ maps: pickRandom(RETRO), templateId: "" })}>Retro only</Button>
        </Stack>

        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" } }}>
          {[0, 1, 2, 3].map((i) => (
            <TrackSelect key={i} label={`Race ${i + 1}`} value={build.maps[i]}
              onChange={(v) => { const maps = build.maps.slice(); maps[i] = v; set({ maps, templateId: "" }); }} />
          ))}
        </Box>

        {dup.length > 0 && <Alert severity="warning">{dup[0]} is in this cup more than once. That's allowed; just checking it's on purpose.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        {confirm ? (
          <Alert severity="warning" action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" variant="outlined" disabled={busy} onClick={go}>{busy ? "Locking in…" : "Lock it in"}</Button>
              <Button color="inherit" size="small" onClick={() => setConfirm(false)}>Keep editing</Button>
            </Stack>
          }>
            <b>Lock in {build.name}?</b> Its 4 tracks can't be changed afterwards.
          </Alert>
        ) : (
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
            <Button variant="contained" onClick={lock}>Lock in &amp; start racing</Button>
            <Typography variant="body2" sx={{ color: colors.muted }}>Pick the tracks before the first race.</Typography>
          </Stack>
        )}

        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ pt: 1, borderTop: `1px solid ${colors.line}` }}>
          <TextField size="small" label="Template name" placeholder="e.g. Cursed Cup" value={tplName} inputProps={{ maxLength: 40 }} onChange={(e) => setTplName(e.target.value)} />
          <Button size="small" disabled={tplBusy} onClick={saveTemplate}>{tplBusy ? "Saving…" : "Save these tracks as a template"}</Button>
        </Stack>
      </Paper>

      {templates.length > 0 && (
        <>
          <SectionTitle title="Your templates" count={templates.length} />
          <Stack spacing={1.5}>
            {templates.map((t) => (
              <Paper key={t.id} sx={{ p: 2, display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <CupIcon cup={t.name} size={40} />
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
                  <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                    {t.maps.map((m, k) => <Typography key={k} variant="body2" sx={{ color: colors.muted }}><b style={{ color: colors.ink }}>R{k + 1}</b> {m}</Typography>)}
                  </Stack>
                </Box>
                <Button size="small" variant="outlined" onClick={() => applyTemplate(t.id)}>Use</Button>
                <Button size="small" color="error" onClick={() => deleteTemplate(t)}>Delete</Button>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      <Typography variant="body2" sx={{ color: colors.muted, mt: 3 }}>
        Already raced without entering each race? <RouterLink to="/add" style={{ color: colors.cool }}>Record the cups and their results</RouterLink> instead.
      </Typography>
    </Container>
  );
}
