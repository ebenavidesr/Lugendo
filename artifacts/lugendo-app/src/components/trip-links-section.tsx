import { useState } from "react";
import { Link2, Plus, Trash2, Building2, ExternalLink } from "lucide-react";
import {
  useListTripLinks, useCreateTripLink, useDeleteTripLink,
  useAddTripLinkShares, useRemoveTripLinkShare,
} from "@workspace/api-client-react";
import type { TripLink } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ResourceSharePanel } from "@/components/resource-share-panel";
import { getLinkPlatform } from "@/lib/link-platform";

const AGENCY_ROLES = new Set(["admin", "manager", "agent"]);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

interface TripLinksSectionProps {
  tripId: number;
}

export function TripLinksSection({ tripId }: TripLinksSectionProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: links, isLoading } = useListTripLinks(tripId);
  const createLink = useCreateTripLink();
  const deleteLink = useDeleteTripLink();
  const addShares = useAddTripLinkShares();
  const removeShare = useRemoveTripLinkShare();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/links`] });

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setShowForm(false);
  };

  const handleCreate = () => {
    if (!title.trim() || !url.trim()) return;
    createLink.mutate(
      { tripId, data: { title: title.trim(), url: url.trim() } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Enlace añadido" });
          resetForm();
        },
        onError: () => toast({ variant: "destructive", title: "Error al añadir el enlace. Revisa la URL." }),
      }
    );
  };

  const handleDelete = (link: TripLink) => {
    if (!window.confirm(`¿Eliminar "${link.title}"?`)) return;
    deleteLink.mutate(
      { tripId, linkId: link.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Enlace eliminado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
      }
    );
  };

  const handleAddShares = (link: TripLink, travelerIds: number[], shareWithAll?: boolean) => {
    addShares.mutate(
      { tripId, linkId: link.id, data: { travelerIds, shareWithAll } },
      {
        onSuccess: invalidate,
        onError: () => toast({ variant: "destructive", title: "No se pudo compartir el enlace" }),
      },
    );
  };

  const handleRemoveShare = (link: TripLink, travelerId: number) => {
    removeShare.mutate(
      { tripId, linkId: link.id, travelerId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Enlace actualizado" }); },
        onError: () => toast({ variant: "destructive", title: "No se pudo actualizar la compartición" }),
      },
    );
  };

  const allLinks = (links as TripLink[] | undefined) ?? [];
  const isAgencyLink = (l: TripLink) => AGENCY_ROLES.has(l.uploaderRole ?? "traveler");
  const agencyLinks = allLinks.filter(isAgencyLink);
  const myLinks = allLinks.filter(l => !isAgencyLink(l));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
          Mis enlaces
        </p>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            style={{ background: "var(--terra)", color: "#fff" }}
            className="h-8 gap-1.5 text-[12px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir enlace
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-[14px] p-4 space-y-3">
          <p className="text-[12px] font-medium" style={{ color: "var(--noche)" }}>Nuevo enlace</p>
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1.5">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Guía de YouTube del viaje"
              className="w-full h-9 px-3 rounded-[8px] border border-border text-[13px] outline-none focus:border-[var(--indigo)]"
              style={{ color: "var(--noche)" }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1.5">URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full h-9 px-3 rounded-[8px] border border-border text-[13px] outline-none focus:border-[var(--indigo)]"
              style={{ color: "var(--noche)" }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!title.trim() || !url.trim() || createLink.isPending}
              style={{ background: "var(--terra)", color: "#fff" }}
            >
              {createLink.isPending ? "Guardando…" : "Guardar enlace"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-14 bg-card border border-border rounded-[14px] animate-pulse" />
          <div className="h-14 bg-card border border-border rounded-[14px] animate-pulse" />
        </div>
      ) : allLinks.length === 0 ? (
        <div
          className="border border-border rounded-[14px] p-8 text-center"
          style={{ background: "var(--arena)" }}
        >
          <Link2 className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--indigo)" }} />
          <p className="text-sm text-muted-foreground mb-4">
            Guarda enlaces útiles: vídeos, álbumes de fotos o reservas
          </p>
          {!showForm && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              style={{ background: "var(--terra)", color: "#fff" }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Añadir enlace
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {agencyLinks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Enlaces de la agencia
                </p>
              </div>
              <div className="space-y-2">
                {agencyLinks.map(link => (
                  <LinkCard key={link.id} link={link} editable={false} currentUserId={user?.id} tripId={tripId} />
                ))}
              </div>
            </div>
          )}

          {myLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Mis enlaces
              </p>
              <div className="space-y-2">
                {myLinks.map(link => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    editable={link.userId === user?.id}
                    currentUserId={user?.id}
                    tripId={tripId}
                    onDelete={() => handleDelete(link)}
                    isDeleting={deleteLink.isPending}
                    onAddShares={(travelerIds, shareWithAll) => handleAddShares(link, travelerIds, shareWithAll)}
                    onRemoveShare={(travelerId) => handleRemoveShare(link, travelerId)}
                    isAddingShare={addShares.isPending}
                    isRemovingShare={removeShare.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LinkCardProps {
  link: TripLink;
  editable: boolean;
  currentUserId: number | undefined;
  tripId: number;
  onDelete?: () => void;
  isDeleting?: boolean;
  onAddShares?: (travelerIds: number[], shareWithAll?: boolean) => void;
  onRemoveShare?: (travelerId: number) => void;
  isAddingShare?: boolean;
  isRemovingShare?: boolean;
}

function LinkCard({
  link, editable, currentUserId, tripId, onDelete, isDeleting,
  onAddShares, onRemoveShare, isAddingShare, isRemovingShare,
}: LinkCardProps) {
  const isOwn = link.userId === currentUserId;
  const isAgencyLink = AGENCY_ROLES.has(link.uploaderRole ?? "traveler");
  const platform = getLinkPlatform(link.url);
  const Icon = platform.icon;

  return (
    <div className="p-4 rounded-[14px] border border-border bg-card space-y-2">
      <div className="flex items-start gap-3">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: "rgba(61,47,107,0.08)" }}
          title={platform.label}
        >
          <Icon className="w-4.5 h-4.5" style={{ color: "var(--indigo)" }} />
        </a>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 group"
        >
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p
              className="text-[13px] font-medium truncate group-hover:underline"
              style={{ color: "var(--noche)" }}
            >
              {link.title}
            </p>
            <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
            {!editable && !isOwn && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                style={{ background: "rgba(61,47,107,0.10)", color: "var(--indigo)" }}
              >
                {isAgencyLink ? "Agencia" : "Compartido"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{fmtDate(link.createdAt)}</p>
        </a>
        {editable && onDelete && (
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors shrink-0"
            title="Eliminar enlace"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!isAgencyLink && onAddShares && onRemoveShare && (
        <div className="flex items-center justify-end gap-2 pl-12">
          <ResourceSharePanel
            tripId={tripId}
            isOwner={isOwn}
            isRecipient={!isOwn}
            sharedWith={link.sharedWith ?? []}
            sharedWithAll={link.sharedWithAll}
            currentUserId={currentUserId}
            isAdding={isAddingShare}
            isRemoving={isRemovingShare}
            onAdd={onAddShares}
            onRemove={onRemoveShare}
          />
        </div>
      )}
    </div>
  );
}
