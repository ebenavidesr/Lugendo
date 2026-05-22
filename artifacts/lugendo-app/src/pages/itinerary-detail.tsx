import { useParams, Link } from "wouter";
import { ArrowLeft, Plus, Trash2, MapPin } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetItinerary,
  useListItineraryDays,
  useCreateItineraryDay,
  useDeleteItineraryDay,
  useListHotels,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ItineraryDay } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  dayNumber: z.string().min(1),
  cityFrom: z.string().optional(),
  cityTo: z.string().optional(),
  transport: z.string().optional(),
  description: z.string().optional(),
  hotelId: z.string().optional(),
});

const diffLabel: Record<string, string> = {
  easy: "Fácil",
  moderate: "Moderado",
  demanding: "Exigente",
};

export default function ItineraryDetail() {
  const params = useParams<{ id: string }>();
  const itineraryId = parseInt(params.id ?? "0");
  const [open, setOpen] = useState(false);
  const { data: itinerary, isLoading } = useGetItinerary(itineraryId);
  const { data: days, isLoading: daysLoading } = useListItineraryDays(itineraryId);
  const { data: hotels } = useListHotels();
  const createDay = useCreateItineraryDay();
  const deleteDay = useDeleteItineraryDay();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      dayNumber: String((days?.length ?? 0) + 1),
      cityFrom: "",
      cityTo: "",
      transport: "",
      description: "",
    },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    createDay.mutate({
      itineraryId,
      data: {
        dayNumber: parseInt(values.dayNumber),
        ...(values.cityFrom ? { cityFrom: values.cityFrom } : {}),
        ...(values.cityTo ? { cityTo: values.cityTo } : {}),
        ...(values.transport ? { transport: values.transport } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.hotelId && values.hotelId !== "none"
          ? { hotelId: parseInt(values.hotelId) }
          : {}),
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
        toast({ title: "Día añadido" });
        setOpen(false);
        form.reset({ dayNumber: String((days?.length ?? 0) + 2) });
      },
      onError: () => toast({ variant: "destructive", title: "Error al añadir el día" }),
    });
  };

  const onDelete = (dayId: number) => {
    deleteDay.mutate({ itineraryId, dayId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/itineraries/${itineraryId}/days`] });
        toast({ title: "Día eliminado" });
      },
      onError: () => toast({ variant: "destructive", title: "Error al eliminar el día" }),
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
        <button
          onClick={() => {
            form.setValue("dayNumber", String((days?.length ?? 0) + 1));
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium shrink-0"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Plus className="w-4 h-4" /> Añadir día
        </button>
      </div>

      {/* Days */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Días ({days?.length ?? 0} / {itinerary.numDays})
          </span>
        </div>

        {daysLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando días…</div>
        ) : !days?.length ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No hay días definidos todavía
            </p>
            <button
              onClick={() => setOpen(true)}
              className="text-[13px] font-medium"
              style={{ color: "#C4793A" }}>
              Añade el primer día →
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {days.map((day: ItineraryDay) => (
              <li key={day.id} className="px-5 py-4 flex items-start gap-4 hover:bg-[#ECD5B8]/10 transition-colors group">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 font-medium text-[13px]"
                  style={{ background: "#FAEEE4", color: "#C4793A" }}>
                  {day.dayNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>
                    {day.cityFrom && day.cityTo
                      ? `${day.cityFrom} → ${day.cityTo}`
                      : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {day.transport && (
                      <span className="text-[12px] text-muted-foreground">✈ {day.transport}</span>
                    )}
                    {day.hotelName && (
                      <span className="text-[12px] text-muted-foreground">🏨 {day.hotelName}</span>
                    )}
                  </div>
                  {day.description && (
                    <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{day.description}</p>
                  )}
                </div>
                <button
                  onClick={() => onDelete(day.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-[6px] transition-opacity text-muted-foreground hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add day dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir día al itinerario</DialogTitle>
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

              <FormField control={form.control} name="transport" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transporte (opcional)</FormLabel>
                  <FormControl><Input placeholder="Vuelo, Tren, Autobús…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="hotelId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hotel (opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccionar hotel" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin hotel</SelectItem>
                      {hotels?.map(h => (
                        <SelectItem key={h.id} value={String(h.id)}>
                          {h.name} — {h.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createDay.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {createDay.isPending ? "Guardando…" : "Añadir día"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
