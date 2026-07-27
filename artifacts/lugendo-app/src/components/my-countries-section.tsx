import { useState } from "react";
import { MapPin, Target, Plus, X, CheckCircle2 } from "lucide-react";
import {
  useListMyCountries, useAddMyCountry, useUpdateMyCountryStatus, useRemoveMyCountry,
  ApiError, COUNTRY_CODE_BY_NAME,
} from "@workspace/api-client-react";
import type { UserCountry, UserCountryConflict } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { countryFlagEmoji } from "@/lib/country-flag";
import { CountrySelect } from "@/components/country-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const LIST_META = {
  visitado: { label: "Visitados", icon: MapPin, bg: "#FAEEE4", fg: "#C4793A" },
  objetivo: { label: "Quiero visitar", icon: Target, bg: "#EAE6F5", fg: "#3D2F6B" },
} as const;

function CountryChip({
  country, onRemove, onMarkVisited,
}: {
  country: UserCountry;
  onRemove: () => void;
  onMarkVisited?: () => void;
}) {
  const meta = LIST_META[country.status];
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[13px] font-medium"
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span>{countryFlagEmoji(country.countryCode)}</span>
      {country.countryName}
      {onMarkVisited && (
        <button
          onClick={onMarkVisited}
          title="Marcar como visitado"
          className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={onRemove}
        title="Quitar de la lista"
        className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

function AddCountryButton({ status, existingCodes }: { status: "visitado" | "objetivo"; existingCodes: Set<string> }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const addCountry = useAddMyCountry();
  const updateStatus = useUpdateMyCountryStatus();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/me/countries"] });
    qc.invalidateQueries({ queryKey: ["/api/me/profile"] });
  };

  const handleSelect = (countryName: string) => {
    const countryCode = COUNTRY_CODE_BY_NAME[countryName];
    if (!countryCode) return;
    setOpen(false);

    addCountry.mutate(
      { data: { countryCode, status } },
      {
        onSuccess: invalidate,
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) {
            const conflict = error.data as UserCountryConflict | null;
            const otherLabel = conflict?.status === "visitado" ? "Visitados" : "Quiero visitar";
            if (window.confirm(`${countryName} ya está en tu lista de "${otherLabel}". ¿Quieres moverlo a "${LIST_META[status].label}"?`)) {
              updateStatus.mutate({ countryCode, data: { status } }, { onSuccess: invalidate });
            }
            return;
          }
          toast({ variant: "destructive", title: "Error al añadir el país" });
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[12px] rounded-full"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir país
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <CountrySelect value="" onChange={handleSelect} placeholder="Buscar país…" />
      </PopoverContent>
    </Popover>
  );
}

function CountryList({ status, countries }: { status: "visitado" | "objetivo"; countries: UserCountry[] }) {
  const meta = LIST_META[status];
  const Icon = meta.icon;
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateStatus = useUpdateMyCountryStatus();
  const removeCountry = useRemoveMyCountry();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/me/countries"] });
    qc.invalidateQueries({ queryKey: ["/api/me/profile"] });
  };

  const existingCodes = new Set(countries.map(c => c.countryCode));

  return (
    <div className="bg-card border border-border rounded-[14px] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: meta.fg }} />
          <h2 className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>{meta.label}</h2>
        </div>
        <AddCountryButton status={status} existingCodes={existingCodes} />
      </div>

      {countries.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: meta.bg }}>
            <Icon className="w-5 h-5" style={{ color: meta.fg }} />
          </div>
          <p className="text-[12px] text-muted-foreground max-w-xs">
            {status === "visitado" ? "Todavía no marcaste ningún país como visitado." : "Todavía no añadiste países que quieras visitar."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {countries.map(country => (
            <CountryChip
              key={country.countryCode}
              country={country}
              onRemove={() => removeCountry.mutate({ countryCode: country.countryCode }, {
                onSuccess: invalidate,
                onError: () => toast({ variant: "destructive", title: "Error al quitar el país" }),
              })}
              onMarkVisited={status === "objetivo" ? () => updateStatus.mutate(
                { countryCode: country.countryCode, data: { status: "visitado" } },
                { onSuccess: invalidate, onError: () => toast({ variant: "destructive", title: "Error al actualizar el país" }) }
              ) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MyCountriesSection() {
  const { data: countries, isLoading } = useListMyCountries();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-32 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-32 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  const all = countries ?? [];
  const visited = all.filter(c => c.status === "visitado");
  const target = all.filter(c => c.status === "objetivo");

  return (
    <div className="space-y-3">
      <CountryList status="visitado" countries={visited} />
      <CountryList status="objetivo" countries={target} />
    </div>
  );
}
