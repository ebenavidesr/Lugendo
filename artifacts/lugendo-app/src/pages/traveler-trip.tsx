import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  ArrowLeft, Plane, Calendar, MapPin, Hotel,
  Share2, Trash2, Users, Copy, Check, Pencil,
} from "lucide-react";
import {
  useGetMyTrip, useListTripShares, useShareTrip, useRevokeTripShare,
} from "@workspace/api-client-react";
import type {
  TravelerTripDetailStatus, TripDay, TripShare,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const statusBadge: Record<TravelerTripDetailStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Próximamente" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "En curso" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

const statusShare: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#FFF3D6", color: "#C47A00", label: "Pendiente" },
  accepted: { bg: "#E4F3EC", color: "#2E7D5A", label: "Aceptado" },
  rejected: { bg: "#FDECEA", color: "#C0392B", label: "Rechazado" },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-[14px] font-medium" style={{ color: "#2D1F0E" }}>{value}</p>
    </div>
  );
}

// ── Share Dialog ──────────────────────────────────────────────────────────────

function ShareDialog({ tripId, open, onClose }: { tripId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const shareTrip = useShareTrip();
  const revokeShare = useRevokeTripShare();
  const { data: shares } = useListTripShares(tripId);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"read" | "full">("read");
  const [copied, setCopied] = useState<string | null>(null);

  const handleShare = () => {
    if (!email.trim()) return;
    shareTrip.mutate(
      { tripId, data: { email: email.trim(), permission } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/shares`] });
          toast({ title: `Invitación enviada a ${email.trim()}` });
          setEmail("");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast({ variant: "destructive", title: msg ?? "Error al compartir" });
        },
      }
    );
  };

  const handleRevoke = (shareId: number) => {
    revokeShare.mutate(
      { tripId, shareId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/shares`] });
          toast({ title: "Acceso revocado" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al revocar" }),
      }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Share2 className="w-4 h-4" style={{ color: "#C4793A" }} />
            Compartir viaje
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>
                Email del destinatario
              </label>
              <Input
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="amigo@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleShare()}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>
                Nivel de acceso
              </label>
              <Select value={permission} onValueChange={v => setPermission(v as "read" | "full")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Solo lectura — puede ver el itinerario</SelectItem>
                  <SelectItem value="full">Acceso completo — puede editar notas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={handleShare}
              disabled={!email.trim() || shareTrip.isPending}
              style={{ background: "#C4793A", color: "#fff" }}
            >
              {shareTrip.isPending ? "Enviando…" : "Enviar invitación"}
            </Button>
          </div>

          {shares && shares.length > 0 && (
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Invitaciones enviadas
              </p>
              <div className="space-y-2">
                {shares.map((s: TripShare) => {
                  const st = statusShare[s.status] ?? statusShare.pending;
                  return (
                    <div key={s.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-[10px] border border-border bg-card">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "#2D1F0E" }}>
                          {s.sharedWithEmail}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          {s.status === "pending" && (
                            <button
                              onClick={() => copyCode(s.shareCode)}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              {copied === s.shareCode
                                ? <><Check className="w-3 h-3" /> Copiado</>
                                : <><Copy className="w-3 h-3" /> {s.shareCode}</>}
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevoke(s.id)}
                        className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                        title="Revocar acceso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TravelerTrip() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const { data: trip, isLoading } = useGetMyTrip(tripId);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);

  const isOwner = !!(trip && user && trip.ownerId === user.id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <Link href="/traveler" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Mis viajes
        </Link>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  const s = statusBadge[trip.status] ?? statusBadge.scheduled;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/traveler" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground mb-2 hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Mis viajes
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>{trip.name}</h1>
            {trip.agencyName && <p className="text-sm text-muted-foreground mt-0.5">{trip.agencyName}</p>}
            {trip.isPersonal && <p className="text-sm mt-0.5" style={{ color: "#C4793A" }}>Viaje personal</p>}
          </div>
          <div className="flex items-center gap-2">
            {isOwner && trip.isPersonal && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/traveler/trips/${tripId}/edit`)}
                className="gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </Button>
            )}
            {isOwner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareOpen(true)}
                className="gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                Compartir
              </Button>
            )}
            <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium shrink-0"
              style={{ background: s.bg, color: s.color }}>{s.label}</span>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard icon={Calendar} label="Inicio" value={fmt(trip.startDate)} />
        <InfoCard icon={Calendar} label="Fin" value={trip.endDate ? fmt(trip.endDate) : "—"} />
        {trip.flightNumber && <InfoCard icon={Plane} label="Vuelo" value={trip.flightNumber} />}
        {trip.reservationCode && <InfoCard icon={Plane} label="Código reserva" value={trip.reservationCode} />}
      </div>

      {/* Flight details box */}
      {(trip.airline || trip.flightTime || trip.flightNotes) && (
        <div className="bg-card border border-border rounded-[14px] p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Información de vuelo
          </p>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            {trip.airline && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Aerolínea</p>
                <p className="font-medium" style={{ color: "#2D1F0E" }}>{trip.airline}</p>
              </div>
            )}
            {trip.flightTime && (
              <div>
                <p className="text-muted-foreground text-[11px] mb-0.5">Hora de salida</p>
                <p className="font-medium" style={{ color: "#2D1F0E" }}>{trip.flightTime}</p>
              </div>
            )}
          </div>
          {trip.flightNotes && (
            <div className="mt-3 p-3 rounded-[8px] text-[13px] text-muted-foreground" style={{ background: "#FAF2EB" }}>
              {trip.flightNotes}
            </div>
          )}
        </div>
      )}

      {/* Day-by-day itinerary */}
      {trip.days && trip.days.length > 0 && (
        <div>
          <h2 className="text-[15px] font-medium mb-3" style={{ color: "#2D1F0E" }}>
            Itinerario día a día
          </h2>
          <div className="space-y-3">
            {trip.days.map((day: TripDay) => (
              <div key={day.id} className="bg-card border border-border rounded-[14px] p-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 font-medium text-[14px]"
                    style={{ background: "#FAEEE4", color: "#C4793A" }}>
                    {day.dayNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#C4793A" }}>
                        Día {day.dayNumber}
                      </span>
                      {day.transport && (
                        <span className="text-[11px] text-muted-foreground">· {day.transport}</span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium mt-0.5" style={{ color: "#2D1F0E" }}>
                      {day.cityFrom && day.cityTo
                        ? `${day.cityFrom} → ${day.cityTo}`
                        : day.cityTo ?? day.cityFrom ?? `Día ${day.dayNumber}`}
                    </p>
                    {day.hotels && day.hotels.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 p-2.5 rounded-[8px]" style={{ background: "#FAF2EB" }}>
                        <Hotel className="w-3.5 h-3.5 shrink-0" style={{ color: "#C4793A" }} />
                        <span className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>{day.hotels.map(h => h.hotelName).join(", ")}</span>
                      </div>
                    )}
                    {day.description && (
                      <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{day.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trip.days && trip.days.length === 0 && (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
          <p className="text-sm text-muted-foreground">El itinerario detallado estará disponible próximamente</p>
        </div>
      )}


      {/* Share dialog */}
      {isOwner && shareOpen && (
        <ShareDialog tripId={tripId} open={shareOpen} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
