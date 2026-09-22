import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MISS_CATEGORIES, type MissCategory } from '@/lib/trackers';

/**
 * Shared across every tracker kind's "log a miss" flow — the structured
 * category + optional free-text note pattern locked in by the
 * lifeos-public-app-direction memory (extends the old `SkipReason` enum
 * pattern). One component here, not duplicated per kind, mirrors the
 * backend's "generic across kinds" design for the same reason: the AI
 * review context builder reads `miss_category`/`miss_note` the same way
 * regardless of what tracker produced them.
 */
export function MissReasonPicker({
  category,
  note,
  onChangeCategory,
  onChangeNote,
}: {
  category: MissCategory | null;
  note: string;
  onChangeCategory: (c: MissCategory) => void;
  onChangeNote: (n: string) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Why did you miss this?</Text>
      <View style={styles.chips}>
        {MISS_CATEGORIES.map((c) => (
          <Pressable key={c} onPress={() => onChangeCategory(c)} style={[styles.chip, category === c && styles.chipSelected]}>
            <Text style={[styles.chipText, category === c && styles.chipTextSelected]}>{formatCategory(c)}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.note}
        placeholder="Add a note (optional)"
        value={note}
        onChangeText={onChangeNote}
        multiline
        maxLength={1000}
      />
    </View>
  );
}

function formatCategory(c: MissCategory): string {
  return c.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  container: { marginTop: 8, gap: 8 },
  label: { fontSize: 13, color: '#666' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#f0f0f0' },
  chipSelected: { backgroundColor: '#111' },
  chipText: { fontSize: 13, color: '#333', textTransform: 'capitalize' },
  chipTextSelected: { color: '#fff' },
  note: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 40 },
});
