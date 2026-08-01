import { Check } from "lucide-react";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.

export function WizardStepper({
  labels,
  current,
  collapseFrom,
  collapseLabel,
}: {
  labels: string[];
  current: number;
  /** When set and `current <= collapseFrom`, only the first `collapseFrom` steps render, with the last visible one relabeled to `collapseLabel`. Mirrors the traveler wizard's join/photo flows, which collapse the 4-step display to 2. */
  collapseFrom?: number;
  collapseLabel?: string;
}) {
  const collapsed = collapseFrom != null && current <= collapseFrom;
  const visibleCount = collapsed ? collapseFrom! : labels.length;

  return (
    <div className="flex items-start gap-0 mb-8">
      {labels.slice(0, visibleCount).map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        const displayLabel = collapsed && num === collapseFrom ? (collapseLabel ?? label) : label;
        return (
          <div key={i} className="flex items-start flex-1">
            <div className="flex flex-col items-center min-w-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0"
                style={{
                  background: done ? "#C4793A" : active ? "#3D2F6B" : "#ECD5B8",
                  color: done || active ? "white" : "#9C7A58",
                }}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : num}
              </div>
              <div
                className="text-[10px] mt-1 text-center whitespace-nowrap"
                style={{ color: active ? "#2D1F0E" : "#9C7A58", fontWeight: active ? 500 : 400 }}
              >
                {displayLabel}
              </div>
            </div>
            {num < visibleCount && (
              <div className="flex-1 h-[2px] mt-3.5 mx-1" style={{ background: done ? "#C4793A" : "#ECD5B8" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
