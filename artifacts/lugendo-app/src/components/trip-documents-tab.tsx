import { useRef, useState } from "react";
import {
  FileText, FileImage, File, Upload, Trash2, Download, Plane, Building2, Eye, X, ExternalLink,
} from "lucide-react";
import {
  useListTripDocuments, useCreateTripDocument, useDeleteTripDocument,
  getTripDocumentDownloadUrl,
} from "@workspace/api-client-react";
import type { TripDocument, TravelerTripDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function isPreviewable(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function FlightCard({ label, airline, flightNumber, flightTime, reservationCode }: {
  label: string;
  airline?: string | null;
  flightNumber?: string | null;
  flightTime?: string | null;
  reservationCode?: string | null;
}) {
  if (!airline && !flightNumber && !reservationCode) return null;
  return (
    <div className="p-4 rounded-[14px] border border-border bg-card space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Plane className="w-4 h-4" style={{ color: "var(--indigo)" }} />
        <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {airline && (
          <>
            <span className="text-muted-foreground">Aerolínea</span>
            <span className="font-medium" style={{ color: "var(--noche)" }}>{airline}</span>
          </>
        )}
        {flightNumber && (
          <>
            <span className="text-muted-foreground">Vuelo</span>
            <span className="font-medium" style={{ color: "var(--noche)" }}>{flightNumber}</span>
          </>
        )}
        {flightTime && (
          <>
            <span className="text-muted-foreground">Hora</span>
            <span className="font-medium" style={{ color: "var(--noche)" }}>{flightTime}</span>
          </>
        )}
        {reservationCode && (
          <>
            <span className="text-muted-foreground">Reserva</span>
            <span className="font-medium font-mono" style={{ color: "var(--terra)" }}>{reservationCode}</span>
          </>
        )}
      </div>
    </div>
  );
}

interface TripDocumentsTabProps {
  tripId: number;
  trip: TravelerTripDetail;
}

interface PreviewState {
  doc: TripDocument;
  url: string;
}

export function TripDocumentsTab({ tripId, trip }: TripDocumentsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const { data: documents, isLoading } = useListTripDocuments(tripId);
  const createDoc = useCreateTripDocument();
  const deleteDoc = useDeleteTripDocument();

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/me/trips/${tripId}/documents`] });

  const hasOutbound = !!(trip.airline || trip.flightNumber || trip.reservationCode);
  const hasReturn = !!(trip.returnAirline || trip.returnFlightNumber || trip.returnReservationCode);
  const hasFlightInfo = hasOutbound || hasReturn;

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
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

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
          onError: () => toast({ variant: "destructive", title: "Error al registrar el documento" }),
          onSettled: () => setIsUploading(false),
        }
      );
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "Error al subir el archivo" });
      setIsUploading(false);
    }
  };

  const handleDelete = (doc: TripDocument) => {
    if (!window.confirm(`¿Eliminar "${doc.filename}"?`)) return;
    setDeletingId(doc.id);
    deleteDoc.mutate(
      { tripId, documentId: doc.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Documento eliminado" }); },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar" }),
        onSettled: () => setDeletingId(null),
      }
    );
  };

  const handleDownload = async (doc: TripDocument) => {
    setDownloadingId(doc.id);
    try {
      const { signedUrl } = await getTripDocumentDownloadUrl(tripId, doc.id);
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

  const handlePreview = async (doc: TripDocument) => {
    if (!isPreviewable(doc.mimeType)) {
      return handleDownload(doc);
    }
    setPreviewingId(doc.id);
    try {
      const { signedUrl } = await getTripDocumentDownloadUrl(tripId, doc.id);
      setPreview({ doc, url: signedUrl });
    } catch {
      toast({ variant: "destructive", title: "No se pudo abrir la vista previa" });
    } finally {
      setPreviewingId(null);
    }
  };

  const isAgencyUpload = (d: TripDocument) => ["admin", "manager", "agent"].includes(d.uploaderRole);
  const agencyDocs = documents?.filter((d: TripDocument) => isAgencyUpload(d)) ?? [];
  const travelerDocs = documents?.filter((d: TripDocument) => !isAgencyUpload(d)) ?? [];

  return (
    <div className="space-y-4">
      {hasFlightInfo && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Información de vuelo
          </p>
          {hasOutbound && (
            <FlightCard
              label="Vuelo de ida"
              airline={trip.airline}
              flightNumber={trip.flightNumber}
              flightTime={trip.flightTime}
              reservationCode={trip.reservationCode}
            />
          )}
          {hasReturn && (
            <FlightCard
              label="Vuelo de vuelta"
              airline={trip.returnAirline}
              flightNumber={trip.returnFlightNumber}
              flightTime={trip.returnFlightTime}
              reservationCode={trip.returnReservationCode}
            />
          )}
        </div>
      )}

      {/* Agency-uploaded documents */}
      {!isLoading && agencyDocs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Documentos de la agencia
            </p>
          </div>
          <div className="space-y-2">
            {agencyDocs.map((doc: TripDocument) => {
              const Icon = getMimeIcon(doc.mimeType);
              const canPreview = isPreviewable(doc.mimeType);
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-[14px] border border-border bg-card">
                  <button
                    onClick={() => handlePreview(doc)}
                    disabled={previewingId === doc.id}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50"
                    style={{ background: "rgba(61,47,107,0.08)" }}
                    title={canPreview ? "Ver documento" : "Descargar"}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: "var(--indigo)" }} />
                  </button>
                  <button
                    onClick={() => handlePreview(doc)}
                    disabled={previewingId === doc.id}
                    className="flex-1 min-w-0 text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                        {doc.filename}
                      </p>
                      <span
                        className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ background: "rgba(61,47,107,0.10)", color: "var(--indigo)" }}
                      >
                        Agencia
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(doc.createdAt)}</p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {canPreview && (
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={previewingId === doc.id}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Ver"
                      >
                        <Eye className={`w-4 h-4 ${previewingId === doc.id ? "animate-pulse" : ""}`} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Descargar"
                    >
                      <Download className={`w-4 h-4 ${downloadingId === doc.id ? "animate-pulse" : ""}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Traveler documents (own + shared-trip uploads from other travelers) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium" style={{ color: "var(--noche)" }}>
            Mis documentos
          </p>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ background: "var(--terra)", color: "#fff" }}
            className="h-8 gap-1.5 text-[12px]"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? "Subiendo…" : "Subir archivo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-14 bg-card border border-border rounded-[14px] animate-pulse" />
            <div className="h-14 bg-card border border-border rounded-[14px] animate-pulse" />
          </div>
        ) : travelerDocs.length === 0 ? (
          <div className="bg-card border border-border rounded-[14px] p-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              No has subido documentos aún
            </p>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{ background: "var(--terra)", color: "#fff" }}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Subir primer documento
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {travelerDocs.map((doc: TripDocument) => {
              const Icon = getMimeIcon(doc.mimeType);
              const canPreview = isPreviewable(doc.mimeType);
              const isOwn = doc.userId === user?.id;
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-[14px] border border-border bg-card">
                  <button
                    onClick={() => handlePreview(doc)}
                    disabled={previewingId === doc.id}
                    className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50"
                    style={{ background: "rgba(61,47,107,0.08)" }}
                    title={canPreview ? "Ver documento" : "Descargar"}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: "var(--indigo)" }} />
                  </button>
                  <button
                    onClick={() => handlePreview(doc)}
                    disabled={previewingId === doc.id}
                    className="flex-1 min-w-0 text-left disabled:opacity-50"
                  >
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                      {doc.filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(doc.createdAt)}</p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {canPreview && (
                      <button
                        onClick={() => handlePreview(doc)}
                        disabled={previewingId === doc.id}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Ver"
                      >
                        <Eye className={`w-4 h-4 ${previewingId === doc.id ? "animate-pulse" : ""}`} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Descargar"
                    >
                      <Download className={`w-4 h-4 ${downloadingId === doc.id ? "animate-pulse" : ""}`} />
                    </button>
                    {isOwn && (
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent
          className="w-full p-0 gap-0 overflow-hidden sm:max-w-4xl"
          style={{ maxHeight: "90svh" }}
        >
          <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-[14px] font-medium truncate pr-4" style={{ color: "var(--noche)" }}>
              {preview?.doc.filename}
            </DialogTitle>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => preview && handleDownload(preview.doc)}
                disabled={!!downloadingId}
                className="h-8 gap-1.5 text-[12px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Descargar</span>
              </Button>
              <button
                onClick={() => setPreview(null)}
                className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="overflow-auto flex-1" style={{ maxHeight: "calc(90svh - 57px)" }}>
            {preview?.doc.mimeType === "application/pdf" && (
              <>
                {/* Desktop: inline iframe */}
                <iframe
                  src={preview.url}
                  className="hidden sm:block w-full border-0"
                  style={{ height: "calc(90svh - 57px)", minHeight: 400 }}
                  title={preview.doc.filename}
                />
                {/* Mobile: native open prompt (iOS Safari can't render PDF in iframe) */}
                <div className="flex sm:hidden flex-col items-center justify-center gap-4 p-8 text-center min-h-[260px]">
                  <div
                    className="w-16 h-16 rounded-[18px] flex items-center justify-center"
                    style={{ background: "rgba(61,47,107,0.10)" }}
                  >
                    <FileText className="w-8 h-8" style={{ color: "var(--indigo)" }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium mb-1" style={{ color: "var(--noche)" }}>
                      {preview.doc.filename}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Abre el PDF en tu navegador para verlo o descargarlo
                    </p>
                  </div>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[14px] font-medium transition-opacity hover:opacity-90"
                    style={{ background: "var(--terra)", color: "#fff" }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir PDF
                  </a>
                </div>
              </>
            )}
            {preview?.doc.mimeType.startsWith("image/") && (
              <div className="flex items-center justify-center p-4 min-h-[200px]">
                <img
                  src={preview.url}
                  alt={preview.doc.filename}
                  className="max-w-full max-h-full object-contain rounded-[8px]"
                  style={{ maxHeight: "calc(90svh - 89px)" }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
