import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LOGO_SRC } from "../lib/constants";
import KartRacer from "./KartRacer";
import { colors, brandStripe, fontDisplay } from "../theme";

function Pill({ children }) {
  return (
    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 2, bgcolor: "rgba(7,10,31,.45)", border: "1px solid rgba(255,255,255,.12)", whiteSpace: "nowrap" }}>
      {children}
    </Box>
  );
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

// The season at a glance. Everything here comes from seasonPlan() (standings.js), the same numbers the
// Playoffs page uses: the week and the cups raced. A kart drives along the stripe at the bottom.
export default function Hero({ league, plan, next }) {
  const { seasonWeeks: W, current, played, seasonDone, justFinished } = plan;
  const status = seasonDone ? "Regular season complete"
    : justFinished ? (next ? `Week ${justFinished} done · next night ${shortDate(next.startsAt)}` : `Week ${justFinished} complete`)
    : null;

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
          // On phones the wedge would cross the week labels and progress bar, so it fades out above them.
          maskImage: { xs: "linear-gradient(180deg, #000 0%, #000 35%, transparent 62%)", md: "none" },
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

      <Container maxWidth="lg" sx={{ position: "relative", pt: { xs: 4, md: 5 }, pb: { xs: 8, md: 7 } }}>
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
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mr: 1 }} aria-label={`Week ${current} of ${W}`}>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "0.85rem", color: colors.accent, letterSpacing: "0.06em" }}>Week</Typography>
                <Typography sx={{ fontFamily: fontDisplay, fontSize: "2.4rem", lineHeight: 1, color: colors.accent, transform: "skewX(-7deg)" }}>
                  {current}
                  <Box component="small" sx={{ fontSize: "0.5em", color: colors.muted }}>/{W}</Box>
                </Typography>
              </Box>
              <Pill>
                <Typography component="span" sx={{ fontWeight: 800 }}>{played}</Typography>
                <Typography component="span" sx={{ color: colors.muted }}> raced</Typography>
              </Pill>
            </Stack>
            {status && <Typography variant="body2" sx={{ color: "rgba(255,255,255,.8)", mt: 1 }}>{status}</Typography>}
          </Box>

          <Box
            component="img"
            src={LOGO_SRC}
            alt="NKL"
            sx={{ display: { xs: "none", md: "block" }, height: 220, width: "auto", filter: "drop-shadow(0 0 1.5px rgba(255,255,255,.9)) drop-shadow(0 18px 30px rgba(0,0,0,.5))", transform: "rotate(-4deg)" }}
          />
        </Box>

      </Container>
      <KartRacer bottom={5} />
      <Box aria-hidden sx={{ position: "relative", height: 5, background: brandStripe }} />
    </Box>
  );
}
