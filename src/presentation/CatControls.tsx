import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import type { Translator } from "@application/i18n";

export interface CatControlsProps {
  isPaused: boolean;
  isOwn: boolean;
  name: string;
  onTogglePause: () => void;
  onRemove: () => void;
  translate: Translator;
}

export function CatControls({
  isPaused,
  isOwn,
  name,
  onTogglePause,
  onRemove,
  translate,
}: Readonly<CatControlsProps>) {
  if (!isOwn) return null;

  return (
    <span aria-label={translate("cat.controls")} className="cat-controls" role="toolbar">
      <button
        aria-label={
          isPaused
            ? translate("cat.resume", { name })
            : translate("cat.pause", { name })
        }
        className="cat-controls__button"
        type="button"
        onClick={onTogglePause}
      >
        {isPaused ? (
          <PlayIcon aria-hidden="true" size={16} weight="fill" />
        ) : (
          <PauseIcon aria-hidden="true" size={16} weight="fill" />
        )}
      </button>
      <button
        aria-label={translate("cat.removeAction")}
        className="cat-controls__button"
        type="button"
        onClick={onRemove}
      >
        {/* The Phosphor X is a filled outline whose arms are too thin to read at this
            size, so the X is drawn as a stroke instead: two bold lines the eye catches. */}
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        >
          <path d="M4 4 14 14 M14 4 4 14" />
        </svg>
      </button>
    </span>
  );
}
