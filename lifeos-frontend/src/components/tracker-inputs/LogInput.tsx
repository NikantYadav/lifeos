import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { Tracker } from '@/lib/trackers';

/**
 * Renders a form from `tracker.fields` — the one AI-authored-schema kind
 * (see lifeos-public-app-direction memory). This component reads field
 * *shape* (key/type/label/options) to decide what input to show; it never
 * executes anything from the schema, only branches on the fixed `type` enum
 * the backend's Zod validation already constrains AI output to
 * (`text`/`number`/`select`/`boolean`/`date`) — same trust boundary as the
 * server: field data is rendered, never interpreted as code.
 */
export function LogInput({
  tracker,
  onSave,
}: {
  tracker: Tracker;
  onSave: (data: Record<string, string | number | boolean | null>, note: string | undefined) => void;
}) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [note, setNote] = useState('');

  // `undefined` means "remove this key", not "set it to undefined" — a
  // cleared number field must be ABSENT from `data`, not present with an
  // empty-string value. `validateEntryDataAgainstFields` (backend) rejects
  // `{field: ""}` for a `number`-type field (wrong type), which previously
  // turned "user cleared an optional field" into a 400 the submit button
  // didn't surface. Text/date fields can legitimately hold `''` (an empty
  // string still type-checks as `text`), so only the number case below
  // takes this branch.
  function setField(key: string, value: string | number | boolean | undefined) {
    setValues((prev) => {
      if (value === undefined) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }

  function submit() {
    onSave(values, note || undefined);
    setValues({});
    setNote('');
  }

  return (
    <View style={styles.container}>
      {tracker.fields.map((field) => (
        <View key={field.key} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          {renderFieldInput(field, values[field.key], (v) => setField(field.key, v))}
        </View>
      ))}

      <TextInput style={styles.note} placeholder="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />

      <Pressable style={styles.saveButton} onPress={submit}>
        <Text style={styles.saveButtonText}>Add entry</Text>
      </Pressable>
    </View>
  );
}

function renderFieldInput(
  field: Tracker['fields'][number],
  value: string | number | boolean | undefined,
  onChange: (v: string | number | boolean | undefined) => void
) {
  switch (field.type) {
    case 'text':
    case 'date':
      return (
        <TextInput
          style={styles.textInput}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder={field.type === 'date' ? 'YYYY-MM-DD' : undefined}
        />
      );
    case 'number':
      return (
        <TextInput
          style={styles.textInput}
          value={value != null ? String(value) : ''}
          onChangeText={(t) => {
            if (t.trim() === '') {
              onChange(undefined); // removes the key entirely — see setField's comment
              return;
            }
            const n = Number(t);
            if (Number.isFinite(n)) onChange(n);
          }}
          keyboardType="decimal-pad"
        />
      );
    case 'boolean':
      return <Switch value={Boolean(value)} onValueChange={onChange} />;
    case 'select':
      return (
        <View style={styles.chips}>
          {(field.options ?? []).map((opt) => (
            <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.chip, value === opt && styles.chipSelected]}>
              <Text style={[styles.chipText, value === opt && styles.chipTextSelected]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 10 },
  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 13, color: '#666' },
  textInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
  note: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipSelected: { backgroundColor: '#111' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextSelected: { color: '#fff' },
  saveButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
