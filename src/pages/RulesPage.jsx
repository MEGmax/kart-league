import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useLeagueData } from "../context/LeagueDataContext";
import { DEFAULT_LEAGUE, RACE_POINTS, ord } from "../lib/constants";
import { currentSeason, rankByFor, seasonPlan } from "../lib/standings";
import { ratingSettings } from "../lib/rating";
import { colors, fontData } from "../theme";
import { PageTitle, SectionTitle } from "../components/PageBits";

function rules(L, plan) {
  const planned = (Number(L.seasonWeeks) || 5) * (Number(L.cupsPerWeek) || 4);
  const total = plan.total;
  return [
    ["Season format", `The regular season runs ${L.seasonWeeks} weeks of ${L.cupsPerWeek} cups (${total} cups${total !== planned ? ", counting a week that ran over" : ""}). Each cup is 4 races.`],
    ["Cups and characters", "On a cup night the league races specific cups, set when the night is scheduled or picked in the cup builder. Everyone normally keeps one character for the whole night, which is how results photos are matched to players. If someone switches for a cup, the cup records the character they actually used."],
    ["Race scoring", `Every race is scored with the game's 12-racer points table, so the most anyone can score in a cup is ${L.defaultMax} points.`, true],
    ["Entering results", "Either join the cup on the Join tab and enter each race as you go (the honour system: if two people claim the same place, the site flags it), or record the whole night afterwards from the results-screen photos. Members' recorded nights are checked by an admin before they count."],
    ["The photo is the check", "When a cup ends, someone photographs the final results screen before anyone presses a button. An admin compares it with the entered totals and fixes anything that doesn't match. Only finished cups count in the standings."],
    ["Unclaimed points", "A highlighted human row on a photo that isn't matched to a player is saved as unclaimed. If it was you, request it on the Unclaimed page and an admin will add it to your record."],
    ["Standard settings", "150cc, CPUs on Hard, items Normal, any character and any kart or bike (ideally the same character all night)."],
    ["Ranking stat: points percentage", "Your rank is the points you earned divided by the points you could have earned in the cups you played. Missing a cup doesn't lower your percentage."],
    ["Qualifying", `To be ranked you must have played at least ${L.minParticipation}% of the cups held so far, rounded up. Everyone else is listed under Not yet qualified until they catch up.`],
    ["Cup wins and podiums", "Finishing order counts human players only. The most points in a cup wins it; 2nd and 3rd complete the podium. Players tied on points share the place."],
    ["Tiebreakers", "Equal percentages are split by, in order: cup wins, head-to-head points across cups both players played, total points, then a single-race runoff on a track an admin picks."],
    ["Abandoned cups", "A cup that isn't finished (power cut, rage quit, a disconnect that ends it) doesn't count and is raced again from the start."],
    ["Playoffs", `After week ${L.seasonWeeks} the standings lock and the top ${L.playoffSpots} qualified players advance to a seeded, single-elimination bracket (1 v ${L.playoffSpots}, 2 v ${Math.max(2, L.playoffSpots - 1)}, and so on). ${Number(L.playoffCupsPerRound) > 1 ? `Each round is ${L.playoffCupsPerRound} cups on aggregate points; the higher total advances, and a tie goes to a single-race runoff on a track an admin picks.` : "Each matchup is one cup; the higher-scoring player advances, and a tied cup goes to a single-race runoff on a track an admin picks."} If ${L.playoffSpots} or fewer players qualify, they're all in; if that leaves an uneven bracket, the top seeds get byes.`],
    ["Disputes", "The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. Admins can correct any recorded cup."],
  ];
}

// Season 2 on: ranked by skill rating. Rules that changed from Season 1 say so.
function ratingRules(L, plan, season) {
  const cfg = ratingSettings(L);
  const planned = (Number(L.seasonWeeks) || 5) * (Number(L.cupsPerWeek) || 4);
  const total = plan.total;
  const finalMark = Math.max(cfg.provisional, Math.ceil((L.minParticipation / 100) * total));
  const per = Math.max(1, Number(L.playoffCupsPerRound) || 1);
  return [
    ["Season format", `The regular season runs ${L.seasonWeeks} weeks of ${L.cupsPerWeek} cups (${total} cups${total !== planned ? ", counting a week that ran over" : ""}). Each cup is 4 races. A night that runs over keeps its extra cups in that week.`],
    ["Standard settings", "150cc, CPUs on Hard, items Normal, any character and any kart or bike."],
    ["Characters", "Declare one main character when you join the night. You may switch for a cup, but say so before the cup starts so the photo can be matched. Two humans can't share a character in the same cup.", null, "Changed"],
    ["Tracks", season > 1
      ? "Every cup is built in the cup builder before racing, so all 4 tracks are recorded. Each night races 2 of the game's 8 cups, in a rotation that covers all 8 by week 4, plus 2 cups picked by the track vote. No track twice in one night."
      : "Every cup is built in the cup builder before racing, so all 4 tracks are recorded.", null, "New"],
    ["Race scoring", `Every race is scored with the game's 12-racer points table, so the most anyone can score in a cup is ${L.defaultMax} points.`, true],
    ["Entering results and the photo check", "Enter race by race on the Join tab, or record the night afterwards from the results-screen photos. When a cup ends, someone photographs the final results screen before anyone presses a button; that photo is the check. Only finished cups count."],
    ["Ranking stat: skill rating", "Your rank is your rating. After every cup, each pair of league players in it is scored as a mini-match, and your rating goes up or down depending on who you beat, by how much, and how strong they were. See How the rating works below.", null, "Changed"],
    ["Starting ratings", `Returning players start the season ${Math.round(cfg.carry * 100)}% of the way from ${cfg.start} to their final rating from last season. New players start at ${cfg.start}.`, null, "New"],
    ["Provisional ratings", `Your first ${cfg.provisional} cups of the season are provisional: your rating moves ${Math.round((cfg.Kp / cfg.K - 1) * 100)}% faster and shows a “P” badge.`, null, "New"],
    ["Qualifying", `To be ranked you need at least ${cfg.provisional} cups and ${L.minParticipation}% of the cups held so far, rounded up. By the season's end that is ${finalMark} of ${total}.`, null, "Changed"],
    ["Cup wins and podiums", "Finishing order counts human players only. The most points in a cup wins it; 2nd and 3rd complete the podium. Players tied on points share the place."],
    ["Tiebreakers", "Ratings are compared to the whole point. Equal ratings are split by cup wins, then head-to-head points across cups both players raced, then total points, then a single-race runoff on a track an admin picks.", null, "Changed"],
    ["Abandoned cups", "A cup that isn't finished (power cut, rage quit, a disconnect that ends it) doesn't count and is raced again from the start."],
    ["Playoffs", `After week ${L.seasonWeeks} the standings lock and the top ${L.playoffSpots} ranked players make the playoffs, seeded by rating. Each round is ${per === 1 ? "one cup" : `${per} cups on aggregate points`}; a tie goes to a single-race runoff. ${L.playoffSpots === 4 ? `All four race the semifinal cups together (1 v 4 and 2 v 3 compare totals), and the final is ${per === 1 ? "one more cup" : `${per} more cups`}. ` : ""}Playoff cups count in stats and records but don't move the locked season rating.`, null, "Changed"],
    ["Disputes", "The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. Admins can correct any recorded cup."],
  ];
}

// The formula and the settings it runs on.
function HowRatingWorks({ L }) {
  const cfg = ratingSettings(L);
  const rows = [
    ["Starting rating", cfg.start, "New players start level"],
    ["K (cup weight)", cfg.K, "The most a rating can move in one cup"],
    ["Provisional K", `${cfg.Kp} for the first ${cfg.provisional} cups`, "New players find their level faster"],
    ["Margin cap", `${cfg.cap} points`, `Winning a cup by ${cfg.cap}+ counts as a full win`],
    ["Season carry-over", `${Math.round(cfg.carry * 100)}%`, `A season starts ${Math.round(cfg.carry * 100)}% of the way from ${cfg.start} to last season's rating`],
  ];
  const code = { fontFamily: fontData, fontSize: "0.85rem", bgcolor: colors.bg2, border: `1px solid ${colors.line}`, borderRadius: 1.5, px: 1.5, py: 1, overflowX: "auto", whiteSpace: "pre" };
  return (
    <>
      <SectionTitle title="How the rating works" />
      <Paper sx={{ p: { xs: 2, sm: 3 }, display: "grid", gap: 1.5 }}>
        <Typography variant="body2">
          Each cup is scored as a set of head-to-head matches between the league players in it. With 4 humans, that's 3 matches each per cup. CPUs don't count.
        </Typography>
        <Typography variant="body2">
          For each opponent, your <b>result</b> blends who finished ahead with the margin, so a 43–42 cup is close to a draw and a 60–24 cup is a full win.
          W is 1 for more points, ½ for a tie, 0 for fewer:
        </Typography>
        <Box sx={code}>{`S = ½·W + ½·clamp(½ + (your pts − their pts) / ${2 * cfg.cap}, 0, 1)`}</Box>
        <Typography variant="body2">
          Your <b>expected</b> result comes from the rating gap, and your rating moves by the difference, averaged over your opponents:
        </Typography>
        <Box sx={code}>{"E  = 1 / (1 + 10^((their rating − your rating) / 400))\nΔR = K / (players − 1) × Σ (S − E)"}</Box>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", py: 0.75, pr: 1.5, borderBottom: `1px solid ${colors.line}`, fontSize: "0.875rem", verticalAlign: "top" }, "& th": { color: colors.muted, fontWeight: 600 } }}>
          <thead><tr><th>Setting</th><th>Value</th><th>Effect</th></tr></thead>
          <tbody>
            {rows.map(([k, v, e]) => (
              <tr key={k}><td>{k}</td><td style={{ fontFamily: fontData, whiteSpace: "nowrap" }}>{v}</td><td style={{ color: colors.muted }}>{e}</td></tr>
            ))}
          </tbody>
        </Box>
      </Paper>
    </>
  );
}

export default function RulesPage() {
  const { state } = useLeagueData();
  const L = state ? state.league : DEFAULT_LEAGUE;
  const season = currentSeason(L);
  const byRating = rankByFor(L, season) === "rating";
  const byWeek = {};
  (state ? state.cups : []).filter((c) => c.status !== "racing" && (c.season || 1) === season).forEach((c) => { byWeek[c.week] = (byWeek[c.week] || 0) + 1; });
  const plan = seasonPlan(L, byWeek);
  // New/Changed tags compare with Season 1's rules, so they only mean something from Season 2 on.
  const list = byRating ? ratingRules(L, plan, season).map((r) => (season > 1 ? r : [r[0], r[1], r[2]])) : rules(L, plan);
  return (
    <Container maxWidth="md" sx={{ pt: 1 }}>
      <PageTitle title="Regular season rules" sub={L.season} />
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Box component="ol" sx={{ m: 0, pl: 3, display: "grid", gap: 2.5 }}>
          {list.map(([h, p, table, tag]) => (
            <li key={h}>
              <Typography sx={{ fontWeight: 800 }}>
                {h}
                {tag && <Box component="span" sx={{ ml: 1, px: 0.75, py: 0.1, borderRadius: 1, fontSize: "0.7rem", fontWeight: 800, verticalAlign: "middle", bgcolor: tag === "New" ? colors.cool : colors.gold, color: "#14100A" }}>{tag}</Box>}
              </Typography>
              <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>{p}</Typography>
              {table && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 0.75, mt: 1.5 }}>
                  {RACE_POINTS.map((pts, i) => (
                    <Box key={i} sx={{ textAlign: "center", border: `1px solid ${colors.line}`, borderRadius: 1.5, py: 0.75, bgcolor: colors.bg2 }}>
                      <Typography sx={{ fontFamily: fontData, fontWeight: 800 }}>{pts}</Typography>
                      <Typography variant="caption" sx={{ color: colors.muted }}>{i + 1}{ord(i + 1)}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </li>
          ))}
        </Box>
      </Paper>
      {byRating && <HowRatingWorks L={L} />}
    </Container>
  );
}
