import { useMemo, useState } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { compute } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { ord, pctTxt, hashHue } from "../lib/constants";
import { colors } from "../theme";
import Hero from "../components/Hero";
import CharacterFace from "../components/CharacterFace";
import CharacterChip from "../components/CharacterChip";
import NextCupNight from "../components/NextCupNight";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Chip + bar + label; on phones the bar drops onto its own line so nothing overflows.
function BarRow({ name, value, color, label }) {
  return (
    <Box
      sx={{
        display: "grid", alignItems: "center", columnGap: 1.5, rowGap: 0.75,
        gridTemplateColumns: { xs: "minmax(0,1fr) auto", sm: "160px minmax(0,1fr) auto" },
        gridTemplateAreas: { xs: '"chip text" "bar bar"', sm: '"chip bar text"' },
      }}
    >
      <Box sx={{ gridArea: "chip", minWidth: 0 }}><CharacterChip name={name} /></Box>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={{ gridArea: "bar", height: 8, borderRadius: 4, bgcolor: colors.panel2, "& .MuiLinearProgress-bar": { bgcolor: color } }}
      />
      <Typography variant="body2" sx={{ gridArea: "text", color: colors.muted, whiteSpace: "nowrap", textAlign: "right" }}>{label}</Typography>
    </Box>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <Paper sx={{ p: 2, flex: 1, minWidth: 160 }}>
      <Typography variant="caption" sx={{ color: colors.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800, mt: 0.5 }}>{value}</Typography>
      <Typography variant="body2" sx={{ color: colors.muted }}>{sub}</Typography>
    </Paper>
  );
}

function Podium({ ranked, onSelect }) {
  const top = ranked.slice(0, 3);
  if (top.length < 2) return null;
  const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
  const heights = { 1: 118, 2: 88, 3: 66 };
  return (
    <Stack direction="row" spacing={2} useFlexGap justifyContent="center" alignItems="flex-end" sx={{ mb: 3, flexWrap: "wrap" }}>
      {order.map((s) => (
        <Box
          key={s.player.id}
          onClick={() => onSelect(s.player.id)}
          sx={{ cursor: "pointer", textAlign: "center", width: 140 }}
        >
          <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={56} />
          <Typography sx={{ fontWeight: 700, mt: 0.5 }} noWrap>{s.player.name}</Typography>
          {s.main && <Typography variant="caption" sx={{ color: colors.muted }}>{s.main.name}</Typography>}
          <Box
            sx={{
              mt: 1, height: heights[s.rank] || 60, borderRadius: "10px 10px 0 0",
              background: s.rank === 1 ? "linear-gradient(180deg,rgba(255,210,63,.35),#151A33)" : s.rank === 2 ? "linear-gradient(180deg,rgba(201,210,232,.25),#151A33)" : "linear-gradient(180deg,rgba(229,143,78,.28),#151A33)",
              border: `1px solid ${colors.line}`, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            }}
          >
            <Typography sx={{ fontWeight: 800 }}>{s.rank}<sup>{ord(s.rank)}</sup></Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>{pctTxt(s.pct)}</Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function BoardRow({ s, rank, selected, onSelect }) {
  const p = s.player;
  return (
    <Box
      onClick={() => onSelect(p.id)}
      sx={{
        display: "grid", alignItems: "center", columnGap: 2, rowGap: 1,
        gridTemplateColumns: { xs: "32px minmax(0,1fr)", sm: "48px minmax(0,1fr) auto" },
        p: 1.5, borderRadius: 2, cursor: "pointer", border: `1px solid ${selected ? colors.accent : "transparent"}`,
        bgcolor: selected ? "rgba(255,210,63,.08)" : "transparent",
        "&:hover": { bgcolor: colors.panel2 },
      }}
    >
      <Typography sx={{ fontWeight: 800, color: rank && rank <= 3 ? colors.accent : colors.ink }}>
        {rank ? <>{rank}<sup style={{ fontSize: "0.6em" }}>{ord(rank)}</sup></> : "–"}
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <CharacterFace name={s.main && s.main.name} ring={p.color} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>{p.name}</Typography>
          {s.main ? (
            <Typography variant="caption" sx={{ color: colors.muted }}>{s.main.name} ×{s.main.n}</Typography>
          ) : (
            <Typography variant="caption" sx={{ color: colors.muted }}>No character yet</Typography>
          )}
        </Box>
      </Stack>
      <Stack sx={{ minWidth: { sm: 160 }, gridColumn: { xs: "2", sm: "auto" }, textAlign: { xs: "left", sm: "right" } }}>
        <Typography sx={{ fontWeight: 800 }}>{pctTxt(s.pct)}</Typography>
        <LinearProgress variant="determinate" value={Math.min(100, s.pct * 100)} sx={{ height: 6, borderRadius: 3, my: 0.5 }} />
        <Typography variant="caption" sx={{ color: colors.muted }}>{s.pts}/{s.max} pts · {plural(s.cp, "cup")} · {plural(s.wins, "win")}</Typography>
      </Stack>
    </Box>
  );
}

function CharacterChart({ chars }) {
  const top = chars.slice(0, 10);
  if (!top.length) return null;
  const most = top[0].picks;
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ fontFamily: "inherit" }}>Most picked characters</Typography>
      <Typography variant="body2" sx={{ color: colors.muted, mb: 1.5 }}>Every league result with a character, unclaimed ones included</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          {top.map((c) => (
            <BarRow
              key={c.name}
              name={c.name}
              value={(c.picks / most) * 100}
              color={`hsl(${hashHue(c.name)} 80% 60%)`}
              label={`${plural(c.picks, "pick")} · ${pctTxt(c.pts / c.max)} avg · ${plural(c.wins, "win")}`}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

function DetailPanel({ s, onClose }) {
  const p = s.player;
  return (
    <Paper sx={{ p: 2.5, mt: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CharacterFace name={s.main && s.main.name} ring={p.color} size={48} />
        <Typography variant="h6" sx={{ fontFamily: "inherit", flex: 1 }}>{p.name}</Typography>
        <Button size="small" onClick={onClose}>Close</Button>
      </Stack>
      <Grid container spacing={2} sx={{ mt: 2 }}>
        {[
          ["Pct", pctTxt(s.pct)],
          ["Total points", s.pts],
          ["Avg pts / cup", s.avgPtsCup != null ? s.avgPtsCup.toFixed(1) : "–"],
          ["Avg race finish", s.avgRace != null ? s.avgRace.toFixed(2) : "–"],
          ["Avg cup finish", s.avg != null ? s.avg.toFixed(2) : "–"],
          ["Cups", s.cp],
          ["Wins", s.wins],
          ["Podiums", s.pods],
        ].map(([k, v]) => (
          <Grid key={k} item xs={6} sm={3}>
            <Typography variant="caption" sx={{ color: colors.muted }}>{k}</Typography>
            <Typography sx={{ fontWeight: 800 }}>{v}</Typography>
          </Grid>
        ))}
      </Grid>
      {s.charList.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" sx={{ color: colors.muted, textTransform: "uppercase" }}>Character usage</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {s.charList.map((c) => (
              <BarRow
                key={c.name}
                name={c.name}
                value={c.share * 100}
                color={`hsl(${hashHue(c.name)} 80% 60%)`}
                label={`${Math.round(c.share * 100)}% · ${c.n}`}
              />
            ))}
          </Stack>
        </>
      )}
    </Paper>
  );
}

export default function StandingsPage() {
  const { state, loadError } = useLeagueData();
  const { isAdmin } = useAuth();
  const [sel, setSel] = useState(null);

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

  const mostWins = m.ranked.concat(m.unranked).slice().sort((a, b) => b.wins - a.wins)[0];
  const topChar = m.chars[0];
  const L = st.league;
  const selected = sel && m.byId.get(sel);

  return (
    <>
      <Hero league={L} metrics={m} />
      <Container maxWidth="lg" sx={{ pt: 3 }}>
        <Box sx={{ mb: 4 }}><NextCupNight /></Box>
        {demo && (
          <Alert severity="info" sx={{ mb: 3 }} action={isAdmin ? <Button color="inherit" size="small" href="#/build">Build the first cup</Button> : null}>
            <b>Example standings.</b> These made-up results show how the site works. They disappear when the first real cup is added.
          </Alert>
        )}
        <Podium ranked={m.ranked} onSelect={setSel} />
        {m.ranked.length > 0 && (
          <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 4, flexWrap: "wrap" }}>
            <StatTile label="Most cup wins" value={mostWins && mostWins.wins ? mostWins.player.name : "None yet"} sub={mostWins && mostWins.wins ? `${mostWins.wins} win${mostWins.wins === 1 ? "" : "s"}` : ""} />
            <StatTile label="Most picked character" value={topChar ? topChar.name : "–"} sub={topChar ? `${topChar.picks} pick${topChar.picks === 1 ? "" : "s"} · ${pctTxt(topChar.pts / topChar.max)} avg` : ""} />
            <StatTile label="Qualifying mark" value={`${m.need} cup${m.need === 1 ? "" : "s"}`} sub={`${L.minParticipation}% of cups played so far`} />
          </Stack>
        )}

        <Typography variant="h5" sx={{ fontFamily: "inherit" }}>Standings</Typography>
        <Typography variant="body2" sx={{ color: colors.muted, mb: 1.5 }}>
          Ranked by points percentage · top {L.playoffSpots} make the playoffs
        </Typography>
        {!m.ranked.length ? (
          <Paper sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>No qualified players yet.</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>Players appear here once they have played {m.need} cups.</Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 1 }}>
            <Stack divider={<Divider />}>
              {m.ranked.map((s, i) => (
                <Box key={s.player.id}>
                  <BoardRow s={s} rank={s.rank} selected={sel === s.player.id} onSelect={(id) => setSel(sel === id ? null : id)} />
                  {i === L.playoffSpots - 1 && m.ranked.length > L.playoffSpots && (
                    <Divider sx={{ borderColor: colors.accent, borderStyle: "dashed" }}><Typography variant="caption" sx={{ px: 1, color: colors.accent }}>Playoff line</Typography></Divider>
                  )}
                </Box>
              ))}
            </Stack>
          </Paper>
        )}

        {m.unranked.length > 0 && (
          <>
            <Typography variant="h6" sx={{ fontFamily: "inherit", mt: 4 }}>Not yet qualified</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, mb: 1.5 }}>Need {m.need} cups to be ranked</Typography>
            <Paper sx={{ p: 1 }}>
              <Stack divider={<Divider />}>
                {m.unranked.map((s) => (
                  <BoardRow key={s.player.id} s={s} rank={null} selected={sel === s.player.id} onSelect={(id) => setSel(sel === id ? null : id)} />
                ))}
              </Stack>
            </Paper>
          </>
        )}

        {selected && selected.cp ? (
          <DetailPanel s={selected} onClose={() => setSel(null)} />
        ) : m.ranked.length > 0 ? (
          <Typography variant="body2" sx={{ color: colors.muted, mt: 2 }}>Select a racer to see their season and character picks.</Typography>
        ) : null}

        {m.chars.length > 0 && <CharacterChart chars={m.chars} />}
      </Container>
    </>
  );
}
