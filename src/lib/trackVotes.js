// The track vote for a cup night, from track_vote_tally() (signed-in members only).
import { useCallback, useEffect, useState } from "react";
import { sb, q } from "./supabaseClient";
import { mapTally } from "./tracks";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";

// The vote for one cup night, refetched whenever the league data reloads (votes arrive over realtime).
// `missing` is true when the database doesn't have track voting yet (schema.sql not re-run).
export function useTrackVotes(eventId) {
  const { user } = useAuth();
  const { version } = useLeagueData();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !eventId) { setRows(null); return undefined; }
    let live = true;
    q(sb.rpc("track_vote_tally", { p_event: eventId }))
      .then((r) => { if (live) { setRows(mapTally(r)); setError(""); setMissing(false); } })
      .catch((e) => {
        if (!live) return;
        const m = (e && e.message) || "";
        if ((e && e.code === "PGRST202") || /track_vote_tally|schema cache/i.test(m)) setMissing(true);
        else setError("Couldn't load the track vote.");
      });
    return () => { live = false; };
  }, [user, eventId, version, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { rows, error, missing, refresh };
}
