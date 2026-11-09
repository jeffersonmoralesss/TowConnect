// Password step. There's no "create account" here on purpose: admins are made by another admin (or
// with SQL), never by signing up, so this page offers nothing to someone who just finds the address.
import { useState } from 'react'
import { Banner, Body, Button, Field, Screen, Title } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function SignInScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    // The same message for a wrong email or a wrong password, so the page doesn't reveal which
    // emails have accounts.
    if (err) setError('That email and password don\'t match an account.')
  }

  return (
    <Screen>
      <Title>Tow Connect Admin</Title>
      <Body muted>Sign in with your Tow Connect account. You'll also need the code from your authenticator app.</Body>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <Button type="submit" label="Sign in" busy={busy} />
      </form>
    </Screen>
  )
}
