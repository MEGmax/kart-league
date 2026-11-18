import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Avatar from "@mui/material/Avatar";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { liveCups } from "../lib/standings";
import { CHARACTERS, RACE_POINTS, fmtDate, initials, ord } from "../lib/constants";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { prepImage, PHOTO_FORMAT_ERROR } from "../lib/photos";
import { getApiKey, readResultsPhoto, ReadError } from "../lib/readPhoto";
import { matchPhotoRows } from "../lib/night";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { colors, fontData } from "../theme";
import { PageTitle } from "../components/PageBits";
import CupIcon from "../components/CupIcon";
import CharacterFace from "../components/CharacterFace";
import PlaceBadge from "../components/PlaceBadge";

// One row per racer who has entered anything for this cup, best total first.
function liveRows(races, cupId) {
  const rs = races.filter((r) => r.cupId === cupId);
  const ids = [...new Set(rs.map((r) => r.playerId))];
  return ids
    .map((pid) => {
      const mine = rs.filter((r) => r.playerId === pid);
      return { pid, total: mine.reduce((a, r) => a + r.points, 0), races: mine };
    })
    .sort((a, b) => b.total - a.total);
}

function lastCharFor(races, pid) {
  if (!pid) return "";
  const rs = races.filter((r) => r.playerId === pid && r.character).sort((a, b) => b.enteredAt - a.enteredAt);
  return rs[0] ? rs[0].character : "";
}

function PlayerDot({ player, size = 24 }) {
  return (
    <Avatar sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 700, bgcolor: player ? player.color : colors.muted, color: "#fff" }}>
      {initials(player ? player.name : "?")}
    </Avatar>
  );
}

function RaceCard({ cup, n, forId, forOther, ringColor, existing, defaultChar }) {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pos = draft ? draft.pos : existing ? existing.position : "";
  const ch = draft ? draft.ch : existing ? existing.character : defaultChar;
  const who = forOther ? forId : null;

  function edit(patch) {
    setDraft({ pos, ch, ...patch });
  }

  async function run(call, msg) {
    setBusy(true); setError("");
    try {
      await q(call);
      setDraft(null);
      flash(msg);
      reload();
    } catch (e) {
      setError(dbErr(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!pos) { setError(`Pick the finishing position for race ${n} first.`); return; }
    run(sb.rpc("enter_race", { p_cup: cup.id, p_race: n, p_position: Number(pos), p_character: ch || "", p_player: who }), `Race ${n} saved`);
  }

  function clear() {
    run(sb.rpc("clear_race", { p_cup: cup.id, p_race: n, p_player: who }), `Race ${n} cleared`);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: colors.bg2, display: "grid", gap: 1.5, alignContent: "start" }}>
      <Box>
        <Typography variant="overline" sx={{ color: colors.accent, lineHeight: 1.4 }}>Race {n}</Typography>
        <Typography sx={{ fontWeight: 700 }}>{cup.maps[n - 1] || `Track ${n}`}</Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <CharacterFace name={ch} ring={ringColor} size={64} />
      </Box>
      <TextField select size="small" label="Finish" value={pos} onChange={(e) => edit({ pos: e.target.value })}>
        <MenuItem value="">—</MenuItem>
        {RACE_POINTS.map((pts, i) => (
          <MenuItem key={i + 1} value={i + 1}>{i + 1}{ord(i + 1)} · {pts} pts</MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label="Character" value={ch || ""} onChange={(e) => edit({ ch: e.target.value })}>
        <MenuItem value="">—</MenuItem>
        {CHARACTERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button size="small" variant="contained" disabled={busy} onClick={save}>{existing ? "Update" : "Save"}</Button>
        {existing && (
          <>
            <Typography variant="body2" sx={{ color: colors.good, fontFamily: fontData }}>
              {existing.position}{ord(existing.position)} · {existing.points} pts
            </Typography>
            <Button size="small" disabled={busy} onClick={clear}>Clear</Button>
          </>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Paper>
  );
}

function LiveTotals({ cup, rows, playerById }) {
  const rs = rows.flatMap((r) => r.races);
  const clash = {};
  rs.forEach((r) => { const k = `${r.race}|${r.position}`; clash[k] = (clash[k] || 0) + 1; });
  const clashes = Object.keys(clash).filter((k) => clash[k] > 1);

  return (
    <Box>
      <Typography variant="overline" sx={{ color: colors.muted }}>
        Live totals · {rows.length} racer{rows.length === 1 ? "" : "s"} entered
      </Typography>
      {!rows.length ? (
        <Typography variant="body2" sx={{ color: colors.muted }}>Nobody has entered a result yet.</Typography>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: colors.bg2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Racer</TableCell>
                  {[1, 2, 3, 4].map((n) => <TableCell key={n} align="center" title={cup.maps[n - 1] || ""}>R{n}</TableCell>)}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const p = playerById(row.pid);
                  return (
                    <TableRow key={row.pid}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PlayerDot player={p} />
                          <span>{p ? p.name : "?"}</span>
                        </Stack>
                      </TableCell>
                      {[1, 2, 3, 4].map((n) => {
                        const x = row.races.find((r) => r.race === n);
                        if (!x) return <TableCell key={n} align="center" sx={{ color: colors.muted }}>–</TableCell>;
                        const bad = clash[`${n}|${x.position}`] > 1;
                        return (
                          <TableCell key={n} align="center" title={x.character || ""} sx={bad ? { bgcolor: "rgba(255,90,100,.18)" } : undefined}>
                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                              {x.character && <CharacterFace name={x.character} size={20} />}
                              <PlaceBadge n={x.position} />
                            </Stack>
                          </TableCell>
                        );
                      })}
                      <TableCell align="right" sx={{ fontFamily: fontData, fontWeight: 700 }}>{row.total}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {clashes.length > 0 && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {clashes.map((k) => { const [race, p] = k.split("|"); return `Race ${race}: ${clash[k]} racers entered ${p}${ord(Number(p))}`; }).join(" · ")}.
              {" "}Someone needs to fix theirs.
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}

// The character a racer used most in this cup (latest race wins ties), as finish_cup records it.
function mainChar(races) {
  const n = {}, last = {};
  races.forEach((x) => { if (x.character) { n[x.character] = (n[x.character] || 0) + 1; last[x.character] = Math.max(last[x.character] || 0, x.race); } });
  return Object.keys(n).sort((a, b) => n[b] - n[a] || last[b] - last[a])[0] || "";
}

function FinishPanel({ cup, rows, playerById, players, onCancel }) {
  const navigate = useNavigate();
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [photo, setPhoto] = useState(null); // base64 JPEG
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(null); // { byPid: {pid: points}, extra: [rows] }
  const [keep, setKeep] = useState({}); // extra row idx -> save as unclaimed
  const existingUnclaimed = (cup.results || []).filter((r) => !r.p).length;

  async function readPhoto(b64) {
    setReading(true); setError("");
    try {
      const racers = rows.map((r) => ({ key: r.pid, assign: r.pid, character: mainChar(r.races) }));
      const out = await readResultsPhoto(b64, { players, lineup: racers.map((r) => r.character).filter(Boolean) });
      const { matches, extra } = matchPhotoRows(racers, out.rows, players);
      const byPid = {};
      Object.keys(matches).forEach((k) => { byPid[k] = matches[k].points; });
      setRead({ byPid, extra });
      const all = rows.every((r) => r.pid in byPid);
      const k = {};
      extra.forEach((h) => { k[h.idx] = all && !existingUnclaimed && h.points != null; });
      setKeep(k);
    } catch (e) {
      setError(e instanceof ReadError ? e.message : "Reading the photo failed. Compare it by eye instead.");
    } finally {
      setReading(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let b64;
    try {
      b64 = await prepImage(file);
    } catch {
      setError(PHOTO_FORMAT_ERROR);
      return;
    }
    setPhoto(b64); setError(""); setRead(null); setKeep({});
    if (getApiKey()) readPhoto(b64);
  }

  const checks = rows.map((r) => {
    const missing = [1, 2, 3, 4].filter((n) => !r.races.some((x) => x.race === n));
    return { ...r, missing };
  });
  const issues = checks.filter((r) => r.missing.length).length;
  const unclaimed = read ? read.extra.filter((h) => keep[h.idx] && h.points != null).map((h) => ({ pts: h.points, character: h.character || "" })) : [];

  async function finalize() {
    setSaving(true); setError("");
    try {
      await q(sb.rpc("finish_cup", { p_cup: cup.id, p_photo: photo, p_unclaimed: unclaimed }));
      flash(`${cup.cup} is final. Standings updated.`);
      reload();
      navigate("/cups");
    } catch (e) {
      setError(dbErr(e));
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: colors.bg2, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 2 }}>
      <Typography variant="overline" sx={{ color: colors.accent }}>Finish {cup.cup}</Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
        {photo && (
          <Box component="img" src={`data:image/jpeg;base64,${photo}`} alt="Results screen photo"
            sx={{ width: { xs: "100%", sm: 240 }, borderRadius: 2, border: `1px solid ${colors.line}` }} />
        )}
        <Box sx={{ display: "grid", gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Button component="label" size="small" variant={photo ? "outlined" : "contained"} disabled={reading}>
              {photo ? "Use a different photo" : "Add the end-of-cup results photo"}
              <input type="file" accept="image/*" hidden onChange={onFile} />
            </Button>
            {photo && getApiKey() && !reading && <Button size="small" onClick={() => readPhoto(photo)}>Read with Gemini{read ? " again" : ""}</Button>}
            {reading && <><CircularProgress size={18} /><Typography variant="body2">Gemini is reading the results screen…</Typography></>}
          </Stack>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            Optional. It's kept as the record for this cup.{" "}
            {getApiKey() ? "Gemini checks its totals against the entries below, matching racers by character." : "Compare its totals with the table below by eye, or add a Gemini key on your Account page to have Gemini check them."}
          </Typography>
        </Box>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Racer</TableCell>
              <TableCell align="center">Races</TableCell>
              <TableCell align="right">Entered</TableCell>
              {read && <TableCell align="right">Photo</TableCell>}
              <TableCell>Check</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checks.map((r) => {
              const p = playerById(r.pid);
              const ph = read ? read.byPid[r.pid] : undefined;
              const off = ph != null && ph !== r.total;
              return (
                <TableRow key={r.pid}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center"><PlayerDot player={p} /><span>{p ? p.name : "?"}</span></Stack>
                  </TableCell>
                  <TableCell align="center" sx={{ fontFamily: fontData }}>{r.races.length}/4</TableCell>
                  <TableCell align="right" sx={{ fontFamily: fontData, fontWeight: 700 }}>{r.total}</TableCell>
                  {read && <TableCell align="right" sx={{ fontFamily: fontData, color: off ? colors.bad : colors.muted }}>{ph == null ? "–" : ph}</TableCell>}
                  <TableCell>
                    {r.missing.length
                      ? <Typography variant="body2" sx={{ color: colors.bad }}>Missing race {r.missing.join(", ")}</Typography>
                      : off ? <Typography variant="body2" sx={{ color: colors.bad }}>Photo shows {ph}</Typography>
                      : read && ph == null ? <Typography variant="body2" sx={{ color: colors.muted }}>Not found on the photo</Typography>
                      : <Typography variant="body2" sx={{ color: colors.good }}>All 4 races in{read ? ", matches the photo" : ""}</Typography>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {read && read.extra.length > 0 && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>Highlighted on the photo, but nobody entered them</Typography>
          {existingUnclaimed > 0 && <Typography variant="caption" sx={{ color: colors.muted }}>This cup already keeps {existingUnclaimed} unclaimed result{existingUnclaimed === 1 ? "" : "s"}; don't add the same one twice.</Typography>}
          {read.extra.map((h) => (
            <FormControlLabel key={h.idx} sx={{ display: "flex" }}
              control={<Checkbox size="small" checked={!!keep[h.idx]} disabled={h.points == null} onChange={(e) => setKeep({ ...keep, [h.idx]: e.target.checked })} />}
              label={<Stack direction="row" spacing={1} alignItems="center"><CharacterFace name={h.character} size={22} /><span>{h.character || "Unknown"} · <b>{h.points == null ? "?" : h.points} pts</b>{h.name ? ` · “${h.name}”` : ""} · save as unclaimed</span></Stack>}
            />
          ))}
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button variant="contained" disabled={saving || reading} onClick={finalize}>
          {saving ? "Finishing…" : issues ? "Finalize anyway" : "Finalize cup"}
        </Button>
        <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Typography variant="body2" sx={{ color: colors.muted }}>
          {issues ? `${issues} racer${issues === 1 ? "" : "s"} with missing races. ` : ""}
          {unclaimed.length ? `${unclaimed.length} unclaimed result${unclaimed.length === 1 ? "" : "s"} will be added. ` : ""}
          Finalizing puts these totals in the standings; an admin can reopen it later.
        </Typography>
      </Stack>
    </Paper>
  );
}

function LiveCup({ cup, state }) {
  const { user, profile, isAdmin } = useAuth();
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [entryFor, setEntryFor] = useState("me");
  const [finishing, setFinishing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const playerById = (id) => state.players.find((p) => p.id === id);
  const mine = user ? state.players.find((p) => p.userId === user.id) : null;
  const forOther = isAdmin && entryFor !== "me";
  const forId = forOther ? entryFor : mine ? mine.id : null;
  const ringColor = forOther ? (playerById(forId) || {}).color : profile && profile.color;
  const rs = state.races.filter((r) => r.cupId === cup.id);
  const rows = liveRows(state.races, cup.id);

  const prevInCup = forId ? rs.filter((r) => r.playerId === forId && r.character).sort((a, b) => b.race - a.race)[0] : null;
  const defaultChar = (prevInCup && prevInCup.character) || lastCharFor(state.races, forId)
    || (!forOther && profile && profile.favoriteCharacter) || "";

  async function del() {
    setBusy(true); setError("");
    try {
      await q(sb.from("cups").delete().eq("id", cup.id));
      flash("Cup deleted");
      reload();
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 2.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CupIcon cup={cup.cup} size={54} />
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontWeight: 800, fontSize: "1.2rem" }}>{cup.cup}</Typography>
            <Chip label="Live" size="small" sx={{ bgcolor: "rgba(61,220,132,.16)", color: colors.good, fontWeight: 800 }} />
          </Stack>
          <Typography variant="body2" sx={{ color: colors.muted }}>Week {cup.week} · {fmtDate(cup.date)}</Typography>
        </Box>
      </Stack>

      {!user && (
        <Alert severity="info" action={<Button component={RouterLink} to="/account" color="inherit" size="small">Sign in</Button>}>
          Raced tonight? Sign in to enter your finishing position after each race.
        </Alert>
      )}

      {user && isAdmin && (
        <TextField select size="small" label="Entering results for" value={entryFor} onChange={(e) => setEntryFor(e.target.value)} sx={{ maxWidth: 320 }}>
          <MenuItem value="me">Me{mine ? ` (${mine.name})` : ""}</MenuItem>
          {state.players.filter((p) => !mine || p.id !== mine.id).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
      )}

      {user ? (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
          {[1, 2, 3, 4].map((n) => (
            <RaceCard
              key={`${forId}|${n}`}
              cup={cup}
              n={n}
              forId={forId}
              forOther={forOther}
              ringColor={ringColor}
              existing={forId ? rs.find((r) => r.playerId === forId && r.race === n) : null}
              defaultChar={defaultChar}
            />
          ))}
        </Box>
      ) : (
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          {[1, 2, 3, 4].map((n) => (
            <Typography key={n} variant="body2" sx={{ color: colors.muted }}>
              <b style={{ color: colors.ink }}>R{n}</b> {cup.maps[n - 1] || `Track ${n}`}
            </Typography>
          ))}
        </Stack>
      )}

      <LiveTotals cup={cup} rows={rows} playerById={playerById} />

      {isAdmin && (finishing ? (
        <FinishPanel cup={cup} rows={rows} playerById={playerById} players={state.players} onCancel={() => setFinishing(false)} />
      ) : (
        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button variant="contained" disabled={!rows.length} onClick={() => setFinishing(true)}>Finish cup…</Button>
          <Typography variant="body2" sx={{ color: colors.muted, flex: 1, minWidth: 200 }}>
            Check the totals against the results photo, then lock them into the standings.
          </Typography>
          {!confirmDel && <Button size="small" color="error" onClick={() => setConfirmDel(true)}>Delete this cup</Button>}
        </Stack>
      ))}

      {confirmDel && (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap" }}>
          <Typography variant="body2"><b>Delete {cup.cup}?</b> Every race result entered for it is deleted too.</Typography>
          <Button size="small" variant="contained" color="error" disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete cup"}</Button>
          <Button size="small" onClick={() => setConfirmDel(false)}>Keep it</Button>
        </Stack>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Paper>
  );
}

export default function RaceNightPage() {
  const { state, loadError } = useLeagueData();
  const { isAdmin } = useAuth();

  if (!state) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: "center" }}>
        {loadError ? <Alert severity="error">{loadError}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  const live = liveCups(state);

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle
        title="Race night"
        action={isAdmin && live.length > 0 && <Button component={RouterLink} to="/build" size="small" variant="outlined">+ Build another cup</Button>}
      />

      {!live.length ? (
        <Paper sx={{ p: 4, display: "grid", justifyItems: "center", gap: 1.5, textAlign: "center" }}>
          <CupIcon cup="Other" size={60} />
          <Typography sx={{ fontWeight: 700 }}>No cup is being raced right now.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            {isAdmin ? "Build the next cup to open results entry." : "When an admin builds the next cup, enter your finishing position here after each race."}
          </Typography>
          {isAdmin && <Button component={RouterLink} to="/build" variant="contained">Build a cup</Button>}
        </Paper>
      ) : (
        <Stack spacing={3}>
          {live.map((c) => <LiveCup key={c.id} cup={c} state={state} />)}
        </Stack>
      )}
    </Container>
  );
}
