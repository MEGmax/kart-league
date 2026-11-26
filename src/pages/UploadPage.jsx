// Upload results (#/upload, admins): pick a night's end-of-cup photos at once. Gemini reads each one
// (points, characters, and the course behind the results), the photos are grouped into cups, racers are
// matched to players, and each cup's tracks come from the course it saw. One check screen, one tap to
// save: the cups go straight into the standings and every open page updates live.
import { useEffect, useMemo, useRef, useState } from "react";
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
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import CloseIcon from "@mui/icons-material/Close";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { dbErr } from "../lib/supabaseClient";
import { getApiKey, readResultsPhoto, ReadError } from "../lib/readPhoto";
import { prepImage, rotateB64, PHOTO_FORMAT_ERROR } from "../lib/photos";
import { photoTakenAt } from "../lib/photoTime";
import { takeFiles, handOffNight } from "../lib/handoff";
import { BacklogError } from "../lib/backlog";
import { alreadySaved, nightFromPhotos } from "../lib/upload";
import { allTemplates, cellOf, cellPoints, racerName, today, uid, validateNight } from "../lib/night";
import { saveNightAsAdmin } from "../lib/saveNight";
import { BUILTIN_CUPS, UNKNOWN_CUP, ord } from "../lib/constants";
import { colors } from "../theme";
import { Loading, PageTitle } from "../components/PageBits";
import CharacterFace from "../components/CharacterFace";
import TrackImage from "../components/TrackImage";
import CupIcon from "../components/CupIcon";
import LineupEditor from "../components/night/LineupEditor";
import { TrackSelect } from "../components/night/CupsPicker";

const OWN = "__own"; // a cup of tracks picked during the night
const AT_ONCE = 2; // photos read in parallel (Gemini's free tier has a low per-minute limit)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One photo, read with retries when Gemini asks us to slow down.
async function readOne(b64, players, onWait) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readResultsPhoto(b64, { players });
    } catch (e) {
      const limited = e instanceof ReadError && e.status === 429;
      if (!limited || attempt >= 2) throw e;
      const wait = Math.min(60, e.retryAfter || 20);
      onWait(wait);
      await sleep(wait * 1000);
    }
  }
}

function PhotoTile({ item, onRemove }) {
  const st = item.status;
  return (
    <Box sx={{ position: "relative", width: 104, flexShrink: 0 }}>
      <Box sx={{ width: 104, height: 78, borderRadius: 1.5, overflow: "hidden", bgcolor: colors.raised, border: `1px solid ${st === "error" ? colors.bad : colors.line}` }}>
        {item.b64 && <img src={`data:image/jpeg;base64,${item.b64}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: st === "done" ? 1 : 0.55 }} />}
      </Box>
      <Box sx={{ position: "absolute", inset: 0, height: 78, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        {(st === "preparing" || st === "reading") && <CircularProgress size={26} sx={{ color: colors.gold }} />}
        {st === "done" && <CheckCircleIcon sx={{ color: colors.good, position: "absolute", top: 4, right: 4, fontSize: 20, filter: "drop-shadow(0 1px 2px #000)" }} />}
        {st === "error" && <ErrorOutlineIcon sx={{ color: colors.bad, fontSize: 28 }} />}
      </Box>
      <IconButton size="small" aria-label="Remove this photo" onClick={onRemove}
        sx={{ position: "absolute", top: -8, left: -8, bgcolor: colors.raised, border: `1px solid ${colors.line}`, p: 0.25, "&:hover": { bgcolor: colors.raised } }}>
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <Typography variant="caption" sx={{ display: "block", mt: 0.5, lineHeight: 1.25, color: st === "error" ? colors.bad : colors.muted }}>
        {st === "preparing" ? "Opening…" : st === "reading" ? (item.wait ? `Gemini is busy, retrying in ${item.wait}s` : "Reading…")
          : st === "done" ? (item.read.screen === "standings" ? "End of cup" : "Race screen") : st === "waiting" ? "Waiting" : st === "nokey" ? "Needs a Gemini key" : item.error}
      </Typography>
    </Box>
  );
}

function CupCard({ cup, index, night, setNight, players, templates }) {
  const [turning, setTurning] = useState(false);
  // Listed in the photo's order (most points first), kept still while points are being fixed.
  const [order] = useState(() => Object.keys(cup.cells).sort((a, b) => (cellPoints(cup.cells[b], night.entry) || 0) - (cellPoints(cup.cells[a], night.entry) || 0)));
  const keys = order.filter((k) => cup.cells[k]).concat(Object.keys(cup.cells).filter((k) => !order.includes(k)));
  const racers = keys
    .map((k) => night.racers.find((r) => r.key === k))
    .filter(Boolean)
    .map((r) => ({ r, pts: cellPoints(cellOf(cup, r.key), night.entry) }));
  const custom = templates.filter((t) => !t.builtin);

  function patchCup(p) {
    setNight((n) => ({ ...n, cups: n.cups.map((c) => (c.key === cup.key ? { ...c, ...p } : c)) }));
  }
  // What the cup is: a game or saved cup (its 4 tracks), the 4 tracks picked during a VS night, or unknown.
  const tpl = templates.find((t) => t.name === cup.name && t.maps.join("|") === cup.maps.join("|"));
  const choice = cup.name === UNKNOWN_CUP && !cup.maps.length ? UNKNOWN_CUP : tpl ? tpl.name : OWN;
  function pickCup(value) {
    if (value === UNKNOWN_CUP) { patchCup({ name: UNKNOWN_CUP, maps: [] }); return; }
    if (value === OWN) {
      const keepName = cup.name && cup.name !== UNKNOWN_CUP && !templates.some((t) => t.name === cup.name);
      patchCup({ name: keepName ? cup.name : "VS Cup", maps: cup.maps.length === 4 ? cup.maps.slice() : ["", "", "", ""] });
      return;
    }
    const t = templates.find((x) => x.name === value);
    if (t) patchCup({ name: t.name, maps: t.maps.slice() });
  }
  function setTrack(k, v) {
    const maps = [0, 1, 2, 3].map((i) => cup.maps[i] || "");
    maps[k] = v;
    patchCup({ maps });
  }
  function setPts(racerKey, v) {
    setNight((n) => ({
      ...n,
      cups: n.cups.map((c) => (c.key !== cup.key ? c : { ...c, cells: { ...c.cells, [racerKey]: { ...cellOf(c, racerKey), pts: v, pos: ["", "", "", ""] } } })),
    }));
  }
  async function turn() {
    setTurning(true);
    try { patchCup({ photo: await rotateB64(cup.photo), photoChanged: true }); } catch { /* keep it as it was */ }
    setTurning(false);
  }

  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}`, display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "200px minmax(0,1fr)" }, alignItems: "start" }}>
        {cup.photo && (
          <Box sx={{ position: "relative" }}>
            <Box component="a" href={`data:image/jpeg;base64,${cup.photo}`} target="_blank" rel="noopener" sx={{ display: "block" }}>
              <Box component="img" src={`data:image/jpeg;base64,${cup.photo}`} alt={`Results photo for cup ${index + 1}`}
                sx={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 1.5, border: `1px solid ${colors.line}`, bgcolor: "#000", display: "block" }} />
            </Box>
            <IconButton size="small" aria-label="Turn the photo" title="Turn the photo (it's saved as the cup's record)" onClick={turn} disabled={turning}
              sx={{ position: "absolute", right: 6, bottom: 6, bgcolor: "rgba(7,10,31,.8)", "&:hover": { bgcolor: colors.raised } }}>
              <RotateRightIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.125rem" }}>Cup {index + 1}</Typography>
          <TextField select size="small" label="Which cup" value={choice} onChange={(e) => pickCup(e.target.value)}
            SelectProps={{ renderValue: (v) => (v === OWN ? "The 4 tracks we picked" : <Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={v} size={20} /><span>{v === UNKNOWN_CUP ? "Unknown cup (no tracks)" : v}</span></Stack>) }}>
            <MenuItem value={OWN}>The 4 tracks we picked…</MenuItem>
            <MenuItem value={UNKNOWN_CUP}><Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={UNKNOWN_CUP} size={20} /><span>Unknown cup (no tracks)</span></Stack></MenuItem>
            <ListSubheader>Game cups</ListSubheader>
            {BUILTIN_CUPS.map((t) => <MenuItem key={t.name} value={t.name}><Stack direction="row" spacing={1} alignItems="center"><CupIcon cup={t.name} size={20} /><span>{t.name}</span></Stack></MenuItem>)}
            {custom.length > 0 && <ListSubheader>Saved cups</ListSubheader>}
            {custom.map((t) => <MenuItem key={t.id || t.name} value={t.name}>{t.name}</MenuItem>)}
          </TextField>
          {choice === UNKNOWN_CUP && (
            <Typography variant="body2" sx={{ color: colors.muted }}>The points count either way. Pick the tracks to get track stats too.</Typography>
          )}
          {choice === OWN && (
            <>
              <TextField size="small" label="Cup name" value={cup.name} inputProps={{ maxLength: 40 }} onChange={(e) => patchCup({ name: e.target.value })} />
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" } }}>
                {[0, 1, 2, 3].map((k) => (
                  <Box key={k} sx={{ display: "grid", gap: 0.75, minWidth: 0 }}>
                    <TrackImage track={cup.maps[k] || ""} radius={1} />
                    <TrackSelect label={`Race ${k + 1}`} value={cup.maps[k]} onChange={(v) => setTrack(k, v)} />
                  </Box>
                ))}
              </Box>
            </>
          )}
          {tpl && (
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
              {cup.maps.map((m, k) => <TrackImage key={k} track={m} label caption={`Race ${k + 1}`} radius={1} />)}
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 1 }}>
        {racers.map(({ r, pts }, i) => (
          <Box key={r.key} sx={{ display: "grid", gridTemplateColumns: "28px 34px minmax(0,1fr) 92px", gap: 1.25, alignItems: "center" }}>
            <Typography sx={{ color: colors.muted, fontSize: "0.85rem" }}>{i + 1}{ord(i + 1)}</Typography>
            <CharacterFace name={cellOf(cup, r.key).character || r.character} size={34} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, color: r.assign === "unclaimed" ? colors.muted : colors.ink }} noWrap>{racerName(r, players)}</Typography>
              <Typography variant="caption" sx={{ color: colors.muted }} noWrap>{cellOf(cup, r.key).character || r.character || "Character not read"}</Typography>
            </Box>
            <TextField size="small" type="number" value={cellOf(cup, r.key).pts === "" ? (pts ?? "") : cellOf(cup, r.key).pts}
              onChange={(e) => setPts(r.key, e.target.value)} inputProps={{ min: 0, max: night.max, "aria-label": `${racerName(r, players)}'s points` }}
              InputProps={{ endAdornment: <Typography variant="caption" sx={{ color: colors.muted, ml: 0.5 }}>pts</Typography> }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function UploadPage() {
  const { state, loadError, reload } = useLeagueData();
  const { user, ready, isAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const flash = useFlash();
  const [items, setItems] = useState([]);
  const [built, setBuilt] = useState(null); // { cups, issues, skipped } from nightFromPhotos
  const [night, setNight] = useState(null);
  const [buildError, setBuildError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  const started = useRef(false);
  const playersRef = useRef([]);
  playersRef.current = state ? state.players : [];
  const hasKey = !!getApiKey();

  function patchItem(id, p) {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  // Open each photo, then read them a couple at a time.
  async function addFiles(files) {
    const fresh = files.map((file, i) => ({ id: uid(), file, order: Date.now() + i, status: "preparing", b64: null, takenAt: "", exact: false, read: null, error: "", wait: 0 }));
    setItems((list) => list.concat(fresh));
    setNight(null); setBuilt(null); setBuildError("");
    const ready = await Promise.all(fresh.map(async (it) => {
      try {
        const [b64, t] = await Promise.all([prepImage(it.file), photoTakenAt(it.file)]);
        patchItem(it.id, { b64, takenAt: t.takenAt, exact: t.exact, status: getApiKey() ? "waiting" : "nokey" });
        return { ...it, b64 };
      } catch {
        patchItem(it.id, { status: "error", error: PHOTO_FORMAT_ERROR });
        return null;
      }
    }));
    if (!getApiKey()) return;
    const todo = ready.filter(Boolean);
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const it = todo[next++];
        patchItem(it.id, { status: "reading" });
        try {
          const read = await readOne(it.b64, playersRef.current, (wait) => patchItem(it.id, { wait }));
          patchItem(it.id, { status: "done", read, wait: 0 });
        } catch (e) {
          patchItem(it.id, { status: "error", wait: 0, error: e instanceof ReadError ? (/No results table/.test(e.message) ? "Not a results screen" : e.message) : "Couldn't read it" });
        }
      }
    };
    queue.current = queue.current.then(() => Promise.all(Array.from({ length: AT_ONCE }, worker)));
  }

  // Photos picked on another page (Join, Add) arrive here.
  useEffect(() => {
    if (started.current || !state || !isAdmin) return;
    started.current = true;
    const f = takeFiles();
    if (f) addFiles(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isAdmin]);

  const busy = items.some((x) => x.status === "preparing" || x.status === "waiting" || x.status === "reading");
  const doneReads = useMemo(
    () => items.filter((x) => x.status === "done").sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.order - b.order),
    [items],
  );

  // Once every photo is read, build the night.
  useEffect(() => {
    if (busy || night || !state || !doneReads.length) return;
    const first = doneReads.find((x) => x.exact) || doneReads[0];
    const date = first && first.exact ? first.takenAt.slice(0, 10) : today();
    try {
      const out = nightFromPhotos(
        doneReads.map((x) => ({ ...x.read, file: x.id, takenAt: x.takenAt, b64: x.b64 })),
        state, { mode: "add", date },
      );
      setNight(out.night);
      setBuilt(out);
      setBuildError("");
    } catch (e) {
      setBuildError(e instanceof BacklogError ? e.message : "Couldn't put those photos together. Try the full form instead.");
    }
  }, [busy, night, state, doneReads]);

  if (!ready || !state) return <Loading error={loadError} />;
  if (!user || (profile && !isAdmin)) {
    return (
      <Container maxWidth="md">
        <PageTitle title="Upload results" />
        <Alert severity="info" action={<Button color="inherit" size="small" component={RouterLink} to="/add">{user ? "Submit results" : "Sign in"}</Button>}>
          Only admins can upload results photos. {user ? "You can still submit a night's results for an admin to check." : ""}
        </Alert>
      </Container>
    );
  }

  const templates = allTemplates(state);
  const dupes = night ? alreadySaved(night, state) : [];
  const n = night ? night.cups.length : 0;
  const L = state.league;
  const weeks = Array.from({ length: Math.max(L.seasonWeeks, Number(night && night.week) || 1) }, (_, i) => i + 1);
  const failedPhotos = items.filter((x) => x.status === "error").length;
  const skipped = built ? built.skipped.length : 0;

  function removeItem(id) {
    setItems((list) => list.filter((x) => x.id !== id));
    setNight(null); setBuilt(null);
  }
  function startOver() {
    setItems([]); setNight(null); setBuilt(null); setBuildError(""); setError("");
  }
  function openFull() {
    handOffNight(night);
    navigate("/add");
  }
  async function save() {
    const err = validateNight(night, state.players);
    if (err) { setError(err); return; }
    setSaving(true); setError("");
    try {
      const failed = await saveNightAsAdmin(night, state);
      flash(failed.length ? `Saved ${n} cup${n === 1 ? "" : "s"}, but the photo for ${failed.join(", ")} didn't upload. Edit the cup to try again.` : `Saved ${n} cup${n === 1 ? "" : "s"}. The standings are updated for everyone.`);
      reload();
      navigate("/standings");
    } catch (e) {
      setError(dbErr(e));
      setSaving(false);
    }
  }

  return (
    <Container maxWidth="lg" sx={{ pt: 1, pb: 4 }}>
      <PageTitle
        title="Upload results"
        sub="Pick every cup's end-of-cup standings photo at once. Gemini reads them; you pick the tracks, check and save."
        action={items.length > 0 && !saving ? <Button size="small" onClick={startOver}>Start over</Button> : null}
      />
      {!hasKey && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" component={RouterLink} to="/account">Account</Button>}>
          Add your Gemini API key on your Account page first. It's what reads the photos.
        </Alert>
      )}

      <Box sx={{ mb: 2.5 }}>
        {!items.length ? (
          <Box sx={{ display: "grid", justifyItems: "center", gap: 1.5, py: { xs: 2, sm: 3 }, textAlign: "center" }}>
            <AddPhotoAlternateOutlinedIcon sx={{ fontSize: 48, color: colors.muted }} />
            <Typography sx={{ fontWeight: 800 }}>Choose the night's photos</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, maxWidth: "56ch" }}>
              One photo of each cup's final standings (the "You got Nth place!" screen), all at once. Race screens work too.
              Gemini reads everyone's points and characters; you pick each cup's tracks on the next screen.
            </Typography>
            <Button component="label" variant="contained" size="large" disabled={!hasKey}>
              Choose photos
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) addFiles(f); }} />
            </Button>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} sx={{ overflowX: "auto", pt: 1, pl: 1, pb: 0.5 }}>
              {items.slice().sort((a, b) => (a.takenAt || "").localeCompare(b.takenAt || "") || a.order - b.order).map((it) => (
                <PhotoTile key={it.id} item={it} onRemove={() => removeItem(it.id)} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Button component="label" size="small" variant="outlined" disabled={!hasKey || busy}>
                Add more photos
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) addFiles(f); }} />
              </Button>
              <Typography variant="body2" sx={{ color: colors.muted }}>
                {busy ? `Gemini is reading ${items.filter((x) => x.status !== "done" && x.status !== "error").length} of ${items.length} photos…`
                  : `${doneReads.length} of ${items.length} read${failedPhotos ? ` · ${failedPhotos} couldn't be` : ""}.`}
              </Typography>
            </Stack>
          </Stack>
        )}
      </Box>

      {buildError && <Alert severity="error" sx={{ mb: 2 }}>{buildError}</Alert>}

      {night && (
        <Stack spacing={2.5}>
          {dupes.length > 0 && (
            <Alert severity="warning">{dupes.length === 1 ? `Cup ${dupes[0] + 1} looks` : `Cups ${dupes.map((i) => i + 1).join(", ")} look`} already saved: a cup on this date has exactly the same points. Saving again would count {dupes.length === 1 ? "it" : "them"} twice, so remove that photo.</Alert>
          )}
          {built && built.issues.length > 0 && (
            <Alert severity="warning">
              <b>Worth a look:</b>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{built.issues.map((x, i) => <li key={i}>{x}</li>)}</Box>
            </Alert>
          )}
          {skipped > 0 && <Alert severity="info">{skipped} photo{skipped === 1 ? " wasn't a results screen and was" : "s weren't results screens and were"} left out.</Alert>}

          <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.line}`, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "200px 200px 1fr" }, alignItems: "center" }}>
            <TextField size="small" type="date" label="Date raced" value={night.date} onChange={(e) => setNight((x) => ({ ...x, date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField select size="small" label="Season week" value={night.week} onChange={(e) => setNight((x) => ({ ...x, week: Number(e.target.value) }))}>
              {weeks.map((w) => <MenuItem key={w} value={w}>Week {w}</MenuItem>)}
            </TextField>
            <Typography variant="body2" sx={{ color: colors.muted, gridColumn: { xs: "1 / -1", sm: "auto" } }}>
              {n} cup{n === 1 ? "" : "s"} · {night.racers.length} racer{night.racers.length === 1 ? "" : "s"} · out of {night.max} points per cup
            </Typography>
          </Box>

          <LineupEditor
            night={night} setNight={setNight} players={state.players} title="Who's who"
            help="Matched by the name on screen or each player's usual character. Fix anyone who's wrong; a racer nobody recognises is saved as unclaimed for them to claim later."
          />

          {night.cups.map((c, i) => (
            <CupCard key={c.key} cup={c} index={i} night={night} setNight={setNight} players={state.players} templates={templates} />
          ))}

          <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gap: 1.5, position: "sticky", bottom: { xs: 76, md: 12 }, zIndex: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <Button variant="contained" size="large" disabled={saving || !n} onClick={save}>
                {saving ? "Saving…" : `Save ${n} cup${n === 1 ? "" : "s"} to the standings`}
              </Button>
              <Button onClick={openFull} disabled={saving}>Edit in the full form</Button>
            </Stack>
          </Paper>
        </Stack>
      )}
    </Container>
  );
}
