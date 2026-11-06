/** Second Look's mark: a four-patch quilt block, one square per person (Margaret, Sarah, Tom, Rosa). */
export function FourPatch({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="14" height="14" rx="2" fill="#2a7d82" />
      <rect x="16" y="0" width="14" height="14" rx="2" fill="#5b7db8" />
      <rect x="0" y="16" width="14" height="14" rx="2" fill="#c99a3e" />
      <rect x="16" y="16" width="14" height="14" rx="2" fill="#7c9a67" />
    </svg>
  );
}
