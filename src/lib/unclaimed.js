// Results nobody has claimed that might be yours: every unclaimed human result except those in cups you
// already have a result in. `waiting` counts the ones you haven't asked for yet; it's the badge on your
// profile picture. The list and the "That was me" requests live on the Account page (UnclaimedResults).
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";
import { useMyData } from "./accountData";
import { compute } from "./standings";

const NONE = { m: null, mine: null, items: [], waiting: 0, pendingFor: () => null, claimable: () => false };

export function useUnclaimed() {
  const { state } = useLeagueData();
  const { user } = useAuth();
  const { claims } = useMyData();
  return useMemo(() => {
    if (!state || !user || !state.cups.length) return NONE;
    const m = compute(state, { season: "all" });
    const mine = state.players.find((p) => (p.userId || p.user_id) === user.id) || null;
    const pendingFor = (u) => claims.find((c) => c.cupId === u.cup.id && c.rid === u.r.rid && c.status === "pending") || null;
    const inCup = (u) => !!mine && m.cupInfo.get(u.cup.id).res.some((r) => r.p === mine.id);
    const items = m.unclaimed.filter((u) => !inCup(u));
    const claimable = (u) => !pendingFor(u) && !inCup(u);
    return { m, mine, items, waiting: items.filter(claimable).length, pendingFor, claimable };
  }, [state, user, claims]);
}
