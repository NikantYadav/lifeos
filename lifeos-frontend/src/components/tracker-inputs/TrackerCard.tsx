import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LogEntryInput, MissCategory, Tracker, TrackerEntry } from '@/lib/trackers';
import { CheckboxInput } from './CheckboxInput';
import { CounterInput } from './CounterInput';
import { LogInput } from './LogInput';
import { MissReasonPicker } from './MissReasonPicker';
import { NumericInput } from './NumericInput';
import { ScaleInput } from './ScaleInput';
import { TimedInput } from './TimedInput';

/**
 * One card per tracker, one input component per `kind` — five kind
 * components total (checkbox/numeric/counter/timed share most of their
 * shape; scale and log are their own), never one component per tracker
 * instance, per ROADMAP.md Phase 3's "generic across every tracker of that
 * kind" requirement. This shell owns what's common to all six kinds: the
 * miss-reason flow (only meaningful for kinds with a `target`, i.e. not
 * `log`) and the submit-in-flight state; each kind component owns only its
 * own value-capture UI.
 */
export function TrackerCard({
  tracker,
  todaysEntry,
  onSubmit,
}: {
  tracker: Tracker;
  todaysEntry: TrackerEntry | undefined;
  onSubmit: (input: LogEntryInput) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMissFlow, setShowMissFlow] = useState(false);
  const [missCategory, setMissCategory] = useState<MissCategory | null>(null);
  const [missNote, setMissNote] = useState('');

  async function submit(partial: Omit<LogEntryInput, 'tracker_id'>) {
    setIsSubmitting(true);
    try {
      await onSubmit({ tracker_id: tracker.id, ...partial });
      setShowMissFlow(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function submitMiss() {
    if (!missCategory) return;
    void submit({ missed: true, miss_category: missCategory, miss_note: missNote || undefined, value: 0 });
  }

  const canMiss = tracker.kind !== 'log' && tracker.target !== null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{tracker.name}</Text>
        {todaysEntry?.missed ? <Text style={styles.missedBadge}>missed</Text> : null}
      </View>
      {tracker.description ? <Text style={styles.description}>{tracker.description}</Text> : null}

      <View style={styles.body}>
        {renderKindInput()}
        {isSubmitting ? <ActivityIndicator style={styles.spinner} /> : null}
      </View>

      {canMiss && !showMissFlow && (
        <Pressable onPress={() => setShowMissFlow(true)}>
          <Text style={styles.missLink}>{todaysEntry?.missed ? 'Edit miss reason' : "Didn't get to this today"}</Text>
        </Pressable>
      )}

      {showMissFlow && (
        <>
          <MissReasonPicker category={missCategory} note={missNote} onChangeCategory={setMissCategory} onChangeNote={setMissNote} />
          <View style={styles.missActions}>
            <Pressable onPress={() => setShowMissFlow(false)}>
              <Text style={styles.cancelLink}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveMissButton, !missCategory && styles.saveMissButtonDisabled]} onPress={submitMiss} disabled={!missCategory}>
              <Text style={styles.saveMissButtonText}>Save</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  function renderKindInput() {
    switch (tracker.kind) {
      case 'checkbox':
        return <CheckboxInput entry={todaysEntry} onToggle={(done) => submit({ value: done ? 1 : 0, missed: false })} />;
      case 'numeric':
        return <NumericInput tracker={tracker} entry={todaysEntry} onSave={(value) => submit({ value, missed: false })} />;
      case 'counter':
        return <CounterInput entry={todaysEntry} onChange={(value) => submit({ value, missed: false })} />;
      case 'timed':
        return <TimedInput entry={todaysEntry} onSave={(seconds) => submit({ value: seconds, missed: false })} />;
      case 'scale':
        return <ScaleInput entry={todaysEntry} onSelect={(value) => submit({ value, missed: false })} />;
      case 'log':
        return <LogInput tracker={tracker} onSave={(data, note) => submit({ data, note })} />;
    }
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 13, color: '#888', marginTop: 2 },
  missedBadge: { fontSize: 11, color: '#c0392b', backgroundColor: '#fdecea', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  body: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  spinner: { marginLeft: 8 },
  missLink: { fontSize: 13, color: '#888', marginTop: 10 },
  missActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 10, alignItems: 'center' },
  cancelLink: { color: '#888', fontSize: 14 },
  saveMissButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  saveMissButtonDisabled: { opacity: 0.4 },
  saveMissButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
