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

// Rating after every cup this season, starting from the season's starting rating.
export function RatingChart({ s }) {
  const hist = s.ratingHistory || [];
  if (hist.length < 2) return null;
  const vals = [s.ratingStart].concat(hist.map((h) => h.after));
  const W = 320, H = 110, pad = 12;
  const lo = Math.min(...vals) - 5, hi = Math.max(...vals) + 5;
  const x = (i) => pad + (i * (W - 2 * pad)) / (vals.length - 1);
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  const mid = s.ratingStart;
  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rating over the season: from ${fmtRating(s.ratingStart)} to ${fmtRating(s.rating)}`}
      sx={{ width: "100%", height: "auto", display: "block", bgcolor: colors.bg2, borderRadius: 2, border: `1px solid ${colors.line}` }}>
      <line x1={pad} x2={W - pad} y1={y(mid)} y2={y(mid)} stroke={colors.line} strokeDasharray="3 4" />
      <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={colors.cool} strokeWidth="2.5" />
      {vals.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 4 : 2.5} fill={colors.cool}>
          <title>{i ? `After cup ${i} of theirs: ${fmtRating(v)}` : `Season start: ${fmtRating(v)}`}</title>
        </circle>
      ))}
    </Box>
  );
}
