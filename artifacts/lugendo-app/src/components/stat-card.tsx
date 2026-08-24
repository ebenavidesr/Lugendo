import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: number | string; sub?: string; icon: LucideIcon; accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-[32px] font-medium leading-none mt-1.5" style={{ color: "#2D1F0E" }}>{value}</p>
          {sub && <p className="text-xs mt-1 text-muted-foreground">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: accent ?? "#FAEEE4" }}>
          <Icon className="w-4.5 h-4.5" style={{ color: "#C4793A" }} />
        </div>
      </div>
    </div>
  );
}
