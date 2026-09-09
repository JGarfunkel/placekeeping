// Standalone icon for the "upload a photo" action -- deliberately not part
// of lib/pins/renderPin.ts's Function/Focus glyph system, since this marks
// an action (add a photo/observation) rather than a real spot's attributes.
// Reuses that system's teardrop outline and gold basemap-contrast trim
// (see renderPin.ts's PIN_PATHS.cultivated/TRIM_COLOR) so it still reads as
// "a pin" alongside the map's real markers, just in neutral ink with a
// camera glyph in place of a Focus glyph.
const PIN_PATH =
  "M1.5 11.5A10.5 10.5 0 0 1 22.5 11.5C22.5 19 12 33 12 33C12 33 1.5 19 1.5 11.5Z";

export function CameraPinIcon({
  className,
  width = 24,
  height = 32,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      viewBox="-2 -2 28 38"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path d={PIN_PATH} fill="none" stroke="#e8b64a" strokeWidth="2.8" strokeLinejoin="round" />
      <path d={PIN_PATH} fill="#374151" stroke="#1f2937" strokeWidth="0.8" />
      {/* Camera glyph, drawn directly in the pin's own coordinate space
          (rather than through renderPin's shared 15x15-glyph-box scaling)
          and sized to fill most of the head -- the shared system's glyphs
          are tuned for delicate botanical shapes read up close on the map;
          a camera silhouette needs to stay bold at icon-button sizes, so it
          gets a bigger share of the circle than a Focus glyph would. */}
      <rect x="4" y="9" width="16" height="10" rx="2" fill="#fff" />
      <rect x="9" y="6.3" width="6" height="3.2" rx="1" fill="#fff" />
      <circle cx="12" cy="14" r="3.6" fill="#374151" stroke="#fff" strokeWidth="0.8" />
    </svg>
  );
}
