import type { Activity } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountrySelectSmall } from "@/components/country-select";
import { Search, Plus } from "lucide-react";
import type { ActivitySuggestion } from "./types";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.

export function ActivityInlineAddPanel({
  dayNumber,
  catalog,
  alreadyAddedIds,
  catalogSearchQ,
  onCatalogSearchQChange,
  onPickExisting,
  creatingMode,
  onStartCreate,
  lookupQ,
  onLookupQChange,
  lookupLoading,
  lookupDone,
  lookupResults,
  onLookup,
  onApplyResult,
  form,
  onFormChange,
  creating,
  onCancel,
  onCreate,
}: {
  dayNumber: number;
  catalog: Activity[];
  alreadyAddedIds: number[];
  catalogSearchQ: string;
  onCatalogSearchQChange: (v: string) => void;
  onPickExisting: (activityId: number) => void;
  creatingMode: boolean;
  onStartCreate: () => void;
  lookupQ: string;
  onLookupQChange: (v: string) => void;
  lookupLoading: boolean;
  lookupDone: boolean;
  lookupResults: ActivitySuggestion[];
  onLookup: () => void;
  onApplyResult: (r: ActivitySuggestion) => void;
  form: { name: string; category: string; city: string; country: string };
  onFormChange: (form: { name: string; category: string; city: string; country: string }) => void;
  creating: boolean;
  onCancel: () => void;
  onCreate: (dayNumber: number) => void;
}) {
  const filtered = catalog
    .filter(a => !catalogSearchQ || a.name.toLowerCase().includes(catalogSearchQ.toLowerCase()))
    .filter(a => !alreadyAddedIds.includes(a.id))
    .slice(0, 12);

  return (
    <div className="border-t border-border p-3 space-y-2" style={{ background: "#F8F6FC" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
        Añadir actividad
      </div>
      <Input
        placeholder="Buscar en el catálogo…"
        value={catalogSearchQ}
        onChange={e => onCatalogSearchQChange(e.target.value)}
        className="h-7 text-[12px]"
      />
      {catalog.length === 0 ? (
        <div className="text-[12px] py-2 text-center rounded-[8px]" style={{ background: "#EDE9F8", color: "#3D2F6B" }}>
          Tu catálogo está vacío — crea una nueva actividad abajo
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-[11px] py-2 text-center" style={{ color: "#9C7A58" }}>
          {catalogSearchQ ? `Sin coincidencias para "${catalogSearchQ}"` : "Todas las actividades ya están añadidas"}
        </div>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-0.5">
          {filtered.map(a => (
            <button
              key={a.id}
              className="w-full text-left px-2 py-1.5 rounded-[6px] hover:bg-[#EDE9F8] text-[12px] transition-colors"
              style={{ color: "#2D1F0E" }}
              onClick={() => onPickExisting(a.id)}
            >
              {a.name}{a.city ? <span style={{ color: "#9C7A58" }}> · {a.city}</span> : null}
            </button>
          ))}
        </div>
      )}

      {!creatingMode ? (
        <button
          className="w-full text-[11px] font-medium py-1 rounded-[6px] flex items-center justify-center gap-1 transition-colors"
          style={{ color: "#3D2F6B", background: "#EDE9F8" }}
          onClick={onStartCreate}
        >
          <Plus className="w-3 h-3" /> Nueva actividad
        </button>
      ) : (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Nueva actividad</div>
          <div className="flex gap-1.5">
            <Input
              placeholder="Buscar en internet…"
              value={lookupQ}
              onChange={e => onLookupQChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onLookup()}
              className="h-7 text-[12px] flex-1"
            />
            <button
              type="button"
              onClick={onLookup}
              disabled={!lookupQ.trim() || lookupLoading}
              className="h-7 px-2 rounded-[6px] text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
              style={{ background: "#3D2F6B", color: "white" }}
            >
              {lookupLoading ? "…" : <Search className="w-3 h-3" />}
            </button>
          </div>
          {lookupResults.length > 0 && (
            <div className="rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/60 max-h-32 overflow-y-auto">
              {lookupResults.map((r, i) => (
                <button
                  key={i} type="button"
                  onClick={() => onApplyResult(r)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted/50 transition-colors"
                >
                  <p className="text-[11px] font-medium truncate" style={{ color: "#2D1F0E" }}>{r.name}</p>
                  {(r.city || r.country) && <p className="text-[10px] text-muted-foreground truncate">{[r.city, r.country].filter(Boolean).join(", ")}</p>}
                </button>
              ))}
            </div>
          )}
          {lookupDone && lookupResults.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Sin resultados. Rellena manualmente.</p>
          )}
          <Input placeholder="Nombre *" value={form.name} onChange={e => onFormChange({ ...form, name: e.target.value })} className="h-7 text-[12px]" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Ciudad" value={form.city} onChange={e => onFormChange({ ...form, city: e.target.value })} className="h-7 text-[12px]" />
            <CountrySelectSmall value={form.country} onChange={v => onFormChange({ ...form, country: v })} placeholder="País" />
          </div>
          <Select value={form.category || "none"} onValueChange={v => onFormChange({ ...form, category: v === "none" ? "" : v })}>
            <SelectTrigger className="h-7 text-[12px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              <SelectItem value="cultural">Cultural</SelectItem>
              <SelectItem value="gastronomic">Gastronómica</SelectItem>
              <SelectItem value="adventure">Aventura</SelectItem>
              <SelectItem value="nature">Naturaleza</SelectItem>
              <SelectItem value="beach">Playa</SelectItem>
              <SelectItem value="city">Ciudad</SelectItem>
              <SelectItem value="excursion">Excursión</SelectItem>
              <SelectItem value="other">Otra</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onCancel}>Cancelar</Button>
            <Button
              type="button" size="sm" className="h-6 text-[11px]"
              style={{ background: "#3D2F6B", color: "white" }}
              disabled={!form.name || creating}
              onClick={() => onCreate(dayNumber)}
            >
              {creating ? "…" : "Crear"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
