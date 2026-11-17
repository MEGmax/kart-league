// Private data that depends on who's signed in: your own claims and submissions, and (for admins)
// everything waiting for review. Refetches whenever the league data reloads (realtime changes).
import { useEffect, useState } from "react";
import { sb, q } from "./supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useLeagueData } from "../context/LeagueDataContext";

export function mapSub(s) {
  return {
    id: s.id, batch: s.batch || s.id, cup: s.cup, date: s.date, week: s.week || 1, max: s.max, maps: s.maps || [],
    rows: s.rows || [], notes: s.notes || "", hasPhoto: !!s.has_photo, status: s.status, submittedBy: s.submitted_by,
    submitterName: s.submitter_name, submittedAt: Number(s.submitted_at) || 0, reviewNote: s.review_note || "", cupId: s.cup_id || null,
  };
}

export function mapClaim(c) {
  return {
    id: c.id, cupId: c.cup_id, rid: c.rid, userId: c.user_id, character: c.character || "", note: c.note || "",
    status: c.status, createdAt: Number(c.created_at) || 0, reviewNote: c.review_note || "",
  };
}

function mapProfileRow(u) {
  return { id: u.id, displayName: u.display_name, email: u.email, role: u.role || "member", color: u.color, createdAt: u.created_at };
}

// Group a list of submissions into nights (by batch), oldest first.
export function groupBatches(subs) {
  const by = new Map();
  subs.forEach((s) => { if (!by.has(s.batch)) by.set(s.batch, []); by.get(s.batch).push(s); });
  return [...by.values()]
    .map((list) => list.sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id)))
    .sort((a, b) => a[0].submittedAt - b[0].submittedAt);
}

export function useMyData() {
  const { user } = useAuth();
  const { version } = useLeagueData();
  const [data, setData] = useState({ claims: [], subs: [], loaded: false });
  const uid = user && user.id;
  useEffect(() => {
    if (!uid) { setData({ claims: [], subs: [], loaded: true }); return; }
    let live = true;
    Promise.all([
      q(sb.from("claims").select("*").eq("user_id", uid)).catch(() => []),
      q(sb.from("submissions").select("*").eq("submitted_by", uid)).catch(() => []),
    ]).then(([claims, subs]) => {
      if (!live) return;
      setData({
        claims: claims.map(mapClaim).sort((a, b) => b.createdAt - a.createdAt),
        subs: subs.map(mapSub).sort((a, b) => b.submittedAt - a.submittedAt),
        loaded: true,
      });
    });
    return () => { live = false; };
  }, [uid, version]);
  return data;
}

export function useAdminData() {
  const { isAdmin } = useAuth();
  const { version } = useLeagueData();
  const [data, setData] = useState({ claims: [], pending: [], users: [], invites: [], loaded: false, error: "" });
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    Promise.all([
      q(sb.from("claims").select("*").eq("status", "pending")),
      q(sb.from("submissions").select("*").eq("status", "pending")),
      q(sb.from("profiles").select("*")),
      q(sb.from("player_invites").select("*")),
    ]).then(([claims, pending, users, invites]) => {
      if (!live) return;
      setData({
        claims: claims.map(mapClaim).sort((a, b) => a.createdAt - b.createdAt),
        pending: pending.map(mapSub),
        users: users.map(mapProfileRow),
        invites: invites.map((i) => ({ playerId: i.player_id, email: i.email })),
        loaded: true, error: "",
      });
    }).catch((e) => { if (live) setData((d) => ({ ...d, loaded: true, error: (e && e.message) || "Couldn't load admin data." })); });
    return () => { live = false; };
  }, [isAdmin, version]);
  return data;
}
