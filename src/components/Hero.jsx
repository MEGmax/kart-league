import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { LOGO_SRC } from "../lib/constants";
import KartRacer from "./KartRacer";
import { colors, brandStripe, fontDisplay } from "../theme";

const longDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

// The season at a glance on the logo's navy. Everything here comes from seasonPlan() (standings.js), the
// same numbers the Playoffs page uses: the week and the cups raced. A kart drives along the stripe.
export default function Hero({ league, plan, next }) {
  const { seasonWeeks: W, current, played, seasonDone, justFinished } = plan;
  const status = seasonDone ? "Regular season complete"
    : next ? `Next night ${longDate(next.startsAt)}`
    : justFinished ? `Week ${justFinished} complete`
    : null;

  return (
    <Box component="section" aria-label="This season" sx={{ position: "relative", overflow: "hidden", mt: -3, bgcolor: colors.navy }}>
      <Container maxWidth="lg" sx={{ position: "relative", pt: { xs: 3.5, md: 5 }, pb: { xs: 9.5, md: 6.5 }, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="div" sx={{ fontFamily: fontDisplay, fontSize: "clamp(1.75rem, 7.6vw, 3rem)", lineHeight: 1.02 }}>
            {league.name}
          </Typography>
          <Typography sx={{ mt: 1.5, fontSize: "1.0625rem", fontWeight: 500 }}>
            <b>{league.season ? `${league.season} · ` : ""}Week {current} of {W}</b> · {played} cup{played === 1 ? "" : "s"} raced
          </Typography>
          {status && <Typography sx={{ fontSize: "1.0625rem", fontWeight: 500 }}>{status}</Typography>}
        </Box>
        <Box component="img" src={LOGO_SRC} alt="" sx={{ display: { xs: "none", md: "block" }, height: 150, width: "auto", flexShrink: 0 }} />
      </Container>
      <KartRacer bottom={5} />
      <Box aria-hidden sx={{ position: "relative", height: 5, background: brandStripe }} />
    </Box>
  );
}
