import { hashHue } from "../lib/constants";

const CUP_STYLE = {
  "Mushroom Cup": ["#FF5A5F", "M5 13a7 6 0 0 1 14 0zM10 13h4v5h-4z"],
  "Flower Cup": ["#FF8A1F", "M12 7a2.6 2.6 0 1 1 0 .01zM8 11a2.6 2.6 0 1 1 0 .01zM16 11a2.6 2.6 0 1 1 0 .01zM9.6 15.4a2.6 2.6 0 1 1 0 .01zM14.4 15.4a2.6 2.6 0 1 1 0 .01z"],
  "Star Cup": ["#FFD23F", "M12 5l2.1 4.4 4.8.6-3.5 3.3.9 4.8L12 15.8 7.7 18.1l.9-4.8L5.1 10l4.8-.6z"],
  "Special Cup": ["#B07CFF", "M6 16l-1-8 4 3 3-5 3 5 4-3-1 8z"],
  "Shell Cup": ["#33D17A", "M12 6a6 6 0 1 1-6 6h3a3 3 0 1 0 3-3z"],
  "Banana Cup": ["#F5E050", "M7 7c0 6 4 10 11 9-1 2-4 3-7 2-4-1-6-6-4-11z"],
  "Leaf Cup": ["#2DD4BF", "M6 18C6 10 11 6 18 6c0 7-4 12-12 12zM7 17l7-7"],
  "Lightning Cup": ["#38BDF8", "M13 4L7 13h4l-1 7 6-9h-4z"],
  Other: ["#9AA3C7", "M8 5v14M8 5h9l-2 3 2 3H8"],
};

// A trophy in the cup's color with its emblem; custom cup names get a hue from their name.
export default function CupIcon({ cup, size = 44 }) {
  const [fill, emblem] = CUP_STYLE[cup] || [`hsl(${hashHue(cup)} 80% 62%)`, CUP_STYLE.Other[1]];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill={fill} />
      <path d="M14 9H8a6 6 0 0 0 7 7M34 9h6a6 6 0 0 1-7 7" fill="none" stroke={fill} strokeWidth="3" strokeLinecap="round" />
      <path d="M21 25h6v7h-6zM15 32h18l2 7H13z" fill={fill} opacity=".85" />
      <g transform="translate(14 2) scale(.84)">
        <path d={emblem} fill="#0B0E1F" fillOpacity=".72" stroke="#0B0E1F" strokeOpacity=".72" strokeWidth="1" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
