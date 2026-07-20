import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "security_guard" | "gate_operator";

export interface AuthProfile {
  full_name: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: AuthProfile | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    const loadFor = async (session: Session | null) => {
      if (!session?.user) {
        if (mounted) {
          setState({ user: null, session: null, role: null, profile: null, loading: false });
        }
        return;
      }
      // Defer with setTimeout so the auth callback isn't blocked
      setTimeout(async () => {
        const [{ data: roleRows }, { data: profile }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", session.user.id),
          supabase
            .from("profiles")
            .select("full_name,email")
            .eq("id", session.user.id)
            .maybeSingle(),
        ]);
        if (!mounted) return;
        const role = (roleRows?.[0]?.role as AppRole | undefined) ?? null;
        setState({
          user: session.user,
          session,
          role,
          profile: profile ?? {
            full_name: session.user.email ?? "",
            email: session.user.email ?? "",
          },
          loading: false,
        });
      }, 0);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadFor(session);
    });

    supabase.auth.getSession().then(({ data }) => loadFor(data.session));

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}
