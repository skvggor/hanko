import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { stampName, type NameStamper } from "@presentation/sealMotion";

export function Button({
  busy = false,
  children,
  className = "",
  onClick,
  variant = "default",
  type = "button",
  disabled = false,
  ref,
}: Readonly<{
  /**
   * Working is not the same as unavailable: a busy control is mid request, so it keeps
   * its full weight and shows a spinner, where fading it would read as broken.
   */
  busy?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: "default" | "primary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  /**
   * A dialog has to move focus onto the button it opens with, so the primitive accepts
   * a ref rather than forcing every caller to drop down to a bare element.
   */
  ref?: Ref<HTMLButtonElement> | undefined;
}>) {
  const base =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-gutter py-tight font-sans text-[0.8125rem] font-semibold tracking-[0.02em] transition-transform duration-100 active:scale-[0.98]";

  const idle =
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

  const working = "cursor-progress disabled:active:scale-100";

  const variants = {
    default: "border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-paper",
    primary: "bg-primary text-on-primary hover:bg-primary-bright",
    quiet: "border border-transparent text-ink-dim hover:border-ink/20 hover:text-ink",
    danger: "border border-primary/40 text-primary hover:bg-primary hover:text-on-primary",
  } as const;

  return (
    <button
      aria-busy={busy || undefined}
      className={`${base} ${busy ? working : idle} ${variants[variant]} ${className}`}
      disabled={disabled || busy}
      onClick={onClick}
      ref={ref}
      type={type}
    >
      {busy && (
        <CircleNotchIcon
          aria-hidden="true"
          className="button-spinner"
          size={15}
          weight="bold"
        />
      )}
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-3xl border border-line bg-paper-raised ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

export function Label({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="m-0 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
}: Readonly<{
  children: ReactNode;
  tone?: "neutral" | "primary" | "secondary" | "accent";
  title?: string;
}>) {
  const tones = {
    neutral: "bg-ink/8 text-ink-dim",
    primary: "bg-primary/12 text-primary",
    secondary: "bg-secondary/12 text-secondary",
    accent: "bg-accent/30 text-ink",
  } as const;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-chip px-tight py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] whitespace-nowrap uppercase ${tones[tone]}`}
      title={title}
    >
      {children}
    </span>
  );
}

/**
 * The owner marker: a filled disc with a notch, echoing the wordmark so ownership
 * reads as a shape before anyone reads the word.
 */
export interface OwnerNameProps {
  name: string;
  roleLabel: string;
  stamp?: NameStamper;
}

/**
 * A pale streak that crosses gold every so often, the light catching the foil. The
 * gradient belongs to the streak rather than to what it crosses, so the mark beneath
 * stays one colour and stays readable.
 */
export function GoldGlint() {
  return (
    <span
      aria-hidden="true"
      className="gold-glint absolute inset-y-0 left-0 w-1/3"
    />
  );
}

/**
 * Ownership is said by the name itself: the owner's name is written in gold and lands
 * on the row the way a seal lands, with the role kept beside it in words so colour is
 * never the only thing saying who owns the room.
 */
export function OwnerName({
  name,
  roleLabel,
  stamp = stampName,
}: Readonly<OwnerNameProps>) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const bloomRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nameElement = nameRef.current;
    if (nameElement === null) return;

    return stamp({ bloom: bloomRef.current, name: nameElement });
  }, [stamp]);

  return (
    <span
      className="relative inline-flex min-w-0 items-baseline gap-tight text-accent-deep"
      data-role="owner"
    >
      <span className="relative min-w-0">
        <span
          aria-hidden="true"
          className="absolute -inset-1 rounded-chip bg-accent/40 opacity-0"
          ref={bloomRef}
        />
        <span
          className="relative block min-w-0 truncate text-[0.9375rem] font-semibold"
          ref={nameRef}
        >
          {name}
          <GoldGlint />
        </span>
      </span>
      <span className="shrink-0 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
        {roleLabel}
      </span>
    </span>
  );
}

/**
 * How much of the room has voted. While people are still out the track pulses, so
 * the bar reads as live rather than finished.
 */
export function Meter({
  value,
  label,
  tone = "secondary",
  pending = false,
}: Readonly<{
  value: number;
  label: string;
  tone?: "primary" | "secondary";
  pending?: boolean;
}>) {
  const clamped = Math.min(1, Math.max(0, value));
  const filled = Math.round(clamped * 100);

  return (
    <div
      className={`relative h-2.5 w-full overflow-hidden rounded-chip bg-ink/10 ${pending ? "meter-live" : ""}`}
      data-pending={pending}
    >
      <progress
        aria-label={label}
        className={`meter ${tone === "primary" ? "meter--primary" : ""}`}
        max={100}
        value={filled}
      />
      {pending && (
        <span aria-hidden="true" className="meter-sweep absolute inset-y-0 w-1/3" />
      )}
    </div>
  );
}

export interface TooltipProps {
  label: string;
  children: ReactNode;
  /** Replaces the default box outright, for a tooltip that is pinned to a corner. */
  className?: string;
  placement?: keyof typeof TOOLTIP_PLACEMENT;
}

/**
 * The label never wraps, so where it hangs from is the whole decision: centring suits a
 * button in a row and grows off the screen for one pinned to the edge of the window.
 */
const TOOLTIP_PLACEMENT = {
  above: "left-1/2 -translate-x-1/2",
  "above-end": "right-0",
} as const;

/**
 * A tooltip the app draws itself, for the same reason the dialogs are ours: the
 * browser's own is a delay and a font the design has no say over. It opens on hover
 * and on keyboard focus alike, because an icon nobody can name is only half drawn.
 */
export function Tooltip({
  label,
  children,
  className,
  placement = "above",
}: Readonly<TooltipProps>) {
  const [open, setOpen] = useState(false);

  return (
    <span
      // A caller that places this owns the box, default and all: overriding the position
      // from a stylesheet would mean fighting the utility layer over a `relative` that
      // stays there winning.
      className={className ?? "relative inline-flex"}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          className={`absolute bottom-full z-20 mb-1 rounded-chip bg-ink px-snug py-1 text-[0.625rem] font-semibold tracking-[0.06em] whitespace-nowrap text-paper ${TOOLTIP_PLACEMENT[placement]}`}
          role="tooltip"
        >
          {label}
        </span>
      )}
    </span>
  );
}