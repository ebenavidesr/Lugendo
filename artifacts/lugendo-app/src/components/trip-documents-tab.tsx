import { useRef, useState } from "react";
import {
  FileText, FileImage, File, Upload, Trash2, Download, Plane,
} from "lucide-react";
import {
  useListTripDocuments, useCreateTripDocument, useDeleteTripDocument,
  getTripDocumentDownloadUrl,
} from "@workspace/api-client-react";
import type { TripDocument, TravelerTripDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf") return FileText;
  return File;
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

export function TripDocumentsTab({ tripId, trip }: TripDocumentsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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
      ) : !documents || documents.length === 0 ? (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center">
          <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">
            No hay documentos subidos aún
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
          {documents.map((doc: TripDocument) => {
            const Icon = getMimeIcon(doc.mimeType);
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-[14px] border border-border bg-card">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ background: "rgba(61,47,107,0.08)" }}
                >
                  <Icon className="w-4.5 h-4.5" style={{ color: "var(--indigo)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: "var(--noche)" }}>
                    {doc.filename}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(doc.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Descargar"
                  >
                    <Download className={`w-4 h-4 ${downloadingId === doc.id ? "animate-pulse" : ""}`} />
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 rounded-[8px] text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
