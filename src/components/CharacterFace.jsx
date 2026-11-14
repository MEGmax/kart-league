import Box from "@mui/material/Box";
import { charSrc, hashHue, initials } from "../lib/constants";
import { colors } from "../theme";

// A round character portrait; `ring` is a player color for the outline.
export default function CharacterFace({ name, size = 36, ring, full = false }) {
  const src = charSrc(name, full);
  const sx = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    border: `2px solid ${ring || colors.line}`, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
    bgcolor: colors.panel2, fontFamily: "inherit", fontWeight: 700,
    fontSize: size * 0.34, color: colors.ink,
  };
  if (!src) {
    return (
      <Box sx={sx} title={name || "No character"}>
        <Box sx={{ color: `hsl(${hashHue(name)} 70% 70%)` }}>{name ? initials(name) : "?"}</Box>
      </Box>
    );
  }
  return (
    <Box component="span" sx={sx} title={name}>
      <img src={src} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Box>
  );
}
