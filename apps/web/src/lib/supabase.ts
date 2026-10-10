import { createClient } from '@supabase/supabase-js';

/** Der anon-Schlüssel ist öffentlich gedacht, geschützt wird über Row Level Security. */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  // PKCE: Der Bestätigungslink kommt mit ?code=... in der Query. Der Standard-Ablauf nutzt den
  // URL-Hash, den der HashRouter als Route lesen würde.
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true },
});
