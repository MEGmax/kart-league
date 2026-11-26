// A little kart with Mario at the wheel that drives along the bottom of the home page hero, on the
// brand stripe. Purely decorative: hidden from screen readers, and parked (not driving) for anyone who
// prefers reduced motion.
import Box from "@mui/material/Box";
import { keyframes } from "@emotion/react";
import { charSrc } from "../lib/constants";
import { colors } from "../theme";

const W = 112; // rendered width in px

// Across the screen in the first 55%, then a pause off to the right before the next lap.
const drive = keyframes`
  0%   { transform: translateX(-${W + 40}px); }
  55%  { transform: translateX(calc(100vw + 40px)); }
  100% { transform: translateX(calc(100vw + 40px)); }
`;
const bounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-1.5px); }
`;
const spin = keyframes`
  to { transform: rotate(360deg); }
`;
const puff = keyframes`
  0%   { transform: translateX(0) scale(.4); opacity: .7; }
  100% { transform: translateX(-18px) scale(1.2); opacity: 0; }
`;

function Wheel({ cx, cy, r }) {
  return (
    <g className="wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r} fill="#15151c" />
      <circle cx={cx} cy={cy} r={r * 0.45} fill="#c9ced8" />
      <rect x={cx - 1} y={cy - r * 0.9} width="2" height={r * 0.6} fill="#c9ced8" />
    </g>
  );
}

export default function KartRacer({ bottom = 0 }) {
  const face = charSrc("Mario");
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute", left: 0, bottom, width: W, pointerEvents: "none", zIndex: 1,
        animation: `${drive} 14s linear infinite`,
        "& .body": { animation: `${bounce} .32s ease-in-out infinite` },
        "& .wheel": { animation: `${spin} .45s linear infinite` },
        "& .puff": { animation: `${puff} .6s ease-out infinite` },
        "& .puff2": { animationDelay: ".3s" },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none", left: "auto", right: { xs: 12, md: "8%" },
          "& .body, & .wheel, & .puff": { animation: "none" },
          "& .puff": { display: "none" },
        },
      }}
    >
      <svg viewBox="0 0 120 72" width={W} height={(W * 72) / 120} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <clipPath id="kart-face"><circle cx="52" cy="22" r="17" /></clipPath>
        </defs>
        {/* Exhaust puffs out the back. */}
        <circle className="puff" cx="4" cy="46" r="4" fill="rgba(255,255,255,.55)" />
        <circle className="puff puff2" cx="4" cy="44" r="3" fill="rgba(255,255,255,.45)" />
        <g className="body">
          {/* Shadow under the driver, then the driver: Mario's face in a helmet ring. */}
          <circle cx="52" cy="22" r="19" fill={colors.brandRed} />
          {face
            ? <image href={face} x="35" y="5" width="34" height="34" clipPath="url(#kart-face)" preserveAspectRatio="xMidYMid slice" />
            : <circle cx="52" cy="22" r="17" fill="#f2c9a0" />}
          {/* Steering wheel. */}
          <line x1="70" y1="32" x2="78" y2="42" stroke="#15151c" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="70" cy="31" rx="2.5" ry="6" fill="#15151c" transform="rotate(-30 70 31)" />
          {/* Chassis: a low red body with a white racing stripe and a navy nose. */}
          <path d="M6 46 Q8 38 22 38 L40 38 Q46 44 58 44 L86 42 Q106 42 114 50 L112 56 L10 56 Q5 54 6 46 Z" fill={colors.brandRed} />
          <path d="M22 45 L104 46" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path d="M100 43 Q110 44 114 50 L112 56 L100 56 Z" fill={colors.navy} />
          {/* Exhaust pipe and spoiler. */}
          <rect x="2" y="43" width="10" height="5" rx="2" fill="#9aa3b5" />
          <path d="M8 38 L20 30 L24 30 L20 38 Z" fill={colors.navy} />
          <circle cx="58" cy="50" r="5" fill="#fff" />
          <text x="58" y="52.6" textAnchor="middle" fontSize="7" fontWeight="900" fill={colors.brandRed} fontFamily="Arial Black, sans-serif">M</text>
        </g>
        <Wheel cx={28} cy={58} r={12} />
        <Wheel cx={98} cy={60} r={10} />
      </svg>
    </Box>
  );
}
