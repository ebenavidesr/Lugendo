import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteAgencyPhoto } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { validatePhotoFile, uploadAgencyPhotoFile } from "@/lib/agency-photos";

interface AgencyPhotosFieldProps {
  agencyId: number;
  photoUrls: string[];
}

export function AgencyPhotosField({ agencyId, photoUrls }: AgencyPhotosFieldProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deletePhoto = useDeleteAgencyPhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/agencies/${agencyId}`] });
    qc.invalidateQueries({ queryKey: ["/api/agencies"] });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    try {
      // Se suben una a una (no en paralelo) para que cada respuesta refleje el array completo
      // actualizado y no se pisen entre sí al hacer array_append concurrente.
      for (const file of files) {
        const error = validatePhotoFile(file);
        if (error) { toast({ variant: "destructive", title: error }); continue; }
        await uploadAgencyPhotoFile(agencyId, file);
      }
      invalidate();
      toast({ title: files.length > 1 ? "Fotos añadidas" : "Foto añadida" });
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "Error al subir la foto" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    setDeletingIndex(index);
    deletePhoto.mutate(
      { agencyId, index },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Foto eliminada" });
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar la foto" }),
        onSettled: () => setDeletingIndex(null),
      }
    );
  };

  return (
    <div className="space-y-3">
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photoUrls.map((url, index) => (
            <div key={url} className="relative aspect-square rounded-[10px] overflow-hidden border border-border group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={deletingIndex === index}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                aria-label="Eliminar foto"
              >
                {deletingIndex === index ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-medium border border-border hover:bg-muted/40 transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        {uploading ? "Subiendo…" : "Añadir fotos"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <p className="text-[11px] text-muted-foreground">PNG, JPG o WebP, máx. 5 MB por foto</p>
    </div>
  );
}
