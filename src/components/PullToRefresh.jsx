// Pull down from the top of any page on a phone to reload the league data in place (no page reload, so
// nothing flashes). Touch only; ignored while a dialog, drawer or menu is open or the page isn't at the top.
// If the reload fails, it falls back to reloading the page.
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useLeagueData } from "../context/LeagueDataContext";
import { colors } from "../theme";

const TRIGGER = 70; // px of (damped) pull that refreshes on release
const MAX = 110;
const MIN_SPIN_MS = 500; // keep the spinner up long enough to see that something happened

// Touches that start in these are someone else's gesture.
const SKIP = '[role="dialog"], [role="presentation"], [role="menu"], [role="listbox"], .MuiDrawer-root, .MuiPopover-root, input, textarea, select';

export default function PullToRefresh({ top = 56 }) {
  const { refresh } = useLeagueData();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const g = useRef({ y0: null, x0: 0, on: false, dist: 0, busy: false });
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const s = g.current;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    function start(e) {
      s.y0 = null;
      if (s.busy || e.touches.length !== 1 || !atTop()) return;
      if (document.body.style.overflow === "hidden") return; // a modal has locked the page
      if (e.target instanceof Element && e.target.closest(SKIP)) return;
      s.y0 = e.touches[0].clientY; s.x0 = e.touches[0].clientX; s.on = false; s.dist = 0;
    }
    function move(e) {
      if (s.y0 == null) return;
      const dy = e.touches[0].clientY - s.y0, dx = e.touches[0].clientX - s.x0;
      if (!s.on) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        // A sideways swipe, a scroll up, or the page moved: not a pull.
        if (dy <= 0 || Math.abs(dx) > dy || !atTop()) { s.y0 = null; return; }
        s.on = true;
      }
      if (e.cancelable) e.preventDefault();
      s.dist = Math.min(MAX, Math.max(0, dy) * 0.5);
      setPull(s.dist);
    }
    async function end() {
      if (s.y0 == null) return;
      const go = s.on && s.dist >= TRIGGER;
      s.y0 = null; s.on = false;
      if (!go) { setPull(0); return; }
      s.busy = true; setBusy(true); setPull(TRIGGER);
      const t0 = Date.now();
      try {
        await refreshRef.current();
      } catch {
        window.location.reload();
        return;
      }
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - t0))));
      s.busy = false; setBusy(false); setPull(0);
    }

    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  const shown = pull > 0 || busy;
  const ready = pull >= TRIGGER;
  return (
    <Box
      aria-hidden={!busy}
      role={busy ? "status" : undefined}
      aria-label={busy ? "Refreshing" : undefined}
      sx={{
        position: "fixed", left: "50%", top, zIndex: (t) => t.zIndex.appBar - 1, pointerEvents: "none",
        width: 40, height: 40, ml: "-20px", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: colors.panel2, border: `1px solid ${ready || busy ? colors.accent : colors.line}`,
        boxShadow: "0 6px 18px rgba(0,0,0,.45)",
        opacity: shown ? Math.min(1, pull / 40 + (busy ? 1 : 0)) : 0,
        transform: `translateY(${shown ? pull - 28 : -60}px)`,
        transition: g.current.on ? "none" : "transform .2s ease, opacity .2s ease",
      }}
    >
      {busy ? (
        <CircularProgress size={20} thickness={5} sx={{ color: colors.accent }} />
      ) : (
        <RefreshIcon sx={{ fontSize: 22, color: ready ? colors.accent : colors.muted, transform: `rotate(${(pull / TRIGGER) * 270}deg)` }} />
      )}
    </Box>
  );
}
