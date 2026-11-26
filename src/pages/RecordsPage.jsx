// Records (#/records): league records that update live, and the season's awards (announced after the playoffs).
import { useMemo } from "react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute } from "../lib/standings";
import { awards, records, rookieIds } from "../lib/records";
import { DEMO } from "../lib/demo";
import { fmtDate, pctTxt } from "../lib/constants";
import { colors } from "../theme";
import SeasonPicker, { useSeason } from "../components/SeasonPicker";
import { fmtRating, signed } from "../components/RatingBits";
import { Fact, FactList, Loading, PageTitle, SectionTitle } from "../components/PageBits";

function names(list) {
  const n = list.map((x) => x.s.player.name);
  return n.length <= 2 ? n.join(" & ") : `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}

// A record or award: the holder in bold, what it's for above, the detail under it.
function Card({ title, holder, detail }) {
  return <Fact label={title} value={holder || "—"} sub={detail} />;
}

export default function RecordsPage() {
  const { state, loadError } = useLeagueData();
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const { season, seasons, setSeason } = useSeason(st);
  const m = useMemo(() => (st ? compute(st, { season }) : null), [st, season]);
  if (!state) return <Loading error={loadError} />;

  const r = records(m);
  const list = awards(m, { rookies: rookieIds(st, season) });
  const name = (id) => (st.players.find((p) => p.id === id) || {}).name || "?";
  const rating = m.rankBy === "rating";
  const over = m.plan.seasonDone;

  const fmtAward = (a) => {
    const w = a.winners;
    if (!w.length) return { holder: null, detail: a.final ? "Decided in the playoffs" : "Nobody yet" };
    const v = w[0].value;
    const detail = {
      regular: rating ? `rating ${fmtRating(v)}` : pctTxt(v),
      mvp: m.mvp ? `${signed(v)} on ${fmtDate(m.mvp.date)}` : "",
      improved: `${signed(v)} since the season started`,
      iron: `${v} cups`,
      consistent: `±${v.toFixed(1)} points a cup`,
      giant: `${v} upset${v === 1 ? "" : "s"}`,
      track: w[0].track ? `${v.toFixed(1)} pts a race on ${w[0].track}` : "",
      blue: `${v} cup${v === 1 ? "" : "s"} last of the humans`,
      rookie: rating ? `rating ${fmtRating(v)}` : pctTxt(v),
    }[a.key];
    return { holder: names(w), detail };
  };

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle title="Records" sub="League records update after every cup; awards are handed out after the playoffs." />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example league.</b> This fills in from real results once the first cup is added.</Alert>}
      <SeasonPicker season={season} seasons={seasons} setSeason={setSeason} />

      <SectionTitle title="Records" sx={{ mt: 0 }} />
      <FactList columns={3}>
        <Card title="Best cup" holder={r.bestCup && name(r.bestCup.p)}
          detail={r.bestCup ? `${r.bestCup.pts}/${r.bestCup.max}, cup ${r.bestCup.num} (${fmtDate(r.bestCup.cup.date)})${r.bestCup.pts === r.bestCup.max ? ": a perfect cup" : ""}` : "No cups yet"} />
        <Card title="Biggest winning margin" holder={r.biggestMargin && name(r.biggestMargin.p)}
          detail={r.biggestMargin ? `by ${r.biggestMargin.by} points, cup ${r.biggestMargin.num} (${fmtDate(r.biggestMargin.cup.date)})` : "No outright wins yet"} />
        <Card title="Most race wins in one night" holder={r.raceWinsNight.length ? names(r.raceWinsNight) : null}
          detail={r.raceWinsNight.length ? `${r.raceWinsNight[0].value} on ${fmtDate(r.raceWinsNight[0].date)}` : "Needs races entered race by race"} />
        <Card title="Longest cup-win streak" holder={r.winStreak.length ? names(r.winStreak) : null}
          detail={r.winStreak.length ? `${r.winStreak[0].value} cups in a row` : "Nobody has won 2 in a row yet"} />
        <Card title="Highest rating reached" holder={r.highestRating.length ? names(r.highestRating) : null}
          detail={r.highestRating.length ? fmtRating(r.highestRating[0].value) : "No ratings yet"} />
      </FactList>

      <SectionTitle title="Awards" count={over ? "Season complete" : "As things stand"} />
      <FactList columns={3}>
        {list.map((a) => {
          const f = fmtAward(a);
          return <Card key={a.key} title={a.title} holder={f.holder} detail={f.detail || a.blurb} />;
        })}
      </FactList>
      <Typography sx={{ color: colors.muted, mt: 2, fontSize: "0.9375rem" }}>
        {list.map((a) => `${a.title}: ${a.blurb.toLowerCase()}.`).join(" ")}
      </Typography>
    </Container>
  );
}
