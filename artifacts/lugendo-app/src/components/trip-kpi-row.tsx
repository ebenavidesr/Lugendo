import { Building2, Star, ListChecks, FileText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface RatioKpi {
  kind: "ratio";
  icon: LucideIcon;
  numerator: number;
  denominator: number;
  label: string;
}

interface PlainKpi {
  kind: "plain";
  icon: LucideIcon;
  value: number;
  label: string;
}

type Kpi = RatioKpi | PlainKpi;

interface TripKpiRowProps {
  daysWithHotel: number;
  daysWithActivity: number;
  totalDays: number;
  checklistCompleted: number;
  checklistTotal: number;
  documentCount: number;
  travelerCount: number;
}

function valueColor(kpi: Kpi): string {
  if (kpi.kind === "plain") return "var(--indigo)";
  if (kpi.denominator === 0) return "var(--indigo)";
  const ratio = kpi.numerator / kpi.denominator;
  if (ratio >= 1) return "#2E7D5A";
  if (ratio < 0.5) return "#C07A2B";
  return "var(--indigo)";
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  const color = valueColor(kpi);
  const display = kpi.kind === "ratio" ? `${kpi.numerator}/${kpi.denominator}` : `${kpi.value}`;

  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-border p-3 text-center"
      style={{ background: "#F5EFE6" }}
    >
      <Icon className="w-4 h-4" style={{ color: "var(--terra)" }} />
      <p className="text-[16px] font-semibold leading-none" style={{ color }}>
        {display}
      </p>
      <p className="text-[10px] leading-tight" style={{ color: "#888888" }}>
        {kpi.label}
      </p>
    </div>
  );
}

export function TripKpiRow({
  daysWithHotel,
  daysWithActivity,
  totalDays,
  checklistCompleted,
  checklistTotal,
  documentCount,
  travelerCount,
}: TripKpiRowProps) {
  const kpis: Kpi[] = [
    {
      kind: "ratio",
      icon: Building2,
      numerator: daysWithHotel,
      denominator: totalDays,
      label: "Días con hotel",
    },
    {
      kind: "ratio",
      icon: Star,
      numerator: daysWithActivity,
      denominator: totalDays,
      label: "Días con actividades",
    },
    {
      kind: "ratio",
      icon: ListChecks,
      numerator: checklistCompleted,
      denominator: checklistTotal,
      label: "Tareas completadas",
    },
    {
      kind: "plain",
      icon: FileText,
      value: documentCount,
      label: "Documentos subidos",
    },
    {
      kind: "plain",
      icon: Users,
      value: travelerCount,
      label: "Viajeros",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {kpis.map((kpi, i) => (
        <KpiCard key={i} kpi={kpi} />
      ))}
    </div>
  );
}
