import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackerEntry } from '@/lib/trackers';

const SCALE_VALUES = [1, 2, 3, 4, 5];

export function ScaleInput({ entry, onSelect }: { entry: TrackerEntry | undefined; onSelect: (value: number) => void }) {
  const selected = entry?.value ?? null;

  return (
    <View style={styles.row}>
      {SCALE_VALUES.map((v) => (
        <Pressable key={v} style={[styles.dot, selected === v && styles.dotSelected]} onPress={() => onSelect(v)}>
          <Text style={[styles.dotText, selected === v && styles.dotTextSelected]}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  dotSelected: { backgroundColor: '#111', borderColor: '#111' },
  dotText: { fontSize: 14, fontWeight: '600', color: '#555' },
  dotTextSelected: { color: '#fff' },
});
