"use client";

import { ToggleButton, ToggleButtonGroup } from "react-aria-components";

// The pill-shaped choose-one control the landing showcase's panels share. A React Aria toggle group
// gives arrow-key movement, a visible focus ring, and `aria-pressed` state for free; this only maps
// its set-of-keys interface onto a single typed value.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const chosen = options.find((option) => keys.has(option.id));
        if (chosen) onChange(chosen.id);
      }}
      className="inline-flex flex-wrap rounded-full border-2 border-ink bg-white p-0.5"
    >
      {options.map((option) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold outline-2 outline-offset-2 outline-transparent transition-colors data-[focus-visible]:outline-ink data-[hovered]:bg-ink/10 data-[selected]:bg-ink data-[selected]:text-cream"
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
