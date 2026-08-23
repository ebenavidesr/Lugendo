import { useState } from "react";
import { useCreateAgencyInquiry } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function ContactAgencyDialog({
  agencyId,
  agencyName,
  itineraryId,
  itineraryName,
  onClose,
}: {
  agencyId: number;
  agencyName: string;
  itineraryId?: number;
  itineraryName?: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const createInquiry = useCreateAgencyInquiry();

  const handleSubmit = () => {
    if (!message.trim()) return;
    createInquiry.mutate({ data: { agencyId, itineraryId, message: message.trim() } }, {
      onSuccess: () => setSent(true),
      onError: (err) => toast({ variant: "destructive", title: getApiErrorMessage(err, "No se pudo enviar la consulta") }),
    });
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{sent ? "Consulta enviada" : `Contactar con ${agencyName}`}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-2">
            <p className="text-[13px] text-muted-foreground">
              Hemos avisado a {agencyName}. Te responderán directamente a tu email.
            </p>
            <DialogFooter className="mt-4">
              <Button onClick={onClose} style={{ background: "#C4793A", color: "#FAF2EB" }}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {itineraryName && (
              <p className="text-[12px] text-muted-foreground">
                Sobre el itinerario <span className="font-medium" style={{ color: "#2D1F0E" }}>{itineraryName}</span>
              </p>
            )}
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Cuéntales qué te gustaría saber sobre este viaje…"
              rows={5}
              maxLength={2000}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || createInquiry.isPending}
                className="gap-1.5"
                style={{ background: "#C4793A", color: "#FAF2EB" }}>
                {createInquiry.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {createInquiry.isPending ? "Enviando…" : "Enviar consulta"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
