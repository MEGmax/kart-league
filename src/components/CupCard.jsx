// One finished cup on the Schedule: finishing order, tracks, the race-by-race grid, the results photo, and
// admin edit/reopen/delete. `latest` is the newest cup in the season, shown big with track pictures; older
// cups are compact, with race by race folded away.
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import Link from "@mui/material/Link";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useLeagueData } from "../context/LeagueDataContext";
import { useFlash } from "../context/FlashContext";
import { sb, q, dbErr } from "../lib/supabaseClient";
import { deleteCupPhoto } from "../lib/cupPhotos";
import { colors } from "../theme";
import CupIcon from "./CupIcon";
import TrackImage from "./TrackImage";
import CharacterFace from "./CharacterFace";
import PlaceBadge from "./PlaceBadge";
import CupPhoto from "./CupPhoto";

// Race-by-race places as a plain table. On a phone each race is just the place (details in the tooltip),
// so all four races and the total fit without scrolling; wider screens add the character and points.
function RaceGrid({ cup, info, races, playerById }) {
  const rs = races.filter((x) => x.cupId === cup.id);
  const cols = { xs: "minmax(0,1fr) repeat(4, 36px) 44px", sm: "minmax(0,1fr) repeat(4, minmax(64px, 96px)) 56px" };
  const head = { fontSize: "0.875rem", fontWeight: 600, color: colors.muted, textAlign: "center" };
  return (
    <Box role="table" aria-label={`${cup.cup}, race by race`}>
      <Box role="row" sx={{ display: "grid", gridTemplateColumns: cols, columnGap: 0.5, alignItems: "center", py: 0.75, borderBottom: `2px solid ${colors.rule}` }}>
        <Box role="columnheader" sx={{ ...head, textAlign: "left" }}>Racer</Box>
        {[1, 2, 3, 4].map((n) => <Box key={n} role="columnheader" title={cup.maps[n - 1] || ""} sx={head}>R{n}</Box>)}
        <Box role="columnheader" sx={{ ...head, textAlign: "right" }}>Total</Box>
      </Box>
      {info.res.filter((r) => r.p).map((r) => {
        const p = playerById(r.p);
        return (
          <Box key={r.rid} role="row" sx={{ display: "grid", gridTemplateColumns: cols, columnGap: 0.5, alignItems: "center", minHeight: 44, borderBottom: `1px solid ${colors.line}` }}>
            <Typography role="rowheader" noWrap sx={{ fontWeight: 600 }}>{p ? p.name : "?"}</Typography>
            {[1, 2, 3, 4].map((n) => {
              const x = rs.find((y) => y.playerId === r.p && y.race === n);
              const tip = x ? [cup.maps[n - 1], `${x.points} pts`, x.character].filter(Boolean).join(" · ") : "";
              return (
                <Stack key={n} role="cell" direction="row" spacing={0.75} alignItems="center" justifyContent="center" title={tip} aria-label={x ? `Race ${n}: ${x.position}, ${tip}` : `Race ${n}: no result`}>
                  {x ? (
                    <>
                      {x.character && <Box sx={{ display: { xs: "none", sm: "block" } }}><CharacterFace name={x.character} size={22} /></Box>}
                      <PlaceBadge n={x.position} />
                      <Typography component="span" sx={{ color: colors.muted, fontSize: "0.875rem", display: { xs: "none", sm: "inline" } }}>{x.points}</Typography>
                    </>
                  ) : <Typography component="span" sx={{ color: colors.muted }}>–</Typography>}
                </Stack>
              );
            })}
            <Typography role="cell" sx={{ fontWeight: 700, textAlign: "right" }}>{r.pts}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// Finishing order: place, face, name (and the character they raced), points.
function Results({ info, playerById, big }) {
  return (
    <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }} aria-label="Finishing order">
      {info.res.map((r) => {
        const p = r.p ? playerById(r.p) : null;
        return (
          <Box component="li" key={r.rid} sx={{
            display: "grid", alignItems: "center", columnGap: 1.5, minHeight: big ? 56 : 48,
            gridTemplateColumns: "28px minmax(0,1fr) auto", borderBottom: `1px solid ${colors.line}`,
          }}>
            <Box sx={{ fontWeight: 800, fontStyle: "italic", fontSize: big ? "1.375rem" : "1.125rem", color: r.rank === 1 ? colors.gold : colors.ink }}>{r.rank}</Box>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
              <CharacterFace name={r.character} size={big ? 36 : 30} />
              <Box sx={{ minWidth: 0 }}>
                {p ? (
                  <Typography noWrap sx={{ fontWeight: 700, lineHeight: 1.25 }}>{p.name}</Typography>
                ) : (
                  <Link component={RouterLink} to="/unclaimed" sx={{ fontWeight: 700, fontStyle: "italic", color: colors.link }}>Unclaimed</Link>
                )}
                {r.character && <Typography noWrap sx={{ color: colors.muted, fontSize: "0.875rem", lineHeight: 1.25 }}>{r.character}</Typography>}
              </Box>
            </Stack>
            <Typography sx={{ fontWeight: 700, fontSize: big ? "1.125rem" : "1rem", textAlign: "right", whiteSpace: "nowrap" }}>
              {r.pts}<Box component="span" sx={{ color: colors.muted, fontWeight: 500 }}>/{info.max}</Box>
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default function CupCard({ cup, info, st, demo, isAdmin, signedIn, latest, first }) {
  const navigate = useNavigate();
  const flash = useFlash();
  const { reload } = useLeagueData();
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState("");
  const playerById = (id) => st.players.find((x) => x.id === id);

  async function del() {
    setBusy(true); setError("");
    try {
      await q(sb.from("cups").delete().eq("id", cup.id));
      await deleteCupPhoto(cup.photoPath).catch(() => {});
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
      navigate("/join");
    } catch (e) {
      setError(dbErr(e));
      setBusy(false);
    }
  }

  const tracks = cup.maps && cup.maps.length > 0;
  return (
    <Box component="article" aria-label={`Cup ${info.num}: ${cup.cup}`} sx={{
      pt: latest || first ? 2 : 3, pb: 3, borderTop: latest || first ? 0 : `1px solid ${colors.line}`,
      display: "grid", columnGap: 4, rowGap: 2,
      gridTemplateColumns: { xs: "minmax(0,1fr)", md: latest ? (cup.hasPhoto && !demo ? "minmax(0,1fr) 260px" : "minmax(0,1fr)") : "minmax(0,1fr) minmax(0,1fr)" },
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
          <CupIcon cup={cup.cup} size={latest ? 44 : 32} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component={latest ? "h2" : "h3"} sx={{ fontWeight: 700, fontSize: latest ? "1.5rem" : "1.125rem", lineHeight: 1.2 }}>
              {cup.cup} <Box component="span" sx={{ color: colors.muted, fontWeight: 500 }}>#{info.num}</Box>
            </Typography>
            {(latest || info.max !== 60) && (
              <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>
                {[latest && "Latest cup", info.max !== 60 && `max ${info.max} pts`].filter(Boolean).join(" · ")}
              </Typography>
            )}
          </Box>
          {info.upset && (
            <Tooltip title={`${(playerById(info.upset.winner) || {}).name || "The winner"} won over ${info.upset.over.map((id) => (playerById(id) || {}).name || "?").join(" and ")}, rated 75+ higher going in`}>
              <Chip size="small" variant="outlined" label="Upset" sx={{ borderColor: colors.rule }} />
            </Tooltip>
          )}
        </Stack>

        {tracks && latest && (
          <Box sx={{ display: "grid", gap: 1, mt: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(4, minmax(0,1fr))" }, maxWidth: 760 }}>
            {cup.maps.map((mp, k) => <TrackImage key={k} track={mp} label caption={`Race ${k + 1}`} />)}
          </Box>
        )}
        {tracks && !latest && (
          <Typography sx={{ color: colors.muted, fontSize: "0.9375rem", mt: 1 }}>{cup.maps.join(" · ")}</Typography>
        )}
        {cup.notes && <Typography sx={{ color: colors.muted, mt: 1 }}>{cup.notes}</Typography>}

        {!latest && (
          <Box sx={{ mt: 1.5 }}><Results info={info} playerById={playerById} /></Box>
        )}
      </Box>

      {latest ? (
        <Box sx={{ gridColumn: { md: "1 / 2" }, minWidth: 0 }}>
          <Results info={info} playerById={playerById} big />
          {info.hasRaces && (
            <Box sx={{ mt: 3 }}>
              <Typography component="h3" sx={{ fontWeight: 700, fontSize: "1.125rem", mb: 0.5 }}>Race by race</Typography>
              <RaceGrid cup={cup} info={info} races={st.races || []} playerById={playerById} />
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ minWidth: 0, display: "grid", gap: 1, alignContent: "start", pt: { md: 6 } }}>
          {cup.hasPhoto && !demo && <CupPhoto cup={cup} signedIn={signedIn} />}
          {info.hasRaces && (
            <>
              <Button size="small" color="inherit" onClick={() => setGrid(!grid)} aria-expanded={grid}
                sx={{ color: colors.muted, px: 0, justifySelf: "start" }}
                endIcon={<ExpandMoreIcon sx={{ transform: grid ? "rotate(180deg)" : "none" }} />}>
                Race by race
              </Button>
              <Collapse in={grid} unmountOnExit>
                <RaceGrid cup={cup} info={info} races={st.races || []} playerById={playerById} />
              </Collapse>
            </>
          )}
        </Box>
      )}

      {latest && cup.hasPhoto && !demo && (
        <Box sx={{ gridColumn: { md: "2" }, gridRow: { md: "1 / span 2" } }}>
          <CupPhoto cup={cup} signedIn={signedIn} />
        </Box>
      )}

      {isAdmin && !demo && (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", gridColumn: "1 / -1" }}>
          {confirmDel ? (
            <>
              <Typography><b>Delete Cup {info.num}?</b> Its results leave the standings.</Typography>
              <Button size="small" variant="contained" color="error" disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete cup"}</Button>
              <Button size="small" onClick={() => setConfirmDel(false)}>Keep it</Button>
            </>
          ) : (
            <>
              <Button size="small" variant="outlined" color="inherit" disabled={busy} onClick={() => navigate(`/add?edit=${encodeURIComponent(cup.id)}`)}>Edit results</Button>
              {!(cup.maps && cup.maps.length) && (
                <Button size="small" color="inherit" disabled={busy} onClick={() => navigate(`/add?edit=${encodeURIComponent(cup.id)}`)}>Set cup &amp; tracks</Button>
              )}
              {info.hasRaces && <Button size="small" color="inherit" disabled={busy} onClick={reopen}>Reopen on Join</Button>}
              <Button size="small" color="error" onClick={() => setConfirmDel(true)}>Delete</Button>
            </>
          )}
        </Stack>
      )}
      {error && <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>{error}</Alert>}
    </Box>
  );
}
