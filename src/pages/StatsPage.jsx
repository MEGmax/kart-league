// Stats: the league in numbers, tracks (table, chaos index, coverage), characters, and everyone who has
// signed up (members only). League stats follow the season picker; the member list is everyone.
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
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
import CharacterChip from "../components/CharacterChip";
import { colors, fontData } from "../theme";
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

function Tile({ label, value }) {
  return (
    <Paper sx={{ p: 2, borderLeft: `3px solid ${colors.hot}`, minWidth: 0 }}>
      <Typography variant="overline" sx={{ color: colors.muted, lineHeight: 1.4, display: "block" }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: fontData, fontWeight: 600, fontSize: "1.7rem", lineHeight: 1.2, mt: 0.25 }}>
        {value == null ? <Skeleton width={40} /> : value}
      </Typography>
    </Paper>
  );
}

const ROLE = { owner: ["Owner", colors.gold], admin: ["Admin", colors.cool] };

function MemberCard({ member, num, season, href }) {
  const role = ROLE[member.role];
  return (
    <Paper
      sx={{
        p: 1.75, display: "flex", gap: 1.5, alignItems: "center", minWidth: 0,
        borderLeft: `3px solid ${member.color || colors.line}`,
        ...(member.me ? { boxShadow: `inset 0 0 0 1px ${colors.accent}55` } : null),
      }}
    >
      {member.character
        ? <CharacterFace name={member.character} size={48} ring={member.color} />
        : <PlayerDot name={member.name} color={member.color} size={48} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, minWidth: 0 }} noWrap>{member.name}</Typography>
          {member.me && <Chip size="small" label="You" sx={{ height: 20, fontWeight: 700, bgcolor: colors.accent, color: colors.accentInk }} />}
          {role && <Chip size="small" variant="outlined" label={role[0]} sx={{ height: 20, fontWeight: 700, color: role[1], borderColor: role[1] }} />}
        </Stack>
        <Typography variant="body2" sx={{ color: colors.muted }} noWrap>
          Joined {fmtDay(member.joinedAt)} · <Box component="span" sx={{ fontFamily: fontData }}>#{num}</Box>
        </Typography>
        {season && season.cp > 0 ? (
          <Typography variant="body2" sx={{ mt: 0.25 }} noWrap>
            Racing as{" "}
            <Box component={RouterLink} to={href} sx={{ color: colors.cool, fontWeight: 700, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              {season.player.name}
            </Box>
            <Box component="span" sx={{ color: colors.muted }}>
              {" · "}{season.rating != null ? `rating ${Math.round(season.rating)}` : pctTxt(season.pct)} · {plural(season.cp, "cup")}{season.wins ? ` · ${plural(season.wins, "cup win")}` : ""}
            </Box>
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ mt: 0.25, color: colors.muted }} noWrap>
            {season ? `Racing as ${season.player.name} · no cups yet` : "Hasn't raced yet"}
          </Typography>
        )}
        {member.tracks.length > 0 && (
          <Typography variant="caption" sx={{ color: colors.muted, display: "block" }} noWrap>
            Loves {member.tracks.join(", ")}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function Members({ m, players, members, error, missing }) {
  const { user, isAdmin, ready } = useAuth();

  if (!user) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>Sign in to see who's signed up.</Typography>
        <Typography variant="body2" sx={{ color: colors.muted, mb: 2 }}>The member list is for league members only.</Typography>
        {ready && <Button variant="contained" component={RouterLink} to="/account">Sign in</Button>}
      </Paper>
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
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={84} />)}
      </Box>
    );
  }
  // Newest first, numbered in the order people joined.
  const list = members.map((x, i) => ({ ...x, num: i + 1 })).reverse();
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
      {list.map((x) => {
        const season = x.playerId ? m.byId.get(x.playerId) : null;
        const href = season ? `/standings/${encodeURIComponent(playerSlug(players, season.player))}` : null;
        return <MemberCard key={x.num} member={x} num={x.num} season={season} href={href} />;
      })}
    </Box>
  );
}

// A compact table: header row plus rows, scrolling sideways on a phone if it must.
function Table({ cols, head, rows, label }) {
  const cell = { py: 0.9, px: 1, borderBottom: `1px solid ${colors.line}`, minWidth: 0, display: "flex", alignItems: "center" };
  return (
    <Paper sx={{ px: 1, py: 0.5, overflowX: "auto" }} role="table" aria-label={label}>
      <Box sx={{ display: "grid", gridTemplateColumns: cols, minWidth: 480 }}>
        {head.map((h, i) => (
          <Box key={"h" + i} role="columnheader" sx={{ ...cell, color: colors.muted, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", justifyContent: i ? "flex-end" : "flex-start" }}>{h}</Box>
        ))}
        {rows.map((r, k) => r.map((v, i) => (
          <Box key={k + "-" + i} role="cell" sx={{ ...cell, justifyContent: i ? "flex-end" : "flex-start", fontFamily: i ? fontData : "inherit", fontSize: "0.875rem", borderBottom: k === rows.length - 1 ? "none" : cell.borderBottom }}>{v}</Box>
        )))}
      </Box>
    </Paper>
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
            <TrackImage track={x.track} width={40} radius={0.75} />
            <Typography variant="body2" noWrap>{x.track}</Typography>
          </Stack>,
          x.times,
          x.avgWin != null ? x.avgWin.toFixed(1) : "–",
          x.chaos != null ? x.chaos.toFixed(1) : "–",
          fmtDate(x.last),
        ])}
      />
      <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>
        Avg win: the best league player's points per race there. Chaos: how many places finishes there stray from each racer's usual place
        {chaotic ? ` (most chaotic so far: ${chaotic.track})` : ""}. Both need races entered race by race.
      </Typography>
      {coverage.unraced.length > 0 && (
        <Typography variant="body2" sx={{ mt: 1 }}>
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
        rows={list.map((c) => [<CharacterChip key="c" name={c.name} />, Math.round(c.picks / 4), c.cupWins, pctTxt(c.max ? c.pts / c.max : 0)])}
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
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" } }}>
        <Tile label="Accounts" value={members ? members.length : user && !missing && !error ? null : "—"} />
        <Tile label="Racers" value={t.racers} />
        <Tile label="Cup nights" value={t.nights} />
        <Tile label="Cups raced" value={t.cups} />
        <Tile label="Races" value={t.races} />
        <Tile label="Tracks raced" value={t.tracks.length} />
      </Box>

      <SectionTitle title="Signed up" count={user && members ? plural(members.length, "account") : null} />
      <Members m={m} players={state.players} members={members} error={error} missing={missing} />

      {t.tracks.length > 0 && (
        <>
          <SectionTitle title="Most raced tracks" count={`of ${plural(t.cups, "cup")}`} />
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" } }}>
            {t.tracks.slice(0, 6).map((x) => (
              <TrackImage key={x.track} track={x.track} label caption={plural(x.n, "time")} />
            ))}
          </Box>
        </>
      )}
      <TrackSection m={m} />
      <CharacterSection m={m} />
    </Container>
  );
}
