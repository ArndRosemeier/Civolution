/**
 * Icons for governors, delegated aspects, routines and digest items (generated art,
 * docs/assets.md: `art/automation/<name>.png`); hidden until the file exists.
 */
export function AutoIcon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <img
      className="auto-icon"
      width={size}
      height={size}
      src={`${import.meta.env.BASE_URL}art/automation/${name}.png`}
      alt=""
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
    />
  );
}
