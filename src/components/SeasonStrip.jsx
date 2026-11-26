// The season as a strip of cups, one group per night, oldest on the left: filled for a cup raced, hollow
// for one planned on an upcoming night, dashed for cups not on the schedule yet. It sticks under the header
// on the Schedule page and works like a scroll bar: the night on screen is underlined, and tapping a night
// scrolls to it.
//   segments: [{ id, label, aria, target (element id to scroll to, or null), pips: ["raced"|"planned"|"tbd"] }]
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { colors } from "../theme";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pipSx(kind, on) {
  // Phones: fixed-width pips, the strip scrolls sideways if it must. Wider screens: the pips share the width.
  const base = { width: { xs: 8, md: "auto" }, flex: { md: "1 1 0" }, height: 16, borderRadius: "2px", flexShrink: 0 };
  if (kind === "raced") return { ...base, bgcolor: on ? colors.ink : colors.muted };
  if (kind === "planned") return { ...base, border: `1.5px solid ${on ? colors.ink : colors.muted}` };
  return { ...base, border: `1.5px dashed ${colors.rule}` };
}

export default function SeasonStrip({ segments, summary }) {
  const [top, setTop] = useState(0);
  const [active, setActive] = useState(null);
  const stripRef = useRef(null);
  const rowRef = useRef(null);

  // Stick just under the site header, whatever its height on this screen.
  useLayoutEffect(() => {
    const header = document.querySelector("header");
    const measure = () => setTop(header ? Math.round(header.getBoundingClientRect().height) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // The night on screen: the section whose top has most recently passed under the strip, else the first one.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = top + (stripRef.current ? stripRef.current.offsetHeight : 0) + 32;
      let best = null, bestTop = -Infinity, first = null, firstTop = Infinity;
      segments.forEach((s) => {
        const el = s.target && document.getElementById(s.target);
        if (!el) return;
        const t = el.getBoundingClientRect().top;
        if (t <= line && t > bestTop) { best = s.id; bestTop = t; }
        if (t < firstTop) { first = s.id; firstTop = t; }
      });
      setActive(best || first);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [segments, top]);

  // Keep the underlined night in view when the strip is wider than the screen.
  useEffect(() => {
    const row = rowRef.current;
    const btn = row && active && row.querySelector(`[data-seg="${active}"]`);
    if (!btn) return;
    const left = btn.offsetLeft - row.clientWidth / 2 + btn.offsetWidth / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active]);

  function jump(target) {
    const el = document.getElementById(target);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - top - (stripRef.current ? stripRef.current.offsetHeight : 0) - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? "auto" : "smooth" });
  }

  if (!segments.length) return null;
  return (
    <Box ref={stripRef} sx={{ position: "sticky", top, zIndex: 2, bgcolor: colors.bg, borderBottom: `1px solid ${colors.line}`, mb: 3, pt: 1 }}>
      {summary && <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: colors.muted }}>{summary}</Typography>}
      <Box
        ref={rowRef} component="nav" aria-label="The season, night by night"
        sx={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" }, mx: -0.75 }}
      >
        {segments.map((s, i) => {
          const on = s.id === active;
          const props = s.target
            ? { component: ButtonBase, onClick: () => jump(s.target), "aria-current": on ? "location" : undefined, "aria-label": s.aria, title: s.aria }
            : { role: "img", "aria-label": s.aria, title: s.aria };
          return (
            <Box
              key={s.id} data-seg={s.id} {...props}
              sx={{
                flexShrink: 0, flexGrow: { xs: 0, md: s.pips.length }, flexBasis: { md: 0 },
                display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-end", gap: 0.5,
                minHeight: 52, px: 0.75, pt: 1, pb: 0.75, borderRadius: 0,
                borderBottom: `2px solid ${on ? colors.ink : "transparent"}`,
                ...(i > 0 && { boxShadow: `inset 1px 0 0 ${colors.line}` }),
                "&:focus-visible": { outline: `2px solid ${colors.gold}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ display: "flex", gap: "3px", width: "100%" }}>
                {s.pips.map((k, j) => <Box key={j} sx={pipSx(k, on)} />)}
              </Box>
              <Typography component="span" sx={{ fontSize: "0.875rem", fontWeight: on ? 700 : 600, color: on ? colors.ink : colors.muted, whiteSpace: "nowrap", lineHeight: 1.2, textAlign: "left" }}>
                {s.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
