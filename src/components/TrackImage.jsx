// A track's picture (16:9). Custom tracks with no picture get a colored placeholder with a cup icon.
// With `label`, the track name sits on the picture over a dark fade; `caption` adds a line above it.
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { hashHue, trackSrc } from "../lib/constants";
import { colors } from "../theme";
import CupIcon from "./CupIcon";

export default function TrackImage({ track, width, label = false, caption, radius = 1.5, sx }) {
  const src = trackSrc(track);
  const hue = hashHue(track || "");
  return (
    <Box
      sx={{
        position: "relative", width: width || "100%", aspectRatio: "16 / 9", flexShrink: 0, overflow: "hidden",
        borderRadius: radius, bgcolor: colors.panel2, border: `1px solid ${colors.line}`,
        background: src ? undefined : `linear-gradient(135deg, hsl(${hue} 45% 28%), ${colors.panel2})`,
        ...sx,
      }}
    >
      {src ? (
        <Box component="img" src={src} alt={label ? "" : track} loading="lazy" decoding="async"
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: 0.8 }}>
          <CupIcon cup="Other" size={label ? 28 : 18} />
        </Box>
      )}
      {label && (
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, px: 1, pt: 2.5, pb: 0.75, background: "linear-gradient(180deg, transparent, rgba(4,6,20,.88))" }}>
          {caption && <Typography sx={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.accent, lineHeight: 1.3 }}>{caption}</Typography>}
          <Typography variant="body2" sx={{ fontWeight: 800, color: "#fff", lineHeight: 1.25, textShadow: "0 1px 2px rgba(0,0,0,.6)" }} noWrap>{track || "Track"}</Typography>
        </Box>
      )}
    </Box>
  );
}
