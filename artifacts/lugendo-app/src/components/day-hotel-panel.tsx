import { useState } from "react";
import { Hotel, Plus, X, Search, Loader2, ChevronDown } from "lucide-react";
import {
  useListHotels,
  useCreateHotel,
  useUpdateItineraryDay,
} from "@workspace/api-client-react";
import type { ItineraryDay } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type HotelLookupResult = {
  name: string; city: string; country: string;
  address: string; phone: string; website: string;
};

export function DayHotelPanel({
  itineraryId,
  day,
  compact = false,
}: {
  itineraryId: number;
  day: ItineraryDay;
  compact?: boolean;
}) {
  const { data: hotels } = useListHotels();
  const createHotel = useCreateHotel();
  const updateDay = useUpdateItineraryDay();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<"idle" | "select" | "create">("idle");

  // lookup state
  const [searchQ, setSearchQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<HotelLookupResult[]>([]);
  const [lookupDone, setLookupDone] = useState(false);

  // new hotel form
  const [form, setForm] = useState({ name: "", city: "", country: "", address: "", phone: "", website: "" });
  const [saving, setSaving] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });

  const assignHotel = (hotelId: number | null, hotelName?: string) => {
    updateDay.mutate(
      { itineraryId, dayId: day.id, data: hotelId ? { hotelId } : { hotelId: 0 } },
      {
        onSuccess: () => {
          invalidate();
          if (hotelName) toast({ title: `Hotel "${hotelName}" asignado` });
          setMode("idle");
        },
        onError: () => toast({ variant: "destructive", title: "Error al asignar el hotel" }),
      }
    );
  };

  const handleSelectChange = (val: string) => {
    if (val === "none") assignHotel(null);
    else assignHotel(parseInt(val), hotels?.find(h => h.id === parseInt(val))?.name);
  };

  const handleLookup = async () => {
    if (!searchQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    setLookupResults([]);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(searchQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar hoteles" });
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyLookup = (r: HotelLookupResult) => {
    setForm({ name: r.name, city: r.city, country: r.country, address: r.address, phone: r.phone ?? "", website: r.website ?? "" });
    setLookupResults([]);
    setSearchQ("");
    setLookupDone(false);
  };

  const handleCreate = async () => {
    if (!form.name || !form.city || !form.country) return;
    setSaving(true);
    try {
      const hotel = await createHotel.mutateAsync({
        data: {
          name: form.name, city: form.city, country: form.country,
          ...(form.address ? { address: form.address } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.website ? { website: form.website } : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/hotels"] });
      assignHotel(hotel.id, hotel.name);
      setForm({ name: "", city: "", country: "", address: "", phone: "", website: "" });
    } catch {
      toast({ variant: "destructive", title: "Error al crear el hotel" });
    } finally {
      setSaving(false);
    }
  };

  const resetMode = () => {
    setMode("idle");
    setSearchQ(""); setLookupResults([]); setLookupDone(false);
    setForm({ name: "", city: "", country: "", address: "", phone: "", website: "" });
  };

  return (
    <div className={compact ? "space-y-2" : "mt-3 pt-3 border-t border-border/60"}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
          Hotel del día
        </div>
        {mode === "idle" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode("select")}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
              <ChevronDown className="w-3 h-3" /> Cambiar
            </button>
            <button
              onClick={() => { setMode("create"); setForm(f => ({ ...f, city: day.cityTo ?? day.cityFrom ?? "" })); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium"
              style={{ background: "#FAEEE4", color: "#C4793A" }}>
              <Plus className="w-3 h-3" /> Nuevo
            </button>
          </div>
        )}
        {mode !== "idle" && (
          <button onClick={resetMode} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" /> Cancelar
          </button>
        )}
      </div>

      {/* Current hotel */}
      {day.hotelId ? (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-border/60 bg-card mb-2">
          <Hotel className="w-4 h-4 shrink-0" style={{ color: "#9C7A58" }} />
          <span className="text-[12px] font-medium flex-1" style={{ color: "#2D1F0E" }}>
            {day.hotelName ?? `Hotel #${day.hotelId}`}
          </span>
          <button
            onClick={() => assignHotel(null)}
            className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
            title="Quitar hotel">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : mode === "idle" ? (
        <div className="text-[11px] text-muted-foreground italic py-1">
          Sin hotel asignado.
        </div>
      ) : null}

      {/* Select from catalogue */}
      {mode === "select" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2" style={{ background: "#FAF8FF" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Seleccionar del catálogo</p>
          <Select defaultValue={day.hotelId ? String(day.hotelId) : "none"} onValueChange={handleSelectChange}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Sin hotel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin hotel</SelectItem>
              {hotels?.map(h => (
                <SelectItem key={h.id} value={String(h.id)}>{h.name} — {h.city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Create new hotel with web lookup */}
      {mode === "create" && (
        <div className="rounded-[8px] border border-border/60 p-3 space-y-2.5" style={{ background: "#FAF8F5" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#C4793A" }}>Buscar o crear hotel</p>

          {/* Lookup */}
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Buscar en la web</label>
            <div className="flex gap-1.5">
              <Input
                placeholder="Hotel Arts Barcelona…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLookup()}
                className="h-8 text-[12px] flex-1"
              />
              <button
                onClick={handleLookup}
                disabled={!searchQ.trim() || lookupLoading}
                className="h-8 px-3 rounded-[6px] text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {lookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </div>
            {lookupResults.length > 0 && (
              <div className="mt-1.5 rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/60">
                {lookupResults.map((r, i) => (
                  <button key={i} onClick={() => applyLookup(r)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors">
                    <p className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>{r.name}</p>
                    {(r.city || r.country) && (
                      <p className="text-[11px] text-muted-foreground truncate">{[r.city, r.country].filter(Boolean).join(", ")}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {lookupDone && lookupResults.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">Sin resultados. Rellena el nombre manualmente.</p>
            )}
          </div>

          {/* Hotel form */}
          <div className="space-y-2 pt-1 border-t border-border/60">
            <label className="text-[11px] text-muted-foreground block">Datos del hotel</label>
            <Input placeholder="Nombre *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-[12px]" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Ciudad *" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-8 text-[12px]" />
              <Input placeholder="País *" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="h-8 text-[12px]" />
            </div>
            <Input placeholder="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-8 text-[12px]" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-[12px]" />
              <Input placeholder="Web" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="h-8 text-[12px]" />
            </div>
            <button
              onClick={handleCreate}
              disabled={!form.name || !form.city || !form.country || saving}
              className="h-8 px-4 rounded-[6px] text-[12px] font-medium disabled:opacity-40"
              style={{ background: "#C4793A", color: "#FAF2EB" }}>
              {saving ? "Guardando…" : "Guardar hotel y asignar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
