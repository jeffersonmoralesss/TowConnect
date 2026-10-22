// The one function every location source funnels into: the background task, the foreground
// watcher and the once-a-minute heartbeat all call reportPosition().
//
// It saves its memory (which operator, what was last sent) in localStorage rather than in normal
// variables. When Android wakes the app in the background just to deliver a location, it starts a
// fresh copy of the JavaScript with empty variables; localStorage survives that.
import { sendPosition } from '../lib/api';
import '../lib/supabase'; // makes sure localStorage is installed before we use it
import { shouldSend } from './throttle';

const OPERATOR_KEY = 'towconnect.sharing.operatorId';
const LAST_SENT_KEY = 'towconnect.sharing.lastSent';
const LAST_ERROR_KEY = 'towconnect.sharing.lastError';

export function rememberOperator(operatorId) {
  localStorage.setItem(OPERATOR_KEY, operatorId);
  localStorage.removeItem(LAST_SENT_KEY); // so the next fix is sent immediately
  localStorage.removeItem(LAST_ERROR_KEY);
}

export function forgetOperator() {
  localStorage.removeItem(OPERATOR_KEY);
}

// For the home screen: when did we last send, and did the last attempt fail?
export function sharingStatus() {
  const raw = localStorage.getItem(LAST_SENT_KEY);
  return {
    lastSentAt: raw ? JSON.parse(raw).timestamp : null,
    lastError: localStorage.getItem(LAST_ERROR_KEY),
  };
}

// `location` is what expo-location gives us: { coords: { latitude, longitude, accuracy }, timestamp }.
// Returns true if it was sent.
export async function reportPosition(location, { force = false } = {}) {
  const operatorId = localStorage.getItem(OPERATOR_KEY);
  if (!operatorId || !location?.coords) return false; // sharing was switched off

  const next = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp ?? Date.now(),
  };
  const raw = localStorage.getItem(LAST_SENT_KEY);
  const last = raw ? JSON.parse(raw) : null;
  if (!force && !shouldSend(last, next)) return false;

  try {
    await sendPosition(operatorId, next);
    localStorage.setItem(LAST_SENT_KEY, JSON.stringify(next));
    localStorage.removeItem(LAST_ERROR_KEY);
    return true;
  } catch (err) {
    // No signal under a bridge, for example. Not fatal: the next fix tries again, because
    // LAST_SENT_KEY wasn't updated.
    localStorage.setItem(LAST_ERROR_KEY, err.message);
    return false;
  }
}
