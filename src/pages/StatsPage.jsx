// Stats: the league in numbers, tracks (table, chaos index, coverage), characters, and everyone who has
// signed up (members only). League stats follow the season picker; the member list is everyone.
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { compute, playerSlug } from "../lib/standings";
import { useMembers } from "../lib/members";
import { fmtDate, fmtDay, pctTxt } from "../lib/constants";
import { leagueTracks } from "../lib/tracks";
import SeasonPicker, { useSeason } from "../components/SeasonPicker";
import { colors } from "../theme";
import CharacterFace from "../components/CharacterFace";
import TrackImage from "../components/TrackImage";
import { Loading, PageTitle, PlayerDot, SectionTitle, plural } from "../components/PageBits";

// Totals across finished cups: races (a cup is max/15 races, usually 4), nights (dates raced), tracks.
export function leagueTotals(m) {
  const tracks = {};
  let races = 0;
  const dates = new Set();
  m.cups.forEach((c) => {
    races += Math.max(1, Math.round((Number(c.max) || 60) / 15));
    if (c.date) dates.add(c.date);
    (c.maps || []).filter(Boolean).forEach((t) => { tracks[t] = (tracks[t] || 0) + 1; });
  });
  const topTracks = Object.keys(tracks)
    .map((t) => ({ track: t, n: tracks[t] }))
    .sort((a, b) => b.n - a.n || a.track.localeCompare(b.track));
  return { cups: m.cups.length, races, nights: dates.size, racers: m.ranked.length + m.unranked.length, tracks: topTracks };
}

// The league in one sentence, with the numbers in bold.
function Totals({ t, accounts }) {
  const B = ({ children }) => <Box component="b" sx={{ fontWeight: 800, color: colors.ink }}>{children}</Box>;
  return (
    <Typography sx={{ fontSize: { xs: "1.25rem", md: "1.5rem" }, lineHeight: 1.4, color: colors.muted, maxWidth: 760 }}>
      <B>{plural(t.cups, "cup")}</B> over <B>{plural(t.nights, "night")}</B>: <B>{plural(t.races, "race")}</B> on <B>{plural(t.tracks.length, "track")}</B>,
      by <B>{plural(t.racers, "racer")}</B>.{accounts != null ? <> <B>{plural(accounts, "account")}</B> signed up.</> : null}
    </Typography>
  );
}

const ROLE = { owner: "Owner", admin: "Admin" };

function MemberRow({ member, num, season, href }) {
  const role = ROLE[member.role];
  const chip = { height: 22, borderColor: colors.rule };
  return (
    <Box component="li" sx={{ py: 1.5, display: "flex", gap: 1.5, alignItems: "center", minWidth: 0, borderBottom: `1px solid ${colors.line}` }}>
      {member.character
        ? <CharacterFace name={member.character} size={40} />
        : <PlayerDot name={member.name} size={40} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, minWidth: 0 }} noWrap>{member.name}</Typography>
          {member.me && <Chip size="small" variant="outlined" label="You" sx={chip} />}
          {role && <Chip size="small" variant="outlined" label={role} sx={chip} />}
        </Stack>
        {season && season.cp > 0 ? (
          <Typography sx={{ fontSize: "0.9375rem", color: colors.muted }} noWrap>
            Racing as{" "}
            <Box component={RouterLink} to={href} sx={{ color: colors.link, fontWeight: 600 }}>{season.player.name}</Box>
            {" · "}{plural(season.cp, "cup")}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: "0.9375rem", color: colors.muted }} noWrap>
            {season ? `Racing as ${season.player.name} · no cups yet` : "Hasn't raced yet"}
          </Typography>
        )}
        <Typography sx={{ color: colors.muted, fontSize: "0.875rem" }} noWrap>
          #{num} · joined {fmtDay(member.joinedAt)}{member.tracks.length > 0 ? ` · loves ${member.tracks.join(", ")}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}

function Members({ m, players, members, error, missing }) {
  const { user, isAdmin, ready } = useAuth();

  if (!user) {
    return (
      <Box>
        <Typography sx={{ fontWeight: 700 }}>Sign in to see who's signed up.</Typography>
        <Typography sx={{ color: colors.muted, mb: 2 }}>The member list is for league members only.</Typography>
        {ready && <Button variant="contained" component={RouterLink} to="/account">Sign in</Button>}
      </Box>
    );
  }
  if (missing) {
    return isAdmin
      ? <Alert severity="info">The member list needs the latest database update: paste <code>supabase/schema.sql</code> into Supabase › SQL Editor and run it.</Alert>
      : <Alert severity="info">The member list is coming soon.</Alert>;
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!members) {
    return (
      <Box sx={{ display: "grid", gap: 1 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}
      </Box>
    );
  }
  // Newest first, numbered in the order people joined.
  const list = members.map((x, i) => ({ ...x, num: i + 1 })).reverse();
  return (
    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", columnGap: 4, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "1fr 1fr" } }}>
      {list.map((x) => {
        const season = x.playerId ? m.byId.get(x.playerId) : null;
        const href = season ? `/standings/${encodeURIComponent(playerSlug(players, season.player))}` : null;
        return <MemberRow key={x.num} member={x} num={x.num} season={season} href={href} />;
      })}
    </Box>
  );
}

// A compact table: header row plus rows, scrolling sideways on a phone if it must.
function Table({ cols, head, rows, label }) {
  const cell = { py: 1, pr: 1, minHeight: 48, borderBottom: `1px solid ${colors.line}`, minWidth: 0, display: "flex", alignItems: "center" };
  return (
    <Box sx={{ overflowX: "auto" }} role="table" aria-label={label}>
      <Box sx={{ display: "grid", gridTemplateColumns: cols, minWidth: 480 }}>
        {head.map((h, i) => (
          <Box key={"h" + i} role="columnheader" sx={{ ...cell, minHeight: 0, color: colors.muted, fontSize: "0.875rem", fontWeight: 600, borderBottom: `2px solid ${colors.rule}`, justifyContent: i ? "flex-end" : "flex-start" }}>{h}</Box>
        ))}
        {rows.map((r, k) => r.map((v, i) => (
          <Box key={k + "-" + i} role="cell" sx={{ ...cell, justifyContent: i ? "flex-end" : "flex-start" }}>{v}</Box>
        )))}
      </Box>
    </Box>
  );
}

function TrackSection({ m }) {
  const lt = useMemo(() => leagueTracks(m), [m]);
  if (!lt.tracks.length) return null;
  const { coverage } = lt;
  const chaotic = lt.tracks.filter((x) => x.chaos != null && x.races >= 2).sort((a, b) => b.chaos - a.chaos)[0];
  return (
    <>
      <SectionTitle title="Tracks" count={`${coverage.raced} of ${coverage.total} raced`} />
      <Table
        label="Track table"
        cols="minmax(170px,2fr) repeat(4, minmax(64px,1fr))"
        head={["Track", "Cups", "Avg win", "Chaos", "Last raced"]}
        rows={lt.tracks.map((x) => [
          <Stack key="t" direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <TrackImage track={x.track} width={48} radius={0.5} />
            <Typography noWrap sx={{ fontWeight: 600 }}>{x.track}</Typography>
          </Stack>,
          x.times,
          x.avgWin != null ? x.avgWin.toFixed(1) : "–",
          x.chaos != null ? x.chaos.toFixed(1) : "–",
          fmtDate(x.last),
        ])}
      />
      <Typography sx={{ color: colors.muted, mt: 1.5, fontSize: "0.9375rem" }}>
        Avg win: the best league player's points per race there. Chaos: how many places finishes there stray from each racer's usual place
        {chaotic ? ` (most chaotic so far: ${chaotic.track})` : ""}. Both need races entered race by race.
      </Typography>
      {coverage.unraced.length > 0 && (
        <Typography sx={{ mt: 1, fontSize: "0.9375rem" }}>
          <b>Not raced yet:</b> {coverage.unraced.join(", ")}.
        </Typography>
      )}
    </>
  );
}

// Characters picked for 4+ cups (16 races): cup wins and points percentage.
function CharacterSection({ m }) {
  const list = m.chars.filter((c) => c.picks >= 16).sort((a, b) => b.cupWins - a.cupWins || b.pts / (b.max || 1) - a.pts / (a.max || 1));
  if (!list.length) return null;
  return (
    <>
      <SectionTitle title="Characters" count="4+ cups" />
      <Table
        label="Character win rates"
        cols="minmax(160px,2fr) repeat(3, minmax(72px,1fr))"
        head={["Character", "Cups", "Cup wins", "Points %"]}
        rows={list.map((c) => [<Stack key="c" direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}><CharacterFace name={c.name} size={28} /><Typography noWrap sx={{ fontWeight: 600 }}>{c.name}</Typography></Stack>, Math.round(c.picks / 4), c.cupWins, pctTxt(c.max ? c.pts / c.max : 0)])}
      />
    </>
  );
}

export default function StatsPage() {
  const { state, loadError } = useLeagueData();
  const { user } = useAuth();
  const { members, error, missing } = useMembers();
  const { season, seasons, setSeason } = useSeason(state);
  const m = useMemo(() => (state ? compute(state, { season }) : null), [state, season]);
  const t = useMemo(() => (m ? leagueTotals(m) : null), [m]);

  if (!state) return <Loading error={loadError} />;

  return (
    <Container maxWidth="lg">
      <PageTitle title="Stats" sub="The league in numbers, and everyone who's signed up." />
      <SeasonPicker season={season} seasons={seasons} setSeason={setSeason} />
      <Totals t={t} accounts={members ? members.length : null} />

      {t.tracks.length > 0 && (
        <>
          <SectionTitle title="Most raced tracks" count={`of ${plural(t.cups, "cup")}`} />
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" } }}>
            {t.tracks.slice(0, 6).map((x) => (
              <TrackImage key={x.track} track={x.track} label caption={plural(x.n, "time")} />
            ))}
          </Box>
        </>
      )}
      <TrackSection m={m} />
      <CharacterSection m={m} />

      <SectionTitle title="Signed up" count={user && members ? plural(members.length, "account") : null} />
      <Members m={m} players={state.players} members={members} error={error} missing={missing} />
    </Container>
  );
}
