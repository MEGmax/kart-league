// Rivals (#/rivals): the rivalry of the season, every pair's head-to-head record, and upsets.
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useLeagueData } from "../context/LeagueDataContext";
import { compute, playerSlug } from "../lib/standings";
import { headToHead, rivalry } from "../lib/rivals";
import { DEMO } from "../lib/demo";
import { fmtDate } from "../lib/constants";
import { colors } from "../theme";
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
        <Box component="section" aria-label="Rivalry of the season">
          <Typography sx={{ color: colors.muted }}>Rivalry of the season</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            {[rival.a, rival.b].map((id, i) => {
              const s = m.byId.get(id);
              return (
                <Stack key={id} direction="row" spacing={1} alignItems="center">
                  {i === 1 && <Typography sx={{ color: colors.muted, fontWeight: 600, mr: 1 }}>vs</Typography>}
                  <CharacterFace name={s && s.main && s.main.name} size={48} />
                  <Typography component={RouterLink} to={href(id)} sx={{ fontWeight: 800, fontSize: { xs: "1.375rem", sm: "1.75rem" }, color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>{name(id)}</Typography>
                </Stack>
              );
            })}
          </Stack>
          <Typography sx={{ mt: 1.25, fontSize: "1.125rem" }}>
            <b>{record(rival)}</b> in {plural(rival.n, "cup")} together, {rival.diff ? `${name(rival.a)} +${rival.diff} points` : "dead level on points"}.
          </Typography>
        </Box>
      ) : (
        <Typography sx={{ color: colors.muted }}>The rivalry of the season appears once a pair has met in 6 cups.</Typography>
      )}

      {rows.length > 1 && (
        <>
          <SectionTitle title="Head-to-head grid" count="row player's record vs the column" />
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ borderCollapse: "collapse", minWidth: "100%", "& th, & td": { p: 1, textAlign: "center", borderBottom: `1px solid ${colors.line}`, whiteSpace: "nowrap" }, "& thead th": { borderBottom: `2px solid ${colors.rule}` } }}>
              <thead>
                <tr>
                  <th aria-label="Player" />
                  {rows.map((c) => <Box component="th" key={c.player.id} scope="col" sx={{ fontSize: "0.875rem", color: colors.muted, fontWeight: 600 }}>{c.player.name}</Box>)}
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
                        <Box component="td" key={c.player.id} title={`${r.player.name} vs ${c.player.name}: ${record(x)}, ${x.diff > 0 ? "+" : ""}${x.diff} points over ${plural(x.n, "cup")}`}>
                          <Typography sx={{ fontWeight: x.w > x.l ? 800 : 500, color: x.w >= x.l ? colors.ink : colors.muted }}>{record(x)}</Typography>
                          <Typography sx={{ fontSize: "0.875rem", color: colors.muted }}>{x.diff > 0 ? "+" : ""}{x.diff}</Typography>
                        </Box>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
          <Typography sx={{ color: colors.muted, mt: 1.5, fontSize: "0.9375rem" }}>Won–lost–tied on points in each cup both raced, and the points difference.</Typography>
        </>
      )}

      <SectionTitle title="Upsets" count={m.rated ? plural(m.upsets.length, "upset") : null} />
      {!m.upsets.length ? (
        <Typography sx={{ color: colors.muted }}>No upsets yet: an upset is a cup won outright over a league player rated 75+ points higher going in.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, borderTop: `1px solid ${colors.line}` }}>
          {m.upsets.slice().reverse().map((u) => {
            const c = m.cups.find((x) => x.id === u.cupId);
            return (
              <Box component="li" key={u.cupId} sx={{ py: 1.25, borderBottom: `1px solid ${colors.line}` }}>
                <Typography>
                  <b>{name(u.winner)}</b> won #{cupNum(u.cupId)} {c.cup} ({fmtDate(c.date)}) over {u.over.map(name).join(" and ")}.
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Container>
  );
}
