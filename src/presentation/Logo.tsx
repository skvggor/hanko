import { useState, type CSSProperties, type PointerEvent } from "react";

/**
 * The mark: three rings meeting on one shared core, at the coordinates it was authored
 * with. The rings are stroked rather than filled so the entrance can trace each one
 * along its own circumference, and the frame carries a margin because one cut to the
 * mark's own bounds clipped the pointer nudge.
 */
const FRAME = { x: -6.93, y: -8.57, width: 114, height: 114 };
const VIEWBOX = `${FRAME.x} ${FRAME.y} ${FRAME.width} ${FRAME.height}`;

const RINGS = [
  { name: "top", cx: 49.7379, cy: 36.5215, radius: 33.2139, strokeWidth: 6.6152 },
  { name: "left", cx: 34.5371, cy: 61.6676, radius: 33.2139, strokeWidth: 2.6465 },
  { name: "right", cx: 64.9394, cy: 61.6657, radius: 33.2129, strokeWidth: 3.9687 },
] as const;

const CORE_PATH =
  "M 49.2577,32.0088 38.5618,41.3912 33.3076,53.9636 32.1818,65.4101 39.5,69.163 47.0059,69.9136 58.8277,68.7878 65.7707,65.5977 68.0225,63.5336 66.5213,52.65 62.0177,41.9541 56.2007,35.3865 z";
const CORE = { cx: 49.9926, cy: 53.5995 };

/** The core reads the whole mark and moves first; a ring only reacts once the pointer is on it. */
const RING_INFLUENCE = 40;
const CORE_INFLUENCE = 55;

/** A pointer on a part has no direction to push it in, and rounding noise would supply one. */
const ON_TOP_OF = 1e-6;

const STILL = { x: 0, y: 0 };

interface Part {
  cx: number;
  cy: number;
  influence: number;
}

function shiftOf(part: Part, probe: { x: number; y: number } | null): typeof STILL {
  if (probe === null) return STILL;

  const awayX = part.cx - (FRAME.x + probe.x * FRAME.width);
  const awayY = part.cy - (FRAME.y + probe.y * FRAME.height);
  const distance = Math.hypot(awayX, awayY);
  if (distance <= ON_TOP_OF) return STILL;

  const reach = Math.max(0, 1 - distance / part.influence);
  return { x: (awayX / distance) * reach, y: (awayY / distance) * reach };
}

function shiftStyle(shift: typeof STILL): CSSProperties {
  return { "--shift-x": shift.x, "--shift-y": shift.y } as CSSProperties;
}

export interface LogoProps {
  /** Sized in rem based classes so the mark grows with the fluid root. */
  className: string;
}

export function Logo({ className }: Readonly<LogoProps>) {
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);

  /** The probe is clamped to the box, so a pointer dragged past the edge keeps pushing from the edge. */
  function track(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setProbe({
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      onPointerEnter={track}
      onPointerLeave={() => setProbe(null)}
      onPointerMove={track}
      viewBox={VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      {RINGS.map((ring) => (
        <circle
          className="logo__ring"
          cx={ring.cx}
          cy={ring.cy}
          data-ring={ring.name}
          fill="none"
          key={ring.name}
          r={ring.radius}
          stroke="currentColor"
          strokeWidth={ring.strokeWidth}
          style={shiftStyle(shiftOf({ ...ring, influence: RING_INFLUENCE }, probe))}
        />
      ))}

      <path
        className="logo__core"
        d={CORE_PATH}
        data-core
        fill="currentColor"
        style={shiftStyle(shiftOf({ ...CORE, influence: CORE_INFLUENCE }, probe))}
      />
    </svg>
  );
}
