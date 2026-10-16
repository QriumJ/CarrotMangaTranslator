import React from "react";
import { normalizeHexColor } from "../../lib/cssColor";
import { Input } from "./Field";

export type HexColorInputProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  /** Set when an enclosing element draws the frame instead of the input. */
  framed?: boolean;
  /** Shows an empty draft with `placeholder` until the user types a color. */
  mixed?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

type HexDraft = { text: string; base: string };

/**
 * A draft survives while the value is the one it was typed against or the one
 * it published; a swatch or picker change from elsewhere replaces it.
 */
function resolveActiveDraft(
  draft: HexDraft | null,
  value: string,
): string | null {
  if (!draft) return null;
  return draft.base === value || normalizeHexColor(draft.text) === value
    ? draft.text
    : null;
}

/**
 * `#RRGGBB` text entry. Valid drafts publish while typing; an invalid draft is
 * dropped on blur so the field always settles back on the applied color.
 */
export function HexColorInput({
  ariaLabel,
  className,
  disabled = false,
  framed = false,
  mixed = false,
  placeholder,
  value,
  onChange,
}: HexColorInputProps): React.JSX.Element {
  const normalizedValue = normalizeHexColor(value) ?? "#000000";
  const [draft, setDraft] = React.useState<HexDraft | null>(null);
  const activeDraft = resolveActiveDraft(draft, normalizedValue);
  const displayedDraft =
    activeDraft ?? (mixed ? "" : normalizedValue.toUpperCase());

  const publishValidDraft = (nextDraft: string): void => {
    const next = normalizeHexColor(nextDraft);
    if (next && (mixed || next !== normalizedValue)) onChange(next);
  };

  return (
    <Input
      className={className}
      data-ui-framed-input={framed ? "" : undefined}
      type="text"
      inputMode="text"
      maxLength={7}
      spellCheck={false}
      value={displayedDraft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const upperDraft = event.target.value.toUpperCase();
        setDraft({ text: upperDraft, base: normalizedValue });
        publishValidDraft(upperDraft);
      }}
      onBlur={() => {
        publishValidDraft(displayedDraft);
        if (draft !== null) setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
}
