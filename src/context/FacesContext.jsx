// Everyone's profile picture, so a racer's picture can sit next to their name across the site (RacerFace).
// Pictures are in a private bucket, so only signed-in members see them; signed-out visitors (and racers
// without a picture or an account) get their character instead. Paths come from league_members() (v13 in
// supabase/schema.sql) and are signed in one batch; signed URLs are cached and re-signed after 12 hours.
// Your own picture comes from your profile, so a new one shows everywhere as soon as it's saved.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sb, q } from "../lib/supabaseClient";
import { avatarUrls } from "../lib/avatars";
import { useAuth } from "./AuthContext";
import { useLeagueData } from "./LeagueDataContext";

const FacesContext = createContext({ faceOf: () => null });
const FRESH_MS = 12 * 3600 * 1000;

export function FacesProvider({ children }) {
  const { user, profile } = useAuth();
  const { version } = useLeagueData();
  const [rows, setRows] = useState([]); // [{ userId, playerId, path }]
  const [urls, setUrls] = useState({}); // path -> { url, at }
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  useEffect(() => {
    if (!user) { setRows([]); return undefined; }
    let live = true;
    q(sb.rpc("league_members"))
      .then((r) => {
        if (!live) return;
        setRows((r || []).filter((m) => m.avatar_path).map((m) => ({ userId: m.user_id, playerId: m.player_id, path: m.avatar_path })));
      })
      .catch(() => {}); // before schema v9/v13 there's nothing to show: everyone keeps their character
    return () => { live = false; };
  }, [user, version]);

  useEffect(() => {
    const now = Date.now();
    const need = [...new Set(rows.map((r) => r.path))].filter((p) => !urlsRef.current[p] || now - urlsRef.current[p].at > FRESH_MS);
    if (!need.length) return undefined;
    let live = true;
    avatarUrls(need).then((got) => {
      if (!live) return;
      setUrls((old) => {
        const next = { ...old };
        Object.keys(got).forEach((p) => { next[p] = { url: got[p], at: now }; });
        return next;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [rows]);

  const value = useMemo(() => {
    const userOfPlayer = new Map(rows.map((r) => [r.playerId, r.userId]));
    const urlOfUser = new Map();
    rows.forEach((r) => { if (urls[r.path]) urlOfUser.set(r.userId, urls[r.path].url); });
    const meId = user && user.id;
    const mine = (profile && profile.avatarUrl) || null;
    // `who` is a player ({ id, userId }) or a cup night attendee ({ userId }).
    function faceOf(who) {
      if (!who || !user) return null;
      const uid = who.userId || who.user_id || userOfPlayer.get(who.id) || null;
      if (!uid) return null;
      return uid === meId ? mine : urlOfUser.get(uid) || null;
    }
    return { faceOf };
  }, [rows, urls, user, profile]);

  return <FacesContext.Provider value={value}>{children}</FacesContext.Provider>;
}

export function useFaces() {
  return useContext(FacesContext);
}
