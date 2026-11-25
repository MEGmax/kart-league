// Each page's title and description, so tabs, bookmarks and history say where you are.
// (Link previews in chats use the static Open Graph tags in index.html: crawlers don't run the app.)
import { useEffect } from "react";

const PAGES = {
  "/standings": ["Home", "Live standings: ratings, cup wins and characters for every racer."],
  "/schedule": ["Schedule", "The season schedule: when each cup night is, which cups, who's in, and how past nights went."],
  "/join": ["Join", "Join the cup being raced and enter your finishing place after each race of tonight's cup."],
  "/history": ["History", "Every finished cup: results, race-by-race places and tracks."],
  "/stats": ["Stats", "The league in numbers, and everyone who has signed up."],
  "/rivals": ["Rivals", "Head to head: every pair's record, the rivalry of the season and upsets."],
  "/records": ["Records", "League records and the season's awards."],
  "/unclaimed": ["Unclaimed points", "Results from the photos nobody has claimed yet. Was one of them you?"],
  "/playoffs": ["Playoffs", "The playoff picture: seeds, the bracket and who's on the bubble."],
  "/rules": ["Rules", "How the league works: scoring, qualifying, tiebreakers and playoffs."],
  "/add": ["Add results", "Record a cup night's results."],
  "/upload": ["Upload results", "Upload a night's results photos and save the cups."],
  "/build": ["Cup builder", "Build the next cup and start racing."],
  "/admin": ["Admin", "League admin."],
  "/account": ["Your account", "Sign in, your profile and cup night emails."],
  "/unsubscribe": ["Email settings", "Cup night email settings."],
};

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

export function usePageTitle(pathname, league) {
  useEffect(() => {
    const [, first, second] = pathname.split("/");
    const [title, description] = PAGES["/" + first] || [null, null];
    const who = first === "standings" && second ? decodeURIComponent(second) : null;
    document.title = [who, title, league].filter(Boolean).join(" · ");
    if (description) setMeta("description", who ? `${who}'s season in the ${league}: every cup, tracks and head-to-heads.` : description);
  }, [pathname, league]);
}
