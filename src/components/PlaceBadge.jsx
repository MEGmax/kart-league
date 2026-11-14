import Box from "@mui/material/Box";
import { ord } from "../lib/constants";
import { colors, fontData } from "../theme";

const PODIUM = { 1: colors.gold, 2: colors.silver, 3: colors.bronze };

export default function PlaceBadge({ n, suffix = true }) {
  return (
    <Box component="span" sx={{ fontFamily: fontData, fontWeight: 700, color: PODIUM[n] || colors.ink, whiteSpace: "nowrap" }}>
      {n}{suffix && <sup style={{ fontSize: "0.65em" }}>{ord(n)}</sup>}
    </Box>
  );
}
