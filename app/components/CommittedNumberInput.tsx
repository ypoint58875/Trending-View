"use client";

import { useEffect, useRef, useState } from "react";

export interface CommittedNumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  name?: string;
  disabled?: boolean;
  integer?: boolean;
  normalize?: (value: number) => number;
}

export function CommittedNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  name,
  disabled = false,
  integer = false,
  normalize,
}: CommittedNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(String(value));
  }, [value]);

  const restore = () => setDraft(String(value));
  const commit = () => {
    editingRef.current = false;
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    if (!Number.isFinite(parsed)) {
      restore();
      return;
    }
    let nextValue = integer ? Math.floor(parsed) : parsed;
    if (min !== undefined) nextValue = Math.max(nextValue, min);
    if (max !== undefined) nextValue = Math.min(nextValue, max);
    if (normalize) nextValue = normalize(nextValue);
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <input
      name={name}
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={(event) => {
        editingRef.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          editingRef.current = false;
          restore();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
