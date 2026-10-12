import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null cuando no hay llaves configuradas: la app arranca en modo demo. */
export const supabase: SupabaseClient | null = url && llave
  ? createClient(url, llave, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
