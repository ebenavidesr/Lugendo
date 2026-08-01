import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateActivity, useCreateHotel } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { HotelSuggestion, ActivitySuggestion } from "./types";

// Shared between trip-wizard.tsx and traveler-trip-wizard.tsx — see task #142.
// Draft-mode hotel/activity assignment: creates real catalog hotels/activities immediately
// (same as before unification), but only records `dayNumber -> id` in the caller's own
// in-memory wizard state — the actual day-assignment rows don't exist until the trip/itinerary
// is created (see each wizard's handleCreate).

const emptyHotelForm = { name: "", city: "", country: "", address: "", phone: "", website: "" };

export function useHotelAssignment(onAssign: (dayNum: number, hotelId: string) => void) {
  const [inlineDay, setInlineDay] = useState<number | null>(null);
  const [catalogSearchQ, setCatalogSearchQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupResults, setLookupResults] = useState<HotelSuggestion[]>([]);
  const [form, setForm] = useState(emptyHotelForm);
  const [creating, setCreating] = useState(false);

  const createHotel = useCreateHotel();
  const qc = useQueryClient();
  const { toast } = useToast();

  const open = (dayNum: number, defaults?: Partial<typeof emptyHotelForm>) => {
    setInlineDay(dayNum);
    setCatalogSearchQ("");
    setSearchQ("");
    setLookupResults([]);
    setLookupDone(false);
    setForm({ ...emptyHotelForm, ...defaults });
  };

  const close = () => setInlineDay(null);

  const lookup = async () => {
    if (!searchQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(searchQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar hoteles" });
    } catch {
      toast({ variant: "destructive", title: "Error de conexión al buscar hoteles" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyResult = (r: HotelSuggestion) => {
    setForm({ name: r.name, city: r.city, country: r.country, address: r.address, phone: r.phone, website: r.website });
    setLookupResults([]);
  };

  const create = async (dayNum: number) => {
    if (!form.name || !form.city || !form.country) return;
    setCreating(true);
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
      onAssign(dayNum, String(hotel.id));
      close();
      toast({ title: `Hotel "${hotel.name}" creado y asignado` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear el hotel" });
    } finally {
      setCreating(false);
    }
  };

  return {
    inlineDay, catalogSearchQ, setCatalogSearchQ, searchQ, setSearchQ,
    lookupLoading, lookupDone, lookupResults, form, setForm, creating,
    open, close, lookup, applyResult, create,
  };
}

const emptyActivityForm = { name: "", category: "", city: "", country: "" };

export function useActivityAssignment(onAssign: (dayNum: number, activityId: number) => void) {
  const [inlineDay, setInlineDay] = useState<number | null>(null);
  const [catalogSearchQ, setCatalogSearchQ] = useState("");
  const [creatingMode, setCreatingMode] = useState(false);
  const [form, setForm] = useState(emptyActivityForm);
  const [creating, setCreating] = useState(false);
  const [lookupQ, setLookupQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupResults, setLookupResults] = useState<ActivitySuggestion[]>([]);

  const createActivity = useCreateActivity();
  const qc = useQueryClient();
  const { toast } = useToast();

  const open = (dayNum: number) => {
    setInlineDay(dayNum);
    setCatalogSearchQ("");
    resetCreateForm();
  };

  const close = () => setInlineDay(null);

  const resetCreateForm = () => {
    setCreatingMode(false);
    setForm(emptyActivityForm);
    setLookupQ("");
    setLookupResults([]);
    setLookupDone(false);
  };

  const lookup = async () => {
    if (!lookupQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    try {
      const res = await fetch(`/api/activities/lookup?q=${encodeURIComponent(lookupQ)}`, { credentials: "include" });
      if (res.ok) setLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar actividades" });
    } catch {
      toast({ variant: "destructive", title: "Error de conexión al buscar actividades" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyResult = (r: ActivitySuggestion) => {
    setForm(f => ({ ...f, name: r.name, city: r.city, country: r.country }));
    setLookupQ("");
    setLookupResults([]);
    setLookupDone(false);
  };

  const create = async (dayNum: number) => {
    if (!form.name) return;
    setCreating(true);
    try {
      const act = await createActivity.mutateAsync({
        data: {
          name: form.name,
          ...(form.city ? { city: form.city } : {}),
          ...(form.country ? { country: form.country } : {}),
          ...(form.category && form.category !== "none"
            ? { category: form.category as "cultural" | "gastronomic" | "adventure" | "nature" | "beach" | "city" | "excursion" | "other" }
            : {}),
        },
      });
      qc.setQueryData(["/api/activities"], (old: typeof act[] | undefined) => (old ? [...old, act] : [act]));
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      onAssign(dayNum, act.id);
      resetCreateForm();
      toast({ title: `Actividad "${act.name}" creada` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear la actividad" });
    } finally {
      setCreating(false);
    }
  };

  return {
    inlineDay, catalogSearchQ, setCatalogSearchQ, creatingMode, setCreatingMode,
    form, setForm, creating, lookupQ, setLookupQ, lookupLoading, lookupDone, lookupResults,
    open, close, resetCreateForm, lookup, applyResult, create,
  };
}
