import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

export interface ShareSnippetProps {
  url: string;
  copied: boolean;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}

/**
 * The room link as a single chip: the whole thing is the target, so there is no
 * separate button to hunt for. The scheme is dropped because it carries no
 * information here.
 */
export function ShareSnippet({
  url,
  copied,
  label,
  copyLabel,
  copiedLabel,
  onCopy,
}: Readonly<ShareSnippetProps>) {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const slashIndex = withoutScheme.indexOf("/");

  const host = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  const segments = slashIndex === -1 ? [] : withoutScheme.slice(slashIndex + 1).split("/");
  const roomId = segments[segments.length - 1] ?? "";

  return (
    <div className="flex min-w-0 flex-col items-start gap-hair">
      <span className="font-mono text-[0.5625rem] font-semibold tracking-[0.14em] uppercase text-ink-faint">
        {label}
      </span>

      <button
        aria-label={copied ? copiedLabel : copyLabel}
        className={`flex min-w-0 max-w-full items-center rounded-chip border border-transparent px-hair py-hair font-mono text-[0.71875rem] leading-[1.3] transition-[background,border-color,transform] duration-150 focus-visible:border-ink focus-visible:outline-offset-[3px] active:scale-[0.99] ${
          copied ? "copy-stamp bg-accent text-ink hover:bg-accent" : "bg-secondary hover:bg-ink text-paper-raised"
        }`}
        data-copied={copied}
        type="button"
        onClick={onCopy}
      >
        {/* The host is the same in every room, so it truncates before the id does. */}
        <span className="truncate font-semibold">{host}</span>
        <span className="shrink-0 opacity-65">/room/</span>
        <span className="shrink-0 font-semibold whitespace-nowrap">{roomId}</span>

        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center pl-tight opacity-85"
        >
          {copied ? <CheckIcon size={13} weight="bold" /> : <CopyIcon size={13} weight="bold" />}
        </span>
      </button>
    </div>
  );
}