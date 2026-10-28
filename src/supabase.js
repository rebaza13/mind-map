import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
)

// The owner's password login still works; everyone else uses Google. Each user only sees their own rows (RLS).
export const OWNER_EMAIL = 'rebazawat10@gmail.com'
export const OWNER_HANDLE = 'rebazawat'

// A login lasts one week, then asks for the password again.
const WEEK = 7 * 24 * 3600 * 1000
const KEY = 'mindbloom.loginAt'

export const markLogin = () => localStorage.setItem(KEY, String(Date.now()))
export const clearLogin = () => localStorage.removeItem(KEY)
export function sessionExpired() {
  const at = Number(localStorage.getItem(KEY))
  return at > 0 && Date.now() - at > WEEK
}
