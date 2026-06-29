import { useRef, useState } from "react";
import { FileText, FileImage, File, Upload, Trash2, Download, Pencil, Check, X } from "lucide-react";
import {
  useListTripDocumentsAdmin,
  useCreateTripDocumentAdmin,
  useDeleteTripDocumentAdmin,
  useRenameTripDocumentAdmin,
  getTripDocumentDownloadUrlAdmin,
} from "@workspace/api-client-react";
import type { TripDocument } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface AgencyTripDocumentsProps {
  tripId: number;
  readOnly?: boolean;
}

export function AgencyTripDocuments({ tripId, readOnly = false }: AgencyTripDocumentsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canManageDoc = (doc: TripDocument) => {
    if (readOnly) return false;
    if (user?.role === "admin" || user?.role === "manager") return true;
    if (user?.role === "agent") return doc.userId === user.id;
    return false;
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: documents, isLoading } = useListTripDocumentsAdmin(tripId);
  const createDoc = useCreateTripDocumentAdmin();
  const deleteDoc = useDeleteTripDocumentAdmin();
  const renameDoc = useRenameTripDocumentAdmin();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/documents`] });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) throw new Error("No se pudo obtener la URL de subida");
      const { uploadURL, objectPath } = (await urlRes.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Error al subir el archivo");

      createDoc.mutate(
        {
          tripId,
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            storageKey: objectPath,
          },
        },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: `"${file.name}" subido correctamente` });
          },
          onError: () =>
            toast({ variant: "destructive", title: "Error al registrar el documento" }),
          onSettled: () => setIsUploading(false),
        },
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: (err as Error).message ?? "Error al subir el archivo",
      });
      setIsUploading(false);
    }
  };

  const handleDelete = (doc: TripDocument) => {
    if (!window.confirm(`¿Eliminar "${doc.filename}"?`)) return;
    setDeletingId(doc.id);
    deleteDoc.mutate(
      { tripId, documentId: doc.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Documento eliminado" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
        onSettled: () => setDeletingId(null),
      },
    );
  };

  const handleDownload = async (doc: TripDocument) => {
    setDownloadingId(doc.id);
    try {
      const { signedUrl } = await getTripDocumentDownloadUrlAdmin(tripId, doc.id);
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = doc.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ variant: "destructive", title: "No se pudo obtener el enlace de descarga" });
    } finally {
      setDownloadingId(null);
    }
  };

  const startRename = (doc: TripDocument) => {
    setRenamingId(doc.id);
    setRenameValue(doc.filename);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const confirmRename = (doc: TripDocument) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === doc.filename) { cancelRename(); return; }
    renameDoc.mutate(
      { tripId, documentId: doc.id, data: { filename: trimmed } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Documento renombrado" });
          cancelRename();
        },
        onError: () => toast({ variant: "destructive", title: "Error al renombrar" }),
      },
    );
  };

  return (
    <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
          Documentos ({documents?.length ?? 0})
        </span>
        {!readOnly && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#C4793A", color: "#FAF2EB" }}
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? "Subiendo…" : "Subir documento"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {isLoading ? (
        <div className="px-5 py-4 space-y-2">
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
          <div className="h-14 bg-muted rounded-[10px] animate-pulse" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <FileText className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "No hay documentos adjuntos"
              : "Sube vouchers, billetes o confirmaciones de hotel"}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((doc: TripDocument) => {
            const Icon = getMimeIcon(doc.mimeType);
            const isRenaming = renamingId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#ECD5B8]/20"
              >
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ background: "rgba(61,47,107,0.08)" }}
                >
                  <Icon className="w-4 h-4" style={{ color: "var(--indigo)" }} />
                </div>

                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmRename(doc);
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="w-full text-[13px] font-medium border border-[var(--indigo)] rounded-[6px] px-2 py-0.5 outline-none bg-white"
                      style={{ color: "var(--noche)" }}
                    />
                  ) : (
                    <p
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--noche)" }}
                    >
                      {doc.filename}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{fmtDate(doc.createdAt)}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isRenaming ? (
                    <>
                      <button
                        onClick={() => confirmRename(doc)}
                        disabled={renameDoc.isPending}
                        className="p-1.5 rounded-[8px] hover:bg-accent transition-colors disabled:opacity-50"
                        style={{ color: "var(--terra)" }}
                        title="Guardar nombre"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelRename}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Descargar"
                      >
                        <Download
                          className={`w-4 h-4 ${downloadingId === doc.id ? "animate-pulse" : ""}`}
                        />
                      </button>
                      {canManageDoc(doc) && (
                        <>
                          <button
                            onClick={() => startRename(doc)}
                            className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Renombrar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
