import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { colors, fontDisplay } from "../theme";

export default function Hero({ league, metrics }) {
  const W = Math.max(1, Number(league.seasonWeeks) || 5);
  const per = Math.max(1, Number(league.cupsPerWeek) || 4);
  const curWeek = Math.min(metrics.curWeek, W);
  const left = Math.max(0, W * per - metrics.total);
  const done = metrics.curWeek >= W && (metrics.byWeek[W] || 0) >= per;

  return (
    <Box sx={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#070917 0%,#141A3D 62%,#1E1546 100%)" }}>
      <Box
        aria-hidden
        sx={{
          position: "absolute", inset: 0, opacity: 0.75,
          background:
            "radial-gradient(1.5px 1.5px at 12% 22%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 28% 12%,#fff 50%,transparent 51%)," +
            "radial-gradient(1.5px 1.5px at 44% 30%,#cfd8ff 50%,transparent 51%),radial-gradient(1px 1px at 63% 16%,#fff 50%,transparent 51%)," +
            "radial-gradient(2px 2px at 78% 26%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 90% 10%,#fff 50%,transparent 51%)," +
            "radial-gradient(60% 50% at 85% 0%,rgba(46,196,255,.25),transparent 70%),radial-gradient(50% 60% at 0% 100%,rgba(255,59,72,.22),transparent 70%)",
        }}
      />
      <Container maxWidth="lg" sx={{ position: "relative", pt: 4, pb: 1 }}>
        <Typography variant="caption" sx={{ letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted, fontWeight: 700 }}>
          {league.season} · Regular season
        </Typography>
        <Typography
          variant="h1"
          sx={{
            fontSize: "clamp(2.1rem, 7.5vw, 4.4rem)", lineHeight: 0.95, mt: 1,
            textShadow: `0 3px 0 ${colors.hot}, 0 6px 0 rgba(0,0,0,.45)`, transform: "skewX(-7deg)", transformOrigin: "left bottom",
          }}
        >
          {league.name}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, flexWrap: "wrap", mt: 2 }}>
          <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.9rem", color: colors.accent, letterSpacing: "0.06em" }}>Week</Typography>
          <Typography sx={{ fontFamily: fontDisplay, fontSize: "2.4rem", lineHeight: 1, color: colors.accent, transform: "skewX(-7deg)" }}>
            {curWeek}
            <Box component="small" sx={{ fontSize: "0.5em", color: colors.muted }}>/{W}</Box>
          </Typography>
          <Typography sx={{ color: colors.muted }}>
            {metrics.total} cup{metrics.total === 1 ? "" : "s"} raced · {done ? "regular season complete" : `${left} to go`}
          </Typography>
        </Box>
        <Box aria-hidden sx={{ display: "grid", gridTemplateColumns: `repeat(${W}, minmax(0,1fr))`, gap: 1, pt: 2, pb: 2.25 }}>
          {Array.from({ length: W }, (_, i) => i + 1).map((w) => {
            const n = metrics.byWeek[w] || 0;
            const segCount = Math.max(per, n);
            const isCur = w === curWeek && metrics.total;
            return (
              <Box key={w} sx={{ display: "grid", gap: 0.5, minWidth: 0 }}>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.66rem", letterSpacing: "0.06em", color: isCur ? colors.accent : colors.muted }}>
                  Wk {w}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${segCount}, minmax(0,1fr))`, gap: 0.4, height: 14 }}>
                  {Array.from({ length: segCount }, (_, i) => (
                    <Box
                      key={i}
                      sx={{
                        borderRadius: "3px", transform: "skewX(-14deg)",
                        background: i < n ? (isCur ? colors.accent : "rgba(255,255,255,.55)") : "rgba(255,255,255,.08)",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
      <Box aria-hidden sx={{ height: 14, background: `repeating-linear-gradient(90deg,${colors.hot} 0 28px,#fff 28px 56px)` }} />
    </Box>
  );
}
