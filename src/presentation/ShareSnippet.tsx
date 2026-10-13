import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

export interface ShareSnippetProps {
  roomId: string;
  copied: boolean;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}

/**
 * The room id as a single chip: the whole thing is the target, so there is no
 * separate button to hunt for. The address stays out of it because the id is what
 * identifies the room and the copy hands over the full link anyway.
 */
export function ShareSnippet({
  roomId,
  copied,
  label,
  copyLabel,
  copiedLabel,
  onCopy,
}: Readonly<ShareSnippetProps>) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-hair">
      <span className="font-mono text-[0.5625rem] font-semibold tracking-[0.14em] uppercase text-ink-faint">
        {label}
      </span>

      <button
        aria-label={copied ? copiedLabel : copyLabel}
        className={`flex min-w-0 max-w-full items-center rounded-chip border px-tight py-hair font-mono text-[0.71875rem] leading-[1.3] transition-[background,border-color,transform] duration-150 focus-visible:border-ink focus-visible:outline-offset-[3px] active:scale-[0.99] ${
          copied
            ? "copy-stamp border-accent bg-accent/30 text-ink hover:border-accent hover:bg-accent/30"
            : "border-line bg-paper text-ink hover:border-ink"
        }`}
        data-copied={copied}
        type="button"
        onClick={onCopy}
      >
        <span className="truncate font-semibold">{roomId}</span>

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
