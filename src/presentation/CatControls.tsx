import { PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
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
          <PlayIcon aria-hidden="true" size={12} weight="fill" />
        ) : (
          <PauseIcon aria-hidden="true" size={12} weight="fill" />
        )}
      </button>
      <button
        aria-label={translate("cat.removeAction")}
        className="cat-controls__button"
        type="button"
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" size={12} weight="bold" />
      </button>
    </span>
  );
}
