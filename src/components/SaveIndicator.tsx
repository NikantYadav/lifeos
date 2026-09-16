import type { SaveStatus } from '@/lib/useAppState';

const TEXT: Record<Exclude<SaveStatus, 'idle'>, string> = {
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved — will retry',
};

export default function SaveIndicator({ status }: { status: SaveStatus }) {
  const visible = status === 'saved' || status === 'error';
  return (
    <div
      id="save"
      className={(visible ? 'up' : '') + (status === 'error' ? ' bad' : '')}
      role="status"
      aria-live="polite"
    >
      {status === 'idle' ? '' : TEXT[status]}
    </div>
  );
}
