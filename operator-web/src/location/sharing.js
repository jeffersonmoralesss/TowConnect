// Location sharing in the browser.
//
// The hard limit: iPhones pause a web page the moment it's not on screen (another app, or the screen
// locks). So this file shares location only while the page is visible, and does three things to make
// the most of that time:
//   1. sends a position immediately whenever the page becomes visible again,
//   2. checks in at least once a minute while visible (same throttle rules as the Android app),
//   3. can keep the screen awake, for operators whose phone sits in a dash mount.
// Everything outside those moments is covered by the auto check-in shortcut.
import { sendPosition } from '../lib/api'
import { HEARTBEAT_MS, shouldSend } from '../shared/throttle'

let operatorId = null
let watchId = null
let heartbeatTimer = null
let lastSent = null // the last fix we sent
let latest = null // the newest fix we've seen
let wakeLock = null
let wantWakeLock = false

// A tiny "store": screens subscribe to status changes instead of polling.
let status = { sharing: false, lastSentAt: null, lastError: null, screenAwake: false }
const listeners = new Set()
function update(changes) {
  status = { ...status, ...changes }
  listeners.forEach((fn) => fn(status))
}
export function subscribe(fn) {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}

// Browser fix -> the { latitude, longitude, accuracy, timestamp } shape the shared throttle expects.
const toFix = (pos) => ({
  latitude: pos.coords.latitude,
  longitude: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  timestamp: pos.timestamp || Date.now(),
})

// Browsers only allow location on secure pages: https:// addresses, or localhost on your own computer.
// On a plain http:// network address (like http://10.0.0.13:5174 during development) they refuse
// without even asking, which looks exactly like "the user said no". We check for that first so the
// message names the real cause.
export const INSECURE_ADDRESS_MESSAGE =
  'Location only works on a secure address (one starting with https://). On this computer, open http://localhost:5174 instead. On a phone, use the deployed https:// address.'

// Turns the browser's error codes into instructions an operator can act on.
export function describeLocationError(err) {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return INSECURE_ADDRESS_MESSAGE
  if (err?.code === 1) {
    return 'Location is blocked for Tow Connect. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App. On a Mac: System Settings → Privacy & Security → Location Services → turn on your browser. Then try again.'
  }
  if (err?.code === 3) return 'Getting your location took too long. Step outside or near a window and try again.'
  return 'Your location is unavailable right now. Check that Location Services are on and try again.'
}

function getOnce() {
  return new Promise((resolve, reject) => {
    if (window.isSecureContext === false) {
      reject(new Error(INSECURE_ADDRESS_MESSAGE))
      return
    }
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser cannot share location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(describeLocationError(err))), {
      enableHighAccuracy: false, // about 100 m is plenty: drivers see positions rounded to about half a mile
      timeout: 20000,
      maximumAge: 30000,
    })
  })
}

async function report(fix, { force = false } = {}) {
  if (!operatorId) return
  if (!force && !shouldSend(lastSent, fix)) return
  try {
    await sendPosition(operatorId, fix)
    lastSent = fix
    update({ lastSentAt: Date.now(), lastError: null })
  } catch (err) {
    // Not fatal: lastSent wasn't updated, so the next fix tries again.
    update({ lastError: err.message })
  }
}

// Coming back to the page (for example after using Maps) is the best moment to send a fresh position.
async function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || !operatorId) return
  if (wantWakeLock) requestWakeLock()
  try {
    const fix = toFix(await getOnce())
    latest = fix
    await report(fix, { force: true })
  } catch {
    // The watcher below will try again.
  }
}

// Asks for location, sends the first position, and keeps sending while the page is visible.
// Throws a readable error if location isn't allowed.
export async function startSharing(id) {
  operatorId = id
  const first = toFix(await getOnce())
  latest = first
  await report(first, { force: true })

  stopWatching()
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      latest = toFix(pos)
      report(latest)
    },
    (err) => update({ lastError: describeLocationError(err) }),
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 60000 },
  )
  // Phones may stop delivering new fixes while parked, so once a minute we resend the newest one.
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && latest) report({ ...latest, timestamp: Date.now() })
  }, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
  update({ sharing: true })
}

function stopWatching() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

export function stopSharing() {
  operatorId = null
  lastSent = null
  stopWatching()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  setKeepScreenOn(false)
  update({ sharing: false, lastError: null })
}

// ---------- Keep the screen awake (Screen Wake Lock API) ----------
// Works on iPhone in Safari from iOS 16.4, and in home-screen web apps from iOS 18.4.
// The browser releases the lock whenever the page is hidden, so we ask again when it's visible.

export const canKeepScreenOn = typeof navigator !== 'undefined' && 'wakeLock' in navigator

async function requestWakeLock() {
  if (!canKeepScreenOn || document.visibilityState !== 'visible') return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    update({ screenAwake: true })
    wakeLock.addEventListener('release', () => update({ screenAwake: false }))
  } catch {
    update({ screenAwake: false })
  }
}

export async function setKeepScreenOn(on) {
  wantWakeLock = on
  if (on) {
    await requestWakeLock()
  } else {
    await wakeLock?.release().catch(() => {})
    wakeLock = null
    update({ screenAwake: false })
  }
}
