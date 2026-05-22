import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListHotels, useCreateHotel } from "@workspace/api-client-react";
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

export default function Hotels() {
  const [open, setOpen] = useState(false);
  const { data: hotels, isLoading } = useListHotels();
  const create = useCreateHotel();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", city: "", country: "", address: "", phone: "", website: "" },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
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
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ variant: "destructive", title: "Error al crear el hotel" }),
    });
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Hoteles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de alojamientos de la agencia</p>
        </div>
        <button onClick={() => setOpen(true)}
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
            <button onClick={() => setOpen(true)} className="text-[13px] font-medium" style={{ color: "#C4793A" }}>
              Añade el primer hotel →
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Hotel", "Ciudad", "País", "Segmento", "Estrellas", "Estado"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hotels.map((h: Hotel) => (
                <tr key={h.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo hotel</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {create.isPending ? "Creando…" : "Guardar hotel"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
