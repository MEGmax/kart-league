import { useMemo } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { compute, playerFromSlug, playerSlug } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { charColor, ord, pctTxt } from "../lib/constants";
import { nextEvent } from "../lib/events";
import { colors, fontDisplay } from "../theme";
import Hero from "../components/Hero";
import CharacterFace from "../components/CharacterFace";
import CharacterChip from "../components/CharacterChip";
import NextCupNight from "../components/NextCupNight";
import RacerDrawer from "../components/RacerDrawer";
import { Loading, PageTitle, SectionTitle, plural } from "../components/PageBits";

const MEDAL = { 1: colors.gold, 2: colors.silver, 3: colors.bronze };

// Rows and podium spots are links (to #/standings/<name>), so they work from the keyboard and can be shared.
const linkReset = {
  color: "inherit", textDecoration: "none", borderRadius: 2, outline: "none",
  "&:focus-visible": { boxShadow: `0 0 0 2px ${colors.accent}` },
};

function names(list) {
  return list.length <= 2 ? list.join(" & ") : `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
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
      <LinearProgress variant="determinate" value={value} sx={{ gridArea: "bar", height: 8, "& .MuiLinearProgress-bar": { bgcolor: color } }} />
      <Typography variant="body2" sx={{ gridArea: "text", color: colors.muted, whiteSpace: "nowrap", textAlign: "right" }}>{label}</Typography>
    </Box>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <Paper sx={{ p: 2, pl: 2.25, flex: 1, minWidth: 160, borderLeft: `3px solid ${colors.hot}` }}>
      <Typography variant="overline" sx={{ color: colors.muted, lineHeight: 1.4, display: "block" }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontFamily: "inherit", fontWeight: 800, mt: 0.5 }}>{value}</Typography>
      <Typography variant="body2" sx={{ color: colors.muted }}>{sub}</Typography>
    </Paper>
  );
}

// 2nd, 1st, 3rd in one row at every width (smaller on phones).
function Podium({ ranked, hrefOf }) {
  const top = ranked.slice(0, 3);
  if (top.length < 2) return null;
  const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
  const heights = { 1: { xs: 88, sm: 118 }, 2: { xs: 66, sm: 88 }, 3: { xs: 50, sm: 66 } };
  return (
    <Stack direction="row" spacing={{ xs: 1, sm: 2 }} justifyContent="center" alignItems="flex-end" sx={{ mb: 3 }} aria-label="Top three">
      {order.map((s) => (
        <Box
          key={s.player.id} component={RouterLink} to={hrefOf(s.player)}
          aria-label={`${s.rank}${ord(s.rank)}: ${s.player.name}, ${pctTxt(s.pct)}. Open their season`}
          sx={{ ...linkReset, textAlign: "center", width: { xs: "31%", sm: 140 }, maxWidth: 140, minWidth: 0 }}
        >
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Box sx={{ display: { xs: "block", sm: "none" } }}><CharacterFace name={s.main && s.main.name} ring={s.player.color} size={44} /></Box>
            <Box sx={{ display: { xs: "none", sm: "block" } }}><CharacterFace name={s.main && s.main.name} ring={s.player.color} size={56} /></Box>
          </Box>
          <Typography sx={{ fontWeight: 700, mt: 0.5, fontSize: { xs: "0.85rem", sm: "1rem" } }} noWrap>{s.player.name}</Typography>
          {s.main && <Typography variant="caption" noWrap component="div" sx={{ color: colors.muted }}>{s.main.name}</Typography>}
          <Box
            sx={{
              mt: 1, height: heights[s.rank] || { xs: 44, sm: 60 }, borderRadius: "10px 10px 0 0",
              background: `linear-gradient(180deg, ${MEDAL[s.rank] || colors.line}55, ${colors.panel} 85%)`,
              border: `1px solid ${colors.line}`, borderTop: `3px solid ${MEDAL[s.rank] || colors.line}`,
              display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            }}
          >
            <Typography sx={{ fontFamily: fontDisplay, fontSize: { xs: "1.05rem", sm: "1.3rem" }, color: MEDAL[s.rank] || colors.ink, transform: "skewX(-7deg)" }}>
              {s.rank}<sup style={{ fontSize: "0.5em" }}>{ord(s.rank)}</sup>
            </Typography>
            <Typography variant="body2" sx={{ color: colors.muted, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}>{pctTxt(s.pct)}</Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

// Rank in a skewed tag: medal colors for the podium, plain for everyone else.
function RankBadge({ rank }) {
  const medal = MEDAL[rank];
  return (
    <Box
      aria-hidden
      sx={{
        width: { xs: 30, sm: 38 }, height: { xs: 30, sm: 38 }, display: "grid", placeItems: "center",
        borderRadius: "8px", transform: "skewX(-8deg)",
        bgcolor: medal || (rank ? colors.panel2 : "transparent"), color: medal ? "#14100A" : rank ? colors.ink : colors.muted,
        border: medal ? "none" : `1px solid ${rank ? colors.line : "transparent"}`,
      }}
    >
      <Box component="span" sx={{ transform: "skewX(8deg)", fontWeight: 800, fontSize: { xs: "0.85rem", sm: "1rem" } }}>{rank || "–"}</Box>
    </Box>
  );
}

function BoardRow({ s, rank, href }) {
  const p = s.player;
  const facts = `${s.pts}/${s.max} pts · ${plural(s.cp, "cup")} · ${plural(s.wins, "cup win")}`;
  return (
    <Box
      component={RouterLink} to={href}
      aria-label={`${rank ? `${rank}${ord(rank)}` : "Not yet ranked"}: ${p.name}, ${pctTxt(s.pct)}, ${facts}. Open their season`}
      sx={{
        ...linkReset, display: "grid", alignItems: "center", columnGap: 2, rowGap: 1,
        gridTemplateColumns: { xs: "32px minmax(0,1fr)", sm: "48px minmax(0,1fr) auto" },
        p: 1.5, "&:hover": { bgcolor: colors.panel2 },
      }}
    >
      <RankBadge rank={rank} />
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <CharacterFace name={s.main && s.main.name} ring={p.color} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>{p.name}</Typography>
          <Typography variant="caption" sx={{ color: colors.muted }}>{s.main ? s.main.name : "No character yet"}</Typography>
        </Box>
      </Stack>
      <Stack sx={{ minWidth: { sm: 190 }, gridColumn: { xs: "2", sm: "auto" }, textAlign: { xs: "left", sm: "right" } }}>
        <Typography sx={{ fontWeight: 800 }}>{pctTxt(s.pct)}</Typography>
        <LinearProgress variant="determinate" value={Math.min(100, s.pct * 100)} sx={{ height: 6, my: 0.5, "& .MuiLinearProgress-bar": { bgcolor: p.color } }} />
        <Typography variant="caption" sx={{ color: colors.muted }}>{facts}</Typography>
      </Stack>
    </Box>
  );
}

function CharacterChart({ chars }) {
  const top = chars.slice(0, 10);
  if (!top.length) return null;
  const most = top[0].picks;
  return (
    <Box>
      <SectionTitle title="Most picked characters" count="By race: a cup entered from its totals counts as 4 races with that character" />
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          {top.map((c) => (
            <BarRow
              key={c.name}
              name={c.name}
              value={(c.picks / most) * 100}
              color={charColor(c.name)}
              label={`${plural(c.picks, "race")} · ${pctTxt(c.pts / c.max)} avg · ${plural(c.cupWins, "cup win")}`}
            />
          ))}
        </Stack>
      </Paper>
      <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 1 }}>
        A cup win counts for the character used most in that cup.
      </Typography>
    </Box>
  );
}

export default function StandingsPage() {
  const { state, events, loadError } = useLeagueData();
  const { isAdmin } = useAuth();
  const { player: slug } = useParams();
  const navigate = useNavigate();

  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const m = useMemo(() => (st ? compute(st) : null), [st]);

  if (!state) return <Loading error={loadError} />;

  const L = st.league;
  const hrefOf = (p) => `/standings/${encodeURIComponent(playerSlug(st.players, p))}`;
  const chosen = slug ? playerFromSlug(st.players, slug) : null;
  const selected = chosen && m.byId.get(chosen.id);

  const everyone = m.ranked.concat(m.unranked);
  const topWins = everyone.length ? Math.max(...everyone.map((s) => s.wins)) : 0;
  const winLeaders = everyone.filter((s) => s.wins === topWins).map((s) => s.player.name);
  const topPicks = m.chars.length ? m.chars[0].picks : 0;
  const charLeaders = m.chars.filter((c) => c.picks === topPicks);

  return (
    <>
      <Hero league={L} plan={m.plan} next={events ? nextEvent(events) : null} />
      <Container maxWidth="lg" sx={{ pt: 3 }}>
        <Box sx={{ mb: 4 }}><NextCupNight /></Box>
        {demo && (
          <Alert severity="info" sx={{ mb: 3 }} action={isAdmin ? <Button color="inherit" size="small" href="#/build">Build the first cup</Button> : null}>
            <b>Example standings.</b> These made-up results show how the site works. They disappear when the first real cup is added.
          </Alert>
        )}
        <Podium ranked={m.ranked} hrefOf={hrefOf} />
        {m.ranked.length > 0 && (
          <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 4, flexWrap: "wrap" }}>
            <StatTile
              label="Most cup wins"
              value={topWins ? names(winLeaders) : "None yet"}
              sub={topWins ? `${plural(topWins, "cup win")}${winLeaders.length > 1 ? " each · tied" : ""}` : ""}
            />
            <StatTile
              label="Most picked character"
              value={charLeaders.length ? names(charLeaders.map((c) => c.name)) : "–"}
              sub={charLeaders.length > 1
                ? `${plural(topPicks, "race")} each · tied`
                : charLeaders.length ? `${plural(topPicks, "race")} · ${pctTxt(charLeaders[0].pts / charLeaders[0].max)} avg` : ""}
            />
            <StatTile label="Qualifying mark" value={plural(m.need, "cup")} sub={`${L.minParticipation}% of cups played so far`} />
          </Stack>
        )}

        <PageTitle title="Standings" sub={`Ranked by points percentage · top ${L.playoffSpots} make the playoffs`} />
        {!m.ranked.length ? (
          <Paper sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>No qualified players yet.</Typography>
            <Typography variant="body2" sx={{ color: colors.muted }}>Players appear here once they have played {m.need} cups.</Typography>
          </Paper>
        ) : (
          <Paper sx={{ p: 1 }} component="nav" aria-label="Standings">
            <Stack divider={<Divider />}>
              {m.ranked.map((s, i) => (
                <Box key={s.player.id}>
                  <BoardRow s={s} rank={s.rank} href={hrefOf(s.player)} />
                  {i === L.playoffSpots - 1 && m.ranked.length > L.playoffSpots && (
                    <Divider sx={{ "&::before, &::after": { borderTop: `2px dashed ${colors.hot}` } }}>
                      <Typography variant="overline" sx={{ px: 1, color: colors.hot, lineHeight: 1 }}>Playoff line</Typography>
                    </Divider>
                  )}
                </Box>
              ))}
            </Stack>
          </Paper>
        )}

        {m.unranked.length > 0 && (
          <>
            <SectionTitle title="Not yet qualified" count={`Need ${plural(m.need, "cup")} to be ranked`} />
            <Paper sx={{ p: 1 }} component="nav" aria-label="Not yet qualified">
              <Stack divider={<Divider />}>
                {m.unranked.map((s) => <BoardRow key={s.player.id} s={s} rank={null} href={hrefOf(s.player)} />)}
              </Stack>
            </Paper>
          </>
        )}

        {m.ranked.length > 0 && (
          <Typography variant="body2" sx={{ color: colors.muted, mt: 2 }}>Pick a racer for their season: every cup, tracks, head-to-heads and characters.</Typography>
        )}

        {m.chars.length > 0 && <CharacterChart chars={m.chars} />}
      </Container>
      <RacerDrawer s={selected && selected.cp ? selected : null} m={m} players={st.players} onClose={() => navigate("/standings")} />
    </>
  );
}
