import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

// #178: lista cerrada de regiones — antes texto libre. Compartida por el formulario
// de edición de itinerario y por esta barra de filtros (Itinerarios y Viajes).
export const REGIONS = ["África", "Asia", "Europa", "América", "Oceanía", "Polar"] as const;

export interface ItineraryTripFilters {
  name: string;
  agencyId: string; // "" = todas
  region: string;   // "" = todas
}

export const EMPTY_ITINERARY_TRIP_FILTERS: ItineraryTripFilters = { name: "", agencyId: "", region: "" };

export function hasActiveFilters(f: ItineraryTripFilters): boolean {
  return !!(f.name || f.agencyId || f.region);
}

/**
 * Barra de filtros combinable (#178) — mismo componente en Itinerarios y Viajes,
 * para no tener dos implementaciones paralelas del mismo patrón.
 */
export function ItineraryTripFilterBar({
  filters, onChange, agencies,
}: {
  filters: ItineraryTripFilters;
  onChange: (f: ItineraryTripFilters) => void;
  agencies: { id: number; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <Input
        placeholder="Buscar por nombre…"
        value={filters.name}
        onChange={e => onChange({ ...filters, name: e.target.value })}
        className="h-9 w-48"
      />
      <Select value={filters.agencyId || "all"} onValueChange={v => onChange({ ...filters, agencyId: v === "all" ? "" : v })}>
        <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Agencia" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las agencias</SelectItem>
          {agencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.region || "all"} onValueChange={v => onChange({ ...filters, region: v === "all" ? "" : v })}>
        <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Región" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las regiones</SelectItem>
          {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      {hasActiveFilters(filters) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 text-muted-foreground"
          onClick={() => onChange(EMPTY_ITINERARY_TRIP_FILTERS)}
        >
          <X className="w-3.5 h-3.5" /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}
