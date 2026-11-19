// One racer's season, opened from the standings (and shareable as #/standings/<name>): a drawer from the
// right on wide screens and from the bottom on phones.
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import { charColor, fmtDate, ord, pctTxt } from "../lib/constants";
import { colors, fontData } from "../theme";
import CharacterChip from "./CharacterChip";
import CharacterFace from "./CharacterFace";
import CupIcon from "./CupIcon";
import TrackImage from "./TrackImage";
import { plural } from "./PageBits";

function Section({ title, children }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="overline" sx={{ color: colors.muted, display: "block", mb: 1, lineHeight: 1.4 }}>{title}</Typography>
      {children}
    </Box>
  );
}

// Each cup's percentage (dots) and the running season percentage (line), oldest cup first.
function Trend({ log }) {
  if (log.length < 2) return null;
  const W = 320, H = 110, pad = 10;
  const x = (i) => pad + (i * (W - 2 * pad)) / (log.length - 1);
  const y = (v) => H - pad - v * (H - 2 * pad);
  let pts = 0, max = 0;
  const running = log.map((l) => { pts += l.pts; max += l.max; return pts / max; });
  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Points percentage over the season, cup by cup"
      sx={{ width: "100%", height: "auto", display: "block", bgcolor: colors.bg2, borderRadius: 2, border: `1px solid ${colors.line}` }}>
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke={colors.line} strokeDasharray="3 4" />)}
      <polyline points={running.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={colors.accent} strokeWidth="2.5" />
      {log.map((l, i) => <circle key={i} cx={x(i)} cy={y(l.pts / l.max)} r="3.5" fill={colors.hot}><title>{`#${l.num} ${l.cup.cup}: ${l.pts}/${l.max}`}</title></circle>)}
    </Box>
  );
}

function headToHead(s, m) {
  const out = {};
  s.log.forEach((l) => {
    const info = m.cupInfo.get(l.cup.id);
    info.res.forEach((o) => {
      if (!o.p || o.p === s.player.id) return;
      const h = out[o.p] || (out[o.p] = { id: o.p, cups: 0, won: 0, lost: 0, tied: 0, diff: 0 });
      h.cups++; h.diff += l.pts - o.pts;
      if (l.pts > o.pts) h.won++; else if (l.pts < o.pts) h.lost++; else h.tied++;
    });
  });
  return Object.values(out).sort((a, b) => b.cups - a.cups || b.diff - a.diff);
}

export default function RacerDrawer({ s, m, players, onClose }) {
  const phone = useMediaQuery("(max-width:599.95px)");
  const h2h = useMemo(() => (s ? headToHead(s, m) : []), [s, m]);
  const open = !!s;
  const byPct = s ? s.log.slice().sort((a, b) => b.pts / b.max - a.pts / a.max) : [];
  const best = byPct[0], worst = byPct.length > 1 ? byPct[byPct.length - 1] : null;
  const nameOf = (id) => (players.find((p) => p.id === id) || {}).name || "?";

  return (
    <Drawer anchor={phone ? "bottom" : "right"} open={open} onClose={onClose}
      PaperProps={{ sx: { width: phone ? "100%" : 460, maxHeight: phone ? "92vh" : "100%", borderRadius: phone ? "16px 16px 0 0" : 0, p: { xs: 2, sm: 3 } } }}>
      {s && (
        <Box component="section" aria-label={`${s.player.name}'s season`}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CharacterFace name={s.main && s.main.name} ring={s.player.color} size={52} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" noWrap sx={{ fontFamily: "inherit" }}>{s.player.name}</Typography>
              <Typography variant="body2" sx={{ color: colors.muted }}>
                {s.rank ? `${s.rank}${ord(s.rank)} · ` : "Not yet qualified · "}{pctTxt(s.pct)} of points possible
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1.5, mt: 2.5 }}>
            {[
              ["Points", `${s.pts}/${s.max}`],
              ["Cups", s.cp],
              ["Cup wins", s.wins],
              ["Race wins", s.rc ? s.raceWins : "–"],
              ["Podiums", s.pods],
              ["Avg pts / cup", s.avgPtsCup != null ? s.avgPtsCup.toFixed(1) : "–"],
              ["Avg cup finish", s.avg != null ? s.avg.toFixed(2) : "–"],
              ["Avg race finish", s.avgRace != null ? s.avgRace.toFixed(2) : "–"],
              ["Races recorded", s.rc],
            ].map(([k, v]) => (
              <Box key={k}>
                <Typography variant="caption" sx={{ color: colors.muted }}>{k}</Typography>
                <Typography sx={{ fontWeight: 800, fontFamily: fontData }}>{v}</Typography>
              </Box>
            ))}
          </Box>
          {s.rc > 0 && s.rc < s.cp * 4 && (
            <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 1 }}>
              Race wins and average race finish count only the {s.rc} races entered race by race.
            </Typography>
          )}

          <Section title="Cup by cup">
            <Trend log={s.log} />
            <Typography variant="caption" sx={{ color: colors.muted, display: "block", mt: 0.5 }}>Dots: each cup. Line: season percentage so far.</Typography>
            {best && (
              <Stack direction="row" spacing={2} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
                <Typography variant="body2"><b>Best:</b> #{best.num} {best.cup.cup}, {best.pts}/{best.max}</Typography>
                {worst && <Typography variant="body2"><b>Worst:</b> #{worst.num} {worst.cup.cup}, {worst.pts}/{worst.max}</Typography>}
              </Stack>
            )}
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {s.log.slice().reverse().map((l) => (
                <Stack key={l.cup.id} direction="row" spacing={1.25} alignItems="center">
                  <CupIcon cup={l.cup.cup} size={26} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>#{l.num} {l.cup.cup}</Typography>
                    <Typography variant="caption" sx={{ color: colors.muted }}>
                      Week {l.cup.week} · {fmtDate(l.cup.date)}{l.chars.length ? ` · ${l.chars.join(", ")}` : ""}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: fontData, whiteSpace: "nowrap" }}>{l.rank}{ord(l.rank)}<span style={{ color: colors.muted }}>/{l.field}</span></Typography>
                  <Typography variant="body2" sx={{ fontFamily: fontData, fontWeight: 700, width: 54, textAlign: "right" }}>{l.pts}<span style={{ color: colors.muted, fontWeight: 400 }}>/{l.max}</span></Typography>
                </Stack>
              ))}
            </Stack>
          </Section>

          {s.mapList.length > 0 && (
            <Section title="Track by track">
              <Stack spacing={0.5}>
                {s.mapList.map((t) => (
                  <Stack key={t.map} direction="row" spacing={1} alignItems="center">
                    <TrackImage track={t.map} width={44} radius={0.75} />
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{t.map}</Typography>
                    <Typography variant="caption" sx={{ color: colors.muted }}>{plural(t.n, "race")}</Typography>
                    <Typography variant="body2" sx={{ fontFamily: fontData, width: 104, textAlign: "right" }} title="Average finishing place">avg place {t.avgPos.toFixed(1)}</Typography>
                    <Typography variant="body2" sx={{ fontFamily: fontData, width: 70, textAlign: "right" }}>{t.avgPts.toFixed(1)} pts</Typography>
                  </Stack>
                ))}
              </Stack>
            </Section>
          )}

          {h2h.length > 0 && (
            <Section title="Head to head (cups both raced)">
              <Stack spacing={0.5}>
                {h2h.map((h) => (
                  <Stack key={h.id} direction="row" spacing={1} alignItems="baseline">
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600 }} noWrap>vs {nameOf(h.id)}</Typography>
                    <Typography variant="body2" sx={{ fontFamily: fontData }}>{h.won}–{h.lost}{h.tied ? `–${h.tied}` : ""}</Typography>
                    <Typography variant="caption" sx={{ color: h.diff >= 0 ? colors.good : colors.bad, fontFamily: fontData, width: 70, textAlign: "right" }}>
                      {h.diff > 0 ? "+" : ""}{h.diff} pts
                    </Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" sx={{ color: colors.muted }}>Won–lost{h2h.some((h) => h.tied) ? "–tied" : ""} on points in each cup.</Typography>
            </Section>
          )}

          {s.charList.length > 0 && (
            <Section title="Characters (by race)">
              <Stack spacing={1}>
                {s.charList.map((c) => (
                  <Stack key={c.name} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 140, flexShrink: 0 }}><CharacterChip name={c.name} /></Box>
                    <LinearProgress variant="determinate" value={c.share * 100} sx={{ flex: 1, height: 8, "& .MuiLinearProgress-bar": { bgcolor: charColor(c.name) } }} />
                    <Typography variant="caption" sx={{ color: colors.muted, width: 40, textAlign: "right" }}>{Math.round(c.share * 100)}%</Typography>
                  </Stack>
                ))}
              </Stack>
            </Section>
          )}
        </Box>
      )}
    </Drawer>
  );
}
