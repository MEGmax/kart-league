import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import { charSrc } from "../lib/constants";

export default function CharacterChip({ name, extra }) {
  if (!name) return null;
  const src = charSrc(name);
  return (
    <Chip
      size="small"
      variant="outlined"
      avatar={src ? <Avatar src={src} alt="" /> : undefined}
      label={extra ? `${name} ×${extra}` : name}
      sx={{ fontWeight: 600 }}
    />
  );
}
