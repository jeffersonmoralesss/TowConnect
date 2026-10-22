// The top of the operator app. It decides which screen to show from two pieces of data:
//   session  - who is signed in (from Supabase Auth)
//   operator - their row in the operators table (or null if they haven't made one yet)
//
//   not signed in            -> AuthScreen
//   no operator row / editing -> ProfileForm
//   status 'pending'         -> SetupScreen (checklist, then "waiting for approval")
//   status 'suspended'       -> SuspendedScreen
//   status 'approved'        -> HomeScreen (the Available switch)
//
// Like the driver app, there's no navigation library: a few screens chosen by data are easier to
// follow than a navigator, and the back button can never land somewhere that no longer makes sense.
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Body, Loading, Screen, Title } from './src/components/ui';
import { getMyOperator, setAvailable } from './src/lib/api';
import { isConfigured, supabase } from './src/lib/supabase';
import { stopSharing } from './src/location/tracking';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProfileForm from './src/screens/ProfileForm';
import SetupScreen from './src/screens/SetupScreen';
import SuspendedScreen from './src/screens/SuspendedScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isConfigured ? <Main /> : <MissingKeys />}
    </SafeAreaProvider>
  );
}

function Main() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  const [operator, setOperator] = useState(undefined); // undefined = still loading
  const [editing, setEditing] = useState(false);
  const userId = session?.user?.id;

  // Listen for sign-in and sign-out. onAuthStateChange also fires once at start with the saved session.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadOperator = useCallback(async () => {
    if (!userId) return;
    try {
      setOperator(await getMyOperator(userId));
    } catch {
      // Keep whatever we had; a weak signal shouldn't throw the operator back to an empty form.
      setOperator((current) => (current === undefined ? null : current));
    }
  }, [userId]);

  useEffect(() => {
    setOperator(undefined);
    loadOperator();
  }, [loadOperator]);

  // Re-check when the app comes back to the screen, so an approval shows up without signing out.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadOperator();
    });
    return () => sub.remove();
  }, [loadOperator]);

  const signOut = async () => {
    await stopSharing();
    if (operator?.is_available) await setAvailable(operator.id, false).catch(() => {});
    await supabase.auth.signOut();
    setOperator(undefined);
  };

  if (session === undefined) return <Loading />;
  if (!session) return <AuthScreen />;
  if (operator === undefined) return <Loading />;

  if (!operator || editing) {
    return (
      <ProfileForm
        userId={userId}
        operator={operator}
        onSaved={(saved) => {
          setOperator(saved);
          setEditing(false);
        }}
        onCancel={operator ? () => setEditing(false) : null}
      />
    );
  }

  const shared = { operator, userId, onEditProfile: () => setEditing(true), onSignOut: signOut };
  if (operator.status === 'suspended') return <SuspendedScreen onCheckStatus={loadOperator} onSignOut={signOut} />;
  if (operator.status === 'pending') return <SetupScreen {...shared} onCheckStatus={loadOperator} />;
  return <HomeScreen {...shared} onOperatorChanged={setOperator} />;
}

function MissingKeys() {
  return (
    <Screen>
      <Title>Almost ready</Title>
      <Body>This app needs your Supabase project's address and public key.</Body>
      <Body muted>
        In the operator-app folder, copy .env.example to .env, fill in EXPO_PUBLIC_SUPABASE_URL and
        EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart with npx expo start --clear.
      </Body>
    </Screen>
  );
}
