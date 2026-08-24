import { useParams, Link, useLocation } from "wouter";
import { ArrowLeft, Trash2, MapPin, FileUp, Check, Loader2, X, BarChart3 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  useGetItinerary,
  useListItineraryDays,
  useCreateItineraryDay,
  useListHotels,
  useListActivities,
  useCreateHotel,
  useCreateActivity,
  useAddDayActivity,
  useAddItineraryDayHotel,
  useParseItineraryPdf,
  useUpdateItinerary,
  useDeleteItinerary,
  TripType,
} from "@workspace/api-client-react";
import type { ItineraryDetail as ItineraryDetailType } from "@workspace/api-client-react";
import { matchOrCreateActivityIds, matchOrCreateHotelId } from "@/lib/pdf-day-autofill";
import { DayListPanel } from "@/components/day-list-panel";
import type { ParsedItinerary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const TRIP_TYPE_OPTIONS: { value: TripType; label: string }[] = [
  { value: "adventure", label: "Aventura" },
  { value: "beach", label: "Playa" },
  { value: "cultural", label: "Cultural" },
  { value: "culinary", label: "Gastronómico" },
  { value: "nature", label: "Naturaleza" },
  { value: "city", label: "Ciudad" },
  { value: "wellness", label: "Bienestar" },
  { value: "family", label: "Familiar" },
];

// Catálogo público del itinerario (tarea #161) — visible por defecto en el buscador; el
// dueño puede desactivarlo, fijar el tipo de viaje y el precio orientativo. Vive en la
// página de detalle (no en el diálogo de edición de la lista) para que sea fácil de
// encontrar al gestionar un itinerario concreto.
function PublicCatalogCard({ itinerary, itineraryId }: { itinerary: ItineraryDetailType; itineraryId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateItinerary = useUpdateItinerary();
  const [publishedInSearch, setPublishedInSearch] = useState(itinerary.publishedInSearch ?? true);
  const [tripTypes, setTripTypes] = useState<TripType[]>(itinerary.tripTypes ?? []);
  const [priceFrom, setPriceFrom] = useState(itinerary.priceFrom != null ? String(itinerary.priceFrom) : "");

  useEffect(() => {
    setPublishedInSearch(itinerary.publishedInSearch ?? true);
    setTripTypes(itinerary.tripTypes ?? []);
    setPriceFrom(itinerary.priceFrom != null ? String(itinerary.priceFrom) : "");
  }, [itinerary.id]);

  const handleSave = () => {
    updateItinerary.mutate({
      itineraryId,
      data: { publishedInSearch, tripTypes, priceFrom: priceFrom ? parseInt(priceFrom) : null },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}`] });
        toast({ title: "Catálogo público actualizado" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al guardar" }),
    });
  };

  return (
    <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "#2D1F0E" }}>Catálogo público</p>
          <p className="text-[12px] text-muted-foreground">
            Visible en el buscador público (/buscar) para cualquier persona sin cuenta. Activado por defecto.
          </p>
        </div>
        <Switch checked={publishedInSearch} onCheckedChange={setPublishedInSearch} />
      </div>

      {publishedInSearch && (
        <>
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>
              Precio orientativo desde (€/persona, opcional)
            </label>
            <Input type="number" min={0} placeholder="890" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} className="max-w-[160px]" />
          </div>
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Tipo de viaje</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">
              {TRIP_TYPE_OPTIONS.map(opt => {
                const checked = tripTypes.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={v => setTripTypes(v ? [...tripTypes, opt.value] : tripTypes.filter(t => t !== opt.value))}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateItinerary.isPending} size="sm" style={{ background: "#C4793A", color: "#FAF2EB" }}>
          {updateItinerary.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

const diffLabel: Record<string, string> = {
  easy: "Fácil",
  moderate: "Moderado",
  demanding: "Exigente",
};

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
  const { data: hotels } = useListHotels();
  const { data: activities } = useListActivities();
  const createHotel = useCreateHotel();
  const createActivity = useCreateActivity();
  const addDayActivity = useAddDayActivity();
  const addDayHotel = useAddItineraryDayHotel();

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
      } catch (err) {
        console.error("Error parsing itinerary file", err);
        toast({ variant: "destructive", title: getApiErrorMessage(err, "No se pudo analizar el archivo. Prueba con un PDF de texto o .txt") });
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
      const currentActivities = activities ?? [];
      const currentHotels = hotels ?? [];
      const singleCountry = parsed.countries?.length === 1 ? parsed.countries[0] : undefined;
      let actCount = 0;
      let hotelCount = 0;
      for (const day of parsed.days) {
        const created = await createDay.mutateAsync({
          itineraryId,
          data: {
            dayNumber: day.dayNumber,
            ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
            ...(day.cityTo ? { cityTo: day.cityTo } : {}),
            ...(day.transport ? { transport: day.transport } : {}),
            ...(day.description ? { description: day.description } : {}),
          },
        });

        const actIds = await matchOrCreateActivityIds(day, currentActivities, args => createActivity.mutateAsync(args));
        for (const activityId of actIds) {
          await addDayActivity.mutateAsync({ itineraryId, dayId: created.id, data: { activityId } });
        }
        actCount += actIds.length;

        const hotelId = await matchOrCreateHotelId(day, currentHotels, args => createHotel.mutateAsync(args), singleCountry);
        if (hotelId) {
          const ph = day.hotel;
          await addDayHotel.mutateAsync({
            itineraryId,
            dayId: created.id,
            data: {
              hotelId: parseInt(hotelId),
              ...(ph?.guaranteed !== undefined && ph?.guaranteed !== null ? { guaranteed: ph.guaranteed } : {}),
              ...(ph?.alternatives?.length ? { alternatives: ph.alternatives } : {}),
              ...(ph?.reviewManually ? { reviewManually: ph.reviewManually } : {}),
            },
          });
          hotelCount++;
        }
      }
      if (actCount || hotelCount) {
        qc.invalidateQueries({ queryKey: ["/api/activities"] });
        qc.invalidateQueries({ queryKey: ["/api/hotels"] });
      }
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
      qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}`] });
      qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
      const extras: string[] = [];
      if (actCount) extras.push(`${actCount} actividad${actCount !== 1 ? "es" : ""}`);
      if (hotelCount) extras.push(`${hotelCount} hotel${hotelCount !== 1 ? "es" : ""}`);
      toast({ title: `${parsed.days.length} días añadidos al itinerario${extras.length ? ` · ${extras.join(" · ")}` : ""}` });
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

          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx,.md,.xlsx" className="hidden" onChange={handleFile} />

          {!file ? (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full p-8 rounded-[12px] border-2 border-dashed text-center transition-all hover:bg-[#FAF2EB]"
              style={{ borderColor: "#E5D4BF" }}>
              <FileUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-[13px] font-medium mb-0.5" style={{ color: "#2D1F0E" }}>Haz clic para subir un archivo</div>
              <div className="text-[11px] text-muted-foreground">PDF, Word, Excel o texto — máx. 10 MB</div>
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
                    <div key={d.dayNumber} className="text-[12px]">
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0 font-medium w-10">Día {d.dayNumber}</span>
                        <span className="text-muted-foreground truncate">
                          {[d.cityFrom, d.cityTo].filter(Boolean).join(" → ")}
                          {d.description ? ` — ${d.description.slice(0, 60)}${d.description.length > 60 ? "…" : ""}` : ""}
                        </span>
                      </div>
                      {(d.hotel || (d.parsedActivities?.length ?? 0) > 0) && (
                        <div className="pl-12 flex flex-wrap items-center gap-1 mt-0.5">
                          {d.hotel && (
                            <span className="px-1.5 py-0.5 rounded-[5px] text-[10px]" style={{ background: "#FAEEE4", color: "#8B4420" }}>
                              🏨 {d.hotel.name}{d.hotel.guaranteed === false ? " (o similar)" : ""}
                            </span>
                          )}
                          {d.hotel?.reviewManually && (
                            <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-medium" style={{ background: "#FDECEA", color: "#C0392B" }}>
                              ⚠ Revisar hotel
                            </span>
                          )}
                          {(d.parsedActivities?.length ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded-[5px] text-[10px]" style={{ background: "#EDE9F8", color: "#3D2F6B" }}>
                              ⚡ {d.parsedActivities!.length} actividad{d.parsedActivities!.length > 1 ? "es" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  El hotel y las actividades detectados se buscarán o crearán automáticamente en el catálogo y quedarán asignados al día. Los marcados "Revisar hotel" no se asignan solos.
                </p>
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
  const [, navigate] = useLocation();
  const [pdfFillOpen, setPdfFillOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { data: itinerary, isLoading } = useGetItinerary(itineraryId);
  const { data: days, isLoading: daysLoading } = useListItineraryDays(itineraryId);
  const { user } = useAuth();
  const { toast } = useToast();
  const canManage = user?.role === "admin" || user?.role === "manager" || user?.role === "agent" || user?.role === "advisor";
  const updateItinerary = useUpdateItinerary();
  const deleteItinerary = useDeleteItinerary();
  const qc = useQueryClient();
  const tripCount = itinerary?.tripCount ?? 0;
  const canDelete = tripCount === 0;

  const handleToggleActive = () => {
    if (!itinerary) return;
    updateItinerary.mutate({ itineraryId, data: { active: !itinerary.active } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}`] });
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        toast({ title: itinerary.active ? "Itinerario marcado como inactivo" : "Itinerario marcado como activo" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al cambiar el estado" }),
    });
  };

  const handleDelete = () => {
    deleteItinerary.mutate({ itineraryId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        toast({ title: "Itinerario eliminado" });
        navigate("/itineraries");
      },
      onError: (err) => toast({ variant: "destructive", title: getApiErrorMessage(err, "Error al eliminar el itinerario") }),
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{itinerary.name}</h1>
            {itinerary.active === false && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: "#ECD5B8", color: "#7A5C3A" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7A5C3A" }} />
                Inactivo
              </span>
            )}
          </div>
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
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManage && (
            <>
              <Link
                href={`/itineraries/${itineraryId}/stats`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors"
                style={{ borderColor: "#E5D4BF", color: "#7A5C3A", background: "white" }}
                onMouseOver={e => (e.currentTarget.style.background = "#FAF2EB")}
                onMouseOut={e => (e.currentTarget.style.background = "white")}>
                <BarChart3 className="w-4 h-4" /> Estadísticas
              </Link>
              <button
                onClick={handleToggleActive}
                disabled={updateItinerary.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors disabled:opacity-60"
                style={{ borderColor: "#E5D4BF", color: "#7A5C3A", background: "white" }}
                onMouseOver={e => (e.currentTarget.style.background = "#FAF2EB")}
                onMouseOut={e => (e.currentTarget.style.background = "white")}>
                {itinerary.active === false ? "Marcar como activo" : "Marcar como inactivo"}
              </button>
              <button
                onClick={() => canDelete && setDeleteConfirmOpen(true)}
                disabled={!canDelete}
                title={canDelete ? undefined : `No se puede borrar: tiene ${tripCount} viaje(s) vinculado(s)`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: "#F3D2CC", color: canDelete ? "#C0392B" : "#7A5C3A", background: "white" }}
                onMouseOver={e => { if (canDelete) e.currentTarget.style.background = "#FDECEA"; }}
                onMouseOut={e => (e.currentTarget.style.background = "white")}>
                <Trash2 className="w-4 h-4" /> Borrar itinerario
              </button>
            </>
          )}
        </div>
      </div>

      {itinerary.description && (
        <div className="bg-card border border-border rounded-[14px] shadow-sm p-5">
          <p className="text-sm text-muted-foreground">{itinerary.description}</p>
        </div>
      )}

      <PublicCatalogCard itinerary={itinerary} itineraryId={itineraryId} />

      <DayListPanel
        mode="itinerary"
        entityId={itineraryId}
        days={days}
        isLoading={daysLoading}
        headerLabel={`Días (${days?.length ?? 0} / ${itinerary.numDays})`}
        emptyMessage="No hay días definidos todavía."
        extraHeaderActions={
          <button
            onClick={() => setPdfFillOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
            style={{ background: "#FAEEE4", color: "#8B4420" }}
          >
            <FileUp className="w-3 h-3" />
            Desde PDF
          </button>
        }
      />

      {pdfFillOpen && (
        <PdfFillDialog
          itineraryId={itineraryId}
          existingDaysCount={days?.length ?? 0}
          onClose={() => setPdfFillOpen(false)}
        />
      )}

      {deleteConfirmOpen && (
        <Dialog open onOpenChange={v => !v && setDeleteConfirmOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Borrar itinerario</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
              ¿Seguro que quieres borrar{" "}
              <strong className="font-medium" style={{ color: "#2D1F0E" }}>"{itinerary.name}"</strong>?{" "}
              Esta acción no se puede deshacer.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteItinerary.isPending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={deleteItinerary.isPending}
                onClick={handleDelete} className="gap-1.5" style={{ background: "#C0392B", color: "white" }}>
                <Trash2 className="w-3.5 h-3.5" />
                {deleteItinerary.isPending ? "Eliminando…" : "Borrar itinerario"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
