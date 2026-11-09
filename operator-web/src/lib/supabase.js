import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Like the Android app, there's no demo mode: this app's job is writing to the real database.
export const isConfigured = Boolean(url && anonKey)

// In a browser, supabase-js saves the login in localStorage by default, so operators stay signed in.
export const supabase = isConfigured ? createClient(url, anonKey) : null
