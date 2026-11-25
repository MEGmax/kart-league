// Playoff picture: the top qualified players (by rating, or points percentage in Season 1), seeded into a
// single-elimination bracket (top seeds get byes when the field isn't a power of two). Projected until the
// regular season ends. Each round is playoffCupsPerRound cups on aggregate points.
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
import { fmtRating } from "../components/RatingBits";
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

function Slot({ seed, s, note, rankBy }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, minHeight: 40 }}>
      <Typography sx={{ fontFamily: fontData, color: colors.muted, width: 18, textAlign: "right" }}>{seed || ""}</Typography>
      {s ? (
        <>
          <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={24} />
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{s.player.name}</Typography>
          <Typography variant="caption" sx={{ fontFamily: fontData, color: colors.muted }}>{rankBy === "rating" ? fmtRating(s.rating) : pctTxt(s.pct)}</Typography>
        </>
      ) : (
        <Typography variant="body2" sx={{ color: colors.muted, fontStyle: "italic" }}>{note || "TBD"}</Typography>
      )}
    </Stack>
  );
}

function Match({ a, b, rankBy }) {
  return (
    <Paper variant="outlined" sx={{ bgcolor: colors.bg2, "& > *:first-of-type": { borderBottom: `1px solid ${colors.line}` } }}>
      <Slot {...a} rankBy={rankBy} />
      <Slot {...b} rankBy={rankBy} />
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
  const byRating = m.rankBy === "rating";
  const perRound = Math.max(1, Number(L.playoffCupsPerRound) || 1);
  const seeds = m.ranked.slice(0, K);
  const bubble = m.ranked.slice(K, K + 3);
  const plan = m.plan;
  const lastWeek = plan.seasonWeeks;
  const over = plan.seasonDone;
  // With this few qualified players, the top-K line doesn't cut anyone.
  const everyoneIn = m.ranked.length > 0 && m.ranked.length <= K;

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
      <PageTitle title="Playoffs" sub={`Top ${K} qualified players by ${byRating ? "skill rating" : "points percentage"} after week ${lastWeek}`} />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example standings.</b> This fills in from real results once the first cup is added.</Alert>}

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>{over ? "Regular season complete: seeds are locked" : "Regular season in progress"}</Typography>
          {!over && <Chip size="small" label="Projected" variant="outlined" />}
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100, (plan.played / plan.total) * 100)}
          sx={{ height: 8, borderRadius: 4, bgcolor: colors.panel2, "& .MuiLinearProgress-bar": { bgcolor: colors.accent } }} />
        <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
          {plan.played} of {plan.total} cups played · week {plan.current} of {lastWeek} · {m.ranked.length} qualified (played {m.minCups}+ cups)
        </Typography>
        {everyoneIn && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {m.ranked.length === K ? `All ${K} qualified players` : `All ${m.ranked.length} qualified players`} make the playoffs as things stand:
            the top-{K} line only cuts anyone once more than {K} players qualify. Seeding still comes from the standings.
          </Typography>
        )}
      </Paper>

      {seeds.length < 2 ? (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>Not enough qualified players for a bracket yet.</Typography>
          <Typography variant="body2" sx={{ color: colors.muted }}>It appears once at least 2 players have played {L.minParticipation}% of the cups{m.minCups > m.need ? ` and at least ${m.minCups}` : ""}.</Typography>
        </Paper>
      ) : (
        <>
          <SectionTitle title={over ? "Bracket" : "If the season ended today"} sx={{ mt: 0 }} />
          {/* Phones: rounds stack top to bottom. Wider screens: left to right. */}
          <Box sx={{ overflowX: { md: "auto" }, pb: 1 }}>
            <Box sx={{
              display: "grid", gap: 2, alignItems: "center",
              gridAutoFlow: { xs: "row", md: "column" }, gridAutoColumns: { md: "minmax(240px, 1fr)" }, minWidth: { md: rounds.length * 250 },
            }}>
              {rounds.map((r, i) => (
                <Box key={i} sx={{ display: "grid", gap: 2 }}>
                  <Typography variant="overline" sx={{ color: colors.muted }}>{roundName(size / 2 ** (i + 1))}</Typography>
                  {r.map((mt, k) => <Match key={k} a={mt[0]} b={mt[1]} rankBy={m.rankBy} />)}
                </Box>
              ))}
            </Box>
          </Box>
          {seeds.length < size && (
            <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
              Seed{size - seeds.length === 1 ? "" : "s"} 1{size - seeds.length > 1 ? `–${size - seeds.length}` : ""} get{size - seeds.length === 1 ? "s" : ""} a bye into the next round.
            </Typography>
          )}
          <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
            {perRound === 1
              ? "Each matchup is one cup; the higher score advances. A tied cup goes to a single-race runoff on a track an admin picks."
              : `Each round is ${perRound} cups on aggregate points; the higher total advances, and a tie goes to a single-race runoff on a track an admin picks.`}
            {perRound > 1 && size === 4 && seeds.length === 4 && " All four semifinalists race the same cups together: 1 v 4 and 2 v 3 compare totals, and the two winners race the final."}
            {byRating && " Playoff cups count in stats and records but don't move the locked season rating."}
          </Typography>
        </>
      )}

      {!over && bubble.length > 0 && (
        <>
          <SectionTitle title="On the bubble" />
          <Stack spacing={1}>
            {bubble.map((s) => {
              const gap = byRating ? Math.round(seeds[seeds.length - 1].rating) - Math.round(s.rating) : (seeds[seeds.length - 1].pct - s.pct) * 100;
              return (
                <Paper key={s.player.id} sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Typography sx={{ fontFamily: fontData, color: colors.muted, width: 24 }}>{s.rank}</Typography>
                  <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={28} />
                  <Typography sx={{ fontWeight: 700, flex: 1 }}>{s.player.name}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: fontData, color: colors.muted }}>{byRating ? `${fmtRating(s.rating)} · ${gap} rating points` : `${pctTxt(s.pct)} · ${gap.toFixed(1)} percentage points`} behind seed {seeds.length}</Typography>
                </Paper>
              );
            })}
          </Stack>
        </>
      )}
    </Container>
  );
}
