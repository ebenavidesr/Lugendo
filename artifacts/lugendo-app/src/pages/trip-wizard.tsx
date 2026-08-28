import { useState, useRef, Fragment, useEffect } from "react";
import { useLocation } from "wouter";
import { Check, Upload, FileText, X, Plane, Hotel, ChevronRight, Zap, Plus, Loader2 } from "lucide-react";
import {
  useListItineraries,
  useListItineraryDays,
  useCreateItinerary,
  useCreateItineraryDay,
  useUpdateItineraryDay,
  useCreateTrip,
  useSendInvitations,
  useListHotels,
  useListActivities,
  useAddDayActivity,
  useAddItineraryDayHotel,
  useRemoveItineraryDayHotel,
} from "@workspace/api-client-react";
import type { ParsedItinerary, ParsedDay } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TransportSelect } from "@/components/transport-select";
import { useAutoDescription } from "@/hooks/use-auto-description";
import { getApiErrorMessage } from "@/lib/utils";
import { WizardStepper } from "@/components/trip-itinerary-wizard/wizard-stepper";
import { ItineraryModePicker, ItineraryUploadPanel } from "@/components/trip-itinerary-wizard/itinerary-upload-panel";
import { useItineraryImport } from "@/components/trip-itinerary-wizard/use-itinerary-import";
import { useHotelAssignment, useActivityAssignment } from "@/components/trip-itinerary-wizard/use-day-assignment";
import { HotelInlineCreatePanel } from "@/components/trip-itinerary-wizard/hotel-inline-panel";
import { ActivityInlineAddPanel } from "@/components/trip-itinerary-wizard/activity-inline-panel";

// ── Types ────────────────────────────────────────────────────────────────────

type Origin = "existing" | "new";
type NewMode = "scratch" | "pdf";
type Step = 1 | 2 | 3 | 4;

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
  tripName: string;
  tripDescription: string;
  emails: string;
}

const STEP_LABELS = ["Origen", "Programa", "Datos del viaje", "Crear"];

// ── Main component ───────────────────────────────────────────────────────────

export default function TripWizard() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>({
    origin: null, selectedItineraryId: null,
    newMode: null,
    scratchName: "", scratchNumDays: "", scratchCountries: "", scratchDifficulty: "", scratchDescription: "",
    parsedItinerary: null, dayHotels: {}, dayTransitNights: {}, dayActivities: {},
    startDate: "", endDate: "", maxCapacity: "",
    tripName: "", tripDescription: "", emails: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [startDateTouched, setStartDateTouched] = useState(false);
  const [dayTransports, setDayTransports] = useState<Record<number, string>>({});

  const { data: itineraries } = useListItineraries();
  const { data: hotels } = useListHotels();
  const { data: activities } = useListActivities();
  const { data: existingDays } = useListItineraryDays(
    data.selectedItineraryId ?? 0
  );
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();
  const updateDay = useUpdateItineraryDay();
  const createTrip = useCreateTrip();
  const sendInvitations = useSendInvitations();
  const addDayActivity = useAddDayActivity();
  const addDayHotel = useAddItineraryDayHotel();
  const removeDayHotel = useRemoveItineraryDayHotel();

  const set = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  const itineraryImport = useItineraryImport();
  const hotelAssignment = useHotelAssignment((dayNum, hotelId) => set({ dayHotels: { ...data.dayHotels, [dayNum]: hotelId } }));
  const activityAssignment = useActivityAssignment((dayNum, activityId) =>
    set({ dayActivities: { ...data.dayActivities, [dayNum]: [...(data.dayActivities[dayNum] ?? []), activityId] } })
  );

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

  const nextStep = () => setStep(s => Math.min(s + 1, 4) as Step);
  const prevStep = () => setStep(s => Math.max(s - 1, 1) as Step);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    itineraryImport.selectFile(file);
    set({ parsedItinerary: null });
  };

  const handleParsePdf = async () => {
    const result = await itineraryImport.parse(activities ?? [], hotels ?? []);
    if (!result) return;
    setDayTransports(result.dayTransports);
    set({
      parsedItinerary: result.parsedItinerary,
      scratchName: result.parsedItinerary.name,
      scratchNumDays: String(result.parsedItinerary.numDays),
      scratchCountries: result.parsedItinerary.countries?.join(", ") ?? "",
      scratchDescription: result.parsedItinerary.description ?? "",
      tripName: result.parsedItinerary.name,
      ...(result.parsedItinerary.startDate ? { startDate: result.parsedItinerary.startDate } : {}),
      ...(result.parsedItinerary.endDate ? { endDate: result.parsedItinerary.endDate } : {}),
      ...(Object.keys(result.dayActivities).length ? { dayActivities: result.dayActivities } : {}),
      ...(Object.keys(result.dayHotels).length ? { dayHotels: result.dayHotels } : {}),
    });
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
            // Este itinerario nace como plantilla interna de ESTE viaje concreto, no como
            // oferta de catálogo pensada para el buscador público — el catálogo deliberado
            // se gestiona aparte, en /itineraries.
            publishedInSearch: false,
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
      console.error("Error creating trip", err);
      toast({ variant: "destructive", title: getApiErrorMessage(err, "Error al crear el viaje") });
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
                {itineraries?.filter(it => it.active !== false).map(it => (
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
                {!itineraries?.filter(it => it.active !== false).length && (
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

            <ItineraryModePicker mode={data.newMode} onChange={mode => set({ newMode: mode })} />

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
              <ItineraryUploadPanel
                fileInputRef={itineraryImport.fileInputRef}
                pdfFile={itineraryImport.pdfFile}
                isParsing={itineraryImport.isParsing}
                parsedItinerary={data.parsedItinerary}
                onFileChange={handleFileChange}
                onClearFile={() => { itineraryImport.clearFile(); set({ parsedItinerary: null }); }}
                onParse={handleParsePdf}
              />
            )}
          </div>
        );

      // ── STEP 3: Datos del viaje ──────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Datos del viaje</h2>
              <p className="text-[13px] text-muted-foreground">Nombre, fechas y capacidad del grupo.</p>
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre del viaje *</label>
              <Input placeholder="Marruecos Imperial Junio 2026" value={data.tripName} onChange={e => set({ tripName: e.target.value })} className="text-[15px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Fecha de salida *</label>
                <Input
                  type="date"
                  value={data.startDate}
                  onChange={e => set({ startDate: e.target.value })}
                  onBlur={() => setStartDateTouched(true)}
                />
                {startDateTouched && !data.startDate && (
                  <p className="text-[11px] mt-1" style={{ color: "#C0392B" }}>
                    La fecha no se guardó — revisa que día, mes y año estén completos y vuelve a introducirla.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Fecha de regreso</label>
                <Input type="date" value={data.endDate} onChange={e => set({ endDate: e.target.value })} min={data.startDate} />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Capacidad máxima</label>
              <Input type="number" placeholder="20 viajeros" value={data.maxCapacity} onChange={e => set({ maxCapacity: e.target.value })} />
              <p className="text-[11px] mt-1 text-muted-foreground">El semáforo de ocupación se calcula sobre este valor.</p>
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
          </div>
        );

      // ── STEP 4: Itinerario y confirmación ────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Itinerario y confirmación</h2>
              <p className="text-[13px] text-muted-foreground">Hoteles, actividades e invitaciones. Todo opcional — puedes completarlo después.</p>
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
                  const isHotelOpen = hotelAssignment.inlineDay === day.dayNumber;
                  const isActOpen = activityAssignment.inlineDay === day.dayNumber;
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
                              if (isHotelOpen) { hotelAssignment.close(); return; }
                              activityAssignment.close();
                              hotelAssignment.open(day.dayNumber, { city: day.cityTo ?? day.cityFrom ?? "" });
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
                            if (next && isHotelOpen) hotelAssignment.close();
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
                              if (isActOpen) { activityAssignment.close(); return; }
                              hotelAssignment.close();
                              activityAssignment.open(day.dayNumber);
                            }}>
                            <Plus className="w-3 h-3" /> Actividad
                          </button>
                        </div>
                      </div>

                      {/* ── Inline hotel creation panel ─────────────────────── */}
                      {isHotelOpen && (
                        <HotelInlineCreatePanel
                          dayNumber={day.dayNumber}
                          catalog={[]}
                          catalogSearchQ=""
                          onCatalogSearchQChange={() => {}}
                          onPickExisting={() => {}}
                          searchQ={hotelAssignment.searchQ}
                          onSearchQChange={hotelAssignment.setSearchQ}
                          lookupLoading={hotelAssignment.lookupLoading}
                          lookupDone={hotelAssignment.lookupDone}
                          lookupResults={hotelAssignment.lookupResults}
                          onLookup={hotelAssignment.lookup}
                          onApplyResult={hotelAssignment.applyResult}
                          form={hotelAssignment.form}
                          onFormChange={hotelAssignment.setForm}
                          creating={hotelAssignment.creating}
                          onCancel={hotelAssignment.close}
                          onCreate={hotelAssignment.create}
                        />
                      )}

                      {/* ── Inline activity picker panel ────────────────────── */}
                      {isActOpen && (
                        <ActivityInlineAddPanel
                          dayNumber={day.dayNumber}
                          catalog={activities ?? []}
                          alreadyAddedIds={data.dayActivities[day.dayNumber] ?? []}
                          catalogSearchQ={activityAssignment.catalogSearchQ}
                          onCatalogSearchQChange={activityAssignment.setCatalogSearchQ}
                          onPickExisting={activityId => set({ dayActivities: { ...data.dayActivities, [day.dayNumber]: [...(data.dayActivities[day.dayNumber] ?? []), activityId] } })}
                          creatingMode={activityAssignment.creatingMode}
                          onStartCreate={() => activityAssignment.setCreatingMode(true)}
                          lookupQ={activityAssignment.lookupQ}
                          onLookupQChange={activityAssignment.setLookupQ}
                          lookupLoading={activityAssignment.lookupLoading}
                          lookupDone={activityAssignment.lookupDone}
                          lookupResults={activityAssignment.lookupResults}
                          onLookup={activityAssignment.lookup}
                          onApplyResult={activityAssignment.applyResult}
                          form={activityAssignment.form}
                          onFormChange={activityAssignment.setForm}
                          creating={activityAssignment.creating}
                          onCancel={activityAssignment.resetCreateForm}
                          onCreate={activityAssignment.create}
                        />
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

            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Emails de viajeros (opcional)</label>
              <Textarea
                placeholder={"viajero1@email.com\nviajero2@email.com\nviajero3@email.com"}
                rows={4}
                value={data.emails}
                onChange={e => set({ emails: e.target.value })}
                className="font-mono text-[12px]"
              />
              <p className="text-[11px] mt-1 text-muted-foreground">Uno por línea o separados por coma. Recibirán un enlace de invitación.</p>
            </div>

            <div className="p-4 rounded-[12px] border border-border space-y-1.5" style={{ background: "#FAF2EB" }}>
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>Resumen final</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                <span className="text-muted-foreground">Itinerario</span>
                <span style={{ color: "#2D1F0E" }}>
                  {data.origin === "existing" ? (selectedItinerary?.name ?? "—") : (data.scratchName || data.parsedItinerary?.name || "Nuevo")}
                </span>
                <span className="text-muted-foreground">Nombre</span>
                <span style={{ color: "#2D1F0E" }}>{data.tripName || "—"}</span>
                <span className="text-muted-foreground">Salida</span>
                <span style={{ color: "#2D1F0E" }}>{data.startDate || "—"}</span>
                <span className="text-muted-foreground">Regreso</span>
                <span style={{ color: "#2D1F0E" }}>{data.endDate || "—"}</span>
                <span className="text-muted-foreground">Capacidad</span>
                <span style={{ color: "#2D1F0E" }}>{data.maxCapacity ? `${data.maxCapacity} viajeros` : "—"}</span>
                <span className="text-muted-foreground">Invitaciones</span>
                <span style={{ color: "#2D1F0E" }}>
                  {data.emails.trim() ? `${data.emails.split(/[\n,]+/).filter(e => e.trim()).length} invitación(es)` : "sin invitaciones"}
                </span>
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
      case 3: return !!data.tripName && !!data.startDate;
      case 4: return true;
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
        <WizardStepper labels={STEP_LABELS} current={step} />

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
            {step < 4 && (
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
            {step === 4 && (
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
