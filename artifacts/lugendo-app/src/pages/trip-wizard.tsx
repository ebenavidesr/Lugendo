import { useState, useRef, Fragment, useEffect } from "react";
import { useLocation } from "wouter";
import { Check, Upload, FileText, X, MapPin, Plane, Calendar, Settings, Hotel, Mail, ChevronRight, Zap, Search, Plus, Loader2 } from "lucide-react";
import {
  useListItineraries,
  useListItineraryDays,
  useCreateItinerary,
  useCreateItineraryDay,
  useUpdateItineraryDay,
  useCreateTrip,
  useSendInvitations,
  useListHotels,
  useParseItineraryPdf,
  useListActivities,
  useCreateActivity,
  useCreateHotel,
  useAddDayActivity,
  useAddItineraryDayHotel,
  useRemoveItineraryDayHotel,
} from "@workspace/api-client-react";
import type { ParsedItinerary, ParsedDay } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TransportSelect } from "@/components/transport-select";
import { useAutoDescription } from "@/hooks/use-auto-description";
import { CountrySelectSmall } from "@/components/country-select";
import { getApiErrorMessage } from "@/lib/utils";
import { matchOrCreateActivityIds, matchOrCreateHotelId } from "@/lib/pdf-day-autofill";

// ── Types ────────────────────────────────────────────────────────────────────

type Origin = "existing" | "new";
type NewMode = "scratch" | "pdf";
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface WizardData {
  origin: Origin | null;
  selectedItineraryId: number | null;
  newMode: NewMode | null;
  scratchName: string;
  scratchNumDays: string;
  scratchCountries: string;
  scratchDifficulty: string;
  scratchDescription: string;
  parsedItinerary: ParsedItinerary | null;
  dayHotels: Record<number, string>;
  dayTransitNights: Record<number, boolean>;
  dayActivities: Record<number, number[]>;
  startDate: string;
  endDate: string;
  maxCapacity: string;
  outboundLegs: FlightLeg[];
  returnLegs: FlightLeg[];
  tripName: string;
  tripDescription: string;
  emails: string;
}

interface FlightLeg {
  airline: string;
  flightNumber: string;
  cityFrom: string;
  cityTo: string;
  departureTime: string;
  arrivalTime: string;
  reservationCode: string;
}

const emptyLeg = (): FlightLeg => ({
  airline: "", flightNumber: "", cityFrom: "", cityTo: "",
  departureTime: "", arrivalTime: "", reservationCode: "",
});

const STEP_LABELS = ["Origen", "Programa", "Fechas", "Vuelos", "Nombre", "Itinerario", "Invitaciones"];
const STEP_ICONS = [MapPin, FileText, Calendar, Plane, Settings, Hotel, Mail];

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-start gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const num = (i + 1) as Step;
        const done = num < step;
        const active = num === step;
        return (
          <div key={label} className="flex items-start flex-1">
            <div className="flex flex-col items-center min-w-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0"
                style={{
                  background: done ? "#C4793A" : active ? "#3D2F6B" : "#ECD5B8",
                  color: done || active ? "white" : "#9C7A58",
                }}>
                {done ? <Check className="w-3.5 h-3.5" /> : num}
              </div>
              <div className="text-[10px] mt-1 text-center whitespace-nowrap"
                style={{ color: active ? "#2D1F0E" : "#9C7A58", fontWeight: active ? 500 : 400 }}>
                {label}
              </div>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className="flex-1 h-[2px] mt-3.5 mx-1"
                style={{ background: done ? "#C4793A" : "#ECD5B8" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TripWizard() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>({
    origin: null, selectedItineraryId: null,
    newMode: null,
    scratchName: "", scratchNumDays: "", scratchCountries: "", scratchDifficulty: "", scratchDescription: "",
    parsedItinerary: null, dayHotels: {}, dayTransitNights: {}, dayActivities: {},
    startDate: "", endDate: "", maxCapacity: "",
    outboundLegs: [emptyLeg()],
    returnLegs: [emptyLeg()],
    tripName: "", tripDescription: "", emails: "",
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // ── Inline hotel form state ───────────────────────────────────────────────
  const [inlineHotelDay, setInlineHotelDay] = useState<number | null>(null);
  const [hotelSearchQ, setHotelSearchQ] = useState("");
  const [hotelLookupLoading, setHotelLookupLoading] = useState(false);
  const [hotelSearchDone, setHotelSearchDone] = useState(false);
  type HotelSuggestion = { name: string; city: string; country: string; address: string; phone: string; website: string };
  const [hotelLookupResults, setHotelLookupResults] = useState<HotelSuggestion[]>([]);
  const [newHotelForm, setNewHotelForm] = useState({ name: "", city: "", country: "", address: "", phone: "", website: "" });
  const [creatingHotel, setCreatingHotel] = useState(false);

  // ── Inline activity form state ────────────────────────────────────────────
  const [inlineActivityDay, setInlineActivityDay] = useState<number | null>(null);
  const [activitySearchQ, setActivitySearchQ] = useState("");
  const [newActivityMode, setNewActivityMode] = useState(false);
  const [newActivityForm, setNewActivityForm] = useState({ name: "", category: "", city: "", country: "" });
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [activityLookupQ, setActivityLookupQ] = useState("");
  const [activityLookupLoading, setActivityLookupLoading] = useState(false);
  const [activityLookupDone, setActivityLookupDone] = useState(false);
  type ActivitySuggestion = { name: string; city: string; country: string; address: string; description: string };
  const [activityLookupResults, setActivityLookupResults] = useState<ActivitySuggestion[]>([]);
  const [dayTransports, setDayTransports] = useState<Record<number, string>>({});

  const { data: itineraries } = useListItineraries();
  const { data: hotels } = useListHotels();
  const { data: activities } = useListActivities();
  const { data: existingDays } = useListItineraryDays(
    data.selectedItineraryId ?? 0
  );
  const parsePdf = useParseItineraryPdf();
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();
  const updateDay = useUpdateItineraryDay();
  const createTrip = useCreateTrip();
  const sendInvitations = useSendInvitations();
  const createHotel = useCreateHotel();
  const createActivity = useCreateActivity();
  const addDayActivity = useAddDayActivity();
  const addDayHotel = useAddItineraryDayHotel();
  const removeDayHotel = useRemoveItineraryDayHotel();

  const set = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  const selectedItinerary = itineraries?.find(i => i.id === data.selectedItineraryId);
  const { isLoading: tripDescLoading, trigger: triggerTripDesc } = useAutoDescription("destination");

  useEffect(() => {
    if (data.origin === "existing" && selectedItinerary) {
      const query = [selectedItinerary.name, ...(selectedItinerary.countries ?? [])].join(" ");
      triggerTripDesc(query, data.tripDescription, desc => set({ tripDescription: desc }));
    } else if (data.origin === "new" && data.scratchName && data.scratchCountries) {
      triggerTripDesc(`${data.scratchName} ${data.scratchCountries}`, data.tripDescription, desc => set({ tripDescription: desc }));
    }
  }, [data.selectedItineraryId, data.scratchName, data.scratchCountries]);

  const getDays = (): ParsedDay[] => {
    if (data.origin === "existing" && existingDays) {
      return existingDays.map(d => ({
        dayNumber: d.dayNumber,
        cityFrom: d.cityFrom ?? null,
        cityTo: d.cityTo ?? null,
        transport: d.transport ?? null,
        description: d.description ?? null,
        activities: [],
      }));
    }
    if (data.origin === "new" && data.parsedItinerary) {
      return data.parsedItinerary.days;
    }
    return [];
  };

  const days = getDays();
  const hasDays = days.length > 0;

  const nextStep = () => setStep(s => Math.min(s + 1, 7) as Step);
  const prevStep = () => setStep(s => Math.max(s - 1, 1) as Step);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    set({ parsedItinerary: null });
  };

  const handleParsePdf = async () => {
    if (!pdfFile) return;
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const result = await parsePdf.mutateAsync({ data: { fileBase64: base64, fileName: pdfFile.name } });

        // Extract transports from parsed days
        const transMap: Record<number, string> = {};
        for (const d of result.days) {
          if (d.transport) transMap[d.dayNumber] = d.transport;
        }
        setDayTransports(transMap);

        // Auto-match or create activities and hotels from parsed names
        const currentActivities = activities ?? [];
        const currentHotels = hotels ?? [];
        const singleCountry = result.countries?.length === 1 ? result.countries[0] : undefined;
        const newDayActivities: Record<number, number[]> = {};
        const newDayHotels: Record<number, string> = {};
        for (const day of result.days) {
          const actIds = await matchOrCreateActivityIds(day, currentActivities, args => createActivity.mutateAsync(args));
          if (actIds.length) newDayActivities[day.dayNumber] = actIds;

          const hotelId = await matchOrCreateHotelId(day, currentHotels, args => createHotel.mutateAsync(args), singleCountry);
          if (hotelId) newDayHotels[day.dayNumber] = hotelId;
        }
        if (Object.keys(newDayActivities).length || Object.keys(newDayHotels).length) {
          qc.invalidateQueries({ queryKey: ["/api/activities"] });
          qc.invalidateQueries({ queryKey: ["/api/hotels"] });
        }

        const actCount = Object.values(newDayActivities).reduce((s, ids) => s + ids.length, 0);
        const hotelCount = Object.keys(newDayHotels).length;
        const extras: string[] = [];
        if (actCount) extras.push(`${actCount} actividad${actCount !== 1 ? "es" : ""}`);
        if (hotelCount) extras.push(`${hotelCount} hotel${hotelCount !== 1 ? "es" : ""}`);

        set({
          parsedItinerary: result,
          scratchName: result.name,
          scratchNumDays: String(result.numDays),
          scratchCountries: result.countries?.join(", ") ?? "",
          scratchDescription: result.description ?? "",
          tripName: result.name,
          ...(result.startDate ? { startDate: result.startDate } : {}),
          ...(result.endDate ? { endDate: result.endDate } : {}),
          ...(Object.keys(newDayActivities).length ? { dayActivities: newDayActivities } : {}),
          ...(Object.keys(newDayHotels).length ? { dayHotels: newDayHotels } : {}),
        });
        toast({ title: `Itinerario extraído: ${result.numDays} días${extras.length ? ` · ${extras.join(" · ")}` : ""}` });
      } catch (err) {
        toast({ variant: "destructive", title: getApiErrorMessage(err, "No se pudo analizar el archivo. Intenta con un .txt o PDF de texto.") });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(pdfFile);
  };

  // ── Activity lookup ───────────────────────────────────────────────────────
  const handleActivityLookup = async () => {
    if (!activityLookupQ.trim()) return;
    setActivityLookupLoading(true);
    setActivityLookupDone(false);
    try {
      const res = await fetch(`/api/activities/lookup?q=${encodeURIComponent(activityLookupQ)}`, { credentials: "include" });
      if (res.ok) {
        setActivityLookupResults(await res.json());
      } else {
        toast({ variant: "destructive", title: "Error al buscar actividades" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error de conexión al buscar actividades" });
    } finally {
      setActivityLookupLoading(false);
      setActivityLookupDone(true);
    }
  };

  // ── Hotel lookup (Google Places or DB fallback) ───────────────────────────
  const handleHotelLookup = async () => {
    if (!hotelSearchQ.trim()) return;
    setHotelLookupLoading(true);
    setHotelSearchDone(false);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(hotelSearchQ)}`, { credentials: "include" });
      if (res.ok) {
        setHotelLookupResults(await res.json());
      } else {
        toast({ variant: "destructive", title: "Error al buscar hoteles" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error de conexión al buscar hoteles" });
    } finally {
      setHotelLookupLoading(false);
      setHotelSearchDone(true);
    }
  };

  const handleCreateHotel = async (dayNum: number) => {
    if (!newHotelForm.name || !newHotelForm.city || !newHotelForm.country) return;
    setCreatingHotel(true);
    try {
      const hotel = await createHotel.mutateAsync({ data: {
        name: newHotelForm.name, city: newHotelForm.city, country: newHotelForm.country,
        ...(newHotelForm.address ? { address: newHotelForm.address } : {}),
        ...(newHotelForm.phone ? { phone: newHotelForm.phone } : {}),
        ...(newHotelForm.website ? { website: newHotelForm.website } : {}),
      }});
      qc.invalidateQueries({ queryKey: ["/api/hotels"] });
      set({ dayHotels: { ...data.dayHotels, [dayNum]: String(hotel.id) } });
      setInlineHotelDay(null);
      setHotelLookupResults([]);
      toast({ title: `Hotel "${hotel.name}" creado y asignado` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear el hotel" });
    } finally {
      setCreatingHotel(false);
    }
  };

  const handleCreateActivity = async (dayNum: number) => {
    if (!newActivityForm.name) return;
    setCreatingActivity(true);
    try {
      const act = await createActivity.mutateAsync({ data: {
        name: newActivityForm.name,
        ...(newActivityForm.city ? { city: newActivityForm.city } : {}),
        ...(newActivityForm.country ? { country: newActivityForm.country } : {}),
        ...(newActivityForm.category && newActivityForm.category !== "none" ? { category: newActivityForm.category as "cultural" | "gastronomic" | "adventure" | "nature" | "beach" | "city" | "excursion" | "other" } : {}),
      }});
      qc.setQueryData(["/api/activities"], (old: typeof act[] | undefined) =>
        old ? [...old, act] : [act]
      );
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      set({ dayActivities: { ...data.dayActivities, [dayNum]: [...(data.dayActivities[dayNum] ?? []), act.id] } });
      setNewActivityMode(false);
      setNewActivityForm({ name: "", category: "", city: "", country: "" });
      setActivityLookupQ(""); setActivityLookupResults([]); setActivityLookupDone(false);
      toast({ title: `Actividad "${act.name}" creada` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear la actividad" });
    } finally {
      setCreatingActivity(false);
    }
  };

  const handleCreate = async () => {
    if (!data.tripName || !data.startDate) {
      toast({ variant: "destructive", title: "Nombre y fecha de inicio son obligatorios" });
      return;
    }
    setIsCreating(true);
    try {
      let itineraryId: number | null = data.selectedItineraryId;

      if (data.origin === "new") {
        const itinName = data.scratchName || data.parsedItinerary?.name || data.tripName;
        const numDays = parseInt(data.scratchNumDays) || data.parsedItinerary?.numDays || 1;
        const countries = data.scratchCountries ? data.scratchCountries.split(",").map(c => c.trim()).filter(Boolean) : (data.parsedItinerary?.countries ?? []);

        const newItin = await createItinerary.mutateAsync({
          data: {
            name: itinName,
            numDays,
            countries,
            ...(data.scratchDifficulty && data.scratchDifficulty !== "none" ? { difficulty: data.scratchDifficulty as "easy" | "moderate" | "demanding" } : {}),
            ...(data.scratchDescription ? { description: data.scratchDescription } : {}),
            ...(data.parsedItinerary?.description ? { description: data.parsedItinerary.description } : {}),
            ...(data.parsedItinerary?.tripNotes?.length ? { tripNotes: data.parsedItinerary.tripNotes } : {}),
            ...(data.parsedItinerary?.recommendations?.length ? { recommendations: data.parsedItinerary.recommendations } : {}),
            ...(data.parsedItinerary?.checklist?.length ? { checklist: data.parsedItinerary.checklist } : {}),
          },
        });
        itineraryId = newItin.id;

        if (data.parsedItinerary?.days.length) {
          const createdDayMap: Record<number, number> = {};
          for (const day of data.parsedItinerary.days) {
            const isTransit = !!data.dayTransitNights[day.dayNumber];
            const hotelId = !isTransit && data.dayHotels[day.dayNumber] ? parseInt(data.dayHotels[day.dayNumber]) : undefined;
            const created = await createDay.mutateAsync({
              itineraryId: newItin.id,
              data: {
                dayNumber: day.dayNumber,
                ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
                ...(day.cityTo ? { cityTo: day.cityTo } : {}),
                ...(dayTransports[day.dayNumber] ? { transport: dayTransports[day.dayNumber] as import("@workspace/api-client-react").TransportMode } : day.transport ? { transport: day.transport } : {}),
                ...(day.description ? { description: day.description } : {}),
                ...(day.meals ? { meals: day.meals } : {}),
                ...(isTransit ? { isTransitNight: true } : {}),
              },
            });
            createdDayMap[day.dayNumber] = created.id;

            if (hotelId) {
              const ph = day.hotel;
              await addDayHotel.mutateAsync({
                itineraryId: newItin.id,
                dayId: created.id,
                data: {
                  hotelId,
                  ...(ph?.guaranteed !== undefined && ph?.guaranteed !== null ? { guaranteed: ph.guaranteed } : {}),
                  ...(ph?.alternatives?.length ? { alternatives: ph.alternatives } : {}),
                  ...(ph?.reviewManually ? { reviewManually: ph.reviewManually } : {}),
                },
              });
            }
          }
          for (const [dayNumStr, actIds] of Object.entries(data.dayActivities)) {
            const dayNum = parseInt(dayNumStr);
            const dayId = createdDayMap[dayNum];
            if (!dayId || !actIds.length) continue;
            for (let i = 0; i < actIds.length; i++) {
              await addDayActivity.mutateAsync({ itineraryId: newItin.id, dayId, data: { activityId: actIds[i] } });
            }
          }
        }
      } else if (data.origin === "existing" && hasDays) {
        if (itineraryId) {
          for (const [dayNumStr, actIds] of Object.entries(data.dayActivities)) {
            const dayNum = parseInt(dayNumStr);
            const existingDay = existingDays?.find(d => d.dayNumber === dayNum);
            if (!existingDay || !actIds.length) continue;
            for (let i = 0; i < actIds.length; i++) {
              await addDayActivity.mutateAsync({ itineraryId, dayId: existingDay.id, data: { activityId: actIds[i] } });
            }
          }
          for (const [dayNumStr, transit] of Object.entries(data.dayTransitNights)) {
            const dayNum = parseInt(dayNumStr);
            const existingDay = existingDays?.find(d => d.dayNumber === dayNum);
            if (!existingDay || !!existingDay.isTransitNight === transit) continue;
            if (transit && existingDay.hotels?.length) {
              for (const h of existingDay.hotels) {
                await removeDayHotel.mutateAsync({ itineraryId, dayId: existingDay.id, assignmentId: h.id });
              }
            }
            await updateDay.mutateAsync({ itineraryId, dayId: existingDay.id, data: { isTransitNight: transit } });
          }
        }
      }

      const trip = await createTrip.mutateAsync({
        data: {
          name: data.tripName,
          startDate: data.startDate,
          ...(data.endDate ? { endDate: data.endDate } : {}),
          ...(itineraryId ? { itineraryId } : {}),
          ...(data.maxCapacity ? { maxCapacity: parseInt(data.maxCapacity) } : {}),
          ...(data.tripDescription ? { description: data.tripDescription } : {}),
          ...(data.outboundLegs.some(l => l.airline || l.flightNumber) ? { outboundFlights: data.outboundLegs.filter(l => l.airline || l.flightNumber) } : {}),
          ...(data.returnLegs.some(l => l.airline || l.flightNumber) ? { returnFlights: data.returnLegs.filter(l => l.airline || l.flightNumber) } : {}),
        },
      });

      if (data.emails.trim()) {
        const emails = data.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
        if (emails.length > 0) {
          await sendInvitations.mutateAsync({ tripId: trip.id, data: { invitees: emails.map(email => ({ email })) } });
        }
      }

      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Viaje creado correctamente" });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Error al crear el viaje" });
    } finally {
      setIsCreating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      // ── STEP 1: Origen ──────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>¿Cómo quieres crear el viaje?</h2>
              <p className="text-[13px] text-muted-foreground">Parte de un itinerario ya creado o crea uno nuevo ahora.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => { set({ origin: "existing" }); nextStep(); }}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{ borderColor: data.origin === "existing" ? "#3D2F6B" : "#E5D4BF", background: data.origin === "existing" ? "#EAE6F5" : "white" }}>
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#EAE6F5" }}>
                  <FileText className="w-5 h-5" style={{ color: "#3D2F6B" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Partir de un itinerario</div>
                <div className="text-[12px] text-muted-foreground">Selecciona un itinerario existente de tu catálogo y crea el viaje sobre él.</div>
              </button>
              <button
                onClick={() => { set({ origin: "new" }); nextStep(); }}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{ borderColor: data.origin === "new" ? "#C4793A" : "#E5D4BF", background: data.origin === "new" ? "#FAEEE4" : "white" }}>
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#FAEEE4" }}>
                  <Upload className="w-5 h-5" style={{ color: "#C4793A" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Crear itinerario nuevo</div>
                <div className="text-[12px] text-muted-foreground">Crea el itinerario desde cero o extráelo automáticamente de un PDF o archivo.</div>
              </button>
            </div>
          </div>
        );

      // ── STEP 2: Itinerario ──────────────────────────────────────────────────
      case 2:
        if (data.origin === "existing") {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Selecciona un itinerario</h2>
                <p className="text-[13px] text-muted-foreground">Elige el itinerario base para este viaje.</p>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {itineraries?.map(it => (
                  <button key={it.id}
                    onClick={() => set({
                      selectedItineraryId: it.id,
                      tripName: data.tripName || it.name,
                      ...(data.selectedItineraryId !== it.id
                        ? { dayTransitNights: {}, dayHotels: {}, dayActivities: {} }
                        : {}),
                    })}
                    className="w-full p-4 rounded-[12px] border-2 text-left transition-all"
                    style={{
                      borderColor: data.selectedItineraryId === it.id ? "#C4793A" : "#E5D4BF",
                      background: data.selectedItineraryId === it.id ? "#FAEEE4" : "white",
                    }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>{it.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {it.numDays} días {it.countries?.length ? `· ${it.countries.join(", ")}` : ""}
                        </div>
                      </div>
                      {data.selectedItineraryId === it.id && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#C4793A" }}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {!itineraries?.length && (
                  <div className="p-6 text-center text-[13px] text-muted-foreground">
                    No hay itinerarios. <button onClick={() => { set({ origin: "new" }); }} className="font-medium" style={{ color: "#C4793A" }}>Crea uno nuevo</button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Crear itinerario</h2>
              <p className="text-[13px] text-muted-foreground">¿Cómo quieres definir el itinerario?</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {(["scratch", "pdf"] as NewMode[]).map(mode => (
                <button key={mode}
                  onClick={() => set({ newMode: mode })}
                  className="p-4 rounded-[12px] border-2 text-left transition-all"
                  style={{ borderColor: data.newMode === mode ? "#C4793A" : "#E5D4BF", background: data.newMode === mode ? "#FAEEE4" : "white" }}>
                  <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>
                    {mode === "scratch" ? "Desde cero" : "Subir archivo"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {mode === "scratch" ? "Rellena los campos manualmente" : "PDF, Word o texto — la IA extrae la estructura"}
                  </div>
                </button>
              ))}
            </div>

            {data.newMode === "scratch" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Nombre del itinerario *</label>
                    <Input placeholder="Marruecos Imperial" value={data.scratchName} onChange={e => set({ scratchName: e.target.value, tripName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Número de días *</label>
                    <Input type="number" placeholder="8" value={data.scratchNumDays} onChange={e => set({ scratchNumDays: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Países</label>
                    <Input placeholder="Marruecos, España" value={data.scratchCountries} onChange={e => set({ scratchCountries: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Dificultad</label>
                    <Select value={data.scratchDifficulty} onValueChange={v => set({ scratchDifficulty: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin definir</SelectItem>
                        <SelectItem value="easy">Fácil</SelectItem>
                        <SelectItem value="moderate">Moderado</SelectItem>
                        <SelectItem value="demanding">Exigente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Descripción</label>
                  <Textarea placeholder="Descripción del itinerario…" rows={2} value={data.scratchDescription} onChange={e => set({ scratchDescription: e.target.value })} />
                </div>
              </div>
            )}

            {data.newMode === "pdf" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx,.md" className="hidden" onChange={handleFileChange} />
                {!pdfFile ? (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full p-8 rounded-[12px] border-2 border-dashed text-center transition-all hover:bg-[#FAF2EB]"
                    style={{ borderColor: "#E5D4BF" }}>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>Haz clic para subir un archivo</div>
                    <div className="text-[11px] text-muted-foreground">PDF, TXT, DOC — máx. 10 MB</div>
                  </button>
                ) : (
                  <div className="p-4 rounded-[12px] border border-border flex items-center gap-3" style={{ background: "#FAF2EB" }}>
                    <div className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: "#FDECEA" }}>
                      <FileText className="w-4 h-4" style={{ color: "#C0392B" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>{pdfFile.name}</div>
                      <div className="text-[11px] text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <button onClick={() => { setPdfFile(null); set({ parsedItinerary: null }); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                )}

                {pdfFile && !data.parsedItinerary && (
                  <button onClick={handleParsePdf} disabled={isParsing}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-medium transition-colors"
                    style={{ background: "#C4793A", color: "#FAF2EB", opacity: isParsing ? 0.7 : 1 }}>
                    {isParsing ? "Analizando con IA…" : "Analizar con IA"}
                  </button>
                )}

                {data.parsedItinerary && (
                  <div className="p-4 rounded-[12px] border border-border" style={{ background: "#E4F3EC" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-4 h-4" style={{ color: "#2E7D5A" }} />
                      <span className="text-[13px] font-medium" style={{ color: "#2E7D5A" }}>Estructura extraída</span>
                    </div>
                    <div className="text-[12px]" style={{ color: "#2D1F0E" }}>
                      <strong>{data.parsedItinerary.name}</strong> · {data.parsedItinerary.numDays} días
                      {data.parsedItinerary.countries?.length ? ` · ${data.parsedItinerary.countries.join(", ")}` : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {data.parsedItinerary.days.length} días procesados
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      // ── STEP 3: Fechas ──────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Fechas del viaje</h2>
              <p className="text-[13px] text-muted-foreground">Define cuándo sale y vuelve el grupo.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Fecha de salida *</label>
                <Input type="date" value={data.startDate} onChange={e => set({ startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Fecha de regreso</label>
                <Input type="date" value={data.endDate} onChange={e => set({ endDate: e.target.value })} min={data.startDate} />
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Capacidad máxima</label>
                <Input type="number" placeholder="20 viajeros" value={data.maxCapacity} onChange={e => set({ maxCapacity: e.target.value })} />
                <p className="text-[11px] mt-1 text-muted-foreground">El semáforo de ocupación se calcula sobre este valor.</p>
              </div>
            </div>
          </div>
        );

      // ── STEP 4: Vuelos ──────────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Información de vuelos</h2>
              <p className="text-[13px] text-muted-foreground">Añade varios tramos si hay escalas. Todos los campos son opcionales.</p>
            </div>

            {/* Vuelo de ida */}
            <div className="p-4 rounded-[12px] border border-border space-y-4" style={{ background: "white" }}>
              <div className="text-[12px] font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#C4793A" }}>
                <Plane className="w-3.5 h-3.5" /> Vuelo de ida
              </div>
              {data.outboundLegs.map((leg, idx) => (
                <div key={idx}>
                  {idx > 0 && (
                    <div className="flex items-center gap-2 pb-2 pt-3 border-t border-border">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tramo {idx + 1}</span>
                      <button
                        onClick={() => set({ outboundLegs: data.outboundLegs.filter((_, i) => i !== idx) })}
                        className="ml-auto text-[11px] text-destructive hover:underline"
                      >Eliminar tramo</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Aerolínea</label>
                      <Input placeholder="Iberia" value={leg.airline} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, airline: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Número de vuelo</label>
                      <Input placeholder="IB1234" value={leg.flightNumber} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, flightNumber: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Ciudad origen</label>
                      <Input placeholder="Madrid" value={leg.cityFrom} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, cityFrom: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Ciudad destino</label>
                      <Input placeholder="Edimburgo" value={leg.cityTo} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, cityTo: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Hora de salida</label>
                      <Input type="time" value={leg.departureTime} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, departureTime: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Hora de llegada</label>
                      <Input type="time" value={leg.arrivalTime} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, arrivalTime: e.target.value } : l) })} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Código de reserva</label>
                      <Input placeholder="ABCDEF" value={leg.reservationCode} onChange={e => set({ outboundLegs: data.outboundLegs.map((l, i) => i === idx ? { ...l, reservationCode: e.target.value } : l) })} />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => set({ outboundLegs: [...data.outboundLegs, emptyLeg()] })}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                style={{ background: "#FAEEE4", color: "#C4793A" }}
              >
                <Plus className="w-3 h-3" /> Añadir tramo
              </button>
            </div>

            {/* Vuelo de vuelta */}
            <div className="p-4 rounded-[12px] border border-border space-y-4" style={{ background: "white" }}>
              <div className="text-[12px] font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#3D2F6B" }}>
                <Plane className="w-3.5 h-3.5 rotate-180" /> Vuelo de vuelta
              </div>
              {data.returnLegs.map((leg, idx) => (
                <div key={idx}>
                  {idx > 0 && (
                    <div className="flex items-center gap-2 pb-2 pt-3 border-t border-border">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tramo {idx + 1}</span>
                      <button
                        onClick={() => set({ returnLegs: data.returnLegs.filter((_, i) => i !== idx) })}
                        className="ml-auto text-[11px] text-destructive hover:underline"
                      >Eliminar tramo</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Aerolínea</label>
                      <Input placeholder="Iberia" value={leg.airline} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, airline: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Número de vuelo</label>
                      <Input placeholder="IB5678" value={leg.flightNumber} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, flightNumber: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Ciudad origen</label>
                      <Input placeholder="Edimburgo" value={leg.cityFrom} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, cityFrom: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Ciudad destino</label>
                      <Input placeholder="Madrid" value={leg.cityTo} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, cityTo: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Hora de salida</label>
                      <Input type="time" value={leg.departureTime} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, departureTime: e.target.value } : l) })} />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Hora de llegada</label>
                      <Input type="time" value={leg.arrivalTime} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, arrivalTime: e.target.value } : l) })} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Código de reserva</label>
                      <Input placeholder="FEDCBA" value={leg.reservationCode} onChange={e => set({ returnLegs: data.returnLegs.map((l, i) => i === idx ? { ...l, reservationCode: e.target.value } : l) })} />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => set({ returnLegs: [...data.returnLegs, emptyLeg()] })}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors"
                style={{ background: "#EAE6F5", color: "#3D2F6B" }}
              >
                <Plus className="w-3 h-3" /> Añadir tramo
              </button>
            </div>
          </div>
        );

      // ── STEP 5: Nombre ──────────────────────────────────────────────────────
      case 5:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Nombre del viaje</h2>
              <p className="text-[13px] text-muted-foreground">Se sugiere desde el itinerario, puedes editarlo libremente.</p>
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre del viaje *</label>
              <Input placeholder="Marruecos Imperial Junio 2026" value={data.tripName} onChange={e => set({ tripName: e.target.value })} className="text-[15px]" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>Descripción (opcional)</label>
                {tripDescLoading && (
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "#3D2F6B" }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> Generando…
                  </span>
                )}
              </div>
              <Textarea
                placeholder="Descripción del viaje para los viajeros…"
                rows={3}
                value={data.tripDescription}
                onChange={e => set({ tripDescription: e.target.value })}
              />
            </div>
            <div className="p-4 rounded-[12px] border border-border space-y-1.5" style={{ background: "#FAF2EB" }}>
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>Resumen</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                <span className="text-muted-foreground">Itinerario</span>
                <span style={{ color: "#2D1F0E" }}>
                  {data.origin === "existing" ? (selectedItinerary?.name ?? "—") : (data.scratchName || data.parsedItinerary?.name || "Nuevo")}
                </span>
                <span className="text-muted-foreground">Salida</span>
                <span style={{ color: "#2D1F0E" }}>{data.startDate || "—"}</span>
                <span className="text-muted-foreground">Regreso</span>
                <span style={{ color: "#2D1F0E" }}>{data.endDate || "—"}</span>
                <span className="text-muted-foreground">Capacidad</span>
                <span style={{ color: "#2D1F0E" }}>{data.maxCapacity ? `${data.maxCapacity} viajeros` : "—"}</span>
                {data.outboundLegs.some(l => l.airline || l.flightNumber) && <>
                  <span className="text-muted-foreground">Vuelo ida</span>
                  <span style={{ color: "#2D1F0E" }}>{data.outboundLegs.filter(l => l.airline || l.flightNumber).map(l => `${l.airline} ${l.flightNumber}`.trim()).join(" + ")}</span>
                </>}
                {data.returnLegs.some(l => l.airline || l.flightNumber) && <>
                  <span className="text-muted-foreground">Vuelo vuelta</span>
                  <span style={{ color: "#2D1F0E" }}>{data.returnLegs.filter(l => l.airline || l.flightNumber).map(l => `${l.airline} ${l.flightNumber}`.trim()).join(" + ")}</span>
                </>}
              </div>
            </div>
          </div>
        );

      // ── STEP 6: Itinerario detallado ────────────────────────────────────────
      case 6:
        return (
          <div className="space-y-3">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Itinerario detallado</h2>
              <p className="text-[13px] text-muted-foreground">Hoteles y actividades por día. Opcional — puedes completarlo después.</p>
            </div>
            {!hasDays ? (
              <div className="p-6 rounded-[12px] border border-border text-center" style={{ background: "#FAF2EB" }}>
                <Hotel className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-[13px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Sin días definidos</div>
                <div className="text-[12px] text-muted-foreground">Los días se configuran desde el detalle del viaje.</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {days.map((day, idx) => {
                  const dayDate = data.startDate ? new Date(data.startDate + "T00:00:00") : null;
                  if (dayDate) dayDate.setDate(dayDate.getDate() + (day.dayNumber - 1));
                  const dateStr = dayDate
                    ? dayDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
                    : null;
                  const dayActs = (data.dayActivities[day.dayNumber] ?? [])
                    .map(id => activities?.find(a => a.id === id))
                    .filter((a): a is NonNullable<typeof a> => Boolean(a));
                  const isHotelOpen = inlineHotelDay === day.dayNumber;
                  const isActOpen = inlineActivityDay === day.dayNumber;
                  const assignedHotel = data.dayHotels[day.dayNumber];
                  const originalTransit = data.origin === "existing"
                    ? !!existingDays?.find(d => d.dayNumber === day.dayNumber)?.isTransitNight
                    : false;
                  const isTransit = data.dayTransitNights[day.dayNumber] ?? originalTransit;

                  return (
                    <Fragment key={day.dayNumber}>
                    <div className="rounded-[12px] border border-border overflow-hidden" style={{ background: "white" }}>
                      {/* Header */}
                      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                          style={{ background: "#FAEEE4", color: "#C4793A" }}>
                          {day.dayNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                            {day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                          </div>
                          {dateStr && <div className="text-[11px] capitalize" style={{ color: "#9C7A58" }}>{dateStr}</div>}
                        </div>
                        {day.meals && (
                          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-[5px]" style={{ background: "#E4F3EC", color: "#2E7D5A" }}>
                            🍽 {day.meals}
                          </span>
                        )}
                      </div>

                      {/* Parsed extraction hints */}
                      {(day.hotel || (day.dayNotes?.length ?? 0) > 0) && (
                        <div className="px-3 pb-2 space-y-1">
                          {day.hotel && (
                            <div className="flex flex-wrap items-center gap-1 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded-[5px]" style={{ background: "#FAEEE4", color: "#8B4420" }}>
                                🏨 Detectado: {day.hotel.name}{day.hotel.guaranteed === false ? " (o similar)" : ""}
                              </span>
                              {day.hotel.reviewManually && (
                                <span className="px-1.5 py-0.5 rounded-[5px] font-medium" style={{ background: "#FDECEA", color: "#C0392B" }}>
                                  ⚠ Revisar manualmente
                                </span>
                              )}
                              {(day.hotel.alternatives?.length ?? 0) > 0 && (
                                <span className="text-[10px]" style={{ color: "#9C7A58" }}>
                                  Alternativas: {day.hotel.alternatives!.join(", ")}
                                </span>
                              )}
                            </div>
                          )}
                          {(day.dayNotes?.length ?? 0) > 0 && (
                            <div className="space-y-0.5">
                              {day.dayNotes!.map((n, i) => (
                                <div key={i} className="text-[10px] px-1.5 py-0.5 rounded-[5px]" style={{ background: "#FFF3E0", color: "#8B4420" }}>
                                  📌 {n}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hotel row */}
                      <div className="px-3 pb-2 flex items-center gap-2 border-t border-border/50 pt-2">
                        <Hotel className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9C7A58" }} />
                        <div className="flex-1 min-w-0">
                          {isTransit ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
                              <Plane className="w-3 h-3" /> Noche en transporte
                            </span>
                          ) : (
                            <Select
                              value={assignedHotel || "none"}
                              onValueChange={v => set({ dayHotels: { ...data.dayHotels, [day.dayNumber]: v === "none" ? "" : v } })}>
                              <SelectTrigger className="text-[12px] h-7 border-0 bg-transparent px-0 focus:ring-0 shadow-none w-full">
                                <SelectValue placeholder="Sin hotel asignado" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin hotel</SelectItem>
                                {hotels?.map(h => (
                                  <SelectItem key={h.id} value={String(h.id)}>{h.name} · {h.city}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {!isTransit && (
                          <button
                            className="flex-shrink-0 text-[11px] font-medium flex items-center gap-0.5 px-2 py-1 rounded-[6px] transition-colors"
                            style={{ color: "#C4793A", background: isHotelOpen ? "#FAEEE4" : "transparent" }}
                            onClick={() => {
                              setInlineHotelDay(isHotelOpen ? null : day.dayNumber);
                              setInlineActivityDay(null);
                              setHotelSearchQ("");
                              setHotelLookupResults([]);
                              setNewHotelForm({ name: "", city: day.cityTo ?? day.cityFrom ?? "", country: "", address: "", phone: "", website: "" });
                            }}>
                            <Plus className="w-3 h-3" />{isHotelOpen ? "Cerrar" : "Nuevo"}
                          </button>
                        )}
                        <button
                          className="flex-shrink-0 text-[11px] font-medium flex items-center gap-1 px-2 py-1 rounded-[6px] transition-colors"
                          style={isTransit
                            ? { background: "#3D2F6B", color: "#FAF2EB" }
                            : { background: "#F0EEF7", color: "#3D2F6B" }}
                          title="Marcar este día como noche en transporte (tren nocturno, vuelo, ferry…)"
                          onClick={() => {
                            const next = !isTransit;
                            set({
                              dayTransitNights: { ...data.dayTransitNights, [day.dayNumber]: next },
                              ...(next ? { dayHotels: { ...data.dayHotels, [day.dayNumber]: "" } } : {}),
                            });
                            if (next && isHotelOpen) setInlineHotelDay(null);
                          }}>
                          <Plane className="w-3 h-3" />
                          Noche en transporte
                        </button>
                      </div>

                      {/* Activities row */}
                      <div className="px-3 pb-3 flex items-start gap-2">
                        <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#9C7A58" }} />
                        <div className="flex-1 flex flex-wrap gap-1 items-center">
                          {dayActs.map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{ background: "#EDE9F8", color: "#3D2F6B" }}>
                              {a.name}
                              <button
                                onClick={() => set({ dayActivities: { ...data.dayActivities, [day.dayNumber]: (data.dayActivities[day.dayNumber] ?? []).filter(id => id !== a.id) } })}
                                className="opacity-60 hover:opacity-100 ml-0.5">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                          <button
                            className="text-[11px] font-medium flex items-center gap-0.5 px-2 py-0.5 rounded-full transition-colors"
                            style={{ color: "#3D2F6B", background: isActOpen ? "#EDE9F8" : "#F5F3FB" }}
                            onClick={() => {
                              setInlineActivityDay(isActOpen ? null : day.dayNumber);
                              setInlineHotelDay(null);
                              setActivitySearchQ("");
                              setNewActivityMode(false);
                            }}>
                            <Plus className="w-3 h-3" /> Actividad
                          </button>
                        </div>
                      </div>

                      {/* ── Inline hotel creation panel ─────────────────────── */}
                      {isHotelOpen && (
                        <div className="border-t border-border p-3 space-y-3" style={{ background: "#FAF8F5" }}>
                          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#C4793A" }}>
                            Buscar o crear hotel
                          </div>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nombre del hotel…"
                              value={hotelSearchQ}
                              onChange={e => setHotelSearchQ(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && handleHotelLookup()}
                              className="h-8 text-[12px] flex-1"
                            />
                            <Button type="button" size="sm" className="h-8 text-[11px] gap-1 flex-shrink-0"
                              style={{ background: "#C4793A", color: "white" }}
                              onClick={handleHotelLookup}
                              disabled={hotelLookupLoading || !hotelSearchQ.trim()}>
                              <Search className="w-3 h-3" />
                              {hotelLookupLoading ? "Buscando…" : "Buscar"}
                            </Button>
                          </div>
                          {hotelSearchDone && hotelLookupResults.length === 0 && (
                            <div className="text-[12px] py-1.5 px-2 rounded-[8px] text-center" style={{ background: "#FFF3E0", color: "#8B4420" }}>
                              Sin resultados — rellena el formulario manualmente o prueba otro nombre
                            </div>
                          )}
                          {hotelLookupResults.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px]" style={{ color: "#9C7A58" }}>Selecciona para pre-rellenar el formulario:</div>
                              {hotelLookupResults.map((r, i) => (
                                <button key={i}
                                  onClick={() => setNewHotelForm({ name: r.name, city: r.city, country: r.country, address: r.address, phone: r.phone, website: r.website })}
                                  className="w-full text-left p-2 rounded-[8px] border border-border hover:border-[#C4793A] text-[12px] transition-colors">
                                  <div className="font-medium" style={{ color: "#2D1F0E" }}>{r.name}</div>
                                  <div style={{ color: "#9C7A58" }}>{r.city}{r.country ? `, ${r.country}` : ""}</div>
                                  {r.address && <div className="text-[11px] truncate" style={{ color: "#9C7A58" }}>{r.address}</div>}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Datos del hotel</div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Nombre *" value={newHotelForm.name} onChange={e => setNewHotelForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-[12px]" />
                            <Input placeholder="Ciudad *" value={newHotelForm.city} onChange={e => setNewHotelForm(f => ({ ...f, city: e.target.value }))} className="h-7 text-[12px]" />
                            <CountrySelectSmall value={newHotelForm.country} onChange={v => setNewHotelForm(f => ({ ...f, country: v }))} placeholder="País *" />
                            <Input placeholder="Dirección" value={newHotelForm.address} onChange={e => setNewHotelForm(f => ({ ...f, address: e.target.value }))} className="h-7 text-[12px]" />
                            <Input placeholder="Teléfono" value={newHotelForm.phone} onChange={e => setNewHotelForm(f => ({ ...f, phone: e.target.value }))} className="h-7 text-[12px]" />
                            <Input placeholder="Web" value={newHotelForm.website} onChange={e => setNewHotelForm(f => ({ ...f, website: e.target.value }))} className="h-7 text-[12px]" />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-[12px]"
                              onClick={() => setInlineHotelDay(null)}>Cancelar</Button>
                            <Button type="button" size="sm" className="h-7 text-[12px]"
                              style={{ background: "#C4793A", color: "white" }}
                              disabled={!newHotelForm.name || !newHotelForm.city || !newHotelForm.country || creatingHotel}
                              onClick={() => handleCreateHotel(day.dayNumber)}>
                              {creatingHotel ? "Guardando…" : "Guardar hotel"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* ── Inline activity picker panel ────────────────────── */}
                      {isActOpen && (
                        <div className="border-t border-border p-3 space-y-2" style={{ background: "#F8F6FC" }}>
                          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
                            Añadir actividad
                          </div>
                          <Input
                            placeholder="Buscar en el catálogo…"
                            value={activitySearchQ}
                            onChange={e => setActivitySearchQ(e.target.value)}
                            className="h-7 text-[12px]"
                          />
                          {(() => {
                            const catalogue = activities ?? [];
                            const alreadyAdded = data.dayActivities[day.dayNumber] ?? [];
                            const filtered = catalogue
                              .filter(a => !activitySearchQ || a.name.toLowerCase().includes(activitySearchQ.toLowerCase()))
                              .filter(a => !alreadyAdded.includes(a.id))
                              .slice(0, 12);
                            if (catalogue.length === 0) {
                              return (
                                <div className="text-[12px] py-2 text-center rounded-[8px]" style={{ background: "#EDE9F8", color: "#3D2F6B" }}>
                                  Tu catálogo está vacío — crea una nueva actividad abajo
                                </div>
                              );
                            }
                            if (filtered.length === 0) {
                              return (
                                <div className="text-[11px] py-2 text-center" style={{ color: "#9C7A58" }}>
                                  {activitySearchQ ? `Sin coincidencias para "${activitySearchQ}"` : "Todas las actividades ya están añadidas"}
                                </div>
                              );
                            }
                            return (
                              <div className="max-h-36 overflow-y-auto space-y-0.5">
                                {filtered.map(a => (
                                  <button key={a.id}
                                    className="w-full text-left px-2 py-1.5 rounded-[6px] hover:bg-[#EDE9F8] text-[12px] transition-colors"
                                    style={{ color: "#2D1F0E" }}
                                    onClick={() => {
                                      set({ dayActivities: { ...data.dayActivities, [day.dayNumber]: [...alreadyAdded, a.id] } });
                                    }}>
                                    {a.name}{a.city ? <span style={{ color: "#9C7A58" }}> · {a.city}</span> : null}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          {!newActivityMode ? (
                            <button className="w-full text-[11px] font-medium py-1 rounded-[6px] flex items-center justify-center gap-1 transition-colors"
                              style={{ color: "#3D2F6B", background: "#EDE9F8" }}
                              onClick={() => setNewActivityMode(true)}>
                              <Plus className="w-3 h-3" /> Nueva actividad
                            </button>
                          ) : (
                            <div className="space-y-2 pt-2 border-t border-border">
                              <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Nueva actividad</div>
                              {/* Web search */}
                              <div className="flex gap-1.5">
                                <Input
                                  placeholder="Buscar en internet…"
                                  value={activityLookupQ}
                                  onChange={e => setActivityLookupQ(e.target.value)}
                                  onKeyDown={e => e.key === "Enter" && handleActivityLookup()}
                                  className="h-7 text-[12px] flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={handleActivityLookup}
                                  disabled={!activityLookupQ.trim() || activityLookupLoading}
                                  className="h-7 px-2 rounded-[6px] text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1"
                                  style={{ background: "#3D2F6B", color: "white" }}>
                                  {activityLookupLoading ? "…" : <Search className="w-3 h-3" />}
                                </button>
                              </div>
                              {activityLookupResults.length > 0 && (
                                <div className="rounded-[6px] border border-border bg-card overflow-hidden divide-y divide-border/60 max-h-32 overflow-y-auto">
                                  {activityLookupResults.map((r, i) => (
                                    <button key={i} type="button"
                                      onClick={() => {
                                        setNewActivityForm(f => ({ ...f, name: r.name, city: r.city, country: r.country }));
                                        setActivityLookupResults([]); setActivityLookupQ(""); setActivityLookupDone(false);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-muted/50 transition-colors">
                                      <p className="text-[11px] font-medium truncate" style={{ color: "#2D1F0E" }}>{r.name}</p>
                                      {(r.city || r.country) && <p className="text-[10px] text-muted-foreground truncate">{[r.city, r.country].filter(Boolean).join(", ")}</p>}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {activityLookupDone && activityLookupResults.length === 0 && (
                                <p className="text-[10px] text-muted-foreground">Sin resultados. Rellena manualmente.</p>
                              )}
                              {/* Manual fields */}
                              <Input placeholder="Nombre *" value={newActivityForm.name}
                                onChange={e => setNewActivityForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-[12px]" />
                              <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="Ciudad" value={newActivityForm.city}
                                  onChange={e => setNewActivityForm(f => ({ ...f, city: e.target.value }))} className="h-7 text-[12px]" />
                                <CountrySelectSmall value={newActivityForm.country} onChange={v => setNewActivityForm(f => ({ ...f, country: v }))} placeholder="País" />
                              </div>
                              <Select value={newActivityForm.category || "none"}
                                onValueChange={v => setNewActivityForm(f => ({ ...f, category: v === "none" ? "" : v }))}>
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
                                <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                                  onClick={() => {
                                    setNewActivityMode(false);
                                    setNewActivityForm({ name: "", category: "", city: "", country: "" });
                                    setActivityLookupQ(""); setActivityLookupResults([]); setActivityLookupDone(false);
                                  }}>
                                  Cancelar
                                </Button>
                                <Button type="button" size="sm" className="h-6 text-[11px]"
                                  style={{ background: "#3D2F6B", color: "white" }}
                                  disabled={!newActivityForm.name || creatingActivity}
                                  onClick={() => handleCreateActivity(day.dayNumber)}>
                                  {creatingActivity ? "…" : "Crear"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {idx < days.length - 1 && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px" style={{ background: "#ECD5B8" }} />
                        <TransportSelect
                          value={dayTransports[days[idx + 1].dayNumber] ?? ""}
                          onChange={v => setDayTransports(prev => ({ ...prev, [days[idx + 1].dayNumber]: v }))}
                          placeholder="Sin transporte"
                          className="h-7 text-[11px] w-48 border-dashed"
                        />
                        <div className="flex-1 h-px" style={{ background: "#ECD5B8" }} />
                      </div>
                    )}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        );

      // ── STEP 7: Invitaciones ────────────────────────────────────────────────
      case 7:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Invitar viajeros</h2>
              <p className="text-[13px] text-muted-foreground">Opcional — puedes invitar más viajeros desde el detalle del viaje.</p>
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Emails de viajeros</label>
              <Textarea
                placeholder={"viajero1@email.com\nviajero2@email.com\nviajero3@email.com"}
                rows={5}
                value={data.emails}
                onChange={e => set({ emails: e.target.value })}
                className="font-mono text-[12px]"
              />
              <p className="text-[11px] mt-1 text-muted-foreground">Uno por línea o separados por coma. Recibirán un enlace de invitación.</p>
            </div>
            <div className="p-4 rounded-[12px] border border-border" style={{ background: "#FAF2EB" }}>
              <div className="text-[12px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Listo para crear</div>
              <div className="text-[12px] text-muted-foreground">
                {data.tripName} · {data.startDate}{data.endDate ? ` → ${data.endDate}` : ""}
                {data.emails.trim() ? ` · ${data.emails.split(/[\n,]+/).filter(e => e.trim()).length} invitación(es)` : " · sin invitaciones"}
              </div>
            </div>
          </div>
        );
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!data.origin;
      case 2:
        if (data.origin === "existing") return !!data.selectedItineraryId;
        if (data.newMode === "scratch") return !!data.scratchName && !!data.scratchNumDays;
        if (data.newMode === "pdf") return !!data.parsedItinerary;
        return false;
      case 3: return !!data.startDate;
      case 4: return true;
      case 5: return !!data.tripName;
      case 6: return true;
      case 7: return true;
      default: return true;
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate("/trips")} className="text-[12px] text-muted-foreground hover:text-foreground">
          ← Volver a viajes
        </button>
      </div>

      <h1 className="text-xl font-medium mb-1" style={{ color: "#2D1F0E" }}>Nuevo viaje</h1>
      <p className="text-sm text-muted-foreground mb-6">Sigue los pasos para configurar el viaje completo.</p>

      <div className="bg-card border border-border rounded-[14px] shadow-sm p-6">
        <Stepper step={step} />

        <div className="min-h-[260px]">
          {renderStep()}
        </div>

        <div className="flex items-center justify-between pt-5 mt-5 border-t border-border">
          <button onClick={prevStep} disabled={step === 1}
            className="px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors disabled:opacity-30"
            style={{ borderColor: "#E5D4BF", color: "#7A5C3A" }}>
            ← Anterior
          </button>
          <div className="flex items-center gap-2">
            {step < 7 && (
              <button
                onClick={nextStep}
                disabled={!canProceed()}
                className="px-5 py-2 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
                style={{ background: "#C4793A", color: "#FAF2EB" }}
                onMouseOver={e => { if (canProceed()) (e.currentTarget as HTMLButtonElement).style.background = "#8B4420"; }}
                onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.background = "#C4793A"}>
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 7 && (
              <button
                onClick={handleCreate}
                disabled={isCreating || !data.tripName || !data.startDate}
                className="px-5 py-2 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isCreating ? "Creando viaje…" : "Crear viaje"}
                {!isCreating && <Check className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
