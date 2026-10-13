import type { ReactNode, Ref } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";

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
      className={`inline-flex items-center gap-1 rounded-chip px-tight py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] uppercase ${tones[tone]}`}
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
export function OwnerBadge({ label }: Readonly<{ label: string }>) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-chip bg-ink py-0.5 pr-tight pl-1.5 text-[0.625rem] font-semibold tracking-[0.06em] text-paper uppercase"
      data-role="owner"
    >
      <svg aria-hidden="true" className="h-2.5 w-2.5" viewBox="0 0 10 10">
        <circle cx="5" cy="5" fill="var(--color-accent)" r="5" />
        <circle cx="5" cy="5" fill="var(--color-primary)" r="2.2" />
      </svg>
      {label}
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