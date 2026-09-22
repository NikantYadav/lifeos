import { Pressable, StyleSheet, Text } from 'react-native';
import type { TrackerEntry } from '@/lib/trackers';

export function CheckboxInput({ entry, onToggle }: { entry: TrackerEntry | undefined; onToggle: (done: boolean) => void }) {
  const done = (entry?.value ?? 0) > 0;
  return (
    <Pressable style={[styles.box, done && styles.boxChecked]} onPress={() => onToggle(!done)}>
      <Text style={[styles.mark, done && styles.markChecked]}>{done ? '✓' : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: '#111', borderColor: '#111' },
  mark: { fontSize: 18, color: 'transparent', fontWeight: '700' },
  markChecked: { color: '#fff' },
});
