import { cn } from '@/utils/cn';

interface LogoProps {
  /** Pixel size of the glyph mark (square). Default 32. */
  size?: number;
  /** Show the "PayLink" wordmark next to the glyph. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * PayLink brand mark — an abstract gradient glyph (two overlapping "link"
 * arcs forming a stylised "P") built entirely as inline SVG, no raster
 * assets. Replaces the plain rounded-square placeholder previously used in
 * AuthLayout/Sidebar (master-doc.md Section 17 visual bar).
 */
export function Logo({ size = 32, withWordmark = false, className }: LogoProps) {
  const gradientId = 'paylink-logo-gradient';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={withWordmark}
        role={withWordmark ? undefined : 'img'}
        aria-label={withWordmark ? undefined : 'PayLink'}
      >
        <defs>
          <linearGradient id={gradientId} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
        {/* Abstract linked-loop glyph, evokes "link" + a "P" counter-space */}
        <path
          d="M11 9.5C11 8.11929 12.1193 7 13.5 7H17.5C20.5376 7 23 9.46243 23 12.5C23 15.5376 20.5376 18 17.5 18H14"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M11 25V9.5"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="21" cy="21" r="2.6" fill="white" fillOpacity="0.95" />
      </svg>
      {withWordmark && (
        <span className="font-display text-h3 font-semibold tracking-tight text-text-primary">PayLink</span>
      )}
    </div>
  );
}
