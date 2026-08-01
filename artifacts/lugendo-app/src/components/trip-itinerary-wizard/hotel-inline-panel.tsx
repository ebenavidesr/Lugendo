import type { Hotel } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CountrySelectSmall } from "@/components/country-select";
import { Search } from "lucide-react";
import type { HotelSuggestion } from "./types";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.
// `showCatalogPicker` is true for the traveler wizard (which has no separate row-level
// hotel <Select>, so this panel is the only way to pick an existing catalog hotel) and
// false for the agency wizard (which already has that <Select> on the day row).

export function HotelInlineCreatePanel({
  dayNumber,
  showCatalogPicker = false,
  catalog,
  catalogSearchQ,
  onCatalogSearchQChange,
  onPickExisting,
  searchQ,
  onSearchQChange,
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
  showCatalogPicker?: boolean;
  catalog: Hotel[];
  catalogSearchQ: string;
  onCatalogSearchQChange: (v: string) => void;
  onPickExisting: (hotelId: number) => void;
  searchQ: string;
  onSearchQChange: (v: string) => void;
  lookupLoading: boolean;
  lookupDone: boolean;
  lookupResults: HotelSuggestion[];
  onLookup: () => void;
  onApplyResult: (r: HotelSuggestion) => void;
  form: { name: string; city: string; country: string; address: string; phone: string; website: string };
  onFormChange: (form: { name: string; city: string; country: string; address: string; phone: string; website: string }) => void;
  creating: boolean;
  onCancel: () => void;
  onCreate: (dayNumber: number) => void;
}) {
  const filteredCatalog = showCatalogPicker
    ? catalog
        .filter(h => !catalogSearchQ || h.name.toLowerCase().includes(catalogSearchQ.toLowerCase()) || h.city.toLowerCase().includes(catalogSearchQ.toLowerCase()))
        .slice(0, 5)
    : [];

  return (
    <div className="border-t border-border p-3 space-y-3" style={{ background: "#FAF8F5" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#C4793A" }}>
        Buscar o crear hotel
      </div>

      {showCatalogPicker && (
        <>
          <Input
            placeholder="Buscar en el catálogo…"
            value={catalogSearchQ}
            onChange={e => onCatalogSearchQChange(e.target.value)}
            className="h-8 text-[12px]"
          />
          {filteredCatalog.length > 0 && (
            <div className="space-y-1">
              {filteredCatalog.map(h => (
                <button
                  key={h.id}
                  className="w-full text-left px-2 py-1.5 rounded-[6px] hover:bg-[#FAEEE4] text-[12px] transition-colors"
                  style={{ color: "#2D1F0E" }}
                  onClick={() => onPickExisting(h.id)}
                >
                  {h.name} <span style={{ color: "#9C7A58" }}>· {h.city}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Buscar en internet…"
          value={searchQ}
          onChange={e => onSearchQChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onLookup()}
          className="h-8 text-[12px] flex-1"
        />
        <Button
          type="button" size="sm" className="h-8 text-[11px] gap-1 flex-shrink-0"
          style={{ background: "#C4793A", color: "white" }}
          onClick={onLookup}
          disabled={lookupLoading || !searchQ.trim()}
        >
          <Search className="w-3 h-3" />
          {lookupLoading ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {lookupDone && lookupResults.length === 0 && (
        <div className="text-[12px] py-1.5 px-2 rounded-[8px] text-center" style={{ background: "#FFF3E0", color: "#8B4420" }}>
          Sin resultados — rellena el formulario manualmente o prueba otro nombre
        </div>
      )}
      {lookupResults.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px]" style={{ color: "#9C7A58" }}>Selecciona para pre-rellenar el formulario:</div>
          {lookupResults.map((r, i) => (
            <button
              key={i}
              onClick={() => onApplyResult(r)}
              className="w-full text-left p-2 rounded-[8px] border border-border hover:border-[#C4793A] text-[12px] transition-colors"
            >
              <div className="font-medium" style={{ color: "#2D1F0E" }}>{r.name}</div>
              <div style={{ color: "#9C7A58" }}>{r.city}{r.country ? `, ${r.country}` : ""}</div>
              {r.address && <div className="text-[11px] truncate" style={{ color: "#9C7A58" }}>{r.address}</div>}
            </button>
          ))}
        </div>
      )}

      <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Datos del hotel</div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Nombre *" value={form.name} onChange={e => onFormChange({ ...form, name: e.target.value })} className="h-7 text-[12px]" />
        <Input placeholder="Ciudad *" value={form.city} onChange={e => onFormChange({ ...form, city: e.target.value })} className="h-7 text-[12px]" />
        <CountrySelectSmall value={form.country} onChange={v => onFormChange({ ...form, country: v })} placeholder="País *" />
        <Input placeholder="Dirección" value={form.address} onChange={e => onFormChange({ ...form, address: e.target.value })} className="h-7 text-[12px]" />
        <Input placeholder="Teléfono" value={form.phone} onChange={e => onFormChange({ ...form, phone: e.target.value })} className="h-7 text-[12px]" />
        <Input placeholder="Web" value={form.website} onChange={e => onFormChange({ ...form, website: e.target.value })} className="h-7 text-[12px]" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[12px]" onClick={onCancel}>Cancelar</Button>
        <Button
          type="button" size="sm" className="h-7 text-[12px]"
          style={{ background: "#C4793A", color: "white" }}
          disabled={!form.name || !form.city || !form.country || creating}
          onClick={() => onCreate(dayNumber)}
        >
          {creating ? "Guardando…" : "Guardar hotel"}
        </Button>
      </div>
    </div>
  );
}
