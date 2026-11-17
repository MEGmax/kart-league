// Human results nobody was matched to. "That was me" sends a request an admin approves on the Admin page.
import { Fragment, useMemo, useState } from "react";
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
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
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
import CharacterChip from "../components/CharacterChip";
import CharacterFace from "../components/CharacterFace";
import { Loading, PageTitle } from "../components/PageBits";

function ClaimForm({ u, mine, onDone }) {
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [character, setCharacter] = useState(u.r.character || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true); setError("");
    try {
      await q(sb.from("claims").insert({ id: "k" + uid(), cup_id: u.cup.id, rid: u.r.rid, character, note: note.trim(), created_at: Date.now() }));
      flash("Request sent. An admin will review it.");
      reload();
      onDone();
    } catch (e) {
      setError(e && e.code === "23505" ? "You already asked for these points." : dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5, py: 1 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <CharacterFace name={character} size={44} />
        <TextField select size="small" label="You raced as" value={character} onChange={(e) => setCharacter(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">—</MenuItem>
          {CHARACTERS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Note for the admin (optional)" placeholder="e.g. I was the green Yoshi" value={note}
          inputProps={{ maxLength: 200 }} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1 }} />
      </Stack>
      {!mine && <Typography variant="caption" sx={{ color: colors.muted }}>You don't have a league player yet. One is created for you when an admin approves this.</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="small" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send request"}</Button>
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
  const m = useMemo(() => (st ? compute(st) : null), [st]);

  if (!state) return <Loading error={loadError} />;

  const mine = user ? state.players.find((p) => p.userId === user.id) : null;

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

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle title="Unclaimed points" sub={`${m.unclaimed.length} result${m.unclaimed.length === 1 ? "" : "s"} waiting for an owner`} />
      <Typography variant="body2" sx={{ color: colors.muted, mb: 2, maxWidth: "70ch" }}>
        These are human results from a results photo that weren't matched to a league player. If one was you, press <b>That was me</b>, fix the character if it's wrong, and an admin will add the points to your record.
      </Typography>
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example results.</b> These disappear when the first real cup is added.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!m.unclaimed.length ? (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>Nothing unclaimed.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>Every human result is matched to a player.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cup</TableCell>
                <TableCell>Character</TableCell>
                <TableCell align="right">Points</TableCell>
                <TableCell align="right">Finish</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {m.unclaimed.map((u) => {
                const key = `${u.cup.id}|${u.r.rid}`;
                const pending = claims.find((c) => c.cupId === u.cup.id && c.rid === u.r.rid && c.status === "pending");
                const inCup = mine && m.cupInfo.get(u.cup.id).res.some((r) => r.p === mine.id);
                let action;
                if (demo) action = <Typography variant="caption" sx={{ color: colors.muted }}>Example</Typography>;
                else if (!user) action = <Button size="small" component={RouterLink} to="/account">Sign in to claim</Button>;
                else if (pending) action = <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label="Requested" color="warning" variant="outlined" /><Button size="small" onClick={() => withdraw(pending)}>Withdraw</Button></Stack>;
                else if (inCup) action = <Typography variant="caption" sx={{ color: colors.muted }}>You already have a result in this cup</Typography>;
                else action = <Button size="small" variant="contained" onClick={() => setOpen(open === key ? null : key)}>That was me</Button>;
                return (
                  <Fragment key={key}>
                    <TableRow>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <CupIcon cup={u.cup.cup} size={34} />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>#{u.num} {u.cup.cup}</Typography>
                            <Typography variant="caption" sx={{ color: colors.muted }}>Week {u.cup.week} · {fmtDate(u.cup.date)}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>{u.r.character ? <CharacterChip name={u.r.character} /> : <Typography variant="body2" sx={{ color: colors.muted }}>Unknown</Typography>}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: fontData }}>{u.r.pts}<span style={{ color: colors.muted }}>/{u.max}</span></TableCell>
                      <TableCell align="right" sx={{ fontFamily: fontData, whiteSpace: "nowrap" }}>{u.r.rank}{ord(u.r.rank)}<span style={{ color: colors.muted }}> of {u.field}</span></TableCell>
                      <TableCell align="right">{action}</TableCell>
                    </TableRow>
                    {open === key && !pending && (
                      <TableRow>
                        <TableCell colSpan={5}><ClaimForm u={u} mine={mine} onDone={() => setOpen(null)} /></TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
