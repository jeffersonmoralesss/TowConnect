// On iPhone, a website works best for operators when it's added to the home screen: it opens full
// screen like an app, and (in a later update) only home-screen web apps can receive notifications.
// iPhones have no "install" button a website can show, so we explain the two taps.
import { useState } from 'react'
import { Banner, Button } from './ui'

const DISMISS_KEY = 'towconnect.installHint.dismissed'

function isIphoneSafariTab() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  // navigator.standalone is true only when opened from the home screen (an Apple-only property).
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return ios && !standalone
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function InstallHint() {
  const [hidden, setHidden] = useState(() => readDismissed() || !isIphoneSafariTab())
  if (hidden) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private browsing can block storage; hiding it for now is enough.
    }
    setHidden(true)
  }

  return (
    <Banner tone="notice">
      <strong>Add Tow Connect to your home screen.</strong> Tap the Share button (the square with an arrow), then{' '}
      <strong>Add to Home Screen</strong>. It then opens like an app.
      <div style={{ marginTop: 6 }}>
        <Button tone="link" label="Got it" onClick={dismiss} />
      </div>
    </Banner>
  )
}
