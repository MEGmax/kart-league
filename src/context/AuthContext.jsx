import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sb, q, siteUrl, authErr } from "../lib/supabaseClient";
import { avatarUrl } from "../lib/avatars";

const AuthContext = createContext(null);

function mapProfile(u) {
  return {
    id: u.id, displayName: u.display_name, email: u.email, role: u.role,
    color: u.color, favoriteCharacter: u.favorite_character,
    emailCupNights: !!u.email_cup_nights,
    avatarPath: u.avatar_path || null,
    avatarCrop: u.avatar_crop || null, // { source, cx, cy, zoom }: how the picture was cut (see src/lib/avatarCrop.js)
    avatarUrl: null, // a signed URL, filled in by loadProfile
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [hasOwner, setHasOwner] = useState(true);
  const userRef = useRef(null);
  userRef.current = user;

  async function loadProfile(uid) {
    const p = await q(sb.from("profiles").select("*").eq("id", uid).maybeSingle());
    const next = p ? mapProfile(p) : null;
    if (next && next.avatarPath) next.avatarUrl = await avatarUrl(next.avatarPath);
    if (userRef.current && userRef.current.id === uid) setProfile(next);
  }

  useEffect(() => {
    q(sb.rpc("league_has_owner")).then(setHasOwner).catch(() => {});
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      const nextUser = session ? session.user : null;
      const changed = (userRef.current && userRef.current.id) !== (nextUser && nextUser.id);
      setUser(nextUser);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); location.hash = "account"; }
      if (changed) setProfile(null);
      // Supabase advises not awaiting its own calls inside this callback.
      setTimeout(() => {
        if (nextUser && (changed || event === "USER_UPDATED")) loadProfile(nextUser.id);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isOwner = !!(profile && profile.role === "owner");
  const isAdmin = isOwner || !!(profile && profile.role === "admin");
  const myName = (profile && profile.displayName) || (user && (user.email || "").split("@")[0]) || "Racer";

  async function signIn(email, password) {
    return q(sb.auth.signInWithPassword({ email: email.trim(), password })).catch((e) => { throw new Error(authErr(e)); });
  }
  async function signUp(email, password, name) {
    return q(sb.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: siteUrl() } }))
      .catch((e) => { throw new Error(authErr(e)); });
  }
  async function signOut() {
    return sb.auth.signOut();
  }
  async function updatePassword(pw) {
    return q(sb.auth.updateUser({ password: pw })).then(() => setRecovery(false)).catch((e) => { throw new Error(authErr(e)); });
  }
  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  const value = useMemo(() => ({
    user, profile, ready, recovery, hasOwner, isAdmin, isOwner, myName,
    signIn, signUp, signOut, updatePassword, refreshProfile,
  }), [user, profile, ready, recovery, hasOwner, isAdmin, isOwner, myName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
