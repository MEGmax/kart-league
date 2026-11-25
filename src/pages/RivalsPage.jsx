// Rivals (#/rivals): the rivalry of the season, every pair's head-to-head record, and upsets.
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute, playerSlug } from "../lib/standings";
import { headToHead, rivalry } from "../lib/rivals";
import { DEMO } from "../lib/demo";
import { fmtDate } from "../lib/constants";
import { colors, fontData } from "../theme";
import CharacterFace from "../components/CharacterFace";
import SeasonPicker, { useSeason } from "../components/SeasonPicker";
import { Loading, PageTitle, SectionTitle, plural } from "../components/PageBits";

function record(r) {
  return `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`;
}

export default function RivalsPage() {
  const { state, loadError } = useLeagueData();
  const demo = state && state.cups.length === 0;
  const st = demo ? DEMO : state;
  const { season, seasons, setSeason } = useSeason(st);
  const m = useMemo(() => (st ? compute(st, { season }) : null), [st, season]);
  const h = useMemo(() => (m ? headToHead(m) : null), [m]);
  if (!state) return <Loading error={loadError} />;

  const rows = m.ranked.concat(m.unranked).filter((s) => s.cp > 0);
  const name = (id) => (st.players.find((p) => p.id === id) || {}).name || "?";
  const href = (id) => `/standings/${encodeURIComponent(playerSlug(st.players, st.players.find((p) => p.id === id) || { id }))}`;
  const rival = rivalry(h);
  const cupNum = (id) => (m.cupInfo.get(id) || {}).num;

  return (
    <Container maxWidth="lg" sx={{ pt: 1 }}>
      <PageTitle title="Rivals" sub="Head to head: who beats whom in the cups they both race." />
      {demo && <Alert severity="info" sx={{ mb: 2 }}><b>Example league.</b> This fills in from real results once the first cup is added.</Alert>}
      <SeasonPicker season={season} seasons={seasons} setSeason={setSeason} />

      {rival ? (
        <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 1, borderLeft: `3px solid ${colors.hot}` }}>
          <Typography variant="overline" sx={{ color: colors.muted, lineHeight: 1.4 }}>Rivalry of the season</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
            {[rival.a, rival.b].map((id, i) => {
              const s = m.byId.get(id);
              return (
                <Stack key={id} direction="row" spacing={1} alignItems="center">
                  {i === 1 && <Typography sx={{ color: colors.muted, fontWeight: 700, mr: 1 }}>vs</Typography>}
                  <CharacterFace name={s && s.main && s.main.name} ring={s && s.player.color} size={36} />
                  <Typography component={RouterLink} to={href(id)} sx={{ fontWeight: 800, fontSize: "1.15rem", color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>{name(id)}</Typography>
                </Stack>
              );
            })}
          </Stack>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {record(rival)} in {plural(rival.n, "cup")} together, {rival.diff ? `${name(rival.a)} +${rival.diff} points` : "dead level on points"}.
          </Typography>
        </Paper>
      ) : (
        <Typography variant="body2" sx={{ color: colors.muted }}>The rivalry of the season appears once a pair has met in 6 cups.</Typography>
      )}

      {rows.length > 1 && (
        <>
          <SectionTitle title="Head-to-head grid" count="row player's record vs the column" />
          <Paper sx={{ p: 1, overflowX: "auto" }}>
            <Box component="table" sx={{ borderCollapse: "collapse", minWidth: "100%", "& th, & td": { p: 1, textAlign: "center", borderBottom: `1px solid ${colors.line}`, whiteSpace: "nowrap" }, "& tbody tr:last-of-type td, & tbody tr:last-of-type th": { borderBottom: "none" } }}>
              <thead>
                <tr>
                  <th aria-label="Player" />
                  {rows.map((c) => <Box component="th" key={c.player.id} scope="col" sx={{ fontSize: "0.8rem", color: colors.muted, fontWeight: 700 }}>{c.player.name}</Box>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.player.id}>
                    <Box component="th" scope="row" sx={{ textAlign: "left !important", fontWeight: 700 }}>{r.player.name}</Box>
                    {rows.map((c) => {
                      if (c === r) return <Box component="td" key={c.player.id} sx={{ color: colors.line }}>—</Box>;
                      const x = h.get(r.player.id, c.player.id);
                      if (!x) return <Box component="td" key={c.player.id} sx={{ color: colors.muted }}>·</Box>;
                      return (
                        <Box component="td" key={c.player.id} title={`${r.player.name} vs ${c.player.name}: ${record(x)}, ${x.diff > 0 ? "+" : ""}${x.diff} points over ${plural(x.n, "cup")}`}
                          sx={{ bgcolor: x.w > x.l ? `${colors.good}22` : x.w < x.l ? `${colors.bad}22` : "transparent" }}>
                          <Typography variant="body2" sx={{ fontFamily: fontData, fontWeight: 700 }}>{record(x)}</Typography>
                          <Typography variant="caption" sx={{ fontFamily: fontData, color: x.diff >= 0 ? colors.good : colors.bad }}>{x.diff > 0 ? "+" : ""}{x.diff}</Typography>
                        </Box>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Paper>
          <Typography variant="body2" sx={{ color: colors.muted, mt: 1 }}>Won–lost–tied on points in each cup both raced, and the points difference.</Typography>
        </>
      )}

      <SectionTitle title="Upsets" count={m.rated ? plural(m.upsets.length, "upset") : null} />
      {!m.upsets.length ? (
        <Typography variant="body2" sx={{ color: colors.muted }}>No upsets yet: an upset is a cup won outright over a league player rated 75+ points higher going in.</Typography>
      ) : (
        <Stack spacing={1}>
          {m.upsets.slice().reverse().map((u) => {
            const c = m.cups.find((x) => x.id === u.cupId);
            return (
              <Paper key={u.cupId} sx={{ p: 1.5 }}>
                <Typography variant="body2">
                  <b>{name(u.winner)}</b> won #{cupNum(u.cupId)} {c.cup} ({fmtDate(c.date)}) over {u.over.map(name).join(" and ")}.
                </Typography>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Container>
  );
}
