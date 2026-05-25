import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Trash2, Plane, Hotel, ChevronDown, ChevronUp,
  Save, Search,
} from "lucide-react";
import {
  useGetMyTrip, useUpdateMyTrip, useCreateTripDay, useUpdateTripDay,
  useDeleteTripDay, useListHotels, useCreateHotel,
} from "@workspace/api-client-react";
import { DayActivitiesPanel } from "@/components/day-activities-panel";
import type { TravelerTripDetailStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DayState {
  id: number | null;        // null = new day not yet saved
  dayNumber: number;
  cityFrom: string;
  cityTo: string;
  transport: string;
  description: string;
  hotelId: string;          // stringified id or ""
  hotelName: string;
  deleted: boolean;
  expanded: boolean;
}

interface MetaState {
  name: string;
  status: TravelerTripDetailStatus;
  startDate: string;
  endDate: string;
  airline: string;
  flightNumber: string;
  flightTime: string;
  reservationCode: string;
  returnAirline: string;
  returnFlightNumber: string;
  returnFlightTime: string;
  returnReservationCode: string;
}

// ── Hotel lookup mini-panel ────────────────────────────────────────────────────

function HotelPanel({
  dayNumber,
  hotels,
  onAssign,
  onClose,
}: {
  dayNumber: number;
  hotels: Array<{ id: number; name: string; city: string }>;
  onAssign: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createHotel = useCreateHotel();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"catalog" | "new">("catalog");
  const [q, setQ] = useState("");
  const [lookupQ, setLookupQ] = useState("");
  const [lookupResults, setLookupResults] = useState<Array<{ name: string; city: string; country: string; address: string; phone: string; website: string }>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", city: "", country: "", address: "", phone: "", website: "" });
  const [creating, setCreating] = useState(false);

  const filtered = hotels.filter(h =>
    !q || h.name.toLowerCase().includes(q.toLowerCase()) || h.city.toLowerCase().includes(q.toLowerCase())
  );

  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(lookupQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
    } catch { /* ignore */ }
    finally { setLookupLoading(false); }
  };

  const handleCreate = async (data: { name: string; city: string; country: string; address?: string; phone?: string; website?: string }) => {
    if (!data.name || !data.city || !data.country) return;
    setCreating(true);
    try {
      const hotel = await createHotel.mutateAsync({ data: {
        name: data.name, city: data.city, country: data.country,
        ...(data.address ? { address: data.address } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.website ? { website: data.website } : {}),
      }});
      qc.invalidateQueries({ queryKey: ["/api/hotels"] });
      toast({ title: `Hotel "${hotel.name}" creado` });
      onAssign(String(hotel.id), hotel.name);
      onClose();
    } catch { toast({ variant: "destructive", title: "Error al crear el hotel" }); }
    finally { setCreating(false); }
  };

  return (
    <div className="border border-border rounded-[10px] p-3 mt-2 space-y-3" style={{ background: "#F8F6FC" }}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
        <Hotel className="w-3.5 h-3.5" /> Asignar hotel — Día {dayNumber}
        <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
      </div>

      <div className="flex gap-2">
        <button
          className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${tab === "catalog" ? "text-white" : "text-muted-foreground"}`}
          style={{ background: tab === "catalog" ? "#3D2F6B" : "#EDE9F8" }}
          onClick={() => setTab("catalog")}
        >Catálogo</button>
        <button
          className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors ${tab === "new" ? "text-white" : "text-muted-foreground"}`}
          style={{ background: tab === "new" ? "#C4793A" : "#FAEEE4", color: tab === "new" ? "white" : "#C4793A" }}
          onClick={() => setTab("new")}
        >Nuevo hotel</button>
      </div>

      {tab === "catalog" && (
        <div className="space-y-2">
          <Input
            placeholder="Buscar en catálogo…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-7 text-[12px]"
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-[12px] text-muted-foreground text-center py-2">Sin resultados</div>
            ) : (
              filtered.slice(0, 15).map(h => (
                <button
                  key={h.id}
                  className="w-full text-left px-2 py-1.5 rounded-[6px] hover:bg-white text-[12px]"
                  style={{ color: "#2D1F0E" }}
                  onClick={() => { onAssign(String(h.id), h.name); onClose(); }}
                >
                  {h.name} <span className="text-muted-foreground">· {h.city}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "new" && (
        <div className="space-y-2">
          {/* Internet search — click result to create+assign directly */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar en internet…"
              value={lookupQ}
              onChange={e => setLookupQ(e.target.value)}
              className="h-7 text-[12px] flex-1"
              onKeyDown={e => e.key === "Enter" && handleLookup()}
            />
            <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleLookup} disabled={lookupLoading || creating} style={{ background: "#3D2F6B" }}>
              <Search className="w-3 h-3" />{lookupLoading ? "…" : "Buscar"}
            </Button>
          </div>
          {lookupResults.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-0.5 border border-border rounded-[8px] p-1" style={{ background: "white" }}>
              <p className="text-[10px] text-muted-foreground px-1 pt-0.5 pb-1">Haz clic para crear y asignar</p>
              {lookupResults.map((r, i) => (
                <button
                  key={i}
                  disabled={creating}
                  className="w-full text-left px-2 py-1.5 rounded-[6px] hover:bg-[#FAF2EB] text-[12px] flex items-center justify-between disabled:opacity-50"
                  style={{ color: "#2D1F0E" }}
                  onClick={() => handleCreate(r)}
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground text-[11px] shrink-0 ml-2">{r.city}{r.country ? `, ${r.country}` : ""}</span>
                </button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">o añade manualmente</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual form */}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nombre *" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-[12px]" />
            <Input placeholder="Ciudad *" value={newForm.city} onChange={e => setNewForm(f => ({ ...f, city: e.target.value }))} className="h-7 text-[12px]" />
            <Input placeholder="País *" value={newForm.country} onChange={e => setNewForm(f => ({ ...f, country: e.target.value }))} className="h-7 text-[12px]" />
            <Input placeholder="Dirección" value={newForm.address} onChange={e => setNewForm(f => ({ ...f, address: e.target.value }))} className="h-7 text-[12px]" />
          </div>
          <Button
            size="sm" className="w-full h-7 text-[11px]"
            style={{ background: "#C4793A", color: "white" }}
            disabled={!newForm.name || !newForm.city || !newForm.country || creating}
            onClick={() => handleCreate(newForm)}
          >
            {creating ? "Creando…" : "Crear y asignar"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TravelerTripEdit() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: trip, isLoading } = useGetMyTrip(tripId);
  const { data: hotels } = useListHotels();
  const updateTrip = useUpdateMyTrip();
  const createDay = useCreateTripDay();
  const updateDay = useUpdateTripDay();
  const deleteDay = useDeleteTripDay();

  const [meta, setMeta] = useState<MetaState>({
    name: "", status: "draft", startDate: "", endDate: "",
    airline: "", flightNumber: "", flightTime: "", reservationCode: "",
    returnAirline: "", returnFlightNumber: "", returnFlightTime: "", returnReservationCode: "",
  });
  const [days, setDays] = useState<DayState[]>([]);
  const [hotelPanelDay, setHotelPanelDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load trip data into state once
  useEffect(() => {
    if (trip && !initialized) {
      setMeta({
        name: trip.name,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate ?? "",
        airline: trip.airline ?? "",
        flightNumber: trip.flightNumber ?? "",
        flightTime: trip.flightTime ?? "",
        reservationCode: trip.reservationCode ?? "",
        returnAirline: "",
        returnFlightNumber: "",
        returnFlightTime: "",
        returnReservationCode: "",
      });
      setDays((trip.days ?? []).map(d => ({
        id: d.id,
        dayNumber: d.dayNumber,
        cityFrom: d.cityFrom ?? "",
        cityTo: d.cityTo ?? "",
        transport: d.transport ?? "",
        description: d.description ?? "",
        hotelId: d.hotelId ? String(d.hotelId) : "",
        hotelName: d.hotelName ?? "",
        deleted: false,
        expanded: false,
      })));
      setInitialized(true);
    }
  }, [trip, initialized]);

  const setMt = (patch: Partial<MetaState>) => setMeta(m => ({ ...m, ...patch }));

  const activeDays = days.filter(d => !d.deleted).sort((a, b) => a.dayNumber - b.dayNumber);

  const updateDayField = (idx: number, patch: Partial<DayState>) => {
    setDays(ds => ds.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const addDay = () => {
    const nextNum = activeDays.length > 0 ? Math.max(...activeDays.map(d => d.dayNumber)) + 1 : 1;
    setDays(ds => [...ds, {
      id: null, dayNumber: nextNum,
      cityFrom: "", cityTo: "", transport: "", description: "",
      hotelId: "", hotelName: "", deleted: false, expanded: true,
    }]);
  };

  const removeDay = (idx: number) => {
    setDays(ds => ds.map((d, i) => i === idx
      ? (d.id === null ? null : { ...d, deleted: true }) // new unsaved: remove; saved: mark deleted
      : d
    ).filter((d): d is DayState => d !== null));
  };

  const toggleExpand = (idx: number) => {
    setDays(ds => ds.map((d, i) => i === idx ? { ...d, expanded: !d.expanded } : d));
  };

  const handleSave = async () => {
    if (!meta.name.trim() || !meta.startDate) {
      toast({ variant: "destructive", title: "Nombre y fecha de inicio son obligatorios" });
      return;
    }
    setSaving(true);
    try {
      // 1. Save metadata
      await updateTrip.mutateAsync({
        tripId,
        data: {
          name: meta.name.trim(),
          status: meta.status,
          startDate: meta.startDate,
          endDate: meta.endDate || null,
          airline: meta.airline || null,
          flightNumber: meta.flightNumber || null,
          flightTime: meta.flightTime || null,
          reservationCode: meta.reservationCode || null,
          returnAirline: meta.returnAirline || null,
          returnFlightNumber: meta.returnFlightNumber || null,
          returnFlightTime: meta.returnFlightTime || null,
          returnReservationCode: meta.returnReservationCode || null,
        },
      });

      // 2. Delete removed days
      for (const d of days.filter(d => d.deleted && d.id !== null)) {
        await deleteDay.mutateAsync({ tripId, dayId: d.id! });
      }

      // 3. Create new days
      for (const d of days.filter(d => !d.deleted && d.id === null)) {
        await createDay.mutateAsync({
          tripId,
          data: {
            dayNumber: d.dayNumber,
            cityFrom: d.cityFrom || null,
            cityTo: d.cityTo || null,
            transport: d.transport || null,
            description: d.description || null,
            hotelId: d.hotelId ? parseInt(d.hotelId) : null,
          },
        });
      }

      // 4. Update modified existing days
      for (const d of days.filter(d => !d.deleted && d.id !== null)) {
        await updateDay.mutateAsync({
          tripId,
          dayId: d.id!,
          data: {
            dayNumber: d.dayNumber,
            cityFrom: d.cityFrom || null,
            cityTo: d.cityTo || null,
            transport: d.transport || null,
            description: d.description || null,
            hotelId: d.hotelId ? parseInt(d.hotelId) : null,
          },
        });
      }

      await qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}`] });
      await qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
      toast({ title: "Cambios guardados" });
      navigate(`/traveler/trips/${tripId}`);
    } catch {
      toast({ variant: "destructive", title: "Error al guardar los cambios" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return <p className="text-muted-foreground">Viaje no encontrado</p>;
  }

  const hotelList = (hotels ?? []) as Array<{ id: number; name: string; city: string }>;

  return (
    <div className="max-w-2xl space-y-5 pb-16">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate(`/traveler/trips/${tripId}`)}
          className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al viaje
        </button>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Editar viaje</h1>
          <Button
            onClick={handleSave}
            disabled={saving || !meta.name.trim() || !meta.startDate}
            className="gap-1.5"
            style={{ background: "#C4793A", color: "white" }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>

      {/* ── Información básica ──────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-[14px] p-5 space-y-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Información básica</p>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium block" style={{ color: "#2D1F0E" }}>Nombre del viaje *</label>
          <Input value={meta.name} onChange={e => setMt({ name: e.target.value })} placeholder="Japón otoño 2026" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium block" style={{ color: "#2D1F0E" }}>Estado</label>
          <Select value={meta.status} onValueChange={v => setMt({ status: v as TravelerTripDetailStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Próximamente</SelectItem>
              <SelectItem value="scheduled">Programado</SelectItem>
              <SelectItem value="active">En curso</SelectItem>
              <SelectItem value="finished">Finalizado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium block" style={{ color: "#2D1F0E" }}>Fecha de salida *</label>
            <Input type="date" value={meta.startDate} onChange={e => setMt({ startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium block" style={{ color: "#2D1F0E" }}>Fecha de regreso</label>
            <Input type="date" value={meta.endDate} onChange={e => setMt({ endDate: e.target.value })} />
          </div>
        </div>
      </section>

      {/* ── Vuelos ─────────────────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-[14px] p-5 space-y-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Plane className="w-3.5 h-3.5" /> Vuelos
        </p>

        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#C4793A" }}>Ida</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Aerolínea</label>
              <Input className="h-8 text-[13px]" placeholder="Iberia" value={meta.airline} onChange={e => setMt({ airline: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Número de vuelo</label>
              <Input className="h-8 text-[13px]" placeholder="IB1234" value={meta.flightNumber} onChange={e => setMt({ flightNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Hora de salida</label>
              <Input className="h-8 text-[13px]" type="time" value={meta.flightTime} onChange={e => setMt({ flightTime: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Código de reserva</label>
              <Input className="h-8 text-[13px]" placeholder="ABCDEF" value={meta.reservationCode} onChange={e => setMt({ reservationCode: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>Vuelta</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Aerolínea</label>
              <Input className="h-8 text-[13px]" placeholder="Iberia" value={meta.returnAirline} onChange={e => setMt({ returnAirline: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Número de vuelo</label>
              <Input className="h-8 text-[13px]" placeholder="IB5678" value={meta.returnFlightNumber} onChange={e => setMt({ returnFlightNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Hora de salida</label>
              <Input className="h-8 text-[13px]" type="time" value={meta.returnFlightTime} onChange={e => setMt({ returnFlightTime: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Código de reserva</label>
              <Input className="h-8 text-[13px]" placeholder="FEDCBA" value={meta.returnReservationCode} onChange={e => setMt({ returnReservationCode: e.target.value })} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Itinerario día a día ────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-[14px] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Itinerario día a día
          </p>
          <button
            onClick={addDay}
            className="flex items-center gap-1 text-[12px] font-medium px-3 py-1 rounded-full transition-colors"
            style={{ background: "#EAE6F5", color: "#3D2F6B" }}
          >
            <Plus className="w-3 h-3" /> Añadir día
          </button>
        </div>

        {activeDays.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Hotel className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">Sin días definidos. Pulsa "Añadir día" para empezar.</p>
          </div>
        )}

        <div className="space-y-2">
          {days.map((day, idx) => {
            if (day.deleted) return null;
            const dateStr = (() => {
              if (!meta.startDate) return null;
              const d = new Date(meta.startDate + "T00:00:00");
              d.setDate(d.getDate() + (day.dayNumber - 1));
              return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
            })();

            return (
              <div key={idx} className="border border-border rounded-[12px] overflow-hidden" style={{ background: "white" }}>
                {/* Day header */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                    style={{ background: "#FAEEE4", color: "#C4793A" }}
                  >
                    {day.dayNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                      {day.cityTo || day.cityFrom || `Día ${day.dayNumber}`}
                    </div>
                    {dateStr && <div className="text-[11px] capitalize" style={{ color: "#9C7A58" }}>{dateStr}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {day.hotelName && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#FAF2EB", color: "#8B4420" }}>
                        {day.hotelName}
                      </span>
                    )}
                    <button
                      onClick={() => toggleExpand(idx)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground"
                    >
                      {day.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removeDay(idx)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive"
                      title="Eliminar día"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded fields */}
                {day.expanded && (
                  <div className="border-t border-border px-3 pb-3 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Ciudad origen</label>
                        <Input
                          className="h-8 text-[13px]"
                          placeholder="Madrid"
                          value={day.cityFrom}
                          onChange={e => updateDayField(idx, { cityFrom: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Ciudad destino</label>
                        <Input
                          className="h-8 text-[13px]"
                          placeholder="Tokio"
                          value={day.cityTo}
                          onChange={e => updateDayField(idx, { cityTo: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Transporte</label>
                      <Input
                        className="h-8 text-[13px]"
                        placeholder="Vuelo, tren, coche…"
                        value={day.transport}
                        onChange={e => updateDayField(idx, { transport: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Descripción del día</label>
                      <Textarea
                        className="text-[13px] min-h-[60px] resize-none"
                        placeholder="Actividades, notas del día…"
                        value={day.description}
                        onChange={e => updateDayField(idx, { description: e.target.value })}
                      />
                    </div>

                    {/* Hotel */}
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Hotel</label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={day.hotelId || "none"}
                          onValueChange={v => {
                            if (v === "none") {
                              updateDayField(idx, { hotelId: "", hotelName: "" });
                            } else {
                              const h = hotelList.find(h => String(h.id) === v);
                              updateDayField(idx, { hotelId: v, hotelName: h?.name ?? "" });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-[13px] flex-1">
                            <SelectValue placeholder="Sin hotel asignado" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin hotel</SelectItem>
                            {hotelList.map(h => (
                              <SelectItem key={h.id} value={String(h.id)}>
                                {h.name} · {h.city}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          className="text-[11px] font-medium px-2 py-1 rounded-[6px] flex items-center gap-1 transition-colors shrink-0"
                          style={{
                            background: hotelPanelDay === day.dayNumber ? "#FAEEE4" : "#FAF2EB",
                            color: "#C4793A",
                          }}
                          onClick={() => setHotelPanelDay(hotelPanelDay === day.dayNumber ? null : day.dayNumber)}
                        >
                          <Plus className="w-3 h-3" />
                          {hotelPanelDay === day.dayNumber ? "Cerrar" : "Nuevo"}
                        </button>
                      </div>

                      {hotelPanelDay === day.dayNumber && (
                        <HotelPanel
                          dayNumber={day.dayNumber}
                          hotels={hotelList}
                          onAssign={(id, name) => updateDayField(idx, { hotelId: id, hotelName: name })}
                          onClose={() => setHotelPanelDay(null)}
                        />
                      )}
                    </div>

                    {/* Activities */}
                    {day.id !== null ? (
                      <DayActivitiesPanel entityType="trip" entityId={tripId} dayId={day.id} />
                    ) : (
                      <div className="pt-3 border-t border-border/60">
                        <p className="text-[11px] text-muted-foreground italic">
                          Guarda los cambios para gestionar actividades de este día.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {activeDays.length > 0 && (
          <button
            onClick={addDay}
            className="w-full py-2 rounded-[10px] border-2 border-dashed text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors hover:border-[#C4793A] hover:text-[#C4793A]"
            style={{ borderColor: "#E5D4BF", color: "#9C7A58" }}
          >
            <Plus className="w-3.5 h-3.5" /> Añadir otro día
          </button>
        )}
      </section>

      {/* Bottom save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || !meta.name.trim() || !meta.startDate}
          className="gap-1.5"
          style={{ background: "#C4793A", color: "white" }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
