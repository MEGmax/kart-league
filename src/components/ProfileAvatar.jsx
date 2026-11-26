// Your profile picture: the uploaded picture, else your initials on a plain disc. `badge` puts a count in the
// corner (results nobody has claimed that might be yours); 0 shows nothing.
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import { initials } from "../lib/constants";
import { colors } from "../theme";

export default function ProfileAvatar({ name, src, size = 40, badge = 0, badgeLabel }) {
  const face = (
    <Avatar
      src={src || undefined} alt=""
      sx={{
        width: size, height: size, bgcolor: colors.raised, color: colors.ink, border: `1px solid ${colors.rule}`,
        fontWeight: 700, fontSize: Math.round(size * 0.38), letterSpacing: 0,
      }}
    >
      {initials(name)}
    </Avatar>
  );
  if (!badge) return face;
  return (
    <Badge
      badgeContent={badge} max={99} overlap="circular" anchorOrigin={{ vertical: "top", horizontal: "right" }}
      aria-label={badgeLabel}
      sx={{ "& .MuiBadge-badge": { bgcolor: colors.red, color: colors.bg, fontWeight: 800, fontSize: "0.75rem", minWidth: 20, height: 20, border: `2px solid ${colors.bg}` } }}
    >
      {face}
    </Badge>
  );
}
