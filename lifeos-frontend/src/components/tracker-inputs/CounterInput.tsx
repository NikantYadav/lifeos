import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackerEntry } from '@/lib/trackers';

export function CounterInput({ entry, onChange }: { entry: TrackerEntry | undefined; onChange: (value: number) => void }) {
  const count = entry?.value ?? 0;

  return (
    <View style={styles.row}>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.max(0, count - 1))} disabled={count <= 0}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.count}>{count}</Text>
      <Pressable style={styles.stepButton} onPress={() => onChange(count + 1)}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '600', color: '#333' },
  count: { fontSize: 20, fontWeight: '700', minWidth: 32, textAlign: 'center' },
});
