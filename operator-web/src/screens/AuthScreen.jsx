// Sign in or create an account with email and password. Same flow as the Android app's AuthScreen.
import { useState } from 'react'
import { Banner, Body, Button, Field, Screen, Title } from '../components/ui'
import { supabase } from '../lib/supabase'
import { checkEmail, checkPassword } from '../shared/validate'

export default function AuthScreen() {
  const [mode, setMode] = useState('signIn') // 'signIn' | 'signUp'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null) // { tone, text }
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'signUp'

  // A <form> with onSubmit means the keyboard's Go/Enter key submits, just like tapping the button.
  const submit = async (event) => {
    event.preventDefault()
    const next = { email: checkEmail(email), password: checkPassword(password) }
    setErrors(next)
    setMessage(null)
    if (next.email || next.password) return

    setBusy(true)
    try {
      const credentials = { email: email.trim(), password }
      const { data, error } = signingUp
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials)
      if (error) throw error
      if (signingUp && !data.session) {
        setMessage({ tone: 'good', text: 'Check your email and tap the confirmation link, then sign in here.' })
        setMode('signIn')
      }
      // Otherwise App.jsx hears about the new session and moves on by itself.
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Title>{signingUp ? 'Join Tow Connect' : 'Tow Connect for operators'}</Title>
      <Body muted>
        {signingUp
          ? 'Create an account, add your company and documents, and we will review your license before you appear to drivers.'
          : 'Sign in to switch to Available and get calls from drivers near you.'}
      </Body>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          hint={signingUp ? 'At least 8 characters.' : undefined}
        />
        <Button type="submit" label={signingUp ? 'Create account' : 'Sign in'} busy={busy} />
      </form>

      <div>
        <Button
          tone="link"
          label={signingUp ? 'I already have an account' : 'New operator? Create an account'}
          onClick={() => {
            setMode(signingUp ? 'signIn' : 'signUp')
            setErrors({})
            setMessage(null)
          }}
        />
      </div>
    </Screen>
  )
}
