import type { TripType } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: "adventure", label: "Aventura" },
  { value: "beach", label: "Playa" },
  { value: "cultural", label: "Cultural" },
  { value: "culinary", label: "Gastronómico" },
  { value: "nature", label: "Naturaleza" },
  { value: "city", label: "Ciudad" },
  { value: "wellness", label: "Bienestar" },
  { value: "family", label: "Familiar" },
];

interface ItineraryFilterBarProps {
  destination: string;
  onDestinationChange: (v: string) => void;
  maxBudget: string;
  onMaxBudgetChange: (v: string) => void;
  tripTypes: TripType[];
  onTripTypesChange: (v: TripType[]) => void;
}

export function ItineraryFilterBar({
  destination, onDestinationChange, maxBudget, onMaxBudgetChange, tripTypes, onTripTypesChange,
}: ItineraryFilterBarProps) {
  return (
    <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "#2D1F0E" }}>Destino</label>
          <Input placeholder="Marruecos, Perú…" value={destination} onChange={e => onDestinationChange(e.target.value)} />
        </div>
        <div>
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "#2D1F0E" }}>
            Presupuesto máximo (€/persona)
          </label>
          <Input type="number" min={0} placeholder="1500" value={maxBudget} onChange={e => onMaxBudgetChange(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium mb-1.5 block" style={{ color: "#2D1F0E" }}>Tipo de viaje</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {TRIP_TYPE_OPTIONS.map(opt => {
            const checked = tripTypes.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none">
                <Checkbox
                  checked={checked}
                  onCheckedChange={v => onTripTypesChange(v ? [...tripTypes, opt.value] : tripTypes.filter(t => t !== opt.value))}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
