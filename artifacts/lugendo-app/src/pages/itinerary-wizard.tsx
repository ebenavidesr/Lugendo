import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Check, Upload, FileText, X, ChevronRight, Plus, Search, Hotel, Zap, Loader2, Sparkles,
} from "lucide-react";
import {
  useCreateItinerary,
  useCreateItineraryDay,
  useListHotels,
  useListActivities,
  useCreateActivity,
  useCreateHotel,
  useAddDayActivity,
  useParseItineraryPdf,
  useSuggestDayDescription,
} from "@workspace/api-client-react";
import type { ParsedItinerary, ParsedDay } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { CountrySelectSmall } from "@/components/country-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAutoDescription } from "@/hooks/use-auto-description";

// ── Types ─────────────────────────────────────────────────────────────────────

type NewMode = "scratch" | "pdf";
type Step = 1 | 2 | 3 | 4;

interface WizardData {
  mode: NewMode | null;
  name: string;
  numDays: string;
  countries: string;
  difficulty: string;
  description: string;
  recommendedMonths: string;
  priceRange: string;
  tags: string;
  parsedItinerary: ParsedItinerary | null;
  dayHotels: Record<number, string>;
  dayActivities: Record<number, number[]>;
  dayDescriptions: Record<number, string>;
}

const STEP_LABELS = ["Modo", "Datos base", "Días", "Crear"];
const STEP_ICONS = [Upload, FileText, Hotel, Check];

// ── Stepper ───────────────────────────────────────────────────────────────────

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
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0"
                style={{
                  background: done ? "#C4793A" : active ? "#3D2F6B" : "#ECD5B8",
                  color: done || active ? "white" : "#9C7A58",
                }}>
                {done ? <Check className="w-3.5 h-3.5" /> : num}
              </div>
              <div
                className="text-[10px] mt-1 text-center whitespace-nowrap"
                style={{ color: active ? "#2D1F0E" : "#9C7A58", fontWeight: active ? 500 : 400 }}>
                {label}
              </div>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className="flex-1 h-[2px] mt-3.5 mx-1"
                style={{ background: done ? "#C4793A" : "#ECD5B8" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ItineraryWizard() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>({
    mode: null,
    name: "", numDays: "", countries: "", difficulty: "", description: "",
    recommendedMonths: "", priceRange: "", tags: "",
    parsedItinerary: null,
    dayHotels: {}, dayActivities: {}, dayDescriptions: {},
  });
  const [aiSuggestingDay, setAiSuggestingDay] = useState<number | null>(null);
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
  const [newActivityForm, setNewActivityForm] = useState({ name: "", category: "", city: "" });
  const [creatingActivity, setCreatingActivity] = useState(false);

  const { data: hotels } = useListHotels();
  const { data: activities } = useListActivities();
  const { mutateAsync: suggestDay } = useSuggestDayDescription();
  const { isLoading: descLoading, trigger: triggerDesc } = useAutoDescription("destination");

  useEffect(() => {
    if (data.name && data.countries) {
      triggerDesc(`${data.name} ${data.countries}`, data.description, desc => set({ description: desc }));
    }
  }, [data.name, data.countries]);
  const parsePdf = useParseItineraryPdf();
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();
  const createHotel = useCreateHotel();
  const createActivity = useCreateActivity();
  const addDayActivity = useAddDayActivity();

  const set = (partial: Partial<WizardData>) => setData(d => ({ ...d, ...partial }));

  // Computed days list
  const getDays = (): ParsedDay[] => {
    if (data.mode === "pdf" && data.parsedItinerary) return data.parsedItinerary.days;
    if (data.mode === "scratch" && data.numDays) {
      const n = parseInt(data.numDays);
      if (!isNaN(n) && n > 0) {
        return Array.from({ length: n }, (_, i) => ({
          dayNumber: i + 1,
          cityFrom: null, cityTo: null, transport: null, description: null, activities: [],
        }));
      }
    }
    return [];
  };

  const days = getDays();

  const nextStep = () => setStep(s => Math.min(s + 1, 4) as Step);
  const prevStep = () => setStep(s => Math.max(s - 1, 1) as Step);

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          name: result.name,
          numDays: String(result.numDays),
          countries: result.countries?.join(", ") ?? "",
          description: result.description ?? "",
        });
        toast({ title: `Itinerario extraído: ${result.numDays} días detectados` });
      } catch {
        toast({ variant: "destructive", title: "No se pudo analizar el archivo. Intenta con un PDF de texto o .txt" });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(pdfFile);
  };

  // ── Hotel lookup ──────────────────────────────────────────────────────────
  const handleHotelLookup = async () => {
    if (!hotelSearchQ.trim()) return;
    setHotelLookupLoading(true);
    setHotelSearchDone(false);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(hotelSearchQ)}`, { credentials: "include" });
      if (res.ok) setHotelLookupResults(await res.json());
      else toast({ variant: "destructive", title: "Error al buscar hoteles" });
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
      const hotel = await createHotel.mutateAsync({
        data: {
          name: newHotelForm.name, city: newHotelForm.city, country: newHotelForm.country,
          ...(newHotelForm.address ? { address: newHotelForm.address } : {}),
          ...(newHotelForm.phone ? { phone: newHotelForm.phone } : {}),
          ...(newHotelForm.website ? { website: newHotelForm.website } : {}),
        },
      });
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

  // ── Activity creation ─────────────────────────────────────────────────────
  const handleCreateActivity = async (dayNum: number) => {
    if (!newActivityForm.name) return;
    setCreatingActivity(true);
    try {
      const act = await createActivity.mutateAsync({
        data: {
          name: newActivityForm.name,
          ...(newActivityForm.city ? { city: newActivityForm.city } : {}),
          ...(newActivityForm.category && newActivityForm.category !== "none"
            ? { category: newActivityForm.category as "cultural" | "gastronomic" | "adventure" | "nature" | "beach" | "city" | "excursion" | "other" }
            : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      set({ dayActivities: { ...data.dayActivities, [dayNum]: [...(data.dayActivities[dayNum] ?? []), act.id] } });
      setNewActivityMode(false);
      setNewActivityForm({ name: "", category: "", city: "" });
      toast({ title: `Actividad "${act.name}" creada` });
    } catch {
      toast({ variant: "destructive", title: "Error al crear la actividad" });
    } finally {
      setCreatingActivity(false);
    }
  };

  // ── AI suggest day description ────────────────────────────────────────────
  const handleSuggestDayDescription = async (day: { dayNumber: number; cityFrom?: string | null; cityTo?: string | null }) => {
    setAiSuggestingDay(day.dayNumber);
    try {
      const dayActs = (data.dayActivities[day.dayNumber] ?? [])
        .map(id => activities?.find(a => a.id === id)?.name)
        .filter(Boolean) as string[];
      const result = await suggestDay({
        data: {
          dayNumber: day.dayNumber,
          ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
          ...(day.cityTo ? { cityTo: day.cityTo } : {}),
          ...(dayActs.length ? { activities: dayActs } : {}),
        },
      });
      set({ dayDescriptions: { ...data.dayDescriptions, [day.dayNumber]: result.description } });
    } catch {
      toast({ variant: "destructive", title: "Error al generar la descripción. Inténtalo de nuevo." });
    } finally {
      setAiSuggestingDay(null);
    }
  };

  // ── Final creation ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!data.name || !data.numDays) {
      toast({ variant: "destructive", title: "Nombre y número de días son obligatorios" });
      return;
    }
    setIsCreating(true);
    try {
      const countries = data.countries ? data.countries.split(",").map(c => c.trim()).filter(Boolean) : [];
      const tags = data.tags ? data.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      const recommendedMonths = data.recommendedMonths ? data.recommendedMonths.split(",").map(m => m.trim()).filter(Boolean) : [];
      const numDays = parseInt(data.numDays);

      const itin = await createItinerary.mutateAsync({
        data: {
          name: data.name,
          numDays,
          ...(countries.length ? { countries } : {}),
          ...(data.difficulty && data.difficulty !== "none" ? { difficulty: data.difficulty as "easy" | "moderate" | "demanding" } : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(recommendedMonths.length ? { recommendedMonths } : {}),
          ...(data.priceRange && data.priceRange !== "none" ? { priceRange: data.priceRange } : {}),
          ...(tags.length ? { tags } : {}),
        },
      });

      // Create days
      const sourceDays = data.mode === "pdf" && data.parsedItinerary
        ? data.parsedItinerary.days
        : Array.from({ length: numDays }, (_, i) => ({
            dayNumber: i + 1,
            cityFrom: null, cityTo: null, transport: null, description: null,
          }));

      const createdDayMap: Record<number, number> = {};
      for (const day of sourceDays) {
        const hotelId = data.dayHotels[day.dayNumber] ? parseInt(data.dayHotels[day.dayNumber]) : undefined;
        const wizardDesc = data.dayDescriptions[day.dayNumber];
        const created = await createDay.mutateAsync({
          itineraryId: itin.id,
          data: {
            dayNumber: day.dayNumber,
            ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
            ...(day.cityTo ? { cityTo: day.cityTo } : {}),
            ...(day.transport ? { transport: day.transport } : {}),
            ...(wizardDesc ? { description: wizardDesc } : day.description ? { description: day.description } : {}),
            ...(hotelId ? { hotelId } : {}),
          },
        });
        createdDayMap[day.dayNumber] = created.id;
      }

      // Link activities
      for (const [dayNumStr, actIds] of Object.entries(data.dayActivities)) {
        const dayNum = parseInt(dayNumStr);
        const dayId = createdDayMap[dayNum];
        if (!dayId || !actIds.length) continue;
        for (const actId of actIds) {
          await addDayActivity.mutateAsync({ itineraryId: itin.id, dayId, data: { activityId: actId } });
        }
      }

      qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
      toast({ title: `Itinerario "${itin.name}" creado con ${sourceDays.length} días` });
      navigate(`/itineraries/${itin.id}`);
    } catch {
      toast({ variant: "destructive", title: "Error al crear el itinerario" });
      setIsCreating(false);
    }
  };

  // ── canProceed ────────────────────────────────────────────────────────────
  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!data.mode;
      case 2:
        if (data.mode === "scratch") return !!data.name && !!data.numDays;
        if (data.mode === "pdf") return !!data.parsedItinerary;
        return false;
      case 3: return true;
      case 4: return true;
      default: return true;
    }
  };

  // ── Step renderer ─────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // ── STEP 1: Modo ────────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>¿Cómo quieres crear el itinerario?</h2>
              <p className="text-[13px] text-muted-foreground">Rellena los datos manualmente o extráelos desde un archivo.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => set({ mode: "scratch" })}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{ borderColor: data.mode === "scratch" ? "#3D2F6B" : "#E5D4BF", background: data.mode === "scratch" ? "#EAE6F5" : "white" }}>
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#EAE6F5" }}>
                  <FileText className="w-5 h-5" style={{ color: "#3D2F6B" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Desde cero</div>
                <div className="text-[12px] text-muted-foreground">Rellena los campos manualmente y define los días a tu ritmo.</div>
              </button>
              <button
                onClick={() => set({ mode: "pdf" })}
                className="p-5 rounded-[14px] border-2 text-left transition-all hover:shadow-md"
                style={{ borderColor: data.mode === "pdf" ? "#C4793A" : "#E5D4BF", background: data.mode === "pdf" ? "#FAEEE4" : "white" }}>
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: "#FAEEE4" }}>
                  <Upload className="w-5 h-5" style={{ color: "#C4793A" }} />
                </div>
                <div className="text-[14px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Desde archivo</div>
                <div className="text-[12px] text-muted-foreground">PDF, Word o texto — la IA extrae automáticamente nombre, días y ciudades.</div>
              </button>
            </div>
          </div>
        );

      // ── STEP 2: Datos base ──────────────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>
                {data.mode === "pdf" ? "Subir archivo" : "Datos del itinerario"}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {data.mode === "pdf"
                  ? "Sube el programa y la IA rellenará los campos automáticamente."
                  : "Define el nombre, duración y características del itinerario."}
              </p>
            </div>

            {/* PDF upload block */}
            {data.mode === "pdf" && (
              <div className="space-y-3">
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx,.md" className="hidden" onChange={handleFileChange} />
                {!pdfFile ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
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
                  <button
                    onClick={handleParsePdf}
                    disabled={isParsing}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-medium transition-colors flex items-center justify-center gap-2"
                    style={{ background: "#C4793A", color: "#FAF2EB", opacity: isParsing ? 0.7 : 1 }}>
                    {isParsing && <Loader2 className="w-4 h-4 animate-spin" />}
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
                    {data.parsedItinerary.days.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#B2D9C3] max-h-32 overflow-y-auto space-y-0.5">
                        {data.parsedItinerary.days.map(d => (
                          <div key={d.dayNumber} className="flex items-baseline gap-2 text-[11px] min-w-0">
                            <span className="shrink-0 font-medium w-10" style={{ color: "#2E7D5A" }}>Día {d.dayNumber}</span>
                            <span className="text-muted-foreground truncate min-w-0">
                              {[d.cityFrom, d.cityTo].filter(Boolean).join(" → ")}
                              {d.description ? ` — ${d.description.slice(0, 60)}${d.description.length > 60 ? "…" : ""}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Editable metadata (always shown, pre-filled from PDF if parsed) */}
            {(data.mode === "scratch" || data.parsedItinerary) && (
              <div className={`space-y-3 ${data.mode === "pdf" ? "pt-3 border-t border-border" : ""}`}>
                {data.mode === "pdf" && (
                  <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
                    Revisa y ajusta los datos extraídos
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Nombre del itinerario *</label>
                    <Input
                      placeholder="Marruecos Imperial"
                      value={data.name}
                      onChange={e => set({ name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Número de días *</label>
                    <Input
                      type="number"
                      placeholder="8"
                      value={data.numDays}
                      onChange={e => set({ numDays: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Países (separados por coma)</label>
                    <Input placeholder="Marruecos, España" value={data.countries} onChange={e => set({ countries: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Dificultad</label>
                    <Select value={data.difficulty || "none"} onValueChange={v => set({ difficulty: v })}>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>Descripción</label>
                    {descLoading && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "#3D2F6B" }}>
                        <Loader2 className="w-3 h-3 animate-spin" /> Generando…
                      </span>
                    )}
                  </div>
                  <Textarea
                    placeholder="Un recorrido por las ciudades imperiales de Marruecos…"
                    rows={2}
                    value={data.description}
                    onChange={e => set({ description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Meses recomendados</label>
                    <Input placeholder="Marzo, Abril, Octubre" value={data.recommendedMonths}
                      onChange={e => set({ recommendedMonths: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Rango de precio</label>
                    <Select value={data.priceRange || "none"} onValueChange={v => set({ priceRange: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin definir</SelectItem>
                        <SelectItem value="budget">Económico</SelectItem>
                        <SelectItem value="mid">Medio</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="luxury">Lujo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-[12px] font-medium block mb-1" style={{ color: "#2D1F0E" }}>Etiquetas (separadas por coma)</label>
                  <Input placeholder="cultural, gastronomía, familia" value={data.tags}
                    onChange={e => set({ tags: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        );

      // ── STEP 3: Días ────────────────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-3">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Hoteles y actividades por día</h2>
              <p className="text-[13px] text-muted-foreground">Opcional — puedes completarlo después desde el detalle del itinerario.</p>
            </div>

            {days.length === 0 ? (
              <div className="p-6 rounded-[12px] border border-border text-center" style={{ background: "#FAF2EB" }}>
                <Hotel className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-[13px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Sin días definidos</div>
                <div className="text-[12px] text-muted-foreground">Vuelve al paso anterior y especifica el número de días.</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {days.map(day => {
                  const isHotelOpen = inlineHotelDay === day.dayNumber;
                  const isActOpen = inlineActivityDay === day.dayNumber;
                  const assignedHotel = data.dayHotels[day.dayNumber];
                  const dayActs = (data.dayActivities[day.dayNumber] ?? [])
                    .map(id => activities?.find(a => a.id === id))
                    .filter((a): a is NonNullable<typeof a> => Boolean(a));

                  return (
                    <div key={day.dayNumber} className="rounded-[12px] border border-border overflow-hidden" style={{ background: "white" }}>
                      {/* Header */}
                      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                        <div
                          className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                          style={{ background: "#FAEEE4", color: "#C4793A" }}>
                          {day.dayNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                            {day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                          </div>
                          {(day.cityFrom && day.cityTo && day.cityFrom !== day.cityTo) && (
                            <div className="text-[11px]" style={{ color: "#9C7A58" }}>{day.cityFrom} → {day.cityTo}</div>
                          )}
                        </div>
                      </div>

                      {/* Hotel row */}
                      <div className="px-3 pb-2 flex items-center gap-2 border-t border-border/50 pt-2">
                        <Hotel className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#9C7A58" }} />
                        <div className="flex-1 min-w-0">
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
                        </div>
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
                      </div>

                      {/* AI Description row */}
                      <div className="px-3 pb-2 border-t border-border/50 pt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Descripción del día</span>
                          <button
                            className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors"
                            style={{ background: "#EDE9F8", color: "#3D2F6B", opacity: aiSuggestingDay === day.dayNumber ? 0.7 : 1 }}
                            disabled={aiSuggestingDay === day.dayNumber}
                            onClick={() => handleSuggestDayDescription(day)}>
                            {aiSuggestingDay === day.dayNumber
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Sparkles className="w-3 h-3" />}
                            {aiSuggestingDay === day.dayNumber ? "Generando…" : "✨ Sugerir"}
                          </button>
                        </div>
                        <Textarea
                          placeholder="Descripción opcional del día…"
                          rows={2}
                          className="text-[12px] resize-none"
                          value={data.dayDescriptions[day.dayNumber] ?? ""}
                          onChange={e => set({ dayDescriptions: { ...data.dayDescriptions, [day.dayNumber]: e.target.value } })}
                        />
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
                                onClick={() => set({
                                  dayActivities: {
                                    ...data.dayActivities,
                                    [day.dayNumber]: (data.dayActivities[day.dayNumber] ?? []).filter(id => id !== a.id),
                                  },
                                })}
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

                      {/* Inline hotel creation panel */}
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
                              Sin resultados — rellena el formulario manualmente
                            </div>
                          )}
                          {hotelLookupResults.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px]" style={{ color: "#9C7A58" }}>Selecciona para pre-rellenar:</div>
                              {hotelLookupResults.map((r, i) => (
                                <button key={i}
                                  onClick={() => setNewHotelForm({ name: r.name, city: r.city, country: r.country, address: r.address, phone: r.phone, website: r.website })}
                                  className="w-full text-left p-2 rounded-[8px] border border-border hover:border-[#C4793A] text-[12px] transition-colors">
                                  <div className="font-medium" style={{ color: "#2D1F0E" }}>{r.name}</div>
                                  <div style={{ color: "#9C7A58" }}>{r.city}{r.country ? `, ${r.country}` : ""}</div>
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="space-y-2 pt-2 border-t border-border">
                            <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Datos del hotel</div>
                            <div className="grid grid-cols-3 gap-2">
                              <Input placeholder="Nombre *" value={newHotelForm.name}
                                onChange={e => setNewHotelForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-[12px] col-span-3" />
                              <Input placeholder="Ciudad *" value={newHotelForm.city}
                                onChange={e => setNewHotelForm(f => ({ ...f, city: e.target.value }))} className="h-7 text-[12px]" />
                              <CountrySelectSmall value={newHotelForm.country} onChange={v => setNewHotelForm(f => ({ ...f, country: v }))} placeholder="País *" />
                              <Input placeholder="Teléfono" value={newHotelForm.phone}
                                onChange={e => setNewHotelForm(f => ({ ...f, phone: e.target.value }))} className="h-7 text-[12px]" />
                              <Input placeholder="Dirección" value={newHotelForm.address}
                                onChange={e => setNewHotelForm(f => ({ ...f, address: e.target.value }))} className="h-7 text-[12px] col-span-2" />
                              <Input placeholder="Web" value={newHotelForm.website}
                                onChange={e => setNewHotelForm(f => ({ ...f, website: e.target.value }))} className="h-7 text-[12px] col-span-3" />
                            </div>
                            <div className="flex justify-end">
                              <Button type="button" size="sm" className="h-7 text-[11px]"
                                style={{ background: "#C4793A", color: "white" }}
                                disabled={!newHotelForm.name || !newHotelForm.city || !newHotelForm.country || creatingHotel}
                                onClick={() => handleCreateHotel(day.dayNumber)}>
                                {creatingHotel ? "Guardando…" : "Guardar hotel"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Inline activity picker panel */}
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
                            <button
                              className="w-full text-[11px] font-medium py-1 rounded-[6px] flex items-center justify-center gap-1 transition-colors"
                              style={{ color: "#3D2F6B", background: "#EDE9F8" }}
                              onClick={() => setNewActivityMode(true)}>
                              <Plus className="w-3 h-3" /> Nueva actividad
                            </button>
                          ) : (
                            <div className="space-y-2 pt-2 border-t border-border">
                              <div className="text-[11px] font-medium" style={{ color: "#9C7A58" }}>Nueva actividad</div>
                              <Input placeholder="Nombre *" value={newActivityForm.name}
                                onChange={e => setNewActivityForm(f => ({ ...f, name: e.target.value }))} className="h-7 text-[12px]" />
                              <div className="grid grid-cols-2 gap-2">
                                <Input placeholder="Ciudad" value={newActivityForm.city}
                                  onChange={e => setNewActivityForm(f => ({ ...f, city: e.target.value }))} className="h-7 text-[12px]" />
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
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                                  onClick={() => { setNewActivityMode(false); setNewActivityForm({ name: "", category: "", city: "" }); }}>
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
                  );
                })}
              </div>
            )}
          </div>
        );

      // ── STEP 4: Crear ───────────────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-[17px] font-medium mb-1" style={{ color: "#2D1F0E" }}>Listo para crear</h2>
              <p className="text-[13px] text-muted-foreground">Revisa el resumen y confirma la creación del itinerario.</p>
            </div>
            <div className="p-5 rounded-[14px] border border-border space-y-2" style={{ background: "#FAF2EB" }}>
              <div className="text-[11px] font-medium uppercase tracking-wide mb-3" style={{ color: "#9C7A58" }}>Resumen del itinerario</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium" style={{ color: "#2D1F0E" }}>{data.name || "—"}</span>
                <span className="text-muted-foreground">Días</span>
                <span style={{ color: "#2D1F0E" }}>{data.numDays || "—"}</span>
                <span className="text-muted-foreground">Países</span>
                <span style={{ color: "#2D1F0E" }}>{data.countries || "—"}</span>
                {data.difficulty && data.difficulty !== "none" && (
                  <>
                    <span className="text-muted-foreground">Dificultad</span>
                    <span style={{ color: "#2D1F0E" }}>
                      {{ easy: "Fácil", moderate: "Moderado", demanding: "Exigente" }[data.difficulty] ?? data.difficulty}
                    </span>
                  </>
                )}
                {data.description && (
                  <>
                    <span className="text-muted-foreground">Descripción</span>
                    <span className="text-[12px]" style={{ color: "#2D1F0E" }}>{data.description.slice(0, 80)}{data.description.length > 80 ? "…" : ""}</span>
                  </>
                )}
                <span className="text-muted-foreground">Origen</span>
                <span style={{ color: "#2D1F0E" }}>{data.mode === "pdf" ? "Desde archivo PDF" : "Desde cero"}</span>
              </div>

              {/* Days with hotels/activities assigned */}
              {days.length > 0 && (Object.keys(data.dayHotels).length > 0 || Object.keys(data.dayActivities).length > 0) && (
                <div className="pt-3 mt-1 border-t border-[#E5D4BF]">
                  <div className="text-[11px] font-medium mb-1.5" style={{ color: "#9C7A58" }}>Días configurados</div>
                  <div className="space-y-0.5">
                    {days.map(day => {
                      const hotelId = data.dayHotels[day.dayNumber];
                      const hotel = hotelId ? hotels?.find(h => String(h.id) === hotelId) : null;
                      const actIds = data.dayActivities[day.dayNumber] ?? [];
                      if (!hotel && !actIds.length) return null;
                      return (
                        <div key={day.dayNumber} className="flex items-baseline gap-2 text-[12px]">
                          <span className="w-12 shrink-0 font-medium" style={{ color: "#C4793A" }}>Día {day.dayNumber}</span>
                          <span style={{ color: "#2D1F0E" }}>
                            {hotel ? `🏨 ${hotel.name}` : ""}
                            {hotel && actIds.length ? " · " : ""}
                            {actIds.length ? `⚡ ${actIds.length} actividad${actIds.length > 1 ? "es" : ""}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  // ── Shell ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate("/itineraries")} className="text-[12px] text-muted-foreground hover:text-foreground">
          ← Volver a itinerarios
        </button>
      </div>

      <h1 className="text-xl font-medium mb-1" style={{ color: "#2D1F0E" }}>Nuevo itinerario</h1>
      <p className="text-sm text-muted-foreground mb-6">Sigue los pasos para crear la plantilla de ruta.</p>

      <div className="bg-card border border-border rounded-[14px] shadow-sm p-6">
        <Stepper step={step} />

        <div className="min-h-[260px]">
          {renderStep()}
        </div>

        <div className="flex items-center justify-between pt-5 mt-5 border-t border-border">
          <button
            onClick={prevStep}
            disabled={step === 1}
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
                disabled={isCreating || !data.name || !data.numDays}
                className="px-5 py-2 rounded-[8px] text-[13px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isCreating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Creando itinerario…</>
                ) : (
                  <>Crear itinerario <Check className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
