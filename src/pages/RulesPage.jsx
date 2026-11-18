import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useLeagueData } from "../context/LeagueDataContext";
import { DEFAULT_LEAGUE, RACE_POINTS, ord } from "../lib/constants";
import { seasonPlan } from "../lib/standings";
import { colors, fontData } from "../theme";
import { PageTitle } from "../components/PageBits";

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
    ["Playoffs", `After week ${L.seasonWeeks} the standings lock and the top ${L.playoffSpots} qualified players advance to a seeded, single-elimination bracket (1 v ${L.playoffSpots}, 2 v ${Math.max(2, L.playoffSpots - 1)}, and so on). Each matchup is one cup; the higher-scoring player advances, and a tied cup goes to a single-race runoff on a track an admin picks. If ${L.playoffSpots} or fewer players qualify, they're all in; if that leaves an uneven bracket, the top seeds get byes.`],
    ["Disputes", "The photo settles it. If a photo is unreadable, players in that cup agree on the scores or the cup is replayed. Admins can correct any recorded cup."],
  ];
}

export default function RulesPage() {
  const { state } = useLeagueData();
  const L = state ? state.league : DEFAULT_LEAGUE;
  const byWeek = {};
  (state ? state.cups : []).filter((c) => c.status !== "racing").forEach((c) => { byWeek[c.week] = (byWeek[c.week] || 0) + 1; });
  const plan = seasonPlan(L, byWeek);
  return (
    <Container maxWidth="md" sx={{ pt: 1 }}>
      <PageTitle title="Regular season rules" sub={L.season} />
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Box component="ol" sx={{ m: 0, pl: 3, display: "grid", gap: 2.5 }}>
          {rules(L, plan).map(([h, p, table]) => (
            <li key={h}>
              <Typography sx={{ fontWeight: 800 }}>{h}</Typography>
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
    </Container>
  );
}
