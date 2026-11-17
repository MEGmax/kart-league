import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sb, q } from "../lib/supabaseClient";
import { normalize } from "../lib/standings";
import { mapEvents } from "../lib/events";

const LeagueDataContext = createContext(null);

function mapCup(c) {
  return {
    id: c.id, cup: c.cup, date: c.date, week: c.week, max: c.max, results: c.results || [],
    notes: c.notes || "", hasPhoto: !!c.has_photo, addedAt: Number(c.added_at) || 0,
    status: c.status || "complete", maps: c.maps || [],
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
    const [league, players, cups, races, templates, eventRows, attendees] = await Promise.all([
      q(sb.from("league").select("settings").eq("id", 1).maybeSingle()),
      q(sb.from("players").select("id,name,color,aliases,user_id,registered_at")),
      q(sb.from("cups").select("*")),
      // These two tables arrive with the race-by-race update; an older database just has none yet.
      q(sb.from("race_results").select("*")).catch(() => []),
      q(sb.from("cup_templates").select("*")).catch(() => []),
      // Cup nights arrive with the v4 schema; until it's run there are simply none.
      q(sb.from("events").select("*")).catch(() => []),
      q(sb.rpc("event_attendees")).catch(() => []),
    ]);
    setState(normalize({ league: league ? league.settings : {}, players, cups: cups.map(mapCup), races, templates }));
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
    return () => { if (channel) sb.removeChannel(channel); clearTimeout(reloadTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ state, events, loadError, version, reload: reloadSoon }), [state, events, loadError, version]);

  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}

export function useLeagueData() {
  const ctx = useContext(LeagueDataContext);
  if (!ctx) throw new Error("useLeagueData must be used within LeagueDataProvider");
  return ctx;
}
