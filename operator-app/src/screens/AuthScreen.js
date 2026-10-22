// Sign in or create an account with email and password (FR-O1).
// The SRS mentions phone sign-in too, but texting codes costs money per message, and the project
// has to stay free. Email sign-in is free with Supabase.
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Body, Button, Field, Screen, Title } from '../components/ui';
import { supabase } from '../lib/supabase';
import { checkEmail, checkPassword } from '../lib/validate';

export default function AuthScreen() {
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null); // { tone, text }
  const [busy, setBusy] = useState(false);

  const signingUp = mode === 'signUp';

  const submit = async () => {
    const next = { email: checkEmail(email), password: checkPassword(password) };
    setErrors(next);
    setMessage(null);
    if (next.email || next.password) return;

    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = signingUp
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      // When "Confirm email" is on in Supabase, sign-up succeeds without a session until the
      // operator clicks the link in their email. When it's off, there's a session right away and
      // App.js notices the sign-in and moves on by itself.
      if (signingUp && !data.session) {
        setMessage({ tone: 'good', text: 'Check your email and tap the confirmation link, then sign in here.' });
        setMode('signIn');
      }
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{signingUp ? 'Join Tow Connect' : 'Tow Connect for operators'}</Title>
      <Body muted>
        {signingUp
          ? 'Create an account, add your company and documents, and we will review your license before you appear to drivers.'
          : 'Sign in to switch to Available and get calls from drivers near you.'}
      </Body>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        textContentType={signingUp ? 'newPassword' : 'password'}
        hint={signingUp ? 'At least 8 characters.' : undefined}
        onSubmitEditing={submit}
      />

      <Button label={signingUp ? 'Create account' : 'Sign in'} onPress={submit} busy={busy} />
      <View>
        <Button
          tone="link"
          label={signingUp ? 'I already have an account' : 'New operator? Create an account'}
          onPress={() => {
            setMode(signingUp ? 'signIn' : 'signUp');
            setErrors({});
            setMessage(null);
          }}
        />
      </View>
    </Screen>
  );
}
