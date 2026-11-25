// Human results nobody was matched to, grouped by night and cup (in finishing order). "That was me"
// sends a request an admin approves on the Admin page, and offers the same character's other results
// from that night in the same go, each with the character actually used.
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
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
import Checkbox from "@mui/material/Checkbox";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { compute } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { CHARACTERS, fmtDate, ord } from "../lib/constants";
import { useMyData } from "../lib/accountData";
import { uid } from "../lib/night";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { colors, fontData } from "../theme";
import CupIcon from "../components/CupIcon";
import CharacterFace from "../components/CharacterFace";
import { Loading, PageTitle, plural } from "../components/PageBits";

const keyOf = (u) => `${u.cup.id}|${u.r.rid}`;

function CharacterPick({ value, onChange, label }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 170 }}>
      <MenuItem value="">—</MenuItem>
      {CHARACTERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
    </TextField>
  );
}

// The request: this result plus, ticked by default, the same character's other results from the night.
function ClaimForm({ u, also, mine, onDone }) {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const all = [u].concat(also);
  const [picked, setPicked] = useState(() => Object.fromEntries(all.map((x) => [keyOf(x), { on: true, character: x.r.character || "" }])));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = all.filter((x) => picked[keyOf(x)].on);
  const set = (x, p) => setPicked((s) => ({ ...s, [keyOf(x)]: { ...s[keyOf(x)], ...p } }));

  async function send() {
    if (!chosen.length) return;
    setBusy(true); setError("");
    try {
      await q(sb.from("claims").insert(chosen.map((x) => ({
        id: "k" + uid(), cup_id: x.cup.id, rid: x.r.rid, character: picked[keyOf(x)].character, note: note.trim(), created_at: Date.now(),
      }))));
      flash(chosen.length === 1 ? "Request sent. An admin will review it." : `${chosen.length} requests sent. An admin will review them.`);
      reload();
      onDone();
    } catch (e) {
      setError(e && e.code === "23505" ? "You already asked for one of these. Refresh to see which." : dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5, pt: 1.5, mt: 1.5, borderTop: `1px solid ${colors.line}` }}>
      {also.length > 0 && (
        <Typography variant="body2">
          <b>Also yours?</b> {u.r.character || "This character"} has {plural(also.length, "other result")} from this night. Untick any that weren't you.
        </Typography>
      )}
      <Stack spacing={1}>
        {all.map((x) => {
          const p = picked[keyOf(x)];
          return (
            <Stack key={keyOf(x)} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                {also.length > 0 && (
                  <Checkbox size="small" checked={p.on} onChange={(e) => set(x, { on: e.target.checked })}
                    inputProps={{ "aria-label": `Claim #${x.num} ${x.cup.cup}, ${x.r.pts} points` }} sx={{ ml: -1 }} />
                )}
                <CharacterFace name={p.character} size={30} />
                <Typography variant="body2" sx={{ minWidth: 0 }} noWrap>
                  <b>#{x.num} {x.cup.cup}</b> · {x.r.pts}/{x.max} pts · {x.r.rank}{ord(x.r.rank)}
                </Typography>
              </Stack>
              <CharacterPick label="You raced as" value={p.character} onChange={(v) => set(x, { character: v })} />
            </Stack>
          );
        })}
      </Stack>
      <TextField size="small" label="Note for the admin (optional)" placeholder="e.g. I switched to Mario after the first cup" value={note}
        inputProps={{ maxLength: 200 }} onChange={(e) => setNote(e.target.value)} />
      {!mine && <Typography variant="caption" sx={{ color: colors.muted }}>You don't have a league player yet. One is created for you when an admin approves this.</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="small" disabled={busy || !chosen.length} onClick={send}>
          {busy ? "Sending…" : chosen.length > 1 ? `Request all ${chosen.length}` : "Send request"}
        </Button>
        <Button size="small" onClick={onDone} disabled={busy}>Cancel</Button>
      </Stack>
    </Box>
  );
}

export default function UnclaimedPage() {
  const { state, loadError, reload } = useLeagueData();
  const { user } = useAuth();
  const flash = useFlash();
  const { claims } = useMyData();
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const m = useMemo(() => (st ? compute(st, { season: "all" }) : null), [st]);

  if (!state) return <Loading error={loadError} />;

  const mine = user ? state.players.find((p) => p.userId === user.id) : null;
  const pendingFor = (u) => claims.find((c) => c.cupId === u.cup.id && c.rid === u.r.rid && c.status === "pending");
  const inCup = (u) => !!mine && m.cupInfo.get(u.cup.id).res.some((r) => r.p === mine.id);
  const claimable = (u) => !demo && user && !pendingFor(u) && !inCup(u);

  // Nights (newest first), then each night's cups in the order raced, results in finishing order.
  const nights = [];
  m.unclaimed.forEach((u) => {
    let night = nights.find((n) => n.date === u.cup.date);
    if (!night) { night = { date: u.cup.date, week: u.cup.week, cups: [] }; nights.push(night); }
    let cup = night.cups.find((c) => c.cup.id === u.cup.id);
    if (!cup) { cup = { cup: u.cup, num: u.num, rows: [] }; night.cups.push(cup); }
    cup.rows.push(u);
  });
  nights.forEach((n) => n.cups.sort((a, b) => a.num - b.num));

  async function withdraw(c) {
    setError("");
    try {
      await q(sb.from("claims").delete().eq("id", c.id));
      flash("Request withdrawn");
      reload();
    } catch (e) {
      setError(dbErr(e));
    }
  }

  function action(u) {
    const pending = pendingFor(u);
    if (demo) return <Typography variant="caption" sx={{ color: colors.muted }}>Example</Typography>;
    if (!user) return <Button size="small" component={RouterLink} to="/account">Sign in to claim</Button>;
    if (pending) return <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label="Requested" color="warning" variant="outlined" /><Button size="small" onClick={() => withdraw(pending)}>Withdraw</Button></Stack>;
    if (inCup(u)) return <Typography variant="caption" sx={{ color: colors.muted }}>You already have a result in this cup</Typography>;
    return <Button size="small" variant="contained" onClick={() => setOpen(open === keyOf(u) ? null : keyOf(u))}>That was me</Button>;
  }

  return (
    <Container maxWidth="md" sx={{ pt: 1 }}>
      <PageTitle title="Unclaimed points" sub={`${plural(m.unclaimed.length, "result")} waiting for an owner`} />
      <Typography variant="body2" sx={{ color: colors.muted, mb: 2, maxWidth: "70ch" }}>
        Human results from a results photo that weren't matched to a league player. The character is the clue.{" "}
        {user
          ? <>If one was you, press <b>That was me</b>: you can take the same character's other results from that night in one go, and fix the character for any cup you switched.</>
          : <><RouterLink to="/account" style={{ color: colors.cool }}>Sign in</RouterLink>, then press <b>That was me</b> on yours. An admin adds the points to your record.</>}
      </Typography>
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example results.</b> These disappear when the first real cup is added.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!m.unclaimed.length ? (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>Nothing unclaimed.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>Every human result is matched to a player.</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {nights.map((n) => (
            <Box key={n.date} component="section" aria-label={`Week ${n.week}, ${fmtDate(n.date)}`}>
              <Typography variant="h6" sx={{ fontFamily: "inherit", mb: 1 }}>
                Week {n.week} · {fmtDate(n.date)}{" "}
                <Typography component="span" variant="body2" sx={{ color: colors.muted }}>{plural(n.cups.reduce((a, c) => a + c.rows.length, 0), "result")}</Typography>
              </Typography>
              <Stack spacing={1.5}>
                {n.cups.map((c) => (
                  <Paper key={c.cup.id} sx={{ p: { xs: 1.5, sm: 2 } }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                      <CupIcon cup={c.cup.cup} size={30} />
                      <Typography sx={{ fontWeight: 800 }}>#{c.num} {c.cup.cup}</Typography>
                    </Stack>
                    <Stack spacing={1}>
                      {c.rows.map((u) => {
                        const also = claimable(u)
                          ? m.unclaimed.filter((x) => x !== u && x.cup.date === u.cup.date && x.r.character && x.r.character === u.r.character && claimable(x))
                          : [];
                        return (
                          <Box key={keyOf(u)} sx={{ bgcolor: colors.bg2, border: `1px solid ${colors.line}`, borderRadius: 2, p: 1.25 }}>
                            <Box sx={{
                              display: "grid", alignItems: "center", columnGap: 1.5, rowGap: 1,
                              gridTemplateColumns: { xs: "auto minmax(0,1fr) auto", sm: "auto minmax(0,1fr) auto auto" },
                              gridTemplateAreas: { xs: '"face who pts" "act act act"', sm: '"face who pts act"' },
                            }}>
                              <Box sx={{ gridArea: "face" }}><CharacterFace name={u.r.character} size={36} /></Box>
                              <Box sx={{ gridArea: "who", minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 700 }} noWrap>{u.r.character || "Unknown character"}</Typography>
                                <Typography variant="caption" sx={{ color: colors.muted }}>{u.r.rank}{ord(u.r.rank)} of {u.field}</Typography>
                              </Box>
                              <Typography sx={{ gridArea: "pts", fontFamily: fontData, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {u.r.pts}<span style={{ color: colors.muted, fontWeight: 400 }}>/{u.max}</span>
                              </Typography>
                              <Box sx={{ gridArea: "act", justifySelf: { xs: "start", sm: "end" } }}>{action(u)}</Box>
                            </Box>
                            {open === keyOf(u) && !pendingFor(u) && <ClaimForm u={u} also={also} mine={mine} onDone={() => setOpen(null)} />}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Container>
  );
}
