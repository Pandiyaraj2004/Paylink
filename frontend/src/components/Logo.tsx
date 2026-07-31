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
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src="/logo.png"
        alt="PayLink Logo"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
      {withWordmark && (
        <span className="font-display text-h3 font-semibold tracking-tight text-text-primary">PayLink</span>
      )}
    </div>
  );
}
