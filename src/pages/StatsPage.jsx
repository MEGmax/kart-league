// Stats: the league in numbers, the most-raced tracks, and everyone who has signed up (members only).
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
import { fmtDay, pctTxt } from "../lib/constants";
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
              {" · "}{plural(season.cp, "cup")} · {pctTxt(season.pct)}{season.wins ? ` · ${plural(season.wins, "cup win")}` : ""}
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

export default function StatsPage() {
  const { state, loadError } = useLeagueData();
  const { user } = useAuth();
  const { members, error, missing } = useMembers();
  const m = useMemo(() => (state ? compute(state) : null), [state]);
  const t = useMemo(() => (m ? leagueTotals(m) : null), [m]);

  if (!state) return <Loading error={loadError} />;

  return (
    <Container maxWidth="lg">
      <PageTitle title="Stats" sub="The league in numbers, and everyone who's signed up." />
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
    </Container>
  );
}
