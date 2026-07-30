import { useRef, useState } from "react";
import {
  Users, UserPlus, Trash2, Copy, Check, Pencil, Crown,
} from "lucide-react";
import {
  useListTripShares, useShareTrip, useRevokeTripShare, useUpdateTripShare,
  useListTripPhotoShares, useCreateTripPhotoShare, useRevokeTripPhotoShare,
} from "@workspace/api-client-react";
import type { TripShare, TripPhotoShare } from "@workspace/api-client-react";
import { Camera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Share2 } from "lucide-react";

const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#FFF3D6", color: "#C47A00", label: "Pendiente" },
  accepted: { bg: "#E4F3EC", color: "#2E7D5A", label: "Aceptado" },
  rejected: { bg: "#FDECEA", color: "#C0392B", label: "Rechazado" },
};

const permStyle: Record<string, { bg: string; color: string; label: string }> = {
  read: { bg: "#E8F0FB", color: "#2B5BAD", label: "Solo ver" },
  full: { bg: "#EDE9F7", color: "#3D2F6B", label: "Edición completa" },
};

// "Miembro" = real co-traveler (classified programado/realizado like the owner);
// "Invitado" = view-only inspiration access (always classified compartido) — task #141.
const memberTypeStyle: Record<string, { bg: string; color: string; label: string }> = {
  member: { bg: "#FAEEE4", color: "var(--terra)", label: "Miembro" },
  guest:  { bg: "#F2EFEA", color: "#7A5C3A", label: "Invitado" },
};

function InviteDialog({
  tripId, open, onClose,
}: { tripId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const shareTrip = useShareTrip();
  const [email, setEmail] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const [memberType, setMemberType] = useState<"member" | "guest">("guest");
  const [permission, setPermission] = useState<"read" | "full">("read");

  const handleMemberTypeChange = (v: "member" | "guest") => {
    setMemberType(v);
    setPermission(v === "guest" ? "read" : "full");
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/shares`] });

  const handleShare = () => {
    const value = emailRef.current?.value ?? email;
    if (!value.trim()) return;
    shareTrip.mutate(
      { tripId, data: { email: value.trim(), memberType, permission: memberType === "guest" ? "read" : permission } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: `Invitación enviada a ${value.trim()}` });
          setEmail("");
          if (emailRef.current) emailRef.current.value = "";
          handleMemberTypeChange("guest");
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast({ variant: "destructive", title: msg ?? "Error al compartir" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <UserPlus className="w-4 h-4" style={{ color: "var(--terra)" }} />
            Invitar viajero
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Email del viajero
            </label>
            {/* Bug recurrente: el autocompletado/gestor de contraseñas del navegador reconoce el campo como "email" y captura el teclado. Mitigación validada (ver login.tsx): NO usar readOnly-hasta-foco (desbloquear en onFocus llega tarde en iOS Safari y en Chrome/Safari de escritorio provoca que el campo se "active y desactive" al escribir). En su lugar: campo no controlado (defaultValue, sin `value`) para que el autofill pueda escribir directamente en el DOM sin que un re-render lo borre, y se relee el valor real del DOM (emailRef) justo antes de enviar. */}
            <Input
              inputMode="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Correo del viajero"
              ref={emailRef}
              defaultValue={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleShare()}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Tipo de acceso
            </label>
            <Select value={memberType} onValueChange={v => handleMemberTypeChange(v as "member" | "guest")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Miembro — es parte del viaje</SelectItem>
                <SelectItem value="guest">Invitado — solo lo consulta</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {memberType === "member"
                ? "Le aparecerá en \"Programados\"/\"Realizados\", como a ti."
                : "Le aparecerá en \"Compartidos\" y solo puede ver el viaje."}
            </p>
          </div>
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--noche)" }}>
              Nivel de acceso
            </label>
            <Select
              value={permission}
              onValueChange={v => setPermission(v as "read" | "full")}
              disabled={memberType === "guest"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Solo ver</SelectItem>
                <SelectItem value="full">Edición completa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleShare}
            disabled={!email.trim() || shareTrip.isPending}
            style={{ background: "var(--terra)", color: "#fff" }}
          >
            {shareTrip.isPending ? "Enviando…" : "Invitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TripTravelersTabProps {
  tripId: number;
  isOwner: boolean;
  canEdit: boolean;
  ownerLabel?: string;
}

export function TripTravelersTab({ tripId, isOwner, canEdit, ownerLabel }: TripTravelersTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: shares, isLoading } = useListTripShares(tripId);
  const revokeShare = useRevokeTripShare();
  const updateShare = useUpdateTripShare();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/shares`] });

  const handleRevoke = (shareId: number) => {
    if (!confirm("¿Revocar el acceso a este viajero?")) return;
    revokeShare.mutate(
      { tripId, shareId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Acceso revocado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al revocar" }),
      }
    );
  };

  const handlePermissionChange = (shareId: number, perm: "read" | "full") => {
    updateShare.mutate(
      { tripId, shareId, data: { permission: perm } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Permiso actualizado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el permiso" }),
      }
    );
  };

  const handleMemberTypeChange = (shareId: number, memberType: "member" | "guest") => {
    updateShare.mutate(
      { tripId, shareId, data: { memberType } },
      {
        onSuccess: () => { invalidate(); toast({ title: memberType === "member" ? "Ahora es miembro del viaje" : "Ahora es invitado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el tipo de acceso" }),
      }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
        <div className="h-16 bg-card border border-border rounded-[14px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
          Viajeros con acceso
        </p>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            style={{ background: "var(--terra)", color: "#fff" }}
            className="h-8 gap-1.5 text-[12px]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invitar viajero
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {/* Owner row */}
        <div className="p-4 rounded-[14px] border border-border bg-card flex items-center gap-3">
          <Crown className="w-4 h-4 shrink-0" style={{ color: "var(--terra)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
              {isOwner ? "Tú" : (ownerLabel ?? "Propietario del viaje")}
            </p>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium inline-block mt-1"
              style={{ background: "#EDE9F7", color: "var(--indigo)" }}
            >
              Propietario
            </span>
          </div>
        </div>

        {/* Shares */}
        {(!shares || shares.length === 0) ? (
          canEdit ? (
            <div className="bg-card border border-border rounded-[14px] p-6 text-center">
              <Share2 className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                No hay viajeros invitados aún
              </p>
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                style={{ background: "var(--terra)", color: "#fff" }}
              >
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                Invitar viajero
              </Button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[14px] p-6 text-center">
              <Users className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No hay otros viajeros invitados</p>
            </div>
          )
        ) : (
          shares.map((s: TripShare) => {
            const st = statusStyle[s.status] ?? statusStyle.pending;
            const pm = permStyle[s.permission] ?? permStyle.read;
            const mt = memberTypeStyle[s.memberType] ?? memberTypeStyle.guest;
            return (
              <div key={s.id} className="p-4 rounded-[14px] border border-border bg-card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                      {s.sharedWithEmail}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {/* Status badge */}
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                      {/* Member-type badge — always visible */}
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: mt.bg, color: mt.color }}
                      >
                        {mt.label}
                      </span>
                      {/* Permission badge — always visible */}
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: pm.bg, color: pm.color }}
                      >
                        {pm.label}
                      </span>
                      {s.status === "pending" && (
                        <button
                          onClick={() => copyCode(s.shareCode)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copied === s.shareCode
                            ? <><Check className="w-3 h-3" /> Copiado</>
                            : <><Copy className="w-3 h-3" /> {s.shareCode}</>}
                        </button>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revokeShare.isPending}
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1 transition-colors"
                      title="Revocar acceso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {canEdit && (
                  <div className="pt-2 border-t border-border/50 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <Select
                        value={s.memberType}
                        onValueChange={v => handleMemberTypeChange(s.id, v as "member" | "guest")}
                        disabled={updateShare.isPending}
                      >
                        <SelectTrigger className="h-7 text-[12px] border-0 bg-transparent px-1 focus:ring-0 shadow-none w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Miembro — es parte del viaje</SelectItem>
                          <SelectItem value="guest">Invitado — solo lo consulta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pencil className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <Select
                        value={s.permission}
                        onValueChange={v => handlePermissionChange(s.id, v as "read" | "full")}
                        disabled={updateShare.isPending || s.memberType === "guest"}
                      >
                        <SelectTrigger className="h-7 text-[12px] border-0 bg-transparent px-1 focus:ring-0 shadow-none w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Solo ver</SelectItem>
                          <SelectItem value="full">Edición completa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {canEdit && (
        <InviteDialog tripId={tripId} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      )}

      {canEdit && <TripPhotoSharesSection tripId={tripId} />}
    </div>
  );
}

// ─── Photo shares: frozen "photo" links for an external contact without an
// account ("Invitada", task #141) ─────────────────────────────────────────────
function TripPhotoSharesSection({ tripId }: { tripId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: photoShares, isLoading } = useListTripPhotoShares(tripId);
  const createPhotoShare = useCreateTripPhotoShare();
  const revokePhotoShare = useRevokeTripPhotoShare();
  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/photo-shares`] });

  const photoUrl = (code: string) => `${window.location.origin}/foto/${code}`;

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(photoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCreate = () => {
    createPhotoShare.mutate(
      { tripId },
      {
        onSuccess: (share) => { invalidate(); copyLink(share.shareCode); toast({ title: "Enlace de foto creado y copiado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al crear la foto" }),
      }
    );
  };

  const handleRevoke = (photoShareId: number) => {
    if (!confirm("¿Revocar este enlace de foto?")) return;
    revokePhotoShare.mutate(
      { tripId, photoShareId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Enlace revocado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al revocar" }),
      }
    );
  };

  return (
    <div className="pt-4 mt-4 border-t border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>Fotos para invitadas</p>
          <p className="text-[12px] text-muted-foreground">Enlaces de solo lectura para compartir con contactos sin cuenta.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCreate}
          disabled={createPhotoShare.isPending}
          className="h-8 gap-1.5 text-[12px]"
        >
          <Camera className="w-3.5 h-3.5" />
          Crear foto
        </Button>
      </div>

      {!isLoading && photoShares && photoShares.length > 0 && (
        <div className="space-y-2">
          {photoShares.map((s: TripPhotoShare) => (
            <div key={s.id} className="p-3 rounded-[12px] border border-border bg-card flex items-center justify-between gap-2">
              <button
                onClick={() => copyLink(s.shareCode)}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors min-w-0"
              >
                {copied === s.shareCode
                  ? <><Check className="w-3.5 h-3.5 shrink-0" /> Enlace copiado</>
                  : <><Copy className="w-3.5 h-3.5 shrink-0" /> <span className="truncate font-mono">{s.shareCode}</span></>}
              </button>
              <button
                onClick={() => handleRevoke(s.id)}
                disabled={revokePhotoShare.isPending}
                className="text-muted-foreground hover:text-destructive shrink-0 p-1 transition-colors"
                title="Revocar enlace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
