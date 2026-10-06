import Link from "next/link";

// Glyph-only entry point to the slideshow, shared by the spot and territory pages.
export function PlaySlideshowLink({
  href,
  className = "",
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex align-middle text-neutral-700 hover:text-neutral-900 ${className}`}
      aria-label="Play slideshow"
      title="Play slideshow"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
      </svg>
    </Link>
  );
}
