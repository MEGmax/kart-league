// Small pieces for showing a skill rating: the change since last night, the provisional badge, and form.
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { colors, fontData } from "../theme";

export function fmtRating(r) {
  return r == null ? "–" : String(Math.round(r));
}

export function signed(n, digits = 0) {
  const v = Number(n.toFixed(digits));
  return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
}

// ▲12 / ▼8 since the latest night (nothing when they didn't race it).
export function RatingDelta({ delta, sx }) {
  if (delta == null) return null;
  const v = Math.round(delta);
  const up = v > 0, down = v < 0;
  return (
    <Box component="span" title="Rating change on the latest night"
      sx={{ fontFamily: fontData, fontSize: "0.8rem", fontWeight: 700, color: up ? colors.good : down ? colors.bad : colors.muted, whiteSpace: "nowrap", ...sx }}>
      {up ? "▲" : down ? "▼" : "•"}{Math.abs(v)}
    </Box>
  );
}

export function ProvisionalBadge({ cups }) {
  return (
    <Tooltip title={`Provisional: fewer than ${cups} cups this season, so the rating still moves faster`}>
      <Box component="span" aria-label="Provisional rating"
        sx={{ display: "inline-grid", placeItems: "center", width: 18, height: 18, borderRadius: "5px", border: `1px solid ${colors.muted}`, color: colors.muted, fontSize: "0.7rem", fontWeight: 800, lineHeight: 1 }}>
        P
      </Box>
    </Tooltip>
  );
}

// Form: points % over the last 4 cups, with an arrow against the season so far.
export function FormArrow({ form }) {
  if (!form) return null;
  const d = form.vsSeason * 100;
  const up = d >= 2, down = d <= -2;
  return (
    <Box component="span" title={`Form: ${(form.pct * 100).toFixed(0)}% over the last ${form.cups} cups (${signed(d, 1)} points vs the season)`}
      sx={{ color: up ? colors.good : down ? colors.bad : colors.muted, fontWeight: 700 }}>
      {up ? "↗" : down ? "↘" : "→"}
    </Box>
  );
}
