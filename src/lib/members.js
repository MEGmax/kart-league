// Everyone who has signed up, from league_members() (signed-in members only; never emails).
import { useEffect, useState } from "react";
import { sb, q } from "./supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";

export function mapMembers(rows) {
  return (rows || []).map((r) => ({
    name: r.display_name, color: r.color, role: r.role || "member",
    character: r.favorite_character || "", tracks: r.favorite_tracks || [],
    joinedAt: r.joined_at, playerId: r.player_id || null, me: !!r.is_me,
  }));
}

// Refetched when the league data reloads. `missing` is true until schema.sql (v9) is re-run.
export function useMembers() {
  const { user } = useAuth();
  const { version } = useLeagueData();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user) { setMembers(null); return undefined; }
    let live = true;
    q(sb.rpc("league_members"))
      .then((r) => { if (live) { setMembers(mapMembers(r)); setError(""); setMissing(false); } })
      .catch((e) => {
        if (!live) return;
        const m = (e && e.message) || "";
        if ((e && e.code === "PGRST202") || /league_members|schema cache/i.test(m)) setMissing(true);
        else setError("Couldn't load who's signed up.");
      });
    return () => { live = false; };
  }, [user, version]);

  return { members, error, missing };
}
