import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ArrowRight, Pencil, FileUp, Check, X, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListItineraries, useCreateItinerary, useUpdateItinerary,
  useParseItineraryPdf, useCreateItineraryDay,
} from "@workspace/api-client-react";
import type { ParsedItinerary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Itinerary, ItineraryDifficulty } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const diffBadge: Record<NonNullable<ItineraryDifficulty>, { bg: string; color: string; label: string }> = {
  easy:      { bg: "#E4F3EC", color: "#2E7D5A", label: "Fácil" },
  moderate:  { bg: "#FFF3D6", color: "#C47A00", label: "Moderado" },
  demanding: { bg: "#FDECEA", color: "#C0392B", label: "Exigente" },
};

function DiffBadge({ diff }: { diff: ItineraryDifficulty }) {
  if (!diff) return null;
  const s = diffBadge[diff];
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  numDays: z.string().min(1, "Días requerido"),
  countries: z.string().optional(),
  region: z.string().optional(),
  difficulty: z.enum(["easy", "moderate", "demanding"]).optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function ItineraryForm({
  title,
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
}: {
  title: string;
  defaultValues: FormValues;
  onSubmit: (v: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: defaultValues,
  });

  return (
    <Dialog open onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl><Input placeholder="Marruecos Imperial — 8 días" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="numDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de días</FormLabel>
                  <FormControl><Input type="number" placeholder="8" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="difficulty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Dificultad</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="easy">Fácil</SelectItem>
                      <SelectItem value="moderate">Moderado</SelectItem>
                      <SelectItem value="demanding">Exigente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="countries" render={({ field }) => (
              <FormItem>
                <FormLabel>Países (separados por coma)</FormLabel>
                <FormControl><Input placeholder="Marruecos, España" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="region" render={({ field }) => (
              <FormItem>
                <FormLabel>Región (opcional)</FormLabel>
                <FormControl><Input placeholder="Norte de África" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción (opcional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Un viaje por las ciudades imperiales de Marruecos…" rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button type="submit" disabled={isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isPending ? "Guardando…" : "Guardar itinerario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── PDF Import Dialog ─────────────────────────────────────────────────────────
function PdfImportDialog({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsePdf = useParseItineraryPdf();
  const createItinerary = useCreateItinerary();
  const createDay = useCreateItineraryDay();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedItinerary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
      const itin = await createItinerary.mutateAsync({
        data: {
          name: parsed.name,
          numDays: parsed.numDays,
          ...(parsed.countries?.length ? { countries: parsed.countries } : {}),
          ...(parsed.description ? { description: parsed.description } : {}),
        },
      });
      for (const day of parsed.days) {
        await createDay.mutateAsync({
          itineraryId: itin.id,
          data: {
            dayNumber: day.dayNumber,
            ...(day.cityFrom ? { cityFrom: day.cityFrom } : {}),
            ...(day.cityTo ? { cityTo: day.cityTo } : {}),
            ...(day.transport ? { transport: day.transport } : {}),
            ...(day.description ? { description: day.description } : {}),
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
      toast({ title: `Itinerario "${parsed.name}" creado con ${parsed.days.length} días` });
      navigate(`/itineraries/${itin.id}`);
    } catch {
      toast({ variant: "destructive", title: "Error al crear el itinerario" });
      setIsImporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear itinerario desde PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Sube un archivo con el programa del viaje y la IA extraerá automáticamente el nombre, los días, ciudades y descripciones.
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
                <span className="text-[13px] font-medium" style={{ color: "#2E7D5A" }}>Estructura extraída</span>
              </div>
              <div className="p-4 space-y-2 text-[13px]">
                <div><span className="text-muted-foreground">Nombre:</span> <span className="font-medium">{parsed.name}</span></div>
                <div><span className="text-muted-foreground">Días:</span> <span className="font-medium">{parsed.numDays}</span></div>
                {parsed.countries?.length ? (
                  <div><span className="text-muted-foreground">Países:</span> <span className="font-medium">{parsed.countries.join(", ")}</span></div>
                ) : null}
                {parsed.description && (
                  <div className="text-muted-foreground text-[12px] pt-1 border-t border-border">{parsed.description}</div>
                )}
                {parsed.days.length > 0 && (
                  <div className="pt-2 border-t border-border max-h-40 overflow-y-auto space-y-1">
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
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {parsed && (
            <Button onClick={handleImport} disabled={isImporting}
              style={{ background: "#C4793A", color: "#FAF2EB" }}>
              {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando…</> : `Crear itinerario (${parsed.days.length} días)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Itineraries() {
  const [createOpen, setCreateOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editItinerary, setEditItinerary] = useState<Itinerary | null>(null);
  const { data: itineraries, isLoading } = useListItineraries();
  const create = useCreateItinerary();
  const update = useUpdateItinerary();
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleCreate = (values: FormValues) => {
    const countries = values.countries?.trim()
      ? values.countries.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;
    create.mutate({
      data: {
        name: values.name,
        numDays: parseInt(values.numDays),
        ...(countries?.length ? { countries } : {}),
        ...(values.region ? { region: values.region } : {}),
        ...(values.difficulty ? { difficulty: values.difficulty } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        toast({ title: "Itinerario creado" });
        setCreateOpen(false);
      },
      onError: () => toast({ variant: "destructive", title: "Error al crear el itinerario" }),
    });
  };

  const handleEdit = (values: FormValues) => {
    if (!editItinerary) return;
    const countries = values.countries?.trim()
      ? values.countries.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    update.mutate({
      itineraryId: editItinerary.id,
      data: {
        name: values.name,
        numDays: parseInt(values.numDays),
        countries,
        ...(values.region ? { region: values.region } : {}),
        ...(values.difficulty ? { difficulty: values.difficulty } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/itineraries"] });
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${editItinerary.id}`] });
        toast({ title: "Itinerario actualizado" });
        setEditItinerary(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar el itinerario" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Itinerarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plantillas de ruta reutilizables en múltiples viajes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPdfOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors"
            style={{ borderColor: "#E5D4BF", color: "#7A5C3A", background: "white" }}
            onMouseOver={e => (e.currentTarget.style.background = "#FAF2EB")}
            onMouseOut={e => (e.currentTarget.style.background = "white")}>
            <FileUp className="w-4 h-4" /> Desde PDF
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
            style={{ background: "#C4793A", color: "#FAF2EB" }}
            onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
            onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
            <Plus className="w-4 h-4" /> Nuevo itinerario
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando itinerarios…</div>
        ) : !itineraries?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No hay itinerarios todavía</p>
            <button onClick={() => setCreateOpen(true)} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Crea el primer itinerario →
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", "Países", "Días", "Dificultad", "Viajes", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itineraries.map((it: Itinerary) => (
                <tr key={it.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <span className="font-medium" style={{ color: "#2D1F0E" }}>{it.name}</span>
                    {it.region && <div className="text-[11px] text-muted-foreground mt-0.5">{it.region}</div>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {it.countries?.join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{it.numDays}d</td>
                  <td className="px-5 py-3"><DiffBadge diff={it.difficulty ?? null} /></td>
                  <td className="px-5 py-3 text-muted-foreground">{it.tripCount ?? 0}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditItinerary(it)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <Link href={`/itineraries/${it.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "#C4793A" }}>
                        Ver <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pdfOpen && <PdfImportDialog onClose={() => setPdfOpen(false)} />}

      {createOpen && (
        <ItineraryForm
          title="Nuevo itinerario"
          defaultValues={{ name: "", numDays: "", countries: "", region: "", description: "" }}
          onSubmit={handleCreate}
          isPending={create.isPending}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {editItinerary && (
        <ItineraryForm
          title={`Editar: ${editItinerary.name}`}
          defaultValues={{
            name: editItinerary.name,
            numDays: String(editItinerary.numDays),
            countries: editItinerary.countries?.join(", ") ?? "",
            region: editItinerary.region ?? "",
            difficulty: editItinerary.difficulty ?? undefined,
            description: editItinerary.description ?? "",
          }}
          onSubmit={handleEdit}
          isPending={update.isPending}
          onCancel={() => setEditItinerary(null)}
        />
      )}
    </div>
  );
}
