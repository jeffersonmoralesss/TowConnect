// Installs a `localStorage` that saves to a small SQLite database on the phone. Supabase stores the
// login session there, so operators stay signed in after closing the app. We also use it for a few
// values the background location task needs (see src/location/report.js).
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Unlike the driver app there is no demo mode here: this app's whole job is writing to the real
// database (sign-up, documents, positions), so pretending would test nothing. App.js shows setup
// instructions instead when the keys are missing.
export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // there is no browser address bar in a native app
      },
    })
  : null;

// Login tokens expire after an hour and are refreshed on a timer. Phones pause timers in the
// background, so we only run the timer while the app is on screen. Background requests still work:
// supabase-js refreshes an expired token right before it sends a request.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
