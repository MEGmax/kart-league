import { Fragment, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { compute, liveCups } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { fmtDate } from "../lib/constants";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { colors, fontData } from "../theme";
import CupIcon from "../components/CupIcon";
import CharacterFace from "../components/CharacterFace";
import PlaceBadge from "../components/PlaceBadge";

const photoCache = new Map(); // cupId -> data URL, or "" when the cup has none

function CupPhoto({ cupId, cupName }) {
  const [src, setSrc] = useState(photoCache.get(cupId));
  useEffect(() => {
    if (photoCache.has(cupId)) return;
    let live = true;
    q(sb.from("photos").select("data").eq("cup_id", cupId).maybeSingle())
      .then((r) => (r && r.data ? "data:image/jpeg;base64," + r.data : ""))
      .catch(() => "")
      .then((url) => { photoCache.set(cupId, url); if (live) setSrc(url); });
    return () => { live = false; };
  }, [cupId]);
  if (!src) return null;
  return (
    <Box component="a" href={src} target="_blank" rel="noopener" sx={{ display: "block", alignSelf: "start" }}>
      <Box component="img" src={src} alt={`Results screen photo for ${cupName}`}
        sx={{ width: "100%", maxWidth: { xs: "100%", md: 260 }, borderRadius: 2, border: `1px solid ${colors.line}`, display: "block" }} />
    </Box>
  );
}

function RaceGrid({ cup, info, races, playerById }) {
  const rs = races.filter((x) => x.cupId === cup.id);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, bgcolor: colors.bg2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Racer</TableCell>
            {[1, 2, 3, 4].map((n) => <TableCell key={n} align="center" title={cup.maps[n - 1] || ""}>R{n}</TableCell>)}
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {info.res.filter((r) => r.p).map((r) => {
            const p = playerById(r.p);
            return (
              <TableRow key={r.rid}>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CharacterFace name={r.character} ring={p && p.color} size={24} />
                    <span>{p ? p.name : "?"}</span>
                  </Stack>
                </TableCell>
                {[1, 2, 3, 4].map((n) => {
                  const x = rs.find((y) => y.playerId === r.p && y.race === n);
                  return (
                    <TableCell key={n} align="center" title={x && x.character ? x.character : ""}>
                      {x ? (
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                          {x.character && <CharacterFace name={x.character} size={20} />}
                          <PlaceBadge n={x.position} />
                          <Typography component="span" variant="caption" sx={{ color: colors.muted }}>{x.points}</Typography>
                        </Stack>
                      ) : <Typography component="span" sx={{ color: colors.muted }}>–</Typography>}
                    </TableCell>
                  );
                })}
                <TableCell align="right" sx={{ fontFamily: fontData, fontWeight: 700 }}>{r.pts}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function CupCard({ cup, info, st, demo, isAdmin }) {
  const navigate = useNavigate();
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const playerById = (id) => st.players.find((x) => x.id === id);

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

  async function reopen() {
    setBusy(true); setError("");
    try {
      await q(sb.rpc("reopen_cup", { p_cup: cup.id }));
      flash("Reopened. Fix the entries, then finish it again.");
      reload();
      navigate("/race");
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  return (
    <Paper sx={{ p: 2.5, display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", md: cup.hasPhoto && !demo ? "minmax(0,1fr) 260px" : "minmax(0,1fr)" } }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
          <CupIcon cup={cup.cup} />
          <Typography sx={{ fontFamily: fontData, color: colors.muted }}>#{info.num}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: "1.1rem" }}>{cup.cup}</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>
            {fmtDate(cup.date)}{info.max !== 60 ? ` · max ${info.max} pts` : ""}
          </Typography>
        </Stack>

        {cup.maps && cup.maps.length > 0 && (
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
            {cup.maps.map((mp, k) => (
              <Typography key={k} variant="body2" sx={{ color: colors.muted }}>
                <b style={{ color: colors.ink }}>R{k + 1}</b> {mp}
              </Typography>
            ))}
          </Stack>
        )}
        {cup.notes && <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>{cup.notes}</Typography>}

        <Stack spacing={1} sx={{ mt: 2 }}>
          {info.res.map((r) => {
            const p = r.p ? playerById(r.p) : null;
            return (
              <Box key={r.rid} sx={{
                display: "grid", alignItems: "center", columnGap: 1.5, rowGap: 0.5,
                gridTemplateColumns: { xs: "28px minmax(0,1fr) auto", sm: "28px minmax(0,220px) minmax(0,1fr) auto" },
                opacity: p ? 1 : 0.8,
              }}>
                <PlaceBadge n={r.rank} suffix={false} />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <CharacterFace name={r.character} ring={p ? p.color : colors.muted} size={30} />
                  <Box sx={{ minWidth: 0 }}>
                    {p ? (
                      <Typography noWrap sx={{ fontWeight: 700 }}>{p.name}</Typography>
                    ) : (
                      <Link component={RouterLink} to="/unclaimed" sx={{ fontWeight: 700, fontStyle: "italic" }}>Unclaimed</Link>
                    )}
                    {r.character && <Typography noWrap variant="caption" sx={{ color: colors.muted, display: "block", lineHeight: 1.2 }}>{r.character}</Typography>}
                  </Box>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (r.pts / info.max) * 100)}
                  sx={{
                    display: { xs: "none", sm: "block" }, height: 8, borderRadius: 4, bgcolor: colors.panel2,
                    "& .MuiLinearProgress-bar": { bgcolor: p ? p.color : colors.muted },
                  }}
                />
                <Typography sx={{ fontFamily: fontData, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.pts}<Box component="span" sx={{ color: colors.muted, fontWeight: 400 }}>/{info.max}</Box>
                </Typography>
              </Box>
            );
          })}
        </Stack>

        {info.hasRaces && <RaceGrid cup={cup} info={info} races={st.races || []} playerById={playerById} />}

        {isAdmin && !demo && (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
            {confirmDel ? (
              <>
                <Typography variant="body2"><b>Delete Cup {info.num}?</b> Its results leave the standings.</Typography>
                <Button size="small" variant="contained" color="error" disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete cup"}</Button>
                <Button size="small" onClick={() => setConfirmDel(false)}>Keep it</Button>
              </>
            ) : (
              <>
                {info.hasRaces && <Button size="small" variant="outlined" disabled={busy} onClick={reopen}>Reopen to fix results</Button>}
                <Button size="small" color="error" onClick={() => setConfirmDel(true)}>Delete</Button>
              </>
            )}
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Box>
      {cup.hasPhoto && !demo && <CupPhoto cupId={cup.id} cupName={cup.cup} />}
    </Paper>
  );
}

export default function CupsPage() {
  const { state, loadError } = useLeagueData();
  const { isAdmin } = useAuth();
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const m = useMemo(() => (st ? compute(st) : null), [st]);

  if (!state) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: "center" }}>
        {loadError ? <Alert severity="error">{loadError}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  const live = liveCups(state);
  const newestFirst = m.cups.slice().reverse();

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <Typography variant="h5" sx={{ fontFamily: "inherit" }}>Cup log</Typography>
      <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>
        {m.total} cup{m.total === 1 ? "" : "s"} finished · newest week first
      </Typography>

      {demo && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <b>Example cups.</b> These made-up results show how the site works. They disappear when the first real cup is added.
        </Alert>
      )}

      {live.map((c) => (
        <Alert
          key={c.id}
          severity="success"
          sx={{ mb: 2 }}
          action={<Button component={RouterLink} to="/race" color="inherit" size="small">Race night</Button>}
        >
          <b>{c.cup}</b> is being raced now. Enter your results on Race night.
        </Alert>
      ))}

      {!m.cups.length ? (
        <Paper sx={{ p: 3 }}><Typography sx={{ fontWeight: 700 }}>No cups yet.</Typography></Paper>
      ) : (
        <Stack spacing={2}>
          {newestFirst.map((c, i) => {
            const newWeek = i === 0 || newestFirst[i - 1].week !== c.week;
            const n = m.byWeek[c.week] || 0;
            return (
              <Fragment key={c.id}>
                {newWeek && (
                  <Typography variant="h6" sx={{ fontFamily: "inherit", pt: i ? 2 : 0 }}>
                    Week {c.week}{" "}
                    <Typography component="span" variant="body2" sx={{ color: colors.muted }}>{n} cup{n === 1 ? "" : "s"}</Typography>
                  </Typography>
                )}
                <CupCard cup={c} info={m.cupInfo.get(c.id)} st={st} demo={demo} isAdmin={isAdmin} />
              </Fragment>
            );
          })}
        </Stack>
      )}
    </Container>
  );
}
