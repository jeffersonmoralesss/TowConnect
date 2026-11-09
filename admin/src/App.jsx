// Decides which screen to show, step by step:
//   not configured        -> how to add the .env values
//   signed out            -> SignInScreen
//   signed in, not admin  -> "this account isn't an admin"
//   admin, password only  -> TwoStepScreen (set up the authenticator, or type its code)
//   admin, both steps     -> the panel, with one tab per job
// Every one of these is re-checked whenever Supabase reports a change to the session.
import { useCallback, useEffect, useState } from 'react'
import { Banner, Body, Button, Loading, Screen, Title } from './components/ui'
import { isConfigured, supabase } from './lib/supabase'
import { getAssurance, getCounts, signOut, whoami } from './lib/api'
import SignInScreen from './screens/SignInScreen'
import TwoStepScreen from './screens/TwoStepScreen'
import OperatorsScreen from './screens/OperatorsScreen'
import ReportsScreen from './screens/ReportsScreen'
import DirectoryScreen from './screens/DirectoryScreen'
import AdminsScreen from './screens/AdminsScreen'

const TABS = [
  { id: 'operators', label: 'Operators', count: 'pending' },
  { id: 'reports', label: 'Reports', count: 'reports' },
  { id: 'directory', label: 'Directory', count: 'listings' },
  { id: 'admins', label: 'Admins & activity' },
]

// The tab lives in the address (#reports), so a reload or a bookmark opens the same tab.
const tabFromHash = () => {
  const id = window.location.hash.slice(1)
  return TABS.some((t) => t.id === id) ? id : 'operators'
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [gate, setGate] = useState(null) // { stage: 'notAdmin' | 'enroll' | 'challenge' | 'ready' }
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Work out how far through sign-in this account is. Runs again after every session change,
  // including the moment the authenticator code is accepted.
  useEffect(() => {
    if (!session) {
      setGate(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const me = await whoami()
        const aal = await getAssurance()
        let stage
        if (!me.is_admin_account) stage = 'notAdmin'
        else if (aal.currentLevel === 'aal2') stage = 'ready'
        else if (aal.nextLevel === 'aal2') stage = 'challenge'
        else stage = 'enroll'
        if (!cancelled) {
          setError(null)
          setGate({ stage })
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  if (!isConfigured) {
    return (
      <Screen>
        <Title>Tow Connect Admin</Title>
        <Banner tone="bad">
          This panel isn't connected to the database yet. Copy admin/.env.example to admin/.env, paste the same Supabase URL and
          publishable key as the other apps, and restart npm run dev.
        </Banner>
      </Screen>
    )
  }
  if (session === undefined) return <Loading />
  if (!session) return <SignInScreen />
  if (error) {
    return (
      <Screen>
        <Title>Something went wrong</Title>
        <Banner tone="bad">{error}</Banner>
        <Body muted>If this mentions admin_whoami, the admin migration (20261110000000_admin_panel.sql) hasn't been run yet.</Body>
        <Button tone="secondary" label="Sign out" onClick={signOut} />
      </Screen>
    )
  }
  if (!gate) return <Loading />
  if (gate.stage === 'notAdmin') {
    return (
      <Screen>
        <Title>Not an admin</Title>
        <Body>
          {session.user.email} isn't on the admin list. An existing admin can add you in Admins &amp; activity, or the project
          owner can add you with SQL (see the README).
        </Body>
        <Button tone="secondary" label="Sign out" onClick={signOut} />
      </Screen>
    )
  }
  if (gate.stage !== 'ready') return <TwoStepScreen mode={gate.stage} email={session.user.email} />
  return <Panel email={session.user.email} />
}

function Panel({ email }) {
  const [tab, setTab] = useState(tabFromHash)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Screens call this after any change, so the numbers on the tabs stay right.
  const refreshCounts = useCallback(() => {
    getCounts().then(setCounts).catch(() => {})
  }, [])
  useEffect(refreshCounts, [refreshCounts])

  const Current = { operators: OperatorsScreen, reports: ReportsScreen, directory: DirectoryScreen, admins: AdminsScreen }[tab]

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width="32" height="32" />
          <span>Tow Connect Admin</span>
        </div>
        <div className="who">
          <span className="muted small">{email}</span>
          <button type="button" className="btn btn-link small" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'tab tab-on' : 'tab'} aria-current={t.id === tab ? 'page' : undefined}>
            {t.label}
            {t.count && counts[t.count] ? <span className="badge">{counts[t.count]}</span> : null}
          </a>
        ))}
      </nav>
      <main className="panel">
        <Current onChange={refreshCounts} />
      </main>
    </div>
  )
}
