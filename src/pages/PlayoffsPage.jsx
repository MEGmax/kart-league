// Playoff picture: the top qualified players by points percentage, seeded into a single-elimination
// bracket (top seeds get byes when the field isn't a power of two). Projected until the regular season ends.
import { useMemo } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { pctTxt } from "../lib/constants";
import { colors, fontData } from "../theme";
import CharacterFace from "../components/CharacterFace";
import { Loading, PageTitle, SectionTitle } from "../components/PageBits";

// Standard seeding order: 1 v 8, 4 v 5, 2 v 7, 3 v 6, …
export function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

function roundName(matches) {
  return matches === 1 ? "Final" : matches === 2 ? "Semifinals" : matches === 4 ? "Quarterfinals" : `Round of ${matches * 2}`;
}

function Slot({ seed, s, note }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, minHeight: 40 }}>
      <Typography sx={{ fontFamily: fontData, color: colors.muted, width: 18, textAlign: "right" }}>{seed || ""}</Typography>
      {s ? (
        <>
          <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={24} />
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{s.player.name}</Typography>
          <Typography variant="caption" sx={{ fontFamily: fontData, color: colors.muted }}>{pctTxt(s.pct)}</Typography>
        </>
      ) : (
        <Typography variant="body2" sx={{ color: colors.muted, fontStyle: "italic" }}>{note || "TBD"}</Typography>
      )}
    </Stack>
  );
}

function Match({ a, b }) {
  return (
    <Paper variant="outlined" sx={{ bgcolor: colors.bg2, "& > *:first-of-type": { borderBottom: `1px solid ${colors.line}` } }}>
      <Slot {...a} />
      <Slot {...b} />
    </Paper>
  );
}

export default function PlayoffsPage() {
  const { state, loadError } = useLeagueData();
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const m = useMemo(() => (st ? compute(st) : null), [st]);
  if (!state) return <Loading error={loadError} />;

  const L = st.league;
  const K = Math.max(2, Number(L.playoffSpots) || 4);
  const seeds = m.ranked.slice(0, K);
  const bubble = m.ranked.slice(K, K + 3);
  const lastWeek = Number(L.seasonWeeks) || 5;
  const seasonCups = lastWeek * (Number(L.cupsPerWeek) || 4);
  const over = m.curWeek > lastWeek || ((m.byWeek[lastWeek] || 0) >= (Number(L.cupsPerWeek) || 4) && m.curWeek >= lastWeek);

  // Bracket rounds. First round from the seeding order; later rounds show byes advancing, others TBD.
  const size = seeds.length >= 2 ? 2 ** Math.ceil(Math.log2(seeds.length)) : 0;
  const rounds = [];
  if (size) {
    const order = bracketOrder(size);
    const slot = (seed) => ({ seed: seed <= seeds.length ? seed : null, s: seeds[seed - 1] || null, note: seed > seeds.length ? "Bye" : null });
    let current = [];
    for (let i = 0; i < size; i += 2) current.push([slot(order[i]), slot(order[i + 1])]);
    rounds.push(current);
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        const adv = (mt) => (mt[1].note === "Bye" ? mt[0] : mt[0].note === "Bye" ? mt[1] : { seed: null, s: null, note: "Winner" });
        next.push([adv(current[i]), adv(current[i + 1])]);
      }
      // Only the first round can contain byes; after it everyone left is a real match.
      current = next.map((mt) => mt.map((x) => (x.s ? x : { seed: null, s: null, note: "TBD" })));
      rounds.push(current);
    }
    // A first-round "match" against a bye isn't played; hide it.
    rounds[0] = rounds[0].filter((mt) => mt[0].note !== "Bye" && mt[1].note !== "Bye");
  }

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle title="Playoffs" sub={`Top ${K} qualified players by points percentage after week ${lastWeek}`} />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example standings.</b> This fills in from real results once the first cup is added.</Alert>}

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>{over ? "Regular season complete: seeds are locked" : "Regular season in progress"}</Typography>
          {!over && <Chip size="small" label="Projected" variant="outlined" />}
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100, (m.total / seasonCups) * 100)}
          sx={{ height: 8, borderRadius: 4, bgcolor: colors.panel2, "& .MuiLinearProgress-bar": { bgcolor: colors.accent } }} />
        <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
          {m.total} of about {seasonCups} cups played · week {Math.min(m.curWeek, lastWeek)} of {lastWeek} · {m.ranked.length} qualified (played {m.need}+ cups)
        </Typography>
      </Paper>

      {seeds.length < 2 ? (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>Not enough qualified players for a bracket yet.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>It appears once at least 2 players have played {L.minParticipation}% of the cups.</Typography>
        </Paper>
      ) : (
        <>
          <SectionTitle title={over ? "Bracket" : "If the season ended today"} sx={{ mt: 0 }} />
          <Box sx={{ overflowX: "auto", pb: 1 }}>
            <Box sx={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(240px, 1fr)", gap: 2, alignItems: "center", minWidth: rounds.length * 250 }}>
              {rounds.map((r, i) => (
                <Box key={i} sx={{ display: "grid", gap: 2 }}>
                  <Typography variant="overline" sx={{ color: colors.muted }}>{roundName(size / 2 ** (i + 1))}</Typography>
                  {r.map((mt, k) => <Match key={k} a={mt[0]} b={mt[1]} />)}
                </Box>
              ))}
            </Box>
          </Box>
          {seeds.length < size && (
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
              Seed{size - seeds.length === 1 ? "" : "s"} 1{size - seeds.length > 1 ? `–${size - seeds.length}` : ""} get{size - seeds.length === 1 ? "s" : ""} a bye into the next round.
            </Typography>
          )}
        </>
      )}

      {!over && bubble.length > 0 && (
        <>
          <SectionTitle title="On the bubble" />
          <Stack spacing={1}>
            {bubble.map((s) => {
              const gap = (seeds[seeds.length - 1].pct - s.pct) * 100;
              return (
                <Paper key={s.player.id} sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Typography sx={{ fontFamily: fontData, color: colors.muted, width: 24 }}>{s.rank}</Typography>
                  <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={28} />
                  <Typography sx={{ fontWeight: 700, flex: 1 }}>{s.player.name}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: fontData, color: colors.muted }}>{pctTxt(s.pct)} · {gap.toFixed(1)} percentage points behind seed {seeds.length}</Typography>
                </Paper>
              );
            })}
          </Stack>
        </>
      )}
    </Container>
  );
}
