import { useState } from "react";
import { Plus, Star, Pencil, Search, Globe } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListHotels, useCreateHotel, useUpdateHotel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hotel, HotelSegment } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const segmentBadge: Record<NonNullable<HotelSegment>, { bg: string; color: string; label: string }> = {
  basic:    { bg: "#ECD5B8", color: "#7A5C3A", label: "Básico" },
  standard: { bg: "#FAEEE4", color: "#8B4420", label: "Estándar" },
  premium:  { bg: "#EAE6F5", color: "#3D2F6B", label: "Premium" },
};

function SegmentBadge({ segment }: { segment: HotelSegment }) {
  if (!segment) return null;
  const s = segmentBadge[segment];
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function Stars({ n }: { n: number | null | undefined }) {
  if (!n) return <span className="text-muted-foreground text-[12px]">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[...Array(n)].map((_, i) => <Star key={i} className="w-3 h-3 fill-current" style={{ color: "#C4793A" }} />)}
    </span>
  );
}

const schema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  city: z.string().min(1, "Ciudad requerida"),
  country: z.string().min(1, "País requerido"),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  stars: z.string().optional(),
  segment: z.enum(["basic", "standard", "premium"]).optional(),
});

type FormValues = z.infer<typeof schema>;

type LookupResult = { name: string; city: string; country: string; address: string; phone: string; website: string };

function HotelForm({
  title,
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
  isNew = false,
}: {
  title: string;
  defaultValues: FormValues;
  onSubmit: (v: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: defaultValues,
  });
  const { toast } = useToast();

  const [lookupQ, setLookupQ] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  const handleLookup = async () => {
    if (!lookupQ.trim()) return;
    setLookupLoading(true);
    setLookupDone(false);
    setLookupResults([]);
    try {
      const res = await fetch(`/api/hotels/lookup?q=${encodeURIComponent(lookupQ)}`, { credentials: "include" });
      if (res.ok) {
        const data: LookupResult[] = await res.json();
        setLookupResults(data);
        if (data.length === 0) toast({ title: "Sin resultados", description: "Prueba con otro nombre o ciudad." });
      } else {
        toast({ variant: "destructive", title: "Error al buscar" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error de conexión" });
    } finally {
      setLookupLoading(false);
      setLookupDone(true);
    }
  };

  const applyResult = (r: LookupResult) => {
    form.reset({
      name: r.name,
      city: r.city,
      country: r.country,
      address: r.address || "",
      phone: r.phone || "",
      website: r.website || "",
      stars: form.getValues("stars"),
      segment: form.getValues("segment"),
    });
    setLookupResults([]);
    setLookupQ("");
    setLookupDone(false);
  };

  return (
    <Dialog open onOpenChange={v => !v && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* ── Web search (creation only) ─────────────────────────────── */}
            {isNew && (
              <div className="rounded-[10px] border border-border p-3 space-y-2" style={{ background: "#F8F6FC" }}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3D2F6B" }}>
                  <Globe className="w-3.5 h-3.5" /> Buscar en internet
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: Hotel Arts Barcelona…"
                    value={lookupQ}
                    onChange={e => setLookupQ(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleLookup())}
                    className="h-8 text-[13px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0"
                    style={{ background: "#3D2F6B", color: "white" }}
                    disabled={lookupLoading || !lookupQ.trim()}
                    onClick={handleLookup}
                  >
                    <Search className="w-3.5 h-3.5" />
                    {lookupLoading ? "Buscando…" : "Buscar"}
                  </Button>
                </div>

                {lookupResults.length > 0 && (
                  <div className="space-y-0.5 border border-border rounded-[8px] overflow-hidden" style={{ background: "white" }}>
                    <p className="text-[10px] text-muted-foreground px-2 pt-1.5 pb-0.5">
                      Haz clic en un resultado para rellenar el formulario
                    </p>
                    {lookupResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyResult(r)}
                        className="w-full text-left px-3 py-2 hover:bg-[#FAF2EB] transition-colors flex items-start justify-between gap-3 border-t border-border/40 first:border-t-0"
                      >
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>{r.name}</p>
                          {r.address && <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">{r.address}</p>}
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{r.city}{r.country ? `, ${r.country}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}

                {lookupDone && lookupResults.length === 0 && (
                  <p className="text-[12px] text-muted-foreground text-center py-1">
                    Sin resultados — rellena el formulario manualmente
                  </p>
                )}
              </div>
            )}

            {/* ── Manual form ───────────────────────────────────────────── */}
            {isNew && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground">o introduce los datos manualmente</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del hotel</FormLabel>
                <FormControl><Input placeholder="Riad Palais Amani" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl><Input placeholder="Marrakech" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>País</FormLabel>
                  <FormControl><Input placeholder="Marruecos" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Dirección (opcional)</FormLabel>
                <FormControl><Input placeholder="Derb Tizougarine, Medina" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="segment" render={({ field }) => (
                <FormItem>
                  <FormLabel>Segmento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="basic">Básico</SelectItem>
                      <SelectItem value="standard">Estándar</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="stars" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estrellas</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl><Input placeholder="+212 524 000000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="website" render={({ field }) => (
                <FormItem>
                  <FormLabel>Web</FormLabel>
                  <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
              <Button type="submit" disabled={isPending}
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {isPending ? "Guardando…" : "Guardar hotel"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Hotels() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);
  const { data: hotels, isLoading } = useListHotels();
  const create = useCreateHotel();
  const update = useUpdateHotel();
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleCreate = (values: FormValues) => {
    create.mutate({
      data: {
        name: values.name,
        city: values.city,
        country: values.country,
        ...(values.address ? { address: values.address } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.website ? { website: values.website } : {}),
        ...(values.stars ? { stars: parseInt(values.stars) } : {}),
        ...(values.segment ? { segment: values.segment } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/hotels"] });
        toast({ title: "Hotel creado" });
        setCreateOpen(false);
      },
      onError: () => toast({ variant: "destructive", title: "Error al crear el hotel" }),
    });
  };

  const handleEdit = (values: FormValues) => {
    if (!editHotel) return;
    update.mutate({
      hotelId: editHotel.id,
      data: {
        name: values.name,
        city: values.city,
        country: values.country,
        ...(values.address ? { address: values.address } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.website ? { website: values.website } : {}),
        ...(values.stars ? { stars: parseInt(values.stars) } : {}),
        ...(values.segment ? { segment: values.segment } : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/hotels"] });
        toast({ title: "Hotel actualizado" });
        setEditHotel(null);
      },
      onError: () => toast({ variant: "destructive", title: "Error al actualizar el hotel" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Hoteles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de alojamientos de la agencia</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Plus className="w-4 h-4" /> Nuevo hotel
        </button>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando hoteles…</div>
        ) : !hotels?.length ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No hay hoteles en el catálogo</p>
            <button onClick={() => setCreateOpen(true)} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Añade el primer hotel →
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Hotel", "Ciudad", "País", "Segmento", "Estrellas", "Estado", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hotels.map((h: Hotel) => (
                <tr key={h.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <span className="font-medium" style={{ color: "#2D1F0E" }}>{h.name}</span>
                    {h.address && <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{h.address}</div>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{h.city}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.country}</td>
                  <td className="px-5 py-3"><SegmentBadge segment={h.segment ?? null} /></td>
                  <td className="px-5 py-3"><Stars n={h.stars} /></td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: h.active ? "#E4F3EC" : "#ECD5B8", color: h.active ? "#2E7D5A" : "#7A5C3A" }}>
                      {h.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setEditHotel(h)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <HotelForm
          title="Nuevo hotel"
          defaultValues={{ name: "", city: "", country: "", address: "", phone: "", website: "" }}
          onSubmit={handleCreate}
          isPending={create.isPending}
          onCancel={() => setCreateOpen(false)}
          isNew
        />
      )}

      {editHotel && (
        <HotelForm
          title={`Editar: ${editHotel.name}`}
          defaultValues={{
            name: editHotel.name,
            city: editHotel.city,
            country: editHotel.country,
            address: editHotel.address ?? "",
            phone: editHotel.phone ?? "",
            website: editHotel.website ?? "",
            stars: editHotel.stars ? String(editHotel.stars) : undefined,
            segment: editHotel.segment ?? undefined,
          }}
          onSubmit={handleEdit}
          isPending={update.isPending}
          onCancel={() => setEditHotel(null)}
        />
      )}
    </div>
  );
}
