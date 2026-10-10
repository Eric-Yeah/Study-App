import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from './supabase';

interface AuthApi {
  user: User | null;
  loading: boolean;
  /** true, nachdem jemand über den Link in der E-Mail zum Zurücksetzen kommt: jetzt ein neues Passwort setzen. */
  recovering: boolean;
  finishRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user: session?.user ?? null,
      loading,
      recovering,
      finishRecovery: () => setRecovering(false),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, recovering],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden');
  return ctx;
}

/** Für Bereiche hinter der Anmeldung. */
export function useUserId(): string {
  const { user } = useAuth();
  if (!user) throw new Error('Kein angemeldeter Nutzer');
  return user.id;
}
