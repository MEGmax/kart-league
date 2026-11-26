// Edit your profile picture: opened by tapping your picture on the Account page. Drag the picture to centre
// it in the circle, zoom with the slider (or + and −), arrow keys move it; choose a new picture, or go back
// to your initials. Saving cuts the square with saveAvatar() (src/lib/avatars.js); the original is kept so
// the picture can be re-centred later.
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import { useAuth } from "../context/AuthContext";
import { useFlash } from "../context/FlashContext";
import { MAX_ZOOM, cropRect, dragCrop, zoomCrop } from "../lib/avatarCrop";
import { clearAvatar, imageFromFile, imageFromProfile, saveAvatar } from "../lib/avatars";
import { initials } from "../lib/constants";
import { colors } from "../theme";

const STAGE = 260;

export default function AvatarEditor({ open, onClose }) {
  const { user, profile, refreshProfile } = useAuth();
  const flash = useFlash();
  const [img, setImg] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [crop, setCrop] = useState({ cx: 0.5, cy: 0.5, zoom: 1 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const drag = useRef(null);

  // Open on your saved original, cut where you left it.
  useEffect(() => {
    if (!open || !profile) return;
    let live = true;
    setImg(null); setFresh(false); setError("");
    const saved = profile.avatarCrop;
    setCrop(saved ? { cx: saved.cx, cy: saved.cy, zoom: saved.zoom } : { cx: 0.5, cy: 0.5, zoom: 1 });
    if (!profile.avatarPath) return undefined;
    setLoading(true);
    imageFromProfile(profile)
      .then((i) => { if (live) setImg(i); })
      .catch(() => { if (live) setError("Your picture couldn't be loaded. You can choose it again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, profile]);

  async function pick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      setImg(await imageFromFile(file));
      setFresh(true);
      setCrop({ cx: 0.5, cy: 0.5, zoom: 1 });
    } catch (err) {
      setError(err.message);
    }
  }

  const w = img ? img.naturalWidth : 1, h = img ? img.naturalHeight : 1;
  const r = cropRect(crop, w, h);
  const scale = STAGE / r.side;
  const move = (dx, dy) => setCrop((c) => dragCrop(c, dx, dy, w, h, STAGE));
  const zoomTo = (z) => setCrop((c) => zoomCrop(c, z, w, h));

  function onPointerDown(e) {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    move(dx, dy);
  }
  const onPointerUp = () => { drag.current = null; };
  function onKeyDown(e) {
    if (!img) return;
    const step = e.shiftKey ? 32 : 8;
    const keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (keys[e.key]) { e.preventDefault(); move(...keys[e.key]); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(crop.zoom + 0.1); }
    if (e.key === "-") { e.preventDefault(); zoomTo(crop.zoom - 0.1); }
  }

  async function save() {
    setBusy(true); setError("");
    try {
      await saveAvatar(user.id, { img, crop, fresh, source: profile.avatarCrop && profile.avatarCrop.source });
      await refreshProfile();
      flash("Picture saved");
      onClose();
    } catch (err) {
      setError(/tainted|insecure/i.test(err.message || "") ? "Your saved picture can't be re-cut in this browser. Choose it again to re-centre it." : err.message);
      setBusy(false);
    }
  }
  async function useInitials() {
    setBusy(true); setError("");
    try {
      await clearAvatar(user.id);
      await refreshProfile();
      flash("Showing your initials");
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const name = (profile && profile.displayName) || "";
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: "inherit", fontWeight: 800 }}>Profile picture</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: colors.muted, mb: 2 }}>
          {img ? "Drag the picture to centre it, and zoom in or out." : "Choose a picture. You can centre and zoom it before saving."}
        </Typography>
        <Box
          role={img ? "application" : undefined} tabIndex={img ? 0 : -1}
          aria-label={img ? "Picture position: drag, or use the arrow keys to move and plus or minus to zoom" : undefined}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}
          sx={{
            position: "relative", width: STAGE, height: STAGE, mx: "auto", overflow: "hidden", borderRadius: 2,
            bgcolor: colors.raised, touchAction: "none", cursor: img ? (drag.current ? "grabbing" : "grab") : "default", userSelect: "none",
            display: "grid", placeItems: "center",
            "&:focus-visible": { outline: `2px solid ${colors.gold}`, outlineOffset: 2 },
          }}
        >
          {img ? (
            <Box component="img" src={img.src} alt="" draggable={false}
              sx={{ position: "absolute", left: -r.x * scale, top: -r.y * scale, width: w * scale, height: h * scale, maxWidth: "none", pointerEvents: "none" }} />
          ) : loading ? (
            <CircularProgress />
          ) : (
            <Typography sx={{ fontWeight: 700, fontSize: "4rem", color: colors.muted }}>{initials(name)}</Typography>
          )}
          {/* What shows as your picture: the circle; the corners are dimmed. */}
          <Box aria-hidden sx={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: `0 0 0 ${STAGE}px rgba(13,18,56,0.65)`, border: `2px solid ${colors.ink}`, pointerEvents: "none" }} />
        </Box>

        {img && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2, px: 1 }}>
            <ZoomOutIcon sx={{ color: colors.muted }} />
            <Slider value={crop.zoom} min={1} max={MAX_ZOOM} step={0.01} onChange={(_, v) => zoomTo(v)} aria-label="Zoom" />
            <ZoomInIcon sx={{ color: colors.muted }} />
          </Stack>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 2, justifyContent: "center" }}>
          <Button variant="outlined" color="inherit" sx={{ borderColor: colors.rule }} disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
            {img || profile?.avatarPath ? "Replace picture" : "Choose a picture"}
          </Button>
          {profile && profile.avatarPath && <Button color="inherit" disabled={busy} onClick={useInitials}>Use my initials</Button>}
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !img}>{busy ? "Saving…" : "Save picture"}</Button>
      </DialogActions>
    </Dialog>
  );
}
