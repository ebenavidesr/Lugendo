import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const TRANSPORT_OPTIONS = [
  { value: "plane",      label: "Avión",                icon: "✈️" },
  { value: "ship",       label: "Barco",                icon: "🚢" },
  { value: "ferry",      label: "Ferry",                icon: "⛴️" },
  { value: "train",      label: "Tren",                 icon: "🚂" },
  { value: "self_drive", label: "Coche self-drive",     icon: "🚗" },
  { value: "car_driver", label: "Coche con conductor",  icon: "🚕" },
  { value: "bus",        label: "Autobús",              icon: "🚌" },
  { value: "motorcycle", label: "Moto",                 icon: "🏍️" },
  { value: "bicycle",    label: "Bici",                 icon: "🚲" },
  { value: "walking",    label: "A pie",                icon: "🚶" },
] as const;

export type TransportValue = typeof TRANSPORT_OPTIONS[number]["value"];

export function getTransportOption(value: string | null | undefined) {
  return TRANSPORT_OPTIONS.find(o => o.value === value) ?? null;
}

export function TransportLabel({ value }: { value: string | null | undefined }) {
  const opt = getTransportOption(value);
  if (!opt) return <span className="text-muted-foreground">—</span>;
  return <span>{opt.icon} {opt.label}</span>;
}

interface TransportSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TransportSelect({ value, onChange, placeholder = "Seleccionar transporte", className }: TransportSelectProps) {
  return (
    <Select value={value || "none"} onValueChange={v => onChange(v === "none" ? "" : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {value && value !== "none" ? (() => {
            const opt = getTransportOption(value);
            return opt ? <span>{opt.icon} {opt.label}</span> : <span>{value}</span>;
          })() : <span className="text-muted-foreground">{placeholder}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">Sin transporte</span>
        </SelectItem>
        {TRANSPORT_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
