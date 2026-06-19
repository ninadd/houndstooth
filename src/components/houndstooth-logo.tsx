/**
 * Houndstooth wordmark glyph. Renders with `currentColor` so the color is
 * controlled via Tailwind text utilities (e.g. `text-primary` for theme green).
 */
export function HoundstoothLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 1200"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="m279.21 493.07 427.72-427.72v213.86l-213.86 213.86h213.86v213.86l213.86-213.86h213.86l-427.72 427.72h-213.86l-213.86 213.86v-213.86h-213.86l213.86-213.86z"
        fillRule="evenodd"
      />
    </svg>
  );
}
