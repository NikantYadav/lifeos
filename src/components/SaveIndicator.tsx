export default function SaveIndicator({ up }: { up: boolean }) {
  return (
    <div id="save" className={up ? 'up' : ''}>
      Saved
    </div>
  );
}
