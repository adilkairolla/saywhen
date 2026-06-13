import { clampTime } from "@saywhen/core/controller";

export interface TimeValue {
  h: number;
  m: number;
}

export interface TimeFieldProps {
  value: TimeValue;
  onChange: (value: TimeValue) => void;
}

export function TimeField({ value, onChange }: TimeFieldProps) {
  const set = (h: number, m: number) => onChange(clampTime({ h, m }));
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={23}
        aria-label="Hour"
        value={value.h}
        onChange={(e) => set(Number(e.target.value), value.m)}
        className="w-14 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums"
      />
      <span aria-hidden>:</span>
      <input
        type="number"
        min={0}
        max={59}
        aria-label="Minute"
        value={value.m}
        onChange={(e) => set(value.h, Number(e.target.value))}
        className="w-14 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums"
      />
    </div>
  );
}
