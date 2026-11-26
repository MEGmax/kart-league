// Season picker for Schedule and Stats. Kept in the address (?season=1) so a past
// season's page can be shared. Hidden while the league has only one season.
import { useSearchParams } from "react-router-dom";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { currentSeason, seasonsOf } from "../lib/standings";

export function useSeason(st) {
  const [params, setParams] = useSearchParams();
  const all = st ? seasonsOf(st) : [1];
  const cur = st ? currentSeason(st.league) : 1;
  const asked = Number(params.get("season"));
  const season = all.indexOf(asked) >= 0 ? asked : cur;
  const setSeason = (n) => {
    const next = new URLSearchParams(params);
    if (n === cur) next.delete("season"); else next.set("season", String(n));
    setParams(next, { replace: true });
  };
  return { season, seasons: all, current: cur, setSeason };
}

export default function SeasonPicker({ season, seasons, setSeason, sx }) {
  if (!seasons || seasons.length < 2) return null;
  return (
    <ToggleButtonGroup size="small" exclusive value={season} onChange={(_, v) => v != null && setSeason(v)} aria-label="Season" sx={{ mb: 2, flexWrap: "wrap", ...sx }}>
      {seasons.map((n) => <ToggleButton key={n} value={n} sx={{ px: 1.5 }}>Season {n}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}
