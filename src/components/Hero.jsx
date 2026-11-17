import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LOGO_SRC } from "../lib/constants";
import { colors, brandStripe, fontDisplay } from "../theme";

function Stat({ value, label }) {
  return (
    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 2, bgcolor: "rgba(7,10,31,.45)", border: "1px solid rgba(255,255,255,.12)" }}>
      <Typography component="span" sx={{ fontWeight: 800 }}>{value}</Typography>{" "}
      <Typography component="span" sx={{ color: colors.muted }}>{label}</Typography>
    </Box>
  );
}

export default function Hero({ league, metrics }) {
  const W = Math.max(1, Number(league.seasonWeeks) || 5);
  const per = Math.max(1, Number(league.cupsPerWeek) || 4);
  const curWeek = Math.min(metrics.curWeek, W);
  const left = Math.max(0, W * per - metrics.total);
  const done = metrics.curWeek >= W && (metrics.byWeek[W] || 0) >= per;

  return (
    <Box sx={{ position: "relative", overflow: "hidden", mt: -3, bgcolor: colors.bg }}>
      {/* The logo's split: a navy field with a red wedge on the right, fading into the page. */}
      <Box aria-hidden sx={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${colors.navy} 0%, #141A55 45%, ${colors.bg} 100%)` }} />
      <Box
        aria-hidden
        sx={{
          position: "absolute", top: 0, bottom: 0, right: { xs: "-24%", md: "-14%" }, width: { xs: "34%", md: "36%" },
          transform: "skewX(-14deg)", transformOrigin: "top",
          background: `linear-gradient(180deg, ${colors.red} 0%, #B51C15 45%, rgba(120,16,12,0) 100%)`,
          boxShadow: "-10px 0 0 rgba(255,255,255,.9)",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(-62deg, rgba(255,255,255,.035) 0 2px, transparent 2px 26px)",
          maskImage: "linear-gradient(180deg, #000 0%, transparent 85%)",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", pt: { xs: 4, md: 5 }, pb: { xs: 2.5, md: 3 } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) auto" }, columnGap: 6, alignItems: "center" }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {league.season && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: "#fff", color: colors.navy, fontWeight: 800, fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: "4px", transform: "skewX(-10deg)" }}>
                  <Box component="span" sx={{ display: "inline-block", transform: "skewX(10deg)" }}>{league.season}</Box>
                </Box>
              )}
              <Typography variant="caption" sx={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,.8)", fontWeight: 700 }}>
                Regular season
              </Typography>
            </Stack>
            <Typography
              variant="h1"
              sx={{
                fontSize: "clamp(2.1rem, 6vw, 3.4rem)", lineHeight: 0.98, mt: 1.5,
                textShadow: `0 3px 0 ${colors.red}, 0 7px 0 rgba(0,0,0,.35)`, transform: "skewX(-7deg)", transformOrigin: "left bottom",
              }}
            >
              {league.name}
            </Typography>

            <Stack direction="row" spacing={1} useFlexGap alignItems="center" sx={{ flexWrap: "wrap", mt: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mr: 1 }}>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.85rem", color: colors.accent, letterSpacing: "0.06em" }}>Week</Typography>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "2.4rem", lineHeight: 1, color: colors.accent, transform: "skewX(-7deg)" }}>
                  {curWeek}
                  <Box component="small" sx={{ fontSize: "0.5em", color: colors.muted }}>/{W}</Box>
                </Typography>
              </Box>
              <Stat value={metrics.total} label={`cup${metrics.total === 1 ? "" : "s"} raced`} />
              {done ? <Stat value="Regular season" label="complete" /> : <Stat value={left} label="to go" />}
            </Stack>
          </Box>

          <Box
            component="img"
            src={LOGO_SRC}
            alt=""
            sx={{ display: { xs: "none", md: "block" }, height: 220, width: "auto", filter: "drop-shadow(0 0 1.5px rgba(255,255,255,.9)) drop-shadow(0 18px 30px rgba(0,0,0,.5))", transform: "rotate(-4deg)" }}
          />
        </Box>

        <Box aria-hidden sx={{ display: "grid", gridTemplateColumns: `repeat(${W}, minmax(0,1fr))`, gap: 1, pt: 3 }}>
          {Array.from({ length: W }, (_, i) => i + 1).map((w) => {
            const n = metrics.byWeek[w] || 0;
            const segCount = Math.max(per, n);
            const isCur = w === curWeek && metrics.total;
            return (
              <Box key={w} sx={{ display: "grid", gap: 0.5, minWidth: 0 }}>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.66rem", letterSpacing: "0.06em", color: isCur ? colors.accent : colors.muted }}>
                  Wk {w}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${segCount}, minmax(0,1fr))`, gap: 0.4, height: 12 }}>
                  {Array.from({ length: segCount }, (_, i) => (
                    <Box
                      key={i}
                      sx={{
                        borderRadius: "3px", transform: "skewX(-14deg)",
                        background: i < n ? (isCur ? colors.accent : "rgba(255,255,255,.7)") : "rgba(255,255,255,.1)",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
      <Box aria-hidden sx={{ position: "relative", height: 5, background: brandStripe }} />
    </Box>
  );
}
