import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Tracker, TrackerEntry } from '@/lib/trackers';

function valueToDraft(value: number | null | undefined): string {
  return value != null ? String(value) : '';
}

export function NumericInput({
  tracker,
  entry,
  onSave,
}: {
  tracker: Tracker;
  entry: TrackerEntry | undefined;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(valueToDraft(entry?.value));
  // Tracks which server row's value `draft` was last synced from — compared
  // and adjusted DURING RENDER (React's documented pattern for "reset local
  // state when a prop changes"), not in a useEffect, which the
  // react-hooks/set-state-in-effect lint rule flags for a plain setState
  // call. Keyed on `updated_at` rather than `entry` itself so a re-render
  // with the same underlying row (new array/object identity from a fresh
  // fetch, same data) doesn't reset the draft under the user's fingers.
  const [syncedAt, setSyncedAt] = useState(entry?.updated_at);
  if (entry?.updated_at !== syncedAt) {
    setSyncedAt(entry?.updated_at);
    setDraft(valueToDraft(entry?.value));
  }

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(parsed)) onSave(parsed);
  }

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholder="0"
        returnKeyType="done"
      />
      {tracker.unit ? <Text style={styles.unit}>{tracker.unit}</Text> : null}
      {tracker.target != null ? <Text style={styles.target}>/ {tracker.target}</Text> : null}
      <Pressable style={styles.saveButton} onPress={commit}>
        <Text style={styles.saveButtonText}>Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, fontSize: 16, width: 70, textAlign: 'center' },
  unit: { fontSize: 14, color: '#888' },
  target: { fontSize: 14, color: '#bbb' },
  saveButton: { marginLeft: 'auto', backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  saveButtonText: { fontSize: 13, fontWeight: '600', color: '#333' },
});
