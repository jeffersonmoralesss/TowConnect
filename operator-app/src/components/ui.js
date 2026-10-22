// Small building blocks shared by every screen. Keeping them here means each screen file is about
// WHAT it shows, not about padding and font sizes, and the whole app stays visually consistent.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, TAP } from '../theme';

// A scrolling page that stays clear of the notch and the home indicator.
// keyboardShouldPersistTaps lets a tap on a button work even while the keyboard is open.
export function Screen({ children }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }) {
  return (
    <Text style={s.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Heading({ children }) {
  return (
    <Text style={s.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }) {
  return <Text style={[s.body, muted && s.muted, style]}>{children}</Text>;
}

// tone: 'primary' (dark), 'beacon' (amber, the one main action), 'secondary' (outline), 'danger', 'link'
export function Button({ label, onPress, tone = 'primary', busy, disabled, accessibilityHint }) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [s.button, s[`button_${tone}`], pressed && s[`pressed_${tone}`], off && s.disabled]}
    >
      {busy ? (
        <ActivityIndicator color={tone === 'primary' || tone === 'danger' ? colors.surface : colors.ink} />
      ) : (
        <Text style={[s.buttonText, s[`buttonText_${tone}`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

// A labeled text box with its own error line underneath.
export function Field({ label, error, hint, ...inputProps }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, error && s.inputError]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...inputProps}
      />
      {hint && !error ? <Text style={s.hint}>{hint}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

// A toggle chip for picking from a few options (services, truck type).
export function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[s.chip, selected && s.chipOn]}
    >
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// tone: 'notice' (yellow), 'good' (green), 'bad' (red)
export function Banner({ children, tone = 'notice' }) {
  return (
    <View style={[s.banner, s[`banner_${tone}`]]} accessibilityRole="alert">
      <Text style={s.bannerText}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <SafeAreaView style={[s.safe, s.center]}>
      <ActivityIndicator size="large" color={colors.ink} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { fontSize: 34, fontWeight: '800', color: colors.ink, lineHeight: 38, marginTop: 8 },
  heading: { fontSize: 21, fontWeight: '700', color: colors.ink, marginTop: 6 },
  body: { fontSize: 17, lineHeight: 24, color: colors.ink },
  muted: { color: colors.muted },

  button: { minHeight: TAP, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  button_primary: { backgroundColor: colors.ink },
  button_beacon: { backgroundColor: colors.beacon, minHeight: 72 },
  button_secondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.line },
  button_danger: { backgroundColor: colors.danger },
  button_link: { backgroundColor: 'transparent', minHeight: 44, paddingHorizontal: 0, alignItems: 'flex-start' },
  pressed_primary: { opacity: 0.85 },
  pressed_beacon: { backgroundColor: colors.beaconPress },
  pressed_secondary: { borderColor: colors.ink },
  pressed_danger: { opacity: 0.85 },
  pressed_link: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 18, fontWeight: '700' },
  buttonText_primary: { color: colors.surface },
  buttonText_beacon: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  buttonText_secondary: { color: colors.ink },
  buttonText_danger: { color: colors.surface },
  buttonText_link: { color: colors.ink, textDecorationLine: 'underline', fontWeight: '600' },

  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger, fontWeight: '600' },

  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.line,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  chipTextOn: { color: colors.surface },

  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },

  banner: { borderRadius: 12, padding: 14, borderWidth: 1 },
  banner_notice: { backgroundColor: colors.notice, borderColor: colors.noticeLine },
  banner_good: { backgroundColor: colors.verifiedBg, borderColor: colors.verified },
  banner_bad: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  bannerText: { fontSize: 16, lineHeight: 22, color: colors.ink },
});
