// A cup's results photo: signed-in members only (it shows the inside of someone's home). A thumbnail
// loads when the card scrolls near the screen; tapping it opens the full photo.
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { legacyPhoto, photoUrl, thumbOf } from "../lib/cupPhotos";
import { colors } from "../theme";

function useNearScreen(ref) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return undefined;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "300px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

export default function CupPhoto({ cup, signedIn }) {
  const ref = useRef(null);
  const near = useNearScreen(ref);
  const [thumb, setThumb] = useState(undefined); // undefined: not loaded yet; null: couldn't load
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(null);
  const phone = useMediaQuery("(max-width:599.95px)");
  const label = `Results screen photo for ${cup.cup}`;

  useEffect(() => {
    if (!near || !signedIn || thumb !== undefined) return undefined;
    let live = true;
    (cup.photoPath ? photoUrl(thumbOf(cup.photoPath)) : legacyPhoto(cup.id)).then((u) => { if (live) setThumb(u || null); });
    return () => { live = false; };
  }, [near, signedIn, thumb, cup.photoPath, cup.id]);

  async function show() {
    setOpen(true);
    if (!full) setFull(cup.photoPath ? await photoUrl(cup.photoPath) : thumb);
  }

  if (!signedIn) {
    return (
      <Typography sx={{ color: colors.muted, display: "flex", alignItems: "center", gap: 0.75, alignSelf: "start" }}>
        <PhotoCameraOutlinedIcon fontSize="small" />
        <span>Results photo: <RouterLink to="/account" style={{ color: colors.link }}>sign in</RouterLink> to see it</span>
      </Typography>
    );
  }

  return (
    <Box ref={ref} sx={{ alignSelf: "start", width: "100%", maxWidth: { xs: 220, md: 260 } }}>
      {thumb ? (
        <ButtonBase onClick={show} aria-label={`Open the ${label.toLowerCase()}`} sx={{ display: "block", width: "100%", borderRadius: 1, overflow: "hidden" }}>
          <Box component="img" src={thumb} alt={label} loading="lazy" sx={{ width: "100%", display: "block" }} />
        </ButtonBase>
      ) : thumb === null ? (
        <Typography variant="body2" sx={{ color: colors.muted }}>The results photo couldn't be loaded.</Typography>
      ) : (
        <Skeleton variant="rounded" sx={{ width: "100%", height: 150 }} />
      )}
      <Dialog open={open} onClose={() => setOpen(false)} fullScreen={phone} maxWidth="lg" aria-label={label}>
        <Box sx={{ position: "relative", bgcolor: "#000", minHeight: phone ? "100%" : 200, display: "grid", placeItems: "center" }}>
          <IconButton onClick={() => setOpen(false)} aria-label="Close photo" sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,.55)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,.75)" } }}>
            <CloseIcon />
          </IconButton>
          {full ? <Box component="img" src={full} alt={label} sx={{ maxWidth: "100%", maxHeight: phone ? "100vh" : "85vh", display: "block" }} /> : <Skeleton variant="rectangular" sx={{ width: 600, maxWidth: "100%", height: 400 }} />}
        </Box>
      </Dialog>
    </Box>
  );
}
