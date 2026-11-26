import Box from "@mui/material/Box";
import { charSrc, hashHue, initials } from "../lib/constants";
import { colors } from "../theme";

// A round character portrait on a neutral disc.
export default function CharacterFace({ name, size = 36, full = false }) {
  const src = charSrc(name, full);
  const sx = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
    bgcolor: colors.raised, fontWeight: 700, fontSize: size * 0.34, color: colors.ink,
  };
  if (!src) {
    return (
      <Box sx={sx} title={name || "No character"}>
        <Box sx={{ color: `hsl(${hashHue(name)} 70% 75%)` }}>{name ? initials(name) : "?"}</Box>
      </Box>
    );
  }
  return (
    <Box component="span" sx={sx} title={name}>
      <img src={src} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Box>
  );
}
