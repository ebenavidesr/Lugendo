import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Check, Upload, FileText, X, MapPin, Plane, Calendar, Settings, Hotel, Mail, ChevronRight } from "lucide-react";
import {
  useListItineraries,
  useListItineraryDays,
  useCreateItinerary,
  useCreateItineraryDay,
  useCreateTrip,
  useSendInvitations,
  useListHotels,
  useParseItineraryPdf,
} from "@workspace/api-client-react";
import type { ParsedItinerary, ParsedDay } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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
  startDate: string;
  endDate: string;
  maxCapacity: string;
  airline: string;
  flightNumber: string;
  reservationCode: string;
  tripName: string;
  emails: string;
}

const STEP_LABELS = ["Origen", "Itinerario", "Fechas", "Vuelo", "Nombre", "Hoteles", "Invitaciones"];
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
    parsedItinerary: null, dayHotels: {},
    startDate: "", endDate: "", maxCapacity: "",
    airline: "", flightNumber: "", reservationCode: "",
    tripName: "", emails: "",
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { data: itineraries } = useListItineraries();
  const { data: hotels } = useListHotels();
  const { data: existingDays } = useListItineraryDays(
    data.selectedItineraryId ?? 0
  );
  const parsePdf = useParseItineraryPdf();
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();
  const createTrip = useCreateTrip();
  const sendInvitations = useSendInvitations();

  const set = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  const selectedItinerary = itineraries?.find(i => i.id === data.selectedItineraryId);

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
        set({
          parsedItinerary: result,
          scratchName: result.name,
          scratchNumDays: String(result.numDays),
          scratchCountries: result.countries?.join(", ") ?? "",
          scratchDescription: result.description ?? "",
          tripName: result.name,
        });
        toast({ title: `Itinerario extraído: ${result.numDays} días detectados` });
      } catch {
        toast({ variant: "destructive", title: "No se pudo analizar el archivo. Intenta con un .txt o PDF de texto." });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(pdfFile);
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
          },
        });
        itineraryId = newItin.id;

        if (data.parsedItinerary?.days.length) {
          for (const day of data.parsedItinerary.days) {
            const hotelId = data.dayHotels[day.dayNumber] ? parseInt(data.dayHotels[day.dayNumber]) : undefined;
            await createDay.mutateAsync({
              itineraryId: newItin.id,
              data: {
                dayNumber: day.dayNumber,
                ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
                ...(day.cityTo ? { cityTo: day.cityTo } : {}),
                ...(day.transport ? { transport: day.transport } : {}),
                ...(day.description ? { description: day.description } : {}),
                ...(hotelId ? { hotelId } : {}),
              },
            });
          }
        }
      } else if (data.origin === "existing" && hasDays && Object.keys(data.dayHotels).length > 0) {
        for (const [dayNumStr, hotelIdStr] of Object.entries(data.dayHotels)) {
          const dayNum = parseInt(dayNumStr);
          const hotelId = parseInt(hotelIdStr);
          if (!hotelId) continue;
          const existingDay = existingDays?.find(d => d.dayNumber === dayNum);
          if (existingDay && hotelId !== existingDay.hotelId) {
            await fetch(`/api/itineraries/${itineraryId}/days/${existingDay.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ hotelId }),
            });
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
          ...(data.airline ? { airline: data.airline } : {}),
          ...(data.flightNumber ? { flightNumber: data.flightNumber } : {}),
          ...(data.reservationCode ? { reservationCode: data.reservationCode } : {}),
        },
      });

      if (data.emails.trim()) {
        const emails = data.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
        if (emails.length > 0) {
          await sendInvitations.mutateAsync({ tripId: trip.id, data: { emails } });
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
                    onClick={() => set({ selectedItineraryId: it.id, tripName: data.tripName || it.name })}
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

      // ── STEP 4: Vuelo ───────────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Información de vuelo</h2>
              <p className="text-[13px] text-muted-foreground">Datos del vuelo de salida (opcional).</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Aerolínea</label>
                <Input placeholder="Iberia" value={data.airline} onChange={e => set({ airline: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Número de vuelo</label>
                <Input placeholder="IB1234" value={data.flightNumber} onChange={e => set({ flightNumber: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Código de reserva</label>
                <Input placeholder="ABCDEF" value={data.reservationCode} onChange={e => set({ reservationCode: e.target.value })} />
              </div>
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
                {data.airline && <>
                  <span className="text-muted-foreground">Vuelo</span>
                  <span style={{ color: "#2D1F0E" }}>{data.airline} {data.flightNumber}</span>
                </>}
              </div>
            </div>
          </div>
        );

      // ── STEP 6: Hoteles ─────────────────────────────────────────────────────
      case 6:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Asignar hoteles por día</h2>
              <p className="text-[13px] text-muted-foreground">Opcional — puedes completarlo después desde el detalle del itinerario.</p>
            </div>
            {!hasDays ? (
              <div className="p-6 rounded-[12px] border border-border text-center" style={{ background: "#FAF2EB" }}>
                <Hotel className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-[13px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Sin días definidos</div>
                <div className="text-[12px] text-muted-foreground">Añade días al itinerario después de crear el viaje para asignar hoteles.</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {days.map(day => (
                  <div key={day.dayNumber} className="flex items-center gap-3 p-3 rounded-[10px] border border-border" style={{ background: "white" }}>
                    <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-[12px] font-medium"
                      style={{ background: "#FAEEE4", color: "#C4793A" }}>
                      {day.dayNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                        {day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                      </div>
                    </div>
                    <div className="w-44">
                      <Select value={data.dayHotels[day.dayNumber] ?? ""}
                        onValueChange={v => set({ dayHotels: { ...data.dayHotels, [day.dayNumber]: v } })}>
                        <SelectTrigger className="text-[12px] h-8">
                          <SelectValue placeholder="Sin hotel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sin hotel</SelectItem>
                          {hotels?.map(h => (
                            <SelectItem key={h.id} value={String(h.id)}>{h.name} · {h.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
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
