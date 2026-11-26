import { useMemo } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { useLeagueData } from "../context/LeagueDataContext";
import { useAuth } from "../context/AuthContext";
import { compute, playerFromSlug, playerSlug } from "../lib/standings";
import { DEMO } from "../lib/demo";
import { fmtDate, ord, pctTxt } from "../lib/constants";
import { formatEventWhen, nextEvent } from "../lib/events";
import { colors } from "../theme";
import Hero from "../components/Hero";
import CharacterFace from "../components/CharacterFace";
import RacerDrawer from "../components/RacerDrawer";
import { ProvisionalBadge, RatingDelta, fmtRating } from "../components/RatingBits";
import { Fact, FactList, Loading, PageTitle, plural } from "../components/PageBits";

// Medal colours live here and nowhere else on the site.
const MEDAL = { 1: colors.gold, 2: colors.silver, 3: colors.bronze };

// Rows and podium spots are links (to #/standings/<name>), so they work from the keyboard and can be shared.
const linkReset = {
  color: "inherit", textDecoration: "none", outline: "none",
  "&:focus-visible": { boxShadow: `inset 0 0 0 2px ${colors.gold}` },
};

function names(list) {
  return list.length <= 2 ? list.join(" & ") : `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

// The number a row is ranked by: the rating (Season 2 on) or the points percentage.
function headline(s, rankBy) {
  return rankBy === "rating" ? fmtRating(s.rating) : pctTxt(s.pct);
}

// 2nd, 1st, 3rd on flat steps. Compact, so the table below stays the main thing.
function Podium({ ranked, hrefOf, rankBy }) {
  const top = ranked.slice(0, 3);
  if (top.length < 2) return null;
  const order = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];
  const step = { 1: 56, 2: 42, 3: 32 };
  return (
    <Box aria-label="Top three" sx={{ display: "grid", gridTemplateColumns: `repeat(${order.length}, minmax(0,1fr))`, gap: 1, alignItems: "end", maxWidth: 420, mx: "auto", mt: 3 }}>
      {order.map((s) => (
        <Box
          key={s.player.id} component={RouterLink} to={hrefOf(s.player)}
          aria-label={`${s.rank}${ord(s.rank)}: ${s.player.name}, ${rankBy === "rating" ? "rating " : ""}${headline(s, rankBy)}. Open their season`}
          sx={{ ...linkReset, textAlign: "center", minWidth: 0, borderRadius: 1, "&:hover .nm": { textDecoration: "underline" } }}
        >
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <CharacterFace name={s.main && s.main.name} size={s.rank === 1 ? 60 : 48} />
          </Box>
          <Typography className="nm" noWrap sx={{ fontWeight: 700, mt: 0.5 }}>{s.player.name}</Typography>
          <Typography sx={{ color: colors.muted, fontSize: "0.9375rem" }}>{headline(s, rankBy)}</Typography>
          <Box sx={{
            mt: 0.75, height: step[s.rank] || 32, bgcolor: colors.raised, borderTop: `3px solid ${MEDAL[s.rank] || colors.rule}`,
            display: "grid", placeItems: "center", color: MEDAL[s.rank] || colors.ink, fontWeight: 800, fontStyle: "italic", fontSize: "1.375rem",
          }}>
            {s.rank}{ord(s.rank)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// Column layout shared by the header and every row. Phones: rank, racer, rating. Desktop adds real columns.
const COLS = {
  display: "grid", alignItems: "center", columnGap: { xs: 1.5, md: 2 },
  gridTemplateColumns: { xs: "32px minmax(0,1fr) auto", md: "40px minmax(0,1fr) 64px 48px 72px 88px 80px" },
};
const wide = { display: { xs: "none", md: "block" }, textAlign: "right" };

function columnsFor(rating) {
  return rating ? ["Cups", "Wins", "Points", "Last night", "Rating"] : ["Cups", "Wins", "Points", "Rating", "Points %"];
}

function HeaderRow({ rating }) {
  const cols = columnsFor(rating);
  return (
    <Box aria-hidden sx={{ ...COLS, py: 1, borderBottom: `2px solid ${colors.rule}`, color: colors.muted, fontSize: "0.875rem", fontWeight: 600 }}>
      <Box sx={{ gridColumn: "1 / 3" }}>Racer</Box>
      {cols.slice(0, 4).map((c) => <Box key={c} sx={wide}>{c}</Box>)}
      <Box sx={{ textAlign: "right" }}>{cols[4]}</Box>
    </Box>
  );
}

function BoardRow({ s, rank, href, m }) {
  const p = s.player;
  const rating = m.rankBy === "rating";
  const att = s.attendance;
  const meta = `${att.played} of ${att.held} cups · ${plural(s.wins, "win")}`;
  const out = rank == null;
  const num = { ...wide, fontSize: "1.0625rem", fontWeight: 500, color: out ? colors.muted : colors.ink };
  return (
    <Box
      component={RouterLink} to={href}
      aria-label={`${rank ? `${rank}${ord(rank)}` : "Not yet ranked"}: ${p.name}, ${rating ? `rating ${fmtRating(s.rating)}${s.provisional ? " (provisional)" : ""}` : pctTxt(s.pct)}, ${meta}. Open their season`}
      sx={{ ...linkReset, ...COLS, minHeight: 64, py: 1, borderBottom: `1px solid ${colors.line}`, "&:hover": { bgcolor: colors.hover } }}
    >
      <Box sx={{ fontWeight: 800, fontStyle: "italic", fontSize: "1.625rem", lineHeight: 1, color: rank === 1 ? colors.gold : out ? colors.muted : colors.ink }}>
        {rank || "–"}
      </Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <CharacterFace name={s.main && s.main.name} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.25 }}>{p.name}</Typography>
            {rating && s.provisional && <ProvisionalBadge cups={m.rated.cfg.provisional} />}
          </Stack>
          <Typography noWrap sx={{ display: { md: "none" }, color: colors.muted, fontSize: "0.875rem", fontWeight: 500 }}>{meta}</Typography>
        </Box>
      </Stack>
      <Box sx={num}>{att.played}/{att.held}</Box>
      <Box sx={num}>{s.wins}</Box>
      {rating ? (
        <>
          <Box sx={num}>{pctTxt(s.pct)}</Box>
          <Box sx={num}>{s.ratingDelta == null ? <Box component="span" sx={{ color: colors.muted }}>–</Box> : <RatingDelta delta={s.ratingDelta} sx={{ fontSize: "1rem" }} />}</Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography sx={{ fontWeight: 700, fontSize: "1.375rem", lineHeight: 1.1, color: out ? colors.muted : colors.ink }}>{fmtRating(s.rating)}</Typography>
            <Box sx={{ display: { md: "none" }, lineHeight: 1 }}><RatingDelta delta={s.ratingDelta} /></Box>
          </Box>
        </>
      ) : (
        <>
          <Box sx={num}>{s.pts}/{s.max}</Box>
          <Box sx={num}>{s.rating != null ? fmtRating(s.rating) : "–"}</Box>
          <Typography sx={{ textAlign: "right", fontWeight: 700, fontSize: "1.375rem", color: out ? colors.muted : colors.ink }}>{pctTxt(s.pct)}</Typography>
        </>
      )}
    </Box>
  );
}

// The playoff cut-off: a solid red rule across the table.
function PlayoffLine() {
  return (
    <Box role="separator" aria-label="Playoff line" sx={{ borderBottom: `2px solid ${colors.red}`, textAlign: "right", pt: 0.75, pb: 0.5 }}>
      <Typography component="span" sx={{ color: colors.red, fontSize: "0.875rem", fontWeight: 700 }}>Playoff line</Typography>
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
  const next = events ? nextEvent(events) : null;
  const hrefOf = (p) => `/standings/${encodeURIComponent(playerSlug(st.players, p))}`;
  const chosen = slug ? playerFromSlug(st.players, slug) : null;
  const selected = chosen && m.byId.get(chosen.id);

  const everyone = m.ranked.concat(m.unranked);
  const topWins = everyone.length ? Math.max(...everyone.map((s) => s.wins)) : 0;
  const winLeaders = everyone.filter((s) => s.wins === topWins).map((s) => s.player.name);
  const spots = L.playoffSpots;
  const rating = m.rankBy === "rating";
  const when = next ? formatEventWhen(next.startsAt) : null;

  return (
    <>
      <Hero league={L} plan={m.plan} next={next} />
      <Container maxWidth="lg">
        {demo && (
          <Alert severity="info" sx={{ mt: 3 }} action={isAdmin ? <Button color="inherit" size="small" href="#/build">Build the first cup</Button> : null}>
            <b>Example standings.</b> These made-up results show how the site works. They disappear when the first real cup is added.
          </Alert>
        )}
        <Podium ranked={m.ranked} hrefOf={hrefOf} rankBy={m.rankBy} />

        <Box sx={{ mt: 4 }}>
          <PageTitle title="Standings" sub={`By ${rating ? "skill rating" : "points percentage"} · top ${spots} make the playoffs`} />
        </Box>
        <Box sx={{ display: "grid", gap: { xs: 5, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) 280px" }, alignItems: "start" }}>
          <div>
            {!everyone.length ? (
              <Typography sx={{ color: colors.muted }}>No results yet. Players appear here after their first cup.</Typography>
            ) : (
              <Box component="nav" aria-label="Standings">
                <HeaderRow rating={rating} />
                {!m.ranked.length && (
                  <Typography sx={{ py: 2, color: colors.muted, borderBottom: `1px solid ${colors.line}` }}>
                    Nobody is ranked yet: players are ranked once they have played {plural(m.minCups, "cup")}.
                  </Typography>
                )}
                {m.ranked.map((s, i) => (
                  <Box key={s.player.id}>
                    <BoardRow s={s} rank={s.rank} href={hrefOf(s.player)} m={m} />
                    {i === spots - 1 && (m.ranked.length > spots || m.unranked.length > 0) && <PlayoffLine />}
                  </Box>
                ))}
                {m.unranked.length > 0 && (
                  <>
                    <Typography sx={{ pt: 2.5, pb: 0.75, color: colors.muted, fontSize: "0.875rem", fontWeight: 600, borderBottom: `1px solid ${colors.line}` }}>
                      Not yet qualified · {plural(m.minCups, "cup")} needed
                    </Typography>
                    {m.unranked.map((s) => <BoardRow key={s.player.id} s={s} rank={null} href={hrefOf(s.player)} m={m} />)}
                  </>
                )}
              </Box>
            )}
            {everyone.length > 0 && (
              <Typography sx={{ color: colors.muted, mt: 1.5 }}>Tap a racer for their season: every cup, tracks, head-to-heads and characters.</Typography>
            )}
          </div>

          {everyone.length > 0 && (
            <Box component="aside" aria-label="This week">
              <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.25rem", mb: 1 }}>This week</Typography>
              <FactList>
                {m.mvp && <Fact label="Weekly MVP" value={m.mvp.s.player.name} sub={`Up ${Math.round(m.mvp.delta)} on ${fmtDate(m.mvp.date)}`} />}
                <Fact
                  label="Most cup wins"
                  value={topWins ? names(winLeaders) : "Nobody yet"}
                  sub={topWins ? `${plural(topWins, "cup win")}${winLeaders.length > 1 ? " each" : ""}` : null}
                />
                <Fact
                  label="To be ranked"
                  value={`Play ${plural(m.minCups, "cup")}`}
                  sub={m.minCups > m.need ? `${L.minParticipation}% of the cups held so far, and at least ${m.minCups}` : `${L.minParticipation}% of the cups held so far`}
                />
                {when && (
                  <Fact label="Next night" value={when.date} sub={<>{when.time} · <Link component={RouterLink} to="/schedule" sx={{ color: colors.link }}>Schedule</Link></>} />
                )}
              </FactList>
            </Box>
          )}
        </Box>
      </Container>
      <RacerDrawer s={selected && selected.cp ? selected : null} m={m} players={st.players} onClose={() => navigate("/standings")} />
    </>
  );
}
