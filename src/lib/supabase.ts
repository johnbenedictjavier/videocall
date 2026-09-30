import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key && !url.includes('your-project'))

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null
