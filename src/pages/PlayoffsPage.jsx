// Playoff picture: the top qualified players (by rating, or points percentage in Season 1), seeded into a
// single-elimination bracket (top seeds get byes when the field isn't a power of two), with an optional
// wild-card play-in for the last spot. Projected until the regular season ends. Each round is
// playoffCupsPerRound cups on aggregate points. The field and bracket come from src/lib/playoffs.js.
import { useMemo } from "react";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute } from "../lib/standings";
import { playoffFormat, playoffPicture, roundName } from "../lib/playoffs";
import { DEMO } from "../lib/demo";
import { pctTxt } from "../lib/constants";
import { colors } from "../theme";
import RacerFace from "../components/RacerFace";
import { fmtRating } from "../components/RatingBits";
import { Loading, PageTitle, SectionTitle } from "../components/PageBits";

function Slot({ seed, s, note, rankBy }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, minHeight: 44 }}>
      <Typography sx={{ fontWeight: 800, fontStyle: "italic", width: 20, textAlign: "right" }}>{seed || ""}</Typography>
      {s ? (
        <>
          <RacerFace who={s.player} character={s.main && s.main.name} size={24} />
          <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{s.player.name}</Typography>
          <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{rankBy === "rating" ? fmtRating(s.rating) : pctTxt(s.pct)}</Typography>
        </>
      ) : (
        <Typography sx={{ color: colors.muted, fontStyle: "italic" }}>{note || "TBD"}</Typography>
      )}
    </Stack>
  );
}

function Match({ a, b, rankBy }) {
  return <Card slots={[a, b]} rankBy={rankBy} />;
}

// One bordered card of slots: a two-player match, or the whole play-in field.
function Card({ slots, rankBy, label }) {
  return (
    <Paper variant="outlined" aria-label={label} sx={{ borderColor: colors.rule, "& > *:not(:last-of-type)": { borderBottom: `1px solid ${colors.line}` } }}>
      {slots.map((x, i) => <Slot key={i} {...x} rankBy={rankBy} />)}
    </Paper>
  );
}

const cupsTxt = (n) => (n === 1 ? "one cup" : `${n} cups`);

export default function PlayoffsPage() {
  const { state, loadError } = useLeagueData();
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const m = useMemo(() => (st ? compute(st) : null), [st]);
  if (!state) return <Loading error={loadError} />;

  const L = st.league;
  const { spots: K, playInRacers, perRound } = playoffFormat(L);
  const byRating = m.rankBy === "rating";
  const { direct, playIn, bubble, slots, rounds, size, byes } = playoffPicture(m.ranked, L);
  const plan = m.plan;
  const lastWeek = plan.seasonWeeks;
  const over = plan.seasonDone;
  const by = byRating ? "skill rating" : "points percentage";
  // The most players the field can hold; with this few qualified, nobody is cut.
  const fieldMax = playInRacers ? K - 1 + playInRacers : K;
  const everyoneIn = m.ranked.length > 0 && m.ranked.length <= fieldMax;
  const lastIn = playIn.length ? playIn[playIn.length - 1] : direct[direct.length - 1];
  const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  const playInSeeds = playIn.length ? range(K, K + playIn.length - 1) : "";

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle
        title="Playoffs"
        sub={playInRacers
          ? `Top ${K - 1} by ${by} go straight in after week ${lastWeek}; the next ${playInRacers} race a play-in for the wild card`
          : `Top ${K} qualified players by ${by} after week ${lastWeek}`}
      />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example standings.</b> This fills in from real results once the first cup is added.</Alert>}

      <Box sx={{ mb: 4, maxWidth: 760 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>{over ? "Regular season complete: seeds are locked" : "Regular season in progress"}</Typography>
          {!over && <Chip size="small" label="Projected" variant="outlined" sx={{ borderColor: colors.rule }} />}
        </Stack>
        <Typography sx={{ color: colors.muted }}>
          {plan.played} of {plan.total} cups played · week {plan.current} of {lastWeek} · {m.ranked.length} qualified (played {m.minCups}+ cups)
        </Typography>
        {everyoneIn && (
          <Typography sx={{ mt: 1 }}>
            {playIn.length
              ? `All ${m.ranked.length} qualified players are in the field as things stand: the top ${direct.length} go straight in and the rest race the play-in. Nobody is cut until more than ${fieldMax} players qualify.`
              : `${m.ranked.length === K ? `All ${K}` : `All ${m.ranked.length}`} qualified players make the playoffs as things stand: the line only cuts anyone once more than ${fieldMax} players qualify. Seeding still comes from the standings.`}
          </Typography>
        )}
      </Box>

      {slots.length < 2 ? (
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Not enough qualified players for a bracket yet.</Typography>
          <Typography sx={{ color: colors.muted }}>It appears once at least 2 players have played {L.minParticipation}% of the cups{m.minCups > m.need ? ` and at least ${m.minCups}` : ""}.</Typography>
        </Box>
      ) : (
        <>
          <SectionTitle title={over ? "Bracket" : "If the season ended today"} sx={{ mt: 0 }} />
          {/* Phones: rounds stack top to bottom. Wider screens: left to right. */}
          <Box sx={{ overflowX: { md: "auto" }, pb: 1 }}>
            <Box sx={{
              display: "grid", gap: 2, alignItems: "center",
              gridAutoFlow: { xs: "row", md: "column" }, gridAutoColumns: { md: "minmax(240px, 1fr)" },
              minWidth: { md: (rounds.length + (playIn.length ? 1 : 0)) * 250 },
            }}>
              {playIn.length > 0 && (
                <Box sx={{ display: "grid", gap: 2 }}>
                  <Typography component="h3" sx={{ fontWeight: 700, color: colors.muted }}>Play-in · wild card</Typography>
                  <Card label="Play-in" rankBy={m.rankBy} slots={playIn.map((s) => ({ seed: s.rank, s }))} />
                  <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>Highest {perRound === 1 ? "score" : "total"} takes seed {K}.</Typography>
                </Box>
              )}
              {rounds.map((r, i) => (
                <Box key={i} sx={{ display: "grid", gap: 2 }}>
                  <Typography component="h3" sx={{ fontWeight: 700, color: colors.muted }}>{roundName(size / 2 ** (i + 1))}</Typography>
                  {r.map((mt, k) => <Match key={k} a={mt[0]} b={mt[1]} rankBy={m.rankBy} />)}
                </Box>
              ))}
            </Box>
          </Box>
          {byes > 0 && (
            <Typography sx={{ color: colors.muted, mt: 1.5, fontSize: "0.9375rem" }}>
              Seed{byes === 1 ? "" : "s"} 1{byes > 1 ? `–${byes}` : ""} get{byes === 1 ? "s" : ""} a bye into the next round.
            </Typography>
          )}
          <Typography sx={{ color: colors.muted, mt: 1.5, fontSize: "0.9375rem" }}>
            {playIn.length > 0 && `The play-in is ${cupsTxt(perRound)}: ${playIn.length === 2 ? "both" : `all ${playIn.length}`} racers (${playInSeeds} in the standings) race together and the highest ${perRound === 1 ? "score" : "total"} takes the wild card into the bracket as seed ${K}; a tie for the top goes to a single-race runoff. `}
            {perRound === 1
              ? "Each matchup is one cup; the higher score advances. A tied cup goes to a single-race runoff on a track an admin picks."
              : `Each round is ${perRound} cups on aggregate points; the higher total advances, and a tie goes to a single-race runoff on a track an admin picks.`}
            {perRound > 1 && size === 4 && slots.length === 4 && ` All four semifinalists race the same cups together: 1 v 4 and 2 v 3 compare totals, and the two winners race the final.`}
            {byRating && " Playoff cups count in stats and records but don't move the locked season rating."}
          </Typography>
        </>
      )}

      {!over && bubble.length > 0 && lastIn && (
        <>
          <SectionTitle title="On the bubble" />
          <Box sx={{ borderTop: `1px solid ${colors.line}` }}>
            {bubble.map((s) => {
              const gap = byRating ? Math.round(lastIn.rating) - Math.round(s.rating) : (lastIn.pct - s.pct) * 100;
              const target = playIn.length ? "the last play-in spot" : `seed ${direct.length}`;
              return (
                <Box key={s.player.id} sx={{ py: 1.25, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderBottom: `1px solid ${colors.line}` }}>
                  <Typography sx={{ fontWeight: 800, fontStyle: "italic", fontSize: "1.125rem", width: 24 }}>{s.rank}</Typography>
                  <RacerFace who={s.player} character={s.main && s.main.name} size={32} />
                  <Typography sx={{ fontWeight: 700, flex: 1 }}>{s.player.name}</Typography>
                  <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{byRating ? `${fmtRating(s.rating)} · ${gap} rating points` : `${pctTxt(s.pct)} · ${gap.toFixed(1)} percentage points`} behind {target}</Typography>
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Container>
  );
}
