import { useEffect, useState } from "react";
import { useGetMyTripCountries, useAddMyCountry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { countryFlagEmoji } from "@/lib/country-flag";

type Choice = "visitado" | "objetivo" | "no";

interface TripCountryClaimModalProps {
  tripId: number;
  onDone: () => void;
}

export function TripCountryClaimModal({ tripId, onDone }: TripCountryClaimModalProps) {
  const { data: candidates, isLoading } = useGetMyTripCountries(tripId);
  const addCountry = useAddMyCountry();
  const qc = useQueryClient();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && (candidates ?? []).length === 0) onDone();
  }, [isLoading, candidates, onDone]);

  if (isLoading || !candidates || candidates.length === 0) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(choices).filter(([, choice]) => choice !== "no");
      for (const [countryCode, choice] of entries) {
        await addCountry.mutateAsync({ data: { countryCode, status: choice as "visitado" | "objetivo" } });
      }
      qc.invalidateQueries({ queryKey: ["/api/me/countries"] });
      qc.invalidateQueries({ queryKey: ["/api/me/profile"] });
    } finally {
      setSaving(false);
      onDone();
    }
  };

  const OPTIONS: { value: Choice; label: string }[] = [
    { value: "visitado", label: "Ya lo he visitado" },
    { value: "objetivo", label: "Quiero visitarlo" },
    { value: "no", label: "No añadir" },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Añadir estos países a tu lista?</DialogTitle>
          <DialogDescription>
            Puedes marcar cada país como visitado, como objetivo, o dejarlo fuera de tus listas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {candidates.map(country => (
            <div key={country.countryCode} className="space-y-1.5">
              <p className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: "#2D1F0E" }}>
                <span>{countryFlagEmoji(country.countryCode)}</span>
                {country.countryName}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChoices(prev => ({ ...prev, [country.countryCode]: opt.value }))}
                    className={cn(
                      "text-[11px] rounded-[8px] border px-2 py-1.5 transition-colors",
                      choices[country.countryCode] === opt.value
                        ? "border-transparent text-white"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                    style={choices[country.countryCode] === opt.value ? { background: "var(--terra)" } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onDone} disabled={saving}>Ahora no</Button>
          <Button
            onClick={handleSave}
            disabled={saving || Object.keys(choices).length === 0}
            style={{ background: "var(--terra)", color: "#fff" }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
