import { Check, Copy } from "@phosphor-icons/react";

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
 * information here, and the room id is tinted so the eye lands on what to share.
 */
export function ShareSnippet({
  url,
  copied,
  label,
  copyLabel,
  copiedLabel,
  onCopy,
}: ShareSnippetProps) {
  const withoutScheme = url.replace(/^https?:\/\//, "");
  const slashIndex = withoutScheme.indexOf("/");

  const host = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  const segments = slashIndex === -1 ? [] : withoutScheme.slice(slashIndex + 1).split("/");
  const roomId = segments[segments.length - 1] ?? "";

  return (
    <div className="snippet">
      <span className="snippet__tag">{label}</span>

      <button
        aria-label={copied ? copiedLabel : copyLabel}
        className="snippet__chip"
        data-copied={copied}
        type="button"
        onClick={onCopy}
      >
        <span className="snippet__host">{host}</span>
        <span className="snippet__slash">/room/</span>
        <span className="snippet__path">{roomId}</span>

        <span aria-hidden="true" className="snippet__icon">
          {copied ? (
            <Check size={13} weight="bold" />
          ) : (
            <Copy size={13} weight="bold" />
          )}
        </span>
      </button>
    </div>
  );
}