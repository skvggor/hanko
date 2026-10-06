import { useState, type PointerEvent } from "react";

/**
 * The wordmark. Three primitives on a Bauhaus grid: a full disc, a quarter, a square.
 * The pointer walks across them, each one lifting and settling on its own curve, so
 * the mark feels built rather than printed. Everything collapses to rest on leave.
 */
export function Wordmark({ size = 36 }: { size?: number }) {
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);

  function track(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    setProbe({ x, y });
  }

  const near = (cx: number, cy: number, radius: number) => {
    if (probe === null) return 0;
    const distance = Math.hypot(probe.x - cx, probe.y - cy);
    return Math.max(0, 1 - distance / radius);
  };

  const quarter = near(0.08, 0.08, 0.55);
  const disc = near(0.5, 0.5, 0.7);
  const center = near(0.5, 0.5, 0.35);

  return (
    <svg
      aria-hidden="true"
      className="wordmark shrink-0"
      height={size}
      onPointerEnter={track}
      onPointerLeave={() => setProbe(null)}
      onPointerMove={track}
      style={
        {
          "--lift-quarter": probe === null ? 0 : quarter,
          "--lift-disc": probe === null ? 0 : disc,
          "--lift-core": probe === null ? 0 : center,
        } as React.CSSProperties
      }
      viewBox="0 0 36 36"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        className="wordmark__square"
        fill="var(--color-accent)"
        height="6"
        width="6"
        x="5"
        y="5"
      />
      <circle
        className="wordmark__disc"
        cx="18"
        cy="18"
        fill="var(--color-primary)"
        r="13"
      />
      <path
        className="wordmark__quarter"
        d="M18 5a13 13 0 0 1 0 26z"
        fill="var(--color-secondary)"
      />
      <circle
        className="wordmark__core"
        cx="18"
        cy="18"
        fill="var(--color-paper-raised)"
        r="4.5"
      />
    </svg>
  );
}