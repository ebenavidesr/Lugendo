import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  Share2, Trash2, Users, Copy, Check, Pencil, MapPin,
} from "lucide-react";
import {
  useGetMyTrip, useListTripShares, useShareTrip, useRevokeTripShare, useUpdateTripShare,
} from "@workspace/api-client-react";
import type { TripShare } from "@workspace/api-client-react";
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
import { TripDetailHeader } from "@/components/trip-detail-header";
import { TripDayCard } from "@/components/trip-day-card";

type ActiveTab = "itinerary" | "travelers" | "documents" | "notes";

const statusShare: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#FFF3D6", color: "#C47A00", label: "Pendiente" },
  accepted: { bg: "#E4F3EC", color: "#2E7D5A", label: "Aceptado" },
  rejected: { bg: "#FDECEA", color: "#C0392B", label: "Rechazado" },
};

// ── Share Dialog ──────────────────────────────────────────────────────────────

function ShareDialog({ tripId, open, onClose }: { tripId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const shareTrip = useShareTrip();
  const revokeShare = useRevokeTripShare();
  const updateShare = useUpdateTripShare();
  const { data: shares } = useListTripShares(tripId);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"read" | "full">("read");
  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/shares`] });

  const handleShare = () => {
    if (!email.trim()) return;
    shareTrip.mutate(
      { tripId, data: { email: email.trim(), permission } },
      {
        onSuccess: () => {
          invalidate();
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

  const handlePermissionChange = (shareId: number, newPermission: "read" | "full") => {
    updateShare.mutate(
      { tripId, shareId, data: { permission: newPermission } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Permiso actualizado" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el permiso" }),
      }
    );
  };

  const handleRevoke = (shareId: number) => {
    revokeShare.mutate(
      { tripId, shareId },
      {
        onSuccess: () => {
          invalidate();
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
                      className="p-3 rounded-[10px] border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between gap-2">
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
                      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                        <Pencil className="w-3 h-3 shrink-0 text-muted-foreground" />
                        <Select
                          value={s.permission}
                          onValueChange={v => handlePermissionChange(s.id, v as "read" | "full")}
                          disabled={updateShare.isPending}
                        >
                          <SelectTrigger className="h-7 text-[12px] border-0 bg-transparent px-1 focus:ring-0 shadow-none w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read">Solo lectura</SelectItem>
                            <SelectItem value="full">Acceso completo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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

// ── Compute initially expanded days ──────────────────────────────────────────

function computeDefaultExpanded(days: { dayNumber: number }[], startDate: string): Set<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const msPerDay = 86400000;
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / msPerDay));
  const currentDayNumber = daysElapsed + 1;

  const expanded = new Set<number>();
  for (const d of days) {
    if (d.dayNumber === currentDayNumber || d.dayNumber === currentDayNumber + 1) {
      expanded.add(d.dayNumber);
    }
  }

  // If nothing matches (trip not started or finished), expand first two days
  if (expanded.size === 0 && days.length > 0) {
    expanded.add(days[0].dayNumber);
    if (days.length > 1) expanded.add(days[1].dayNumber);
  }

  return expanded;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TravelerTrip() {
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id ?? "0");
  const { data: trip, isLoading } = useGetMyTrip(tripId);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");

  const isOwner = !!(trip && user && trip.ownerId === user.id);
  const canEdit = isOwner || trip?.myPermission === "full";

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set<number>());

  useEffect(() => {
    if (!trip?.days || !trip.startDate) return;
    setExpandedDays(computeDefaultExpanded(trip.days, trip.startDate));
  }, [trip?.id, trip?.days?.length, trip?.startDate]);

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-56 bg-card border border-border rounded-[18px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-20 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div>
        <p className="text-muted-foreground">Viaje no encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Full-width header (break out of px-4 layout padding) */}
      <div className="-mx-4">
        <TripDetailHeader
          trip={trip}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          canEdit={canEdit}
          isOwner={isOwner}
          onEditClick={() => navigate(`/traveler/trips/${tripId}/edit`)}
          onShareClick={() => setShareOpen(true)}
        />
      </div>

      {/* Tab content */}
      {activeTab === "itinerary" && (
        <>
          {trip.days && trip.days.length > 0 ? (
            <div className="space-y-3">
              {trip.days.map((day, idx) => (
                <TripDayCard
                  key={day.id}
                  day={day}
                  dayIndex={idx}
                  allDays={trip.days}
                  expanded={expandedDays.has(day.dayNumber)}
                  onToggle={() => toggleDay(day.dayNumber)}
                  tripId={tripId}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[14px] p-8 text-center">
              <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
              <p className="text-sm text-muted-foreground">
                El itinerario detallado estará disponible próximamente
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === "travelers" && (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <Users className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
          <p className="text-sm text-muted-foreground">Próximamente</p>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
          <p className="text-sm text-muted-foreground">Próximamente</p>
        </div>
      )}

      {activeTab === "notes" && (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <MapPin className="w-8 h-8 mx-auto mb-3" style={{ color: "#C4793A" }} />
          <p className="text-sm text-muted-foreground">Próximamente</p>
        </div>
      )}

      {/* Share dialog */}
      {isOwner && shareOpen && (
        <ShareDialog tripId={tripId} open={shareOpen} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
