// Upload and track the tow license and insurance certificate (FR-O2).
// Picking a file and typing its expiry date happen in two steps, so the operator can't upload
// a document without saying when it runs out. That date is what hides an operator automatically.
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { addDays, formatDate } from '../lib/dates';
import { uploadDocument } from '../lib/api';
import { daysUntil, KIND_LABELS, REQUIRED_KINDS, summarize } from '../lib/documents';
import { checkExpiryDate } from '../lib/validate';
import { colors } from '../theme';
import { Banner, Body, Button, Card, Field, Heading } from './ui';

const STATE_TEXT = {
  missing: { text: 'Not uploaded yet', color: colors.danger },
  review: { text: 'Waiting for review', color: colors.muted },
  verified: { text: 'Verified', color: colors.verified },
  expiring: { text: 'Verified, expires soon', color: colors.danger },
  expired: { text: 'Expired. Upload the current one.', color: colors.danger },
};

export default function DocumentsSection({ operatorId, userId, documents, onChanged }) {
  return (
    <View style={{ gap: 12 }}>
      <Heading>Documents</Heading>
      <Body muted>Photos or PDFs are fine. Only you and Tow Connect reviewers can see these files.</Body>
      {REQUIRED_KINDS.map((kind) => (
        <DocumentCard key={kind} kind={kind} operatorId={operatorId} userId={userId} documents={documents} onChanged={onChanged} />
      ))}
    </View>
  );
}

function DocumentCard({ kind, operatorId, userId, documents, onChanged }) {
  const { state, current, pending } = summarize(documents, kind);
  const [file, setFile] = useState(null); // the picked file, before upload
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true, // copies the file somewhere the app can read it
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 10 * 1024 * 1024) {
      setError('That file is over 10 MB. Try a photo or a smaller PDF.');
      return;
    }
    setFile(asset);
  };

  const upload = async () => {
    const dateError = checkExpiryDate(expiresOn);
    if (dateError) {
      setError(dateError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadDocument({ operatorId, userId, kind, file, expiresOn: expiresOn.trim() });
      setFile(null);
      setExpiresOn('');
      onChanged();
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const status = STATE_TEXT[state];
  const shown = current ?? pending;
  const days = current ? daysUntil(current.expires_on) : null;

  return (
    <Card>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{KIND_LABELS[kind]}</Text>
      <Text style={{ fontSize: 16, fontWeight: '700', color: status.color }}>{status.text}</Text>
      {shown?.expires_on ? <Body muted>Expires {formatDate(shown.expires_on)}{days != null && days <= 30 ? ` (in ${days} days)` : ''}</Body> : null}
      {current && pending ? <Body muted>Your newer upload is waiting for review. You stay visible meanwhile.</Body> : null}

      {file ? (
        <>
          <Body>Selected: {file.name}</Body>
          <Field
            label="Expiry date on this document"
            value={expiresOn}
            onChangeText={setExpiresOn}
            placeholder={`For example ${addDays(365)}`}
            hint="Format: YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button label="Upload" onPress={upload} busy={busy} />
          <Button tone="link" label="Choose a different file" onPress={pick} />
        </>
      ) : (
        <>
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button
            tone={state === 'missing' || state === 'expired' ? 'primary' : 'secondary'}
            label={state === 'missing' ? 'Choose file' : 'Upload a newer copy'}
            onPress={pick}
          />
        </>
      )}
    </Card>
  );
}
