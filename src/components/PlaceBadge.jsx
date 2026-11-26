import Box from "@mui/material/Box";
import { ord } from "../lib/constants";

// A finishing place in plain type ("1st", "4th"). Medal colours are for the Home podium only.
export default function PlaceBadge({ n, suffix = true }) {
  return (
    <Box component="span" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
      {n}{suffix && <sup style={{ fontSize: "0.65em" }}>{ord(n)}</sup>}
    </Box>
  );
}
