// Stats (#/stats): leaderboards for the season. Cup wins and points a cup lead the page; then top 3s, race
// wins, win streaks, best cup, best head-to-head, cups raced and last places. The two headline boards show
// the top 5, the rest the top 3 (more on a tie) and, when you're signed in and further down, your own place under them. A row opens that
// racer's season (#/standings/<name>). Numbers from playerSheet()/leaderboard() in src/lib/playerStats.js.
// Old #/rivals and #/records links land here.
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { compute, playerSlug } from "../lib/standings";
import { headToHead } from "../lib/rivals";
import { leaderboard, playerSheet } from "../lib/playerStats";
import { DEMO } from "../lib/demo";
import { fmtDate } from "../lib/constants";
import { colors } from "../theme";
import RacerFace from "../components/RacerFace";
import SeasonPicker, { useSeason } from "../components/SeasonPicker";
import { Loading, PageTitle, plural } from "../components/PageBits";

const TOP = { hero: 5, other: 3 }; // places shown on the two headline boards and on the rest
const MIN_CUPS = 3; // cups needed for points a cup
const one = (n) => (n == null ? "–" : n.toFixed(1));
const pct = (n, of) => `${Math.round((n / of) * 100)}%`;
const rec = (r) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`;
const signed = (n) => `${n > 0 ? "+" : ""}${n}`;

// Each board: what it ranks by (null leaves a racer off), the number shown, and the line under the name.
const boards = (name) => [
  { key: "wins", title: "Cup wins", hero: true,
    value: (x) => x.wins || null, shown: (x) => x.wins, sub: (x) => `${pct(x.wins, x.cups)} of ${plural(x.cups, "cup")}` },
  { key: "avg", title: "Points a cup", hero: true, note: `${MIN_CUPS}+ cups`,
    value: (x) => (x.cups >= MIN_CUPS ? x.avgPts : null), shown: (x) => one(x.avgPts), sub: (x) => `average finish ${one(x.avgFinish)}` },
  { key: "top3", title: "Top 3 finishes",
    value: (x) => x.podiums || null, shown: (x) => x.podiums, sub: (x) => `${pct(x.podiums, x.cups)} of ${plural(x.cups, "cup")}` },
  { key: "races", title: "Race wins", note: "race-by-race cups",
    value: (x) => (x.races && x.raceWins ? x.raceWins : null), shown: (x) => x.raceWins, sub: (x) => `in ${plural(x.races, "race")}` },
  { key: "streak", title: "Longest win streak",
    value: (x) => (x.winStreak >= 2 ? x.winStreak : null), shown: (x) => x.winStreak, sub: () => "cups won in a row" },
  { key: "best", title: "Best cup",
    value: (x) => (x.bestCup ? x.bestCup.pts / x.bestCup.max : null), shown: (x) => `${x.bestCup.pts}/${x.bestCup.max}`,
    sub: (x) => `${x.bestCup.cup.cup} #${x.bestCup.num}, ${fmtDate(x.bestCup.cup.date)}` },
  { key: "h2h", title: "Best head-to-head", note: "3+ cups together",
    value: (x) => (x.bestVs ? (x.bestVs.w + x.bestVs.t / 2) / x.bestVs.n : null), shown: (x) => rec(x.bestVs),
    sub: (x) => `vs ${name(x.bestVs.id)} · ${signed(x.bestVs.diff)} pts` },
  { key: "cups", title: "Cups raced",
    value: (x) => x.cups, shown: (x) => x.cups, sub: (x) => `of ${x.held} held` },
  { key: "last", title: "Last places", note: "last of the league's racers",
    value: (x) => x.lasts || null, shown: (x) => x.lasts, sub: (x) => `${pct(x.lasts, x.cups)} of ${plural(x.cups, "cup")}` },
];

function Row({ e, b, hero, me, href }) {
  const x = e.x;
  return (
    <Box
      component={RouterLink} to={href} aria-current={me ? "true" : undefined}
      sx={{
        display: "grid", gridTemplateColumns: hero ? "32px minmax(0,1fr) auto" : "26px minmax(0,1fr) auto", columnGap: 1.25,
        alignItems: "center", minHeight: hero ? 60 : 52, color: "inherit", textDecoration: "none",
        borderBottom: `1px solid ${colors.line}`, bgcolor: me ? colors.raised : "transparent", px: me ? 0.75 : 0, mx: me ? -0.75 : 0,
        "&:hover": { bgcolor: me ? colors.raised : colors.hover },
        "&:focus-visible": { outline: `2px solid ${colors.gold}`, outlineOffset: -2 },
      }}
    >
      <Box sx={{ fontWeight: 800, fontStyle: "italic", fontSize: hero ? "1.5rem" : "1.125rem", color: e.place === 1 ? colors.gold : colors.ink }}>{e.place}</Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
        <RacerFace who={e.s.player} character={e.s.main && e.s.main.name} size={hero ? 36 : 28} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: hero ? "1.125rem" : "1rem", lineHeight: 1.25 }}>
            {e.s.player.name}{me && <Box component="span" sx={{ color: colors.muted, fontWeight: 500 }}> · you</Box>}
          </Typography>
          <Typography noWrap sx={{ color: colors.muted, fontSize: "0.875rem", lineHeight: 1.3 }}>{b.sub(x)}</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: hero ? "1.5rem" : "1.125rem", textAlign: "right", whiteSpace: "nowrap" }}>{b.shown(x)}</Typography>
    </Box>
  );
}

function Board({ b, entries, myId, hrefOf }) {
  const list = leaderboard(entries, (e) => b.value(e.x));
  const top = list.filter((e) => e.place <= (b.hero ? TOP.hero : TOP.other));
  const mine = myId && !top.some((e) => e.id === myId) ? list.find((e) => e.id === myId) : null;
  return (
    <Box component="section" aria-labelledby={`board-${b.key}`} sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", columnGap: 1, flexWrap: "wrap", pb: 0.75, borderBottom: `2px solid ${colors.rule}` }}>
        <Typography id={`board-${b.key}`} component="h2" sx={{ fontWeight: 700, fontSize: b.hero ? "1.375rem" : "1.125rem" }}>{b.title}</Typography>
        {b.note && <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }}>{b.note}</Typography>}
      </Box>
      {!list.length ? (
        <Typography sx={{ color: colors.muted, py: 1.5, borderBottom: `1px solid ${colors.line}` }}>Nobody yet.</Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {top.map((e) => <li key={e.id}><Row e={e} b={b} hero={b.hero} me={e.id === myId} href={hrefOf(e)} /></li>)}
          {mine && (
            <li>
              <Typography aria-hidden sx={{ color: colors.muted, textAlign: "center", lineHeight: 1, py: 0.5, borderBottom: `1px solid ${colors.line}` }}>⋯</Typography>
              <Row e={mine} b={b} hero={b.hero} me href={hrefOf(mine)} />
            </li>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function StatsPage() {
  const { state, loadError } = useLeagueData();
  const { user } = useAuth();
  const demo = !!state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const { season, seasons, setSeason } = useSeason(st);
  const m = useMemo(() => (st ? compute(st, { season }) : null), [st, season]);
  const entries = useMemo(() => {
    if (!m) return [];
    const h = headToHead(m);
    return m.ranked.concat(m.unranked).filter((s) => s.cp > 0).map((s) => ({ id: s.player.id, s, x: playerSheet(m, h, s.player.id) }));
  }, [m]);

  if (!state) return <Loading error={loadError} />;

  const players = st.players;
  const name = (id) => (players.find((p) => p.id === id) || {}).name || "?";
  const me = user && !demo ? players.find((p) => (p.userId || p.user_id) === user.id) : null;
  const hrefOf = (e) => `/standings/${encodeURIComponent(playerSlug(players, e.s.player))}`;
  const all = boards(name);
  const props = { entries, myId: me ? me.id : null, hrefOf };

  return (
    <Container maxWidth="lg">
      <PageTitle title="Stats" sub={`Leaderboards for the season${entries.length ? `: ${plural(m.cups.length, "cup")}, ${plural(entries.length, "racer")}` : ""}. Tap a racer for their season.`} />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example league.</b> This fills in from real results once the first cup is added.</Alert>}
      <SeasonPicker season={season} seasons={seasons} setSeason={setSeason} />

      {!entries.length ? (
        <Typography sx={{ fontWeight: 700 }}>Nobody has raced this season yet.</Typography>
      ) : (
        <>
          <Box sx={{ display: "grid", gap: { xs: 5, md: 5 }, columnGap: 5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {all.filter((b) => b.hero).map((b) => <Board key={b.key} b={b} {...props} />)}
          </Box>
          <Box sx={{ mt: 6, display: "grid", rowGap: 5, columnGap: 4, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", md: "repeat(3, minmax(0,1fr))" } }}>
            {all.filter((b) => !b.hero).map((b) => <Board key={b.key} b={b} {...props} />)}
          </Box>
          <Typography sx={{ color: colors.muted, mt: 5, fontSize: "0.9375rem", maxWidth: 760 }}>
            Top 3 and last places count the league's racers only, not the computer players. A head-to-head is cups both racers raced, won by whoever
            scored more; a tie counts half.
          </Typography>
        </>
      )}
    </Container>
  );
}
