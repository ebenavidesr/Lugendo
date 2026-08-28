import { useState, useEffect, Fragment } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Check, Upload, X, Plane,
  Hotel, ChevronRight, Zap, Plus, Camera,
} from "lucide-react";
import {
  useCreateMyTrip,
  useCreateItinerary,
  useCreateItineraryDay,
  useListHotels,
  useListActivities,
  useAddDayActivity,
  useAddItineraryDayHotel,
  useUseTripPhotoAsTemplate,
} from "@workspace/api-client-react";
import type { ParsedItinerary, ParsedDay } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TransportSelect } from "@/components/transport-select";
import { getApiErrorMessage } from "@/lib/utils";
import { TripCountryClaimModal } from "@/components/trip-country-claim-modal";
import { WizardStepper } from "@/components/trip-itinerary-wizard/wizard-stepper";
import { ItineraryModePicker, ItineraryUploadPanel } from "@/components/trip-itinerary-wizard/itinerary-upload-panel";
import { useItineraryImport } from "@/components/trip-itinerary-wizard/use-itinerary-import";
import { useHotelAssignment, useActivityAssignment } from "@/components/trip-itinerary-wizard/use-day-assignment";
import { HotelInlineCreatePanel } from "@/components/trip-itinerary-wizard/hotel-inline-panel";
import { ActivityInlineAddPanel } from "@/components/trip-itinerary-wizard/activity-inline-panel";

// ── Types ────────────────────────────────────────────────────────────────────

type Origin = "create" | "photo";
type NewMode = "scratch" | "pdf";
type Step = 1 | 2 | 3 | 4;

interface WizardData {
  origin: Origin | null;
  photoCode: string;
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
  tripName: string;
}

const STEP_LABELS = ["Inicio", "Programa", "Datos del viaje", "Crear"];

// ── Main component ────────────────────────────────────────────────────────────

export default function TravelerTripWizard() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [pendingClaim, setPendingClaim] = useState<{ tripId: number; navigateTo: string } | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>({
    origin: null,
    photoCode: "",
    newMode: null,
    scratchName: "", scratchNumDays: "", scratchCountries: "", scratchDifficulty: "", scratchDescription: "",
    parsedItinerary: null, dayHotels: {}, dayTransitNights: {}, dayActivities: {},
    startDate: "", endDate: "",
    tripName: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isUsingPhoto, setIsUsingPhoto] = useState(false);
  const [startDateTouched, setStartDateTouched] = useState(false);
  const useAsTemplate = useUseTripPhotoAsTemplate();

  // Coming from a shared photo link (/foto/:code → "Crear mi cuenta y usarla") —
  // task #141. Jump straight to the code-confirmation step with it prefilled.
  useEffect(() => {
    const photoCode = new URLSearchParams(search).get("photoCode");
    if (photoCode) {
      setData(d => ({ ...d, origin: "photo", photoCode }));
      setStep(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dayTransports, setDayTransports] = useState<Record<number, string>>({});

  const { data: hotels } = useListHotels();
  const { data: activities } = useListActivities();
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();
  const createMyTrip = useCreateMyTrip();
  const addDayActivity = useAddDayActivity();
  const addDayHotel = useAddItineraryDayHotel();

  const set = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  const itineraryImport = useItineraryImport();
  const hotelAssignment = useHotelAssignment((dayNum, hotelId) => set({ dayHotels: { ...data.dayHotels, [dayNum]: hotelId } }));
  const activityAssignment = useActivityAssignment((dayNum, activityId) =>
    set({ dayActivities: { ...data.dayActivities, [dayNum]: [...(data.dayActivities[dayNum] ?? []), activityId] } })
  );

  const joinMode = data.origin === "photo";

  const getDays = (): ParsedDay[] => {
    if (data.parsedItinerary) return data.parsedItinerary.days;
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

  // ── Handle "use shared photo as template" ─────────────────────────────────
  const handleUsePhoto = async () => {
    const code = data.photoCode.trim();
    if (!code) return;
    setIsUsingPhoto(true);
    try {
      const result = await useAsTemplate.mutateAsync({ code });
      qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
      toast({ title: "¡Viaje creado a partir de la foto compartida!" });
      setPendingClaim({ tripId: result.tripId, navigateTo: `/traveler/trips/${result.tripId}` });
    } catch {
      toast({ variant: "destructive", title: "Código no válido o la foto ya no está disponible" });
    } finally {
      setIsUsingPhoto(false);
    }
  };

  // ── Handle create personal trip ───────────────────────────────────────────
  const handleCreate = async () => {
    if (!data.tripName || !data.startDate) {
      toast({ variant: "destructive", title: "Nombre y fecha de inicio son obligatorios" });
      return;
    }
    setIsCreating(true);
    try {
      let itineraryId: number | null = null;

      if (data.newMode === "scratch" && data.scratchName && data.scratchNumDays) {
        const countries = data.scratchCountries
          ? data.scratchCountries.split(",").map(c => c.trim()).filter(Boolean)
          : [];
        const newItin = await createItinerary.mutateAsync({
          data: {
            name: data.scratchName,
            numDays: parseInt(data.scratchNumDays),
            countries,
            ...(data.scratchDifficulty && data.scratchDifficulty !== "none"
              ? { difficulty: data.scratchDifficulty as "easy" | "moderate" | "demanding" }
              : {}),
            ...(data.scratchDescription ? { description: data.scratchDescription } : {}),
            // Plantilla interna de este viaje del propio viajero, no una oferta de
            // catálogo de agencia — nunca debe salir en el buscador público.
            publishedInSearch: false,
          },
        });
        itineraryId = newItin.id;
      } else if (data.newMode === "pdf" && data.parsedItinerary) {
        const countries = data.parsedItinerary.countries ?? [];
        const newItin = await createItinerary.mutateAsync({
          data: {
            name: data.parsedItinerary.name,
            numDays: data.parsedItinerary.numDays,
            countries,
            ...(data.parsedItinerary.description ? { description: data.parsedItinerary.description } : {}),
            publishedInSearch: false,
          },
        });
        itineraryId = newItin.id;

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
          for (const actId of actIds) {
            await addDayActivity.mutateAsync({
              itineraryId: newItin.id,
              dayId,
              data: { activityId: actId },
            });
          }
        }
      }

      const trip = await createMyTrip.mutateAsync({
        data: {
          name: data.tripName,
          startDate: data.startDate,
          ...(data.endDate ? { endDate: data.endDate } : {}),
          ...(itineraryId ? { itineraryId } : {}),
        },
      });

      qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
      toast({ title: "¡Viaje creado correctamente!" });
      setPendingClaim({ tripId: trip.id, navigateTo: `/traveler/trips/${trip.id}` });
    } catch (err) {
      console.error("Error creating trip", err);
      toast({ variant: "destructive", title: getApiErrorMessage(err, "Error al crear el viaje") });
    } finally {
      setIsCreating(false);
    }
  };

  // ── Render step ───────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // ── STEP 1: Inicio ──────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>¿Cómo quieres empezar?</h2>
              <p className="text-[13px] text-muted-foreground">Crea tu propio viaje o usa una foto compartida como plantilla.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => { set({ origin: "create" }); nextStep(); }}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{
                  borderColor: data.origin === "create" ? "#C4793A" : "#E5D4BF",
                  background: data.origin === "create" ? "#FAEEE4" : "white",
                }}
              >
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#FAEEE4" }}>
                  <Upload className="w-5 h-5" style={{ color: "#C4793A" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Crear viaje propio</div>
                <div className="text-[12px] text-muted-foreground">Organiza tu propio viaje desde cero o a partir de un archivo.</div>
              </button>
              <button
                onClick={() => { set({ origin: "photo" }); nextStep(); }}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{
                  borderColor: data.origin === "photo" ? "#8B4420" : "#E5D4BF",
                  background: data.origin === "photo" ? "#F3E6D8" : "white",
                }}
              >
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#F3E6D8" }}>
                  <Camera className="w-5 h-5" style={{ color: "#8B4420" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Usar una foto compartida</div>
                <div className="text-[12px] text-muted-foreground">Alguien te compartió una foto de su viaje y quieres usarla como plantilla.</div>
              </button>
            </div>
          </div>
        );

      // ── STEP 2: create → Programa / photo → código de foto ──
      case 2:
        if (data.origin === "photo") {
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Introduce el código de la foto</h2>
                <p className="text-[13px] text-muted-foreground">Lo encontrarás en el enlace que te compartieron.</p>
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Código de foto</label>
                <Input
                  placeholder="Ej. ABC123XYZ"
                  value={data.photoCode}
                  onChange={e => set({ photoCode: e.target.value.toUpperCase() })}
                  className="text-[15px] font-mono tracking-widest"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && data.photoCode.trim()) handleUsePhoto(); }}
                />
              </div>
              <button
                onClick={handleUsePhoto}
                disabled={!data.photoCode.trim() || isUsingPhoto}
                className="w-full py-2.5 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "#8B4420", color: "white" }}
              >
                {isUsingPhoto ? "Creando viaje…" : (
                  <><Check className="w-4 h-4" /> Usar como plantilla</>
                )}
              </button>
              <div className="p-4 rounded-[12px] border border-border text-center" style={{ background: "#FAF2EB" }}>
                <div className="text-[12px] text-muted-foreground">
                  ¿No tienes código?
                  {" "}<button className="font-medium hover:underline" style={{ color: "#C4793A" }} onClick={() => { set({ origin: "create" }); }}>crea tu propio viaje</button>.
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Crear itinerario</h2>
              <p className="text-[13px] text-muted-foreground">¿Cómo quieres definir el programa del viaje?</p>
            </div>

            <ItineraryModePicker mode={data.newMode} onChange={mode => set({ newMode: mode })} />

            {data.newMode === "scratch" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Nombre del itinerario *</label>
                    <Input placeholder="Japón en otoño" value={data.scratchName} onChange={e => set({ scratchName: e.target.value, tripName: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Número de días *</label>
                    <Input type="number" placeholder="10" value={data.scratchNumDays} onChange={e => set({ scratchNumDays: e.target.value })} />
                  </div>
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

      // ── STEP 3: Datos del viaje ───────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Datos del viaje</h2>
              <p className="text-[13px] text-muted-foreground">Configura los detalles básicos de tu aventura.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre del viaje *</label>
                <Input
                  placeholder="Japón otoño 2026"
                  value={data.tripName}
                  onChange={e => set({ tripName: e.target.value })}
                  className="text-[15px]"
                />
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
                <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Países</label>
                <Input
                  placeholder="Ej. Japón, Corea"
                  value={data.scratchCountries}
                  onChange={e => set({ scratchCountries: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Descripción</label>
                <Textarea
                  placeholder="Descripción del viaje…"
                  rows={2}
                  value={data.scratchDescription}
                  onChange={e => set({ scratchDescription: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      // ── STEP 4: Crear ───────────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Itinerario y confirmación</h2>
              <p className="text-[13px] text-muted-foreground">Revisa tu viaje y añade hoteles o actividades si lo deseas.</p>
            </div>

            {hasDays && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9C7A58" }}>Itinerario detallado (Opcional)</div>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
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
                    const isTransit = !!data.dayTransitNights[day.dayNumber];

                    return (
                      <Fragment key={day.dayNumber}>
                      <div className="rounded-[12px] border border-border overflow-hidden" style={{ background: "white" }}>
                        <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                          <div
                            className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                            style={{ background: "#FAEEE4", color: "#C4793A" }}
                          >
                            {day.dayNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                                {day.cityTo || day.cityFrom || "Día de viaje"}
                              </span>
                              {dateStr && <span className="text-[10px] text-muted-foreground uppercase">{dateStr}</span>}
                            </div>
                            {day.description && <div className="text-[11px] text-muted-foreground line-clamp-1">{day.description}</div>}
                          </div>
                        </div>

                        {/* Activities & Hotel list */}
                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                          {isTransit ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium" style={{ background: "#3D2F6B", color: "#FAF2EB" }}>
                              <Plane className="w-3 h-3" />
                              Noche en transporte
                              <button
                                onClick={() => set({ dayTransitNights: { ...data.dayTransitNights, [day.dayNumber]: false } })}
                                className="opacity-70 hover:opacity-100"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : assignedHotel ? (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium" style={{ background: "#EAE6F5", color: "#3D2F6B" }}>
                              <Hotel className="w-3 h-3" />
                              <span className="max-w-[100px] truncate">{hotels?.find(h => String(h.id) === assignedHotel)?.name}</span>
                              <button onClick={() => set({ dayHotels: { ...data.dayHotels, [day.dayNumber]: "" } })} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (isHotelOpen) { hotelAssignment.close(); return; }
                                activityAssignment.close();
                                hotelAssignment.open(day.dayNumber);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border border-dashed transition-colors hover:bg-muted"
                              style={{ borderColor: "#E5D4BF", color: "#9C7A58" }}
                            >
                              <Plus className="w-2.5 h-2.5" /> Hotel
                            </button>
                          )}
                          {!isTransit && (
                            <button
                              onClick={() => {
                                set({
                                  dayTransitNights: { ...data.dayTransitNights, [day.dayNumber]: true },
                                  dayHotels: { ...data.dayHotels, [day.dayNumber]: "" },
                                });
                                if (isHotelOpen) hotelAssignment.close();
                              }}
                              title="Marcar este día como noche en transporte (tren nocturno, vuelo, ferry…)"
                              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border border-dashed transition-colors hover:bg-muted"
                              style={{ borderColor: "#C6BEE3", color: "#3D2F6B" }}
                            >
                              <Plane className="w-2.5 h-2.5" /> Noche en transporte
                            </button>
                          )}

                          {dayActs.map(a => (
                            <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium" style={{ background: "#EDE9F8", color: "#3D2F6B" }}>
                              <Zap className="w-3 h-3" />
                              <span className="max-w-[100px] truncate">{a.name}</span>
                              <button
                                onClick={() => set({ dayActivities: { ...data.dayActivities, [day.dayNumber]: data.dayActivities[day.dayNumber].filter(id => id !== a.id) } })}
                                className="hover:text-destructive"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}

                          <button
                            onClick={() => {
                              if (isActOpen) { activityAssignment.close(); return; }
                              hotelAssignment.close();
                              activityAssignment.open(day.dayNumber);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border border-dashed transition-colors hover:bg-muted"
                            style={{ borderColor: "#E5D4BF", color: "#9C7A58" }}
                          >
                            <Plus className="w-2.5 h-2.5" /> Actividad
                          </button>
                        </div>

                        {/* Inline Hotel Search/Create */}
                        {isHotelOpen && (
                          <HotelInlineCreatePanel
                            dayNumber={day.dayNumber}
                            showCatalogPicker
                            catalog={hotels ?? []}
                            catalogSearchQ={hotelAssignment.catalogSearchQ}
                            onCatalogSearchQChange={hotelAssignment.setCatalogSearchQ}
                            onPickExisting={hotelId => { set({ dayHotels: { ...data.dayHotels, [day.dayNumber]: String(hotelId) } }); hotelAssignment.close(); }}
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

                        {/* Inline Activity Search/Create */}
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
                            className="h-6 text-[10px] w-36 border-dashed"
                          />
                          <div className="flex-1 h-px" style={{ background: "#ECD5B8" }} />
                        </div>
                      )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-5 rounded-[12px] border border-border space-y-3" style={{ background: "#FAF2EB" }}>
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>Resumen final</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium" style={{ color: "#2D1F0E" }}>{data.tripName || "—"}</span>
                <span className="text-muted-foreground">Salida</span>
                <span style={{ color: "#2D1F0E" }}>{data.startDate || "—"}</span>
                <span className="text-muted-foreground">Regreso</span>
                <span style={{ color: "#2D1F0E" }}>{data.endDate || "—"}</span>
                {hasDays && (
                  <>
                    <span className="text-muted-foreground">Itinerario</span>
                    <span style={{ color: "#2D1F0E" }}>{days.length} días extraídos</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );

    }
  };

  // ── canProceed ─────────────────────────────────────────────────────────────
  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!data.origin;
      case 2:
        if (data.origin === "photo") return false;
        if (data.newMode === "scratch") return !!data.scratchName && !!data.scratchNumDays;
        if (data.newMode === "pdf") return !!data.parsedItinerary;
        return false;
      case 3: return !!data.tripName && !!data.startDate;
      case 4: return true;
      default: return true;
    }
  };

  const isLastStep = step === 4;
  const isJoinStep = step === 2 && data.origin === "photo";

  return (
    <div className="p-6 max-w-2xl">
      {pendingClaim && (
        <TripCountryClaimModal
          tripId={pendingClaim.tripId}
          onDone={() => { const to = pendingClaim.navigateTo; setPendingClaim(null); navigate(to); }}
        />
      )}

      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate("/traveler")} className="text-[12px] text-muted-foreground hover:text-foreground">
          ← Volver a mis viajes
        </button>
      </div>

      <h1 className="text-xl font-medium mb-1" style={{ color: "#2D1F0E" }}>Nuevo viaje</h1>
      <p className="text-sm text-muted-foreground mb-6">Únete a un viaje existente o crea el tuyo propio.</p>

      <div className="bg-card border border-border rounded-[14px] shadow-sm p-6">
        <WizardStepper
          labels={STEP_LABELS}
          current={step}
          collapseFrom={joinMode ? 2 : undefined}
          collapseLabel={data.origin === "photo" ? "Foto" : "Unirse"}
        />

        <div className="min-h-[260px]">
          {renderStep()}
        </div>

        {!isJoinStep && (
          <div className="flex items-center justify-between pt-5 mt-5 border-t border-border">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors disabled:opacity-30"
              style={{ borderColor: "#E5D4BF", color: "#7A5C3A" }}
            >
              ← Anterior
            </button>
            <div className="flex items-center gap-2">
              {!isLastStep && (
                <button
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className="px-5 py-2 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: "#C4793A", color: "#FAF2EB" }}
                  onMouseOver={e => { if (canProceed()) (e.currentTarget as HTMLButtonElement).style.background = "#8B4420"; }}
                  onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.background = "#C4793A"}
                >
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {isLastStep && (
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !data.tripName || !data.startDate}
                  className="px-5 py-2 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: "#C4793A", color: "#FAF2EB" }}
                >
                  {isCreating ? "Creando viaje…" : "Crear viaje"}
                  {!isCreating && <Check className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        )}

        {isJoinStep && (
          <div className="pt-5 mt-5 border-t border-border flex justify-start">
            <button
              onClick={prevStep}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors"
              style={{ borderColor: "#E5D4BF", color: "#7A5C3A" }}
            >
              ← Anterior
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
