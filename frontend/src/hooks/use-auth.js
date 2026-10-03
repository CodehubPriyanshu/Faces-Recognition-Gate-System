import { useEffect, useState } from "react";
import { api, post, onAuthChanged, notifyAuthChanged } from "@/lib/api";
export function useAuth() {
  const [state, setState] = useState({
    user: null,
    session: null,
    role: null,
    profile: null,
    loading: true,
  });
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    const load = async () => {
      const request = ++generation;
      try {
        const { user } = await api("auth/session");
        if (mounted && request === generation)
          setState({
            user,
            session: user ? { user } : null,
            role: user?.role ?? null,
            profile: user ? { full_name: user.full_name, email: user.email } : null,
            loading: false,
          });
      } catch (error) {
        if (mounted && request === generation)
          setState({
            user: null,
            session: null,
            role: null,
            profile: null,
            loading: false,
            error: error.message,
          });
      }
    };
    const unsubscribe = onAuthChanged(load);
    window.addEventListener("focus", load);
    load();
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener("focus", load);
    };
  }, []);
  return state;
}
export async function signOut() {
  await post("auth/logout");
  notifyAuthChanged();
}
