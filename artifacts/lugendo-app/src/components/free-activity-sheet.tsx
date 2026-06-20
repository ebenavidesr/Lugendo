import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAddTripDayActivity } from "@workspace/api-client-react";
import type { TransportMode } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TransportSelect } from "@/components/transport-select";

interface FreeActivitySheetProps {
  tripId: number;
  dayId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreeActivitySheet({ tripId, dayId, open, onOpenChange }: FreeActivitySheetProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const addActivity = useAddTripDayActivity();

  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [companyContact, setCompanyContact] = useState("");
  const [addressOverride, setAddressOverride] = useState("");
  const [transportMode, setTransportMode] = useState("");

  const reset = () => {
    setTitle(""); setStartTime(""); setEndTime(""); setNotes("");
    setCompanyContact(""); setAddressOverride(""); setTransportMode("");
  };

  const handleClose = () => { reset(); onOpenChange(false); };

  const handleSave = () => {
    if (!title.trim()) return;
    addActivity.mutate(
      {
        tripId,
        dayId,
        data: {
          activityTitle: title.trim(),
          included: false,
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          ...(notes ? { notes } : {}),
          ...(companyContact ? { companyContact } : {}),
          ...(addressOverride ? { addressOverride } : {}),
          ...(transportMode ? { transportMode: transportMode as TransportMode } : {}),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}`] });
          toast({ title: "Actividad libre añadida" });
          handleClose();
        },
        onError: () => toast({ variant: "destructive", title: "Error al añadir actividad" }),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <SheetTitle className="text-[15px] font-semibold" style={{ color: "var(--noche)" }}>
            Añadir actividad libre
          </SheetTitle>
          <p className="text-[12px]" style={{ color: "var(--text-ter)" }}>
            Solo tú podrás editarla; el grupo y la agencia la verán en el itinerario.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Nombre de la actividad *
            </label>
            <Input
              placeholder="Visita al mercado, paseo por el río…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-9 text-[13px]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
                Hora de inicio
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="h-9 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
                Hora de fin
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Cómo llegarás (transporte)
            </label>
            <TransportSelect
              value={transportMode}
              onChange={setTransportMode}
              placeholder="Sin transporte definido"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Empresa / Contacto
            </label>
            <Input
              placeholder="Nombre del tour, empresa, teléfono…"
              value={companyContact}
              onChange={e => setCompanyContact(e.target.value)}
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Dirección
            </label>
            <Input
              placeholder="Calle, plaza, punto de referencia…"
              value={addressOverride}
              onChange={e => setAddressOverride(e.target.value)}
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Notas
            </label>
            <Textarea
              placeholder="Detalles adicionales, código de reserva…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="text-[13px] resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/60 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!title.trim() || addActivity.isPending}
            className="flex-1 h-9 rounded-[8px] text-[13px] font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            style={{ background: "var(--terra)", color: "#FAF2EB" }}
          >
            <Plus className="w-3.5 h-3.5" />
            {addActivity.isPending ? "Añadiendo…" : "Añadir al itinerario"}
          </button>
          <button
            onClick={handleClose}
            className="h-9 px-4 rounded-[8px] text-[13px] font-medium border border-border/60"
            style={{ color: "var(--noche)" }}
          >
            Cancelar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
