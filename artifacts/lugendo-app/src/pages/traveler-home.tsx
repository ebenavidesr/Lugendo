import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useListMyTrips, useListSharedWithMe, useAcceptTripShare,
  useDeleteTrip, useLeaveTrip, useDismissTrip,
} from "@workspace/api-client-react";
import type { TravelerTrip, TravelerTripStatus, SharedTripEntry } from "@workspace/api-client-react";
import { MapPin, ArrowRight, Plus, Users, Inbox, Check, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusBadge: Record<TravelerTripStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: "#ECD5B8", color: "#7A5C3A", label: "Próximamente" },
  scheduled: { bg: "#EAE6F5", color: "#3D2F6B", label: "Programado" },
  active:    { bg: "#E4F3EC", color: "#2E7D5A", label: "En curso" },
  finished:  { bg: "#E5D4BF", color: "#9C7A58", label: "Finalizado" },
  cancelled: { bg: "#FDECEA", color: "#C0392B", label: "Cancelado" },
};

const tripGradients = [
  "linear-gradient(135deg, #3D2F6B 0%, #5B4A9B 100%)",
  "linear-gradient(135deg, #8B4420 0%, #C4793A 100%)",
  "linear-gradient(135deg, #2E4A5A 0%, #4A7B8B 100%)",
  "linear-gradient(135deg, #2D4A2D 0%, #3D7B5A 100%)",
  "linear-gradient(135deg, #4A2D3D 0%, #8B4A6B 100%)",
];

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

type TripAction =
  | { type: "delete"; trip: TravelerTrip }
  | { type: "leave"; trip: TravelerTrip }
  | { type: "dismiss"; trip: TravelerTrip };

function TripCard({
  trip,
  idx,
  currentUserId,
  onAction,
}: {
  trip: TravelerTrip;
  idx: number;
  currentUserId?: number;
  onAction?: (action: TripAction) => void;
}) {
  const s = statusBadge[trip.status] ?? statusBadge.draft;
  const gradient = tripGradients[idx % tripGradients.length];
  const isOwner = currentUserId != null && trip.ownerId === currentUserId;
  const isCancelled = trip.status === "cancelled";

  const cardContent = (
    <div
      className="bg-card border border-border rounded-[16px] overflow-hidden shadow-sm transition-all"
      style={isCancelled && !isOwner ? { opacity: 0.55 } : undefined}
    >
      {isCancelled && !isOwner && (
        <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium"
          style={{ background: "#FDECEA", color: "#C0392B", borderBottom: "1px solid #F5C6C2" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Viaje cancelado por el organizador
        </div>
      )}
      <div className="h-20 relative flex items-end px-5 pb-3" style={{ background: gradient }}>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
        <div className="relative z-10 flex items-end justify-between w-full">
          <div>
            {trip.countries && trip.countries.length > 0 && (
              <div className="flex items-center gap-1 mb-0.5">
                <MapPin className="w-3 h-3 text-white/70" />
                <span className="text-[11px] font-medium text-white/70 uppercase tracking-wider">
                  {trip.countries.join(" · ")}
                </span>
              </div>
            )}
            <h3 className="text-[18px] font-medium text-white leading-tight">{trip.name}</h3>
          </div>
          {trip.isPersonal && isOwner && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff", backdropFilter: "blur(4px)" }}>
              Propio
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">
            {fmt(trip.startDate)}{trip.endDate ? ` — ${fmt(trip.endDate)}` : ""}
          </p>
          {trip.agencyName && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{trip.agencyName}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCancelled && isOwner && onAction && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAction({ type: "delete", trip }); }}
              className="p-1.5 rounded-[6px] text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Eliminar viaje"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {!isCancelled && !isOwner && onAction && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAction({ type: "leave", trip }); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-muted-foreground hover:text-orange-700 hover:bg-orange-50 transition-colors border border-border"
              title="Darse de baja del viaje"
            >
              <LogOut className="w-3 h-3" />
              Darme de baja
            </button>
          )}
          {isCancelled && !isOwner && onAction && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAction({ type: "dismiss", trip }); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors"
              style={{ background: "#FDECEA", color: "#C0392B", border: "1px solid #F5C6C2" }}
            >
              <Trash2 className="w-3 h-3" />
              Eliminar de mi lista
            </button>
          )}
          {!isCancelled && (
            <>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{ background: s.bg, color: s.color }}>{s.label}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (isCancelled && !isOwner) {
    return <div>{cardContent}</div>;
  }

  return (
    <Link href={`/traveler/trips/${trip.id}`}>
      {cardContent}
    </Link>
  );
}

// ── Shared-with-me tab ────────────────────────────────────────────────────────

function SharedWithMeSection({
  currentUserId,
  onAction,
}: {
  currentUserId?: number;
  onAction?: (action: TripAction) => void;
}) {
  const { data: entries, isLoading } = useListSharedWithMe();
  const acceptShare = useAcceptTripShare();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  const pending  = entries?.filter(e => e.status === "pending")  ?? [];
  const accepted = entries?.filter(e => e.status === "accepted") ?? [];

  const handleAccept = (shareCode: string) => {
    acceptShare.mutate(
      { shareCode },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/me/shared-trips"] });
          toast({ title: "Viaje añadido a tus compartidos" });
        },
        onError: () => toast({ variant: "destructive", title: "No se pudo aceptar la invitación" }),
      }
    );
  };

  const handleCodeAccept = () => {
    if (!code.trim()) return;
    handleAccept(code.trim().toUpperCase());
    setCode("");
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="h-28 bg-card border border-border rounded-[16px] animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-[14px] p-4">
        <p className="text-[13px] font-medium mb-2" style={{ color: "#2D1F0E" }}>
          ¿Tienes un código de invitación?
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Ej. A3BX9K"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className="font-mono text-[13px] tracking-widest"
            onKeyDown={e => e.key === "Enter" && handleCodeAccept()}
          />
          <Button
            onClick={handleCodeAccept}
            disabled={!code.trim() || acceptShare.isPending}
            style={{ background: "#C4793A", color: "#fff" }}
          >
            <Check className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5" /> Invitaciones pendientes ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((entry: SharedTripEntry, idx) => (
              <div key={entry.shareId}
                className="bg-card border border-border rounded-[16px] overflow-hidden shadow-sm">
                <div className="h-16 relative flex items-end px-5 pb-3"
                  style={{ background: tripGradients[idx % tripGradients.length] }}>
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)" }} />
                  <h3 className="relative z-10 text-[16px] font-medium text-white">{entry.trip.name}</h3>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-muted-foreground">
                      {fmt(entry.trip.startDate)}{entry.trip.endDate ? ` — ${fmt(entry.trip.endDate)}` : ""}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "#C47A00" }}>
                      Invitación pendiente · código {entry.shareCode}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(entry.shareCode)}
                    disabled={acceptShare.isPending}
                    style={{ background: "#2E7D5A", color: "#fff" }}
                  >
                    Aceptar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {accepted.length > 0 && (
        <div>
          <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Compartidos conmigo ({accepted.length})
          </h3>
          <div className="space-y-3">
            {accepted.map((entry: SharedTripEntry, idx) => (
              <TripCard
                key={entry.shareId}
                trip={entry.trip}
                idx={idx + 10}
                currentUserId={currentUserId}
                onAction={onAction}
              />
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && accepted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ background: "#EAE6F5" }}>
            <Users className="w-6 h-6" style={{ color: "#3D2F6B" }} />
          </div>
          <h3 className="text-[16px] font-medium mb-1.5" style={{ color: "#2D1F0E" }}>
            Todavía no tienes viajes compartidos
          </h3>
          <p className="text-[13px] text-muted-foreground max-w-xs">
            Cuando alguien comparta un viaje contigo aparecerá aquí. También puedes introducir un código de invitación.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "mine" | "shared";

export default function TravelerHome() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("mine");
  const { data: trips, isLoading } = useListMyTrips();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteTrip = useDeleteTrip();
  const leaveTrip = useLeaveTrip();
  const dismissTrip = useDismissTrip();

  const [pendingAction, setPendingAction] = useState<TripAction | null>(null);

  const hasTrips = trips && trips.length > 0;

  const handleAction = (action: TripAction) => {
    setPendingAction(action);
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    const { type, trip } = pendingAction;

    if (type === "delete") {
      deleteTrip.mutate({ tripId: trip.id }, {
        onSuccess: (result) => {
          qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
          toast({ title: result.cancelled ? "Viaje cancelado (tenía viajeros)" : "Viaje eliminado" });
          setPendingAction(null);
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar el viaje" }),
      });
    } else if (type === "leave") {
      leaveTrip.mutate({ tripId: trip.id }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
          qc.invalidateQueries({ queryKey: ["/api/me/shared-trips"] });
          toast({ title: "Te has dado de baja del viaje" });
          setPendingAction(null);
        },
        onError: () => toast({ variant: "destructive", title: "Error al darse de baja" }),
      });
    } else if (type === "dismiss") {
      dismissTrip.mutate({ tripId: trip.id }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/me/trips"] });
          qc.invalidateQueries({ queryKey: ["/api/me/shared-trips"] });
          toast({ title: "Viaje eliminado de tu lista" });
          setPendingAction(null);
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar el viaje de tu lista" }),
      });
    }
  };

  const isPending = deleteTrip.isPending || leaveTrip.isPending || dismissTrip.isPending;

  const dialogContent = pendingAction ? (() => {
    const { type, trip } = pendingAction;
    if (type === "delete") return {
      title: "Eliminar viaje",
      description: `¿Seguro que quieres eliminar "${trip.name}"? Si hay otros viajeros en el viaje, este se marcará como cancelado y ellos lo verán como tal hasta que lo descarten.`,
      confirmText: "Eliminar / Cancelar",
      confirmStyle: { background: "#C0392B", color: "white" } as React.CSSProperties,
    };
    if (type === "leave") return {
      title: "Darse de baja del viaje",
      description: `¿Seguro que quieres salir del viaje "${trip.name}"? Ya no aparecerá en tu lista. El viaje seguirá existiendo para los demás participantes.`,
      confirmText: "Darse de baja",
      confirmStyle: { background: "#3D2F6B", color: "white" } as React.CSSProperties,
    };
    return {
      title: "Eliminar de mi lista",
      description: `¿Quieres eliminar "${trip.name}" de tu lista? Este viaje fue cancelado por el organizador.`,
      confirmText: "Eliminar de mi lista",
      confirmStyle: { background: "#C0392B", color: "white" } as React.CSSProperties,
    };
  })() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-medium" style={{ color: "#2D1F0E" }}>Mis viajes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tu pasaporte de aventuras</p>
        </div>
        {tab === "mine" && (
          <Button
            onClick={() => navigate("/traveler/trips/new")}
            size="sm"
            className="shrink-0"
            style={{ background: "var(--terra)", color: "#fff" }}
            data-testid="button-new-trip"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo viaje
          </Button>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-[10px] w-fit" style={{ background: "#ECD5B8" }}>
        {([
          { key: "mine",   label: "Mis viajes" },
          { key: "shared", label: "Compartidos" },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-[8px] text-[13px] font-medium transition-all"
            style={tab === t.key
              ? { background: "#fff", color: "#2D1F0E", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
              : { color: "#7A5C3A" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <>
          {isLoading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-[16px] h-40 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && !hasTrips && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: "#FAEEE4" }}>
                <MapPin className="w-7 h-7" style={{ color: "#C4793A" }} />
              </div>
              <h2 className="text-xl font-medium mb-2" style={{ color: "#2D1F0E" }}>
                Todavía no tienes viajes
              </h2>
              <p className="text-sm text-muted-foreground max-w-xs mb-5">
                Crea tu propio viaje o únete a uno de agencia con el código de invitación que recibirás por email.
              </p>
              <Button onClick={() => navigate("/traveler/trips/new")}
                style={{ background: "var(--terra)", color: "#fff" }}>
                <Plus className="w-4 h-4 mr-1.5" />
                Crear mi primer viaje
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {trips?.map((trip: TravelerTrip, idx) => (
              <TripCard
                key={trip.id}
                trip={trip}
                idx={idx}
                currentUserId={user?.id}
                onAction={handleAction}
              />
            ))}
          </div>
        </>
      )}

      {tab === "shared" && (
        <SharedWithMeSection
          currentUserId={user?.id}
          onAction={handleAction}
        />
      )}

      {pendingAction && dialogContent && (
        <AlertDialog open onOpenChange={open => !open && setPendingAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#C4793A" }} />
                {dialogContent.title}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dialogContent.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirm}
                disabled={isPending}
                style={dialogContent.confirmStyle}
              >
                {isPending ? "Procesando…" : dialogContent.confirmText}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
