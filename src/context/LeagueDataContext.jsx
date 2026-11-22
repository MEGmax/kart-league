import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sb, q } from "../lib/supabaseClient";
import { normalize } from "../lib/standings";
import { mapEvents } from "../lib/events";

const LeagueDataContext = createContext(null);

// The columns the public pages need. Signed-out visitors may read only these (see "what signed-out
// visitors can see" in schema.sql), so never select("*") on these tables.
const COLS = {
  players: "id,name,color,aliases,registered_at",
  cups: "id,cup,date,week,max,results,notes,has_photo,added_at,status,maps,template_id",
  races: "cup_id,race,player_id,position,points,character,entered_at",
  templates: "id,name,maps,created_at",
  events: "id,starts_at,cups,notes,status,sequence,created_at,updated_at",
};

function mapCup(c) {
  return {
    id: c.id, cup: c.cup, date: c.date, week: c.week, max: c.max, results: c.results || [],
    notes: c.notes || "", hasPhoto: !!c.has_photo || !!c.photo_path, photoPath: c.photo_path || null,
    addedAt: Number(c.added_at) || 0, status: c.status || "complete", maps: c.maps || [],
  };
}

export function LeagueDataProvider({ children }) {
  const [state, setState] = useState(null);
  const [events, setEvents] = useState(null);
  const [loadError, setLoadError] = useState("");
  // Goes up after every reload, so pages holding private data (claims, submissions) know to refetch.
  const [version, setVersion] = useState(0);
  const reloadTimer = useRef(null);

  async function loadPublic() {
    const { data: auth } = await sb.auth.getSession();
    const [league, players, links, cups, races, templates, eventRows, attendees] = await Promise.all([
      q(sb.from("league").select("settings").eq("id", 1).maybeSingle()),
      q(sb.from("players").select(COLS.players)),
      // Which account each player is: signed-in members only.
      auth && auth.session ? q(sb.from("players").select("id,user_id")).catch(() => []) : Promise.resolve([]),
      // photo_path arrives with the v6 schema; before it's run, fall back to the columns there are.
      q(sb.from("cups").select(COLS.cups + ",photo_path")).catch(() => q(sb.from("cups").select(COLS.cups))),
      // These two tables arrive with the race-by-race update; an older database just has none yet.
      q(sb.from("race_results").select(COLS.races)).catch(() => []),
      q(sb.from("cup_templates").select(COLS.templates)).catch(() => []),
      // Cup nights arrive with the v4 schema; until it's run there are simply none.
      q(sb.from("events").select(COLS.events)).catch(() => []),
      q(sb.rpc("event_attendees")).catch(() => []),
    ]);
    const userIds = new Map(links.map((l) => [l.id, l.user_id]));
    const withIds = players.map((p) => ({ ...p, user_id: userIds.get(p.id) || null }));
    setState(normalize({ league: league ? league.settings : {}, players: withIds, cups: cups.map(mapCup), races, templates }));
    setEvents(mapEvents(eventRows, attendees));
    setLoadError("");
    setVersion((v) => v + 1);
  }

  function reloadSoon() {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { loadPublic().catch(() => {}); }, 250);
  }

  useEffect(() => {
    loadPublic().catch((e) => setLoadError((e && e.message) || "Couldn't load league data."));
    let channel;
    try {
      channel = sb.channel("league-live").on("postgres_changes", { event: "*", schema: "public" }, reloadSoon).subscribe();
    } catch {
      // live updates are a convenience; the page still works without them
    }
    // Signing in or out changes what this browser may read (account links, photos).
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") reloadSoon();
    });
    return () => {
      if (channel) sb.removeChannel(channel);
      if (sub && sub.subscription) sub.subscription.unsubscribe();
      clearTimeout(reloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull to refresh: reload everything now and resolve when it's in (pages with private data refetch on `version`).
  const refresh = () => loadPublic().catch((e) => { setLoadError((e && e.message) || "Couldn't load league data."); throw e; });

  const value = useMemo(() => ({ state, events, loadError, version, reload: reloadSoon, refresh }), [state, events, loadError, version]);

  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}

export function useLeagueData() {
  const ctx = useContext(LeagueDataContext);
  if (!ctx) throw new Error("useLeagueData must be used within LeagueDataProvider");
  return ctx;
}
