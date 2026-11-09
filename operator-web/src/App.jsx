// The top of the operator web app. Same screen rules as operator-app/App.js:
//   not signed in            -> AuthScreen
//   no operator row / editing -> ProfileForm
//   status 'pending'         -> SetupScreen
//   status 'suspended'       -> SuspendedScreen
//   status 'approved'        -> HomeScreen
import { useCallback, useEffect, useState } from 'react'
import InstallHint from './components/InstallHint'
import { Body, Loading, Screen, Title } from './components/ui'
import { getMyOperator, setAvailable } from './lib/api'
import { isConfigured, supabase } from './lib/supabase'
import { stopSharing } from './location/sharing'
import AuthScreen from './screens/AuthScreen'
import HomeScreen from './screens/HomeScreen'
import ProfileForm from './screens/ProfileForm'
import SetupScreen from './screens/SetupScreen'
import SuspendedScreen from './screens/SuspendedScreen'

export default function App() {
  if (!isConfigured) return <MissingKeys />
  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <InstallHint />
      </div>
      <Main />
    </>
  )
}

function Main() {
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out
  const [operator, setOperator] = useState(undefined) // undefined = loading
  const [editing, setEditing] = useState(false)
  const userId = session?.user?.id

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadOperator = useCallback(async () => {
    if (!userId) return
    try {
      setOperator(await getMyOperator(userId))
    } catch {
      setOperator((current) => (current === undefined ? null : current))
    }
  }, [userId])

  useEffect(() => {
    setOperator(undefined)
    loadOperator()
  }, [loadOperator])

  // When the page comes back on screen, re-check: that's how an approval shows up without signing out.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && loadOperator()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadOperator])

  const signOut = async () => {
    stopSharing()
    if (operator?.is_available) await setAvailable(operator.id, false).catch(() => {})
    await supabase.auth.signOut()
    setOperator(undefined)
  }

  if (session === undefined) return <Loading />
  if (!session) return <AuthScreen />
  if (operator === undefined) return <Loading />

  if (!operator || editing) {
    return (
      <ProfileForm
        userId={userId}
        operator={operator}
        onSaved={(saved) => {
          setOperator(saved)
          setEditing(false)
        }}
        onCancel={operator ? () => setEditing(false) : null}
      />
    )
  }

  const shared = { operator, userId, onEditProfile: () => setEditing(true), onSignOut: signOut }
  if (operator.status === 'suspended') return <SuspendedScreen onCheckStatus={loadOperator} onSignOut={signOut} />
  if (operator.status === 'pending') return <SetupScreen {...shared} onCheckStatus={loadOperator} />
  return <HomeScreen {...shared} onOperatorChanged={setOperator} />
}

function MissingKeys() {
  return (
    <Screen>
      <Title>Almost ready</Title>
      <Body>This app needs your Supabase project's address and public key.</Body>
      <Body muted>
        In the operator-web folder, copy .env.example to .env, fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then
        restart npm run dev.
      </Body>
    </Screen>
  )
}
