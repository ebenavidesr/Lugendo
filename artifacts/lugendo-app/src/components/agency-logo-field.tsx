import { useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteAgencyLogo } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { validateLogoFile, uploadAgencyLogoFile } from "@/lib/agency-logo";

interface AgencyLogoFieldProps {
  agencyId: number;
  logoFileUrl: string | null | undefined;
  logoUrl: string | null | undefined;
  onChanged?: () => void;
}

export function AgencyLogoField({ agencyId, logoFileUrl, logoUrl, onChanged }: AgencyLogoFieldProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deleteLogo = useDeleteAgencyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const previewUrl = logoFileUrl || logoUrl || null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const error = validateLogoFile(file);
    if (error) {
      toast({ variant: "destructive", title: error });
      return;
    }

    setUploading(true);
    try {
      await uploadAgencyLogoFile(agencyId, file);
      await qc.invalidateQueries({ queryKey: [`/api/agencies/${agencyId}`] });
      qc.invalidateQueries({ queryKey: ["/api/agencies"] });
      toast({ title: "Logo actualizado" });
      onChanged?.();
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "Error al subir el logo" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    deleteLogo.mutate(
      { agencyId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: [`/api/agencies/${agencyId}`] });
          qc.invalidateQueries({ queryKey: ["/api/agencies"] });
          toast({ title: "Logo eliminado" });
          onChanged?.();
        },
        onError: () => toast({ variant: "destructive", title: "Error al eliminar el logo" }),
      }
    );
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-14 h-14 rounded-[10px] border border-border flex items-center justify-center overflow-hidden shrink-0"
        style={{ background: "#FAF2EB" }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <Building2 className="w-5 h-5 opacity-30" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-medium border border-border hover:bg-muted/40 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? "Subiendo…" : logoFileUrl ? "Reemplazar logo" : "Subir logo"}
          </button>
          {logoFileUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={deleteLogo.isPending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-medium border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              {deleteLogo.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Eliminar
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <span className="text-[11px] text-muted-foreground">PNG, JPG, SVG o WebP, máx. 2 MB</span>
      </div>
    </div>
  );
}
