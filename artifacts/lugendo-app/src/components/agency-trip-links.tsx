import { useState } from "react";
import { Link2, Plus, Trash2, ExternalLink } from "lucide-react";
import {
  useListTripLinksAdmin, useCreateTripLinkAdmin, useDeleteTripLinkAdmin,
} from "@workspace/api-client-react";
import type { TripLink } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { getLinkPlatform } from "@/lib/link-platform";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

interface AgencyTripLinksProps {
  tripId: number;
  readOnly?: boolean;
}

export function AgencyTripLinks({ tripId, readOnly = false }: AgencyTripLinksProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: links, isLoading } = useListTripLinksAdmin(tripId);
  const createLink = useCreateTripLinkAdmin();
  const deleteLink = useDeleteTripLinkAdmin();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/links`] });

  const canManageLink = (link: TripLink) => {
    if (readOnly) return false;
    if (user?.role === "admin" || user?.role === "manager" || user?.role === "advisor") return true;
    if (user?.role === "agent") return link.userId === user.id;
    return false;
  };

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
    setDeletingId(link.id);
    deleteLink.mutate(
      { tripId, linkId: link.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Enlace eliminado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
        onSettled: () => setDeletingId(null),
      }
    );
  };

  return (
    <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
          Enlaces ({links?.length ?? 0})
        </span>
        {!readOnly && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium"
            style={{ background: "var(--terra)", color: "#fff" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir enlace
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-5 py-4 space-y-3 border-b border-border">
          <div>
            <label className="text-[12px] text-muted-foreground block mb-1.5">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Guía oficial del viaje"
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
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
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
        <div className="px-5 py-4 space-y-2">
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
        </div>
      ) : !links || links.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Link2 className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {readOnly ? "No hay enlaces" : "Añade vídeos, álbumes de fotos o guías útiles"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link: TripLink) => {
            const platform = getLinkPlatform(link.url);
            const Icon = platform.icon;
            return (
              <li key={link.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--duna)]/20">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ background: "rgba(61,47,107,0.08)" }}
                  title={platform.label}
                >
                  <Icon className="w-4 h-4" style={{ color: "var(--indigo)" }} />
                </a>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 group"
                >
                  <p className="text-[13px] font-medium truncate group-hover:underline inline-flex items-center gap-1.5" style={{ color: "var(--noche)" }}>
                    {link.title}
                    <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                  </p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(link.createdAt)}</p>
                </a>
                {canManageLink(link) && (
                  <button
                    onClick={() => handleDelete(link)}
                    disabled={deletingId === link.id}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-50"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
