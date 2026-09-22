import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackerEntry } from '@/lib/trackers';

/** `value` is stored in seconds (see lifeos-public-app-direction memory's tracker envelope). */
export function TimedInput({ entry, onSave }: { entry: TrackerEntry | undefined; onSave: (seconds: number) => void }) {
  const savedSeconds = entry?.value ?? 0;
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(savedSeconds);
  const startedAtRef = useRef<number | null>(null);

  // Resync the displayed value from the server row when it changes (e.g.
  // pull-to-refresh picks up a value logged elsewhere) — adjusted DURING
  // RENDER (React's documented pattern for "reset local state when a prop
  // changes"), not in a useEffect, and only while NOT running, so an
  // in-progress timer is never overwritten by a stale fetch. See the
  // identical pattern (and its lint-rule rationale) in NumericInput.tsx.
  const [syncedAt, setSyncedAt] = useState(entry?.updated_at);
  if (!isRunning && entry?.updated_at !== syncedAt) {
    setSyncedAt(entry?.updated_at);
    setElapsed(entry?.value ?? 0);
  }

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsed(savedSeconds + Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, savedSeconds]);

  function toggle() {
    if (isRunning) {
      setIsRunning(false);
      onSave(elapsed);
    } else {
      startedAtRef.current = Date.now();
      setIsRunning(true);
    }
  }

  return (
    <View style={styles.row}>
      <Text style={styles.time}>{formatDuration(elapsed)}</Text>
      <Pressable style={[styles.button, isRunning && styles.buttonRunning]} onPress={toggle}>
        <Text style={styles.buttonText}>{isRunning ? 'Stop' : 'Start'}</Text>
      </Pressable>
    </View>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  time: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  button: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  buttonRunning: { backgroundColor: '#c0392b' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
