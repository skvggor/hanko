import type { ReactNode } from "react";

export function Button({
  children,
  className = "",
  onClick,
  variant = "default",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: "default" | "primary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 py-2 font-sans text-[13px] font-semibold tracking-[0.02em] transition-transform duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";

  const variants = {
    default: "border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-paper",
    primary: "bg-primary text-on-primary hover:bg-primary-bright",
    quiet: "border border-transparent text-ink-dim hover:border-ink/20 hover:text-ink",
    danger: "border border-primary/40 text-primary hover:bg-primary hover:text-on-primary",
  } as const;

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
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

export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "secondary" | "accent";
  title?: string;
}) {
  const tones = {
    neutral: "bg-ink/8 text-ink-dim",
    primary: "bg-primary/12 text-primary",
    secondary: "bg-secondary/12 text-secondary",
    accent: "bg-accent/30 text-ink",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${tones[tone]}`}
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
export function OwnerBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-chip bg-ink py-0.5 pr-2 pl-1.5 text-[10px] font-semibold tracking-[0.06em] text-paper uppercase"
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
}: {
  value: number;
  label: string;
  tone?: "primary" | "secondary";
  pending?: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const filled = Math.round(clamped * 100);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={filled}
      className={`relative h-2.5 w-full overflow-hidden rounded-chip bg-ink/10 ${pending ? "meter-live" : ""}`}
      data-pending={pending}
      role="progressbar"
    >
      <div
        className={`h-full rounded-chip transition-[width] duration-500 ease-out ${
          tone === "primary" ? "bg-primary" : "bg-secondary"
        }`}
        style={{ width: `${filled}%` }}
      />
      {pending && (
        <span aria-hidden="true" className="meter-sweep absolute inset-y-0 w-1/3" />
      )}
    </div>
  );
}