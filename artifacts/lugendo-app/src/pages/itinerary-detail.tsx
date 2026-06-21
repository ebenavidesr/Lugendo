import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Trash2, MapPin, ChevronDown, ChevronRight, X, FileUp, Check, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetItinerary,
  useListItineraryDays,
  useCreateItineraryDay,
  useDeleteItineraryDay,
  useUpdateItineraryDay,
  useListHotels,
  useParseItineraryPdf,
  useUpdateItinerary,
} from "@workspace/api-client-react";
import { DayActivitiesPanel } from "@/components/day-activities-panel";
import { DayHotelPanel } from "@/components/day-hotel-panel";
import type { GenericDay } from "@/components/day-hotel-panel";
import { TransportSelect, TransportLabel } from "@/components/transport-select";
import { CountrySelect } from "@/components/country-select";
import type { ParsedItinerary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ItineraryDay } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const daySchema = z.object({
  dayNumber: z.string().min(1),
  cityFrom: z.string().optional(),
  cityTo: z.string().optional(),
  country: z.string().optional(),
  transport: z.string().optional(),
  description: z.string().optional(),
});

const diffLabel: Record<string, string> = {
  easy: "Fácil",
  moderate: "Moderado",
  demanding: "Exigente",
};


// ── Edit Day Dialog ──────────────────────────────────────────────────────────
function EditDayDialog({
  itineraryId,
  day,
  open,
  onClose,
  allDays,
}: {
  itineraryId: number;
  day: ItineraryDay;
  open: boolean;
  onClose: () => void;
  allDays?: GenericDay[];
}) {
  const updateDay = useUpdateItineraryDay();
  const { data: hotels } = useListHotels();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof daySchema>>({
    resolver: zodResolver(daySchema),
    values: {
      dayNumber: String(day.dayNumber),
      cityFrom: day.cityFrom ?? "",
      cityTo: day.cityTo ?? "",
      country: day.country ?? "",
      transport: day.transport ?? "",
      description: day.description ?? "",
    },
  });

  const onSubmit = (values: z.infer<typeof daySchema>) => {
    updateDay.mutate({
      itineraryId,
      dayId: day.id,
      data: {
        ...(values.cityFrom ? { cityFrom: values.cityFrom } : {}),
        ...(values.cityTo ? { cityTo: values.cityTo } : {}),
        ...(values.country ? { country: values.country } : {}),
        ...(values.transport ? { transport: values.transport as import("@workspace/api-client-react").TransportMode } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
        toast({ title: "Día actualizado" });
        onClose();
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar el día" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar día {day.dayNumber}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField control={form.control} name="dayNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Número de día</FormLabel>
                <FormControl><Input type="number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="cityFrom" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad origen</FormLabel>
                  <FormControl><Input placeholder="Casablanca" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cityTo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad destino</FormLabel>
                  <FormControl><Input placeholder="Fez" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="country" render={({ field }) => (
              <FormItem>
                <FormLabel>País</FormLabel>
                <FormControl>
                  <CountrySelect value={field.value} onChange={field.onChange} placeholder="Seleccionar país del día…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="transport" render={({ field }) => (
              <FormItem>
                <FormLabel>Transporte</FormLabel>
                <FormControl>
                  <TransportSelect value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DayHotelPanel entityType="itinerary" entityId={itineraryId} day={day} compact allDays={allDays} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea placeholder="Actividades y puntos de interés del día…" rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="pt-2 border-t border-border/60">
              <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#9C7A58" }}>
                Actividades del día
              </p>
              <DayActivitiesPanel entityType="itinerary" entityId={itineraryId} dayId={day.id} compact day={day} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={updateDay.isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {updateDay.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── PDF Fill Dialog ───────────────────────────────────────────────────────────
function PdfFillDialog({
  itineraryId,
  existingDaysCount,
  onClose,
}: {
  itineraryId: number;
  existingDaysCount: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsePdf = useParseItineraryPdf();
  const createDay = useCreateItineraryDay();
  const updateItinerary = useUpdateItinerary();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedItinerary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [updateMeta, setUpdateMeta] = useState(true);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setParsed(null); }
  };

  const handleParse = async () => {
    if (!file) return;
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const result = await parsePdf.mutateAsync({ data: { fileBase64: base64, fileName: file.name } });
        setParsed(result);
        toast({ title: `Extraídos ${result.numDays} días del archivo` });
      } catch {
        toast({ variant: "destructive", title: "No se pudo analizar el archivo. Prueba con un PDF de texto o .txt" });
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setIsImporting(true);
    try {
      if (updateMeta) {
        await updateItinerary.mutateAsync({
          itineraryId,
          data: {
            name: parsed.name,
            numDays: parsed.numDays,
            ...(parsed.countries?.length ? { countries: parsed.countries } : {}),
            ...(parsed.description ? { description: parsed.description } : {}),
          },
        });
      }
      for (const day of parsed.days) {
        await createDay.mutateAsync({
          itineraryId,
          data: {
            dayNumber: day.dayNumber,
            ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
            ...(day.cityTo ? { cityTo: day.cityTo } : {}),
            ...(day.transport ? { transport: day.transport } : {}),
            ...(day.description ? { description: day.description } : {}),
          },
        });
      }
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}`] });
      qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
      toast({ title: `${parsed.days.length} días añadidos al itinerario` });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Error al importar los días" });
      setIsImporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rellenar itinerario desde PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Sube un archivo con el programa y la IA extraerá los días, ciudades y descripciones.
            {existingDaysCount > 0 && (
              <span className="text-amber-700 font-medium"> El itinerario ya tiene {existingDaysCount} día(s) — los nuevos se añadirán al final.</span>
            )}
          </p>

          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx,.md" className="hidden" onChange={handleFile} />

          {!file ? (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full p-8 rounded-[12px] border-2 border-dashed text-center transition-all hover:bg-[#FAF2EB]"
              style={{ borderColor: "#E5D4BF" }}>
              <FileUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>Haz clic para subir un archivo</div>
              <div className="text-[11px] text-muted-foreground">PDF, TXT, DOC — máx. 10 MB</div>
            </button>
          ) : (
            <div className="p-3 rounded-[10px] border border-border flex items-center gap-3" style={{ background: "#FAF2EB" }}>
              <FileUp className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>{file.name}</div>
                <div className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => { setFile(null); setParsed(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          )}

          {file && !parsed && (
            <Button onClick={handleParse} disabled={isParsing} className="w-full"
              style={{ background: "#C4793A", color: "#FAF2EB" }}>
              {isParsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando con IA…</> : "Analizar con IA"}
            </Button>
          )}

          {parsed && (
            <div className="rounded-[12px] border border-border overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#E4F3EC" }}>
                <Check className="w-4 h-4" style={{ color: "#2E7D5A" }} />
                <span className="text-[13px] font-medium" style={{ color: "#2E7D5A" }}>
                  {parsed.days.length} días extraídos
                </span>
              </div>
              <div className="p-4 space-y-2">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={updateMeta} onChange={e => setUpdateMeta(e.target.checked)} className="accent-[#C4793A]" />
                  <span>Actualizar también el nombre y descripción del itinerario</span>
                </label>
                {updateMeta && (
                  <div className="text-[12px] text-muted-foreground pl-5">
                    Nombre: <strong>{parsed.name}</strong>
                    {parsed.countries?.length ? ` · ${parsed.countries.join(", ")}` : ""}
                  </div>
                )}
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1 border-t border-border pt-2">
                  {parsed.days.map(d => (
                    <div key={d.dayNumber} className="flex items-baseline gap-2 text-[12px]">
                      <span className="shrink-0 font-medium w-10">Día {d.dayNumber}</span>
                      <span className="text-muted-foreground truncate">
                        {[d.cityFrom, d.cityTo].filter(Boolean).join(" → ")}
                        {d.description ? ` — ${d.description.slice(0, 60)}${d.description.length > 60 ? "…" : ""}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {parsed && (
            <Button onClick={handleImport} disabled={isImporting}
              style={{ background: "#C4793A", color: "#FAF2EB" }}>
              {isImporting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando…</>
                : `Añadir ${parsed.days.length} días`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ItineraryDetail() {
  const params = useParams<{ id: string }>();
  const itineraryId = parseInt(params.id ?? "0");
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [pdfFillOpen, setPdfFillOpen] = useState(false);
  const [editDay, setEditDay] = useState<ItineraryDay | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const { data: itinerary, isLoading } = useGetItinerary(itineraryId);
  const { data: days, isLoading: daysLoading } = useListItineraryDays(itineraryId);

  useEffect(() => {
    if (days && days.length > 0) {
      setExpandedDays(prev => (prev.size > 0 ? prev : new Set([days[0].id])));
    }
  }, [days?.[0]?.id]);

  const { data: hotels } = useListHotels();
  const createDay = useCreateItineraryDay();
  const deleteDay = useDeleteItineraryDay();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof daySchema>>({
    resolver: zodResolver(daySchema),
    defaultValues: {
      dayNumber: String((days?.length ?? 0) + 1),
      cityFrom: "", cityTo: "", country: "", transport: "", description: "",
    },
  });

  const onAddDay = (values: z.infer<typeof daySchema>) => {
    createDay.mutate({
      itineraryId,
      data: {
        dayNumber: parseInt(values.dayNumber),
        ...(values.cityFrom ? { cityFrom: values.cityFrom } : {}),
        ...(values.cityTo ? { cityTo: values.cityTo } : {}),
        ...(values.country ? { country: values.country } : {}),
        ...(values.transport ? { transport: values.transport as import("@workspace/api-client-react").TransportMode } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
        toast({ title: "Día añadido" });
        setAddDayOpen(false);
        form.reset({ dayNumber: String((days?.length ?? 0) + 2) });
      },
      onError: () => toast({ variant: "destructive", title: "Error al añadir el día" }),
    });
  };

  const onDeleteDay = (dayId: number) => {
    deleteDay.mutate({ itineraryId, dayId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
        toast({ title: "Día eliminado" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar el día" }),
    });
  };

  const toggleDay = (dayId: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="p-6">
        <Link href="/itineraries" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Link>
        <p className="text-muted-foreground">Itinerario no encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/itineraries"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Todos los itinerarios
          </Link>
          <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{itinerary.name}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {itinerary.countries?.length ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" /> {itinerary.countries.join(", ")}
              </span>
            ) : null}
            <span className="text-sm text-muted-foreground">{itinerary.numDays} días</span>
            {itinerary.difficulty && (
              <span className="text-sm text-muted-foreground">{diffLabel[itinerary.difficulty] ?? itinerary.difficulty}</span>
            )}
          </div>
          {itinerary.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">{itinerary.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setPdfFillOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors"
            style={{ borderColor: "#E5D4BF", color: "#7A5C3A", background: "white" }}
            onMouseOver={e => (e.currentTarget.style.background = "#FAF2EB")}
            onMouseOut={e => (e.currentTarget.style.background = "white")}>
            <FileUp className="w-4 h-4" /> Desde PDF
          </button>
          <button
            onClick={() => {
              form.setValue("dayNumber", String((days?.length ?? 0) + 1));
              setAddDayOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium"
            style={{ background: "#C4793A", color: "#FAF2EB" }}
            onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
            onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
            <Plus className="w-4 h-4" /> Añadir día
          </button>
        </div>
      </div>

      {/* Days */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Días ({days?.length ?? 0} / {itinerary.numDays})
          </span>
          {days && days.length > 0 && (
            <button
              onClick={() => {
                if (expandedDays.size > 0) setExpandedDays(new Set());
                else setExpandedDays(new Set(days.map(d => d.id)));
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              {expandedDays.size > 0 ? "Colapsar todos" : "Expandir todos"}
            </button>
          )}
        </div>

        {daysLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando días…</div>
        ) : !days?.length ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">No hay días definidos todavía</p>
            <button
              onClick={() => setAddDayOpen(true)}
              className="text-[13px] font-medium"
              style={{ color: "#C4793A" }}>
              Añade el primer día →
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {days.map((day: ItineraryDay) => {
              const isExpanded = expandedDays.has(day.id);
              return (
                <li key={day.id} className="hover:bg-[#ECD5B8]/10 transition-colors">
                  <div className="px-5 py-3.5 flex items-start gap-4 group">
                    <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 font-medium text-[13px]"
                      style={{ background: "#FAEEE4", color: "#C4793A" }}>
                      {day.dayNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
                          {day.cityFrom && day.cityTo
                            ? `${day.cityFrom} → ${day.cityTo}`
                            : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {day.transport && (
                          <span className="text-[12px] text-muted-foreground">
                            <TransportLabel value={day.transport} />
                          </span>
                        )}
                        {day.hotels && day.hotels.length > 0 && (
                          <span className="text-[12px] text-muted-foreground">🏨 {day.hotels.map(h => h.hotelName).join(", ")}</span>
                        )}
                      </div>
                      {day.description && (
                        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{day.description}</p>
                      )}

                      {isExpanded && (
                        <>
                          <DayHotelPanel entityType="itinerary" entityId={itineraryId} day={day} allDays={days} />
                          <DayActivitiesPanel entityType="itinerary" entityId={itineraryId} dayId={day.id} />
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleDay(day.id)}
                        className="p-1.5 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={isExpanded ? "Colapsar actividades" : "Ver actividades"}>
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setEditDay(day)}
                        className="p-1.5 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        ✏️
                      </button>
                      <button
                        onClick={() => onDeleteDay(day.id)}
                        className="p-1.5 rounded-[6px] transition-colors text-muted-foreground hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add day dialog */}
      <Dialog open={addDayOpen} onOpenChange={setAddDayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir día al itinerario</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onAddDay)} className="space-y-3">
              <FormField control={form.control} name="dayNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de día</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="cityFrom" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ciudad origen</FormLabel>
                    <FormControl><Input placeholder="Casablanca" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cityTo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ciudad destino</FormLabel>
                    <FormControl><Input placeholder="Fez" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>País (opcional)</FormLabel>
                  <FormControl>
                    <CountrySelect value={field.value} onChange={field.onChange} placeholder="Seleccionar país…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="transport" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transporte (opcional)</FormLabel>
                  <FormControl>
                    <TransportSelect value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Actividades y puntos de interés del día…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDayOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createDay.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {createDay.isPending ? "Guardando…" : "Añadir día"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {editDay && (
        <EditDayDialog
          itineraryId={itineraryId}
          day={editDay}
          open={!!editDay}
          onClose={() => setEditDay(null)}
          allDays={days}
        />
      )}

      {pdfFillOpen && (
        <PdfFillDialog
          itineraryId={itineraryId}
          existingDaysCount={days?.length ?? 0}
          onClose={() => setPdfFillOpen(false)}
        />
      )}
    </div>
  );
}
