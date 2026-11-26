// A racer's face wherever their name is shown: their profile picture when they have one (and you're signed
// in, since pictures are members-only), otherwise the character they race most (or their initials).
import Avatar from "@mui/material/Avatar";
import CharacterFace from "./CharacterFace";
import { useFaces } from "../context/FacesContext";
import { initials } from "../lib/constants";
import { colors } from "../theme";

// `who` is a player ({ id, userId, name }) or a cup night attendee ({ userId, name }).
export default function RacerFace({ who, character, size = 36 }) {
  const { faceOf } = useFaces();
  const src = faceOf(who);
  if (!src) return <CharacterFace name={character || (who && !who.id ? who.name : undefined)} size={size} />;
  return (
    <Avatar
      src={src} alt="" title={who && who.name}
      sx={{ width: size, height: size, flexShrink: 0, bgcolor: colors.raised, color: colors.ink, fontWeight: 700, fontSize: Math.round(size * 0.34) }}
    >
      {initials(who && who.name)}
    </Avatar>
  );
}
