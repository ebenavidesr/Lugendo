import { useCallback, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Camera, ImagePlus, Loader2, Trash2, User } from "lucide-react";
import { useDeleteMyTravelProfileAvatar } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadTravelerAvatarBlob, ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE } from "@/lib/traveler-avatar";

// Square crop client-side; the server re-resizes to a fixed max size after upload (#155) --
// this output is just a reasonable working size, not the final stored dimensions.
const OUTPUT_SIZE = 512;
const MAX_WORKING_DIMENSION = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("No se pudo cargar la imagen")));
    img.src = src;
  });
}

async function downscaleForEditing(file: File): Promise<string> {
  const originalSrc = URL.createObjectURL(file);
  const image = await loadImage(originalSrc);
  const scale = Math.min(1, MAX_WORKING_DIMENSION / Math.max(image.width, image.height));
  if (scale === 1) return originalSrc;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  URL.revokeObjectURL(originalSrc);
  if (!ctx) return URL.createObjectURL(file);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.92);
  });
  return URL.createObjectURL(blob);
}

async function getCroppedSquareBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no soporta el recorte de imágenes");
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.9);
  });
}

interface TravelerAvatarEditorProps {
  avatarUrl: string | null;
  name: string;
  initials: string;
  avatarColor: string;
}

export function TravelerAvatarEditor({ avatarUrl, name, initials, avatarColor }: TravelerAvatarEditorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const deleteAvatar = useDeleteMyTravelProfileAvatar();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/me/travel-profile"] });

  const reset = () => {
    setImageSrc(current => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleClose = (v: boolean) => {
    if (!saving) {
      setDialogOpen(v);
      if (!v) reset();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "Formato no soportado. Usa JPG, PNG o WebP." });
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast({ variant: "destructive", title: "Ese archivo pesa demasiado. Prueba con uno de menos de 5 MB." });
      return;
    }
    setLoadingImage(true);
    try {
      setImageSrc(await downscaleForEditing(file));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "No se pudo cargar la imagen" });
    } finally {
      setLoadingImage(false);
    }
  };

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedSquareBlob(imageSrc, croppedAreaPixels);
      await uploadTravelerAvatarBlob(blob);
      invalidate();
      toast({ title: "Foto de perfil actualizada" });
      setDialogOpen(false);
      reset();
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "Error al guardar la foto" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteAvatar.mutateAsync();
      invalidate();
      toast({ title: "Foto de perfil eliminada" });
    } catch {
      toast({ variant: "destructive", title: "Error al eliminar la foto" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="relative inline-block">
      <div
        className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-[28px] font-semibold text-white shadow-md"
        style={{ background: avatarColor }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials || <User className="w-9 h-9" />
        )}
      </div>

      <div className="absolute -bottom-1 -right-1 flex items-center gap-1">
        {avatarUrl && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="p-1.5 rounded-full transition-colors disabled:opacity-50"
            style={{ background: "rgba(45,31,14,0.85)", color: "#FAF2EB" }}
            title="Quitar foto"
          >
            {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        )}
        <button
          onClick={() => setDialogOpen(true)}
          className="p-1.5 rounded-full transition-colors"
          style={{ background: "rgba(45,31,14,0.85)", color: "#FAF2EB" }}
          title={avatarUrl ? "Cambiar foto" : "Añadir foto"}
        >
          <Camera className="w-3 h-3" />
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Foto de perfil</DialogTitle>
          </DialogHeader>

          {!imageSrc ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingImage}
                className="w-full h-32 rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                {loadingImage ? (
                  <Loader2 className="w-6 h-6 opacity-50 animate-spin" />
                ) : (
                  <ImagePlus className="w-6 h-6 opacity-50" />
                )}
                <span className="text-[13px] text-muted-foreground">
                  {loadingImage ? "Cargando…" : "Seleccionar una foto"}
                </span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden bg-muted">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                />
              </div>
              <div className="flex items-center gap-3 px-1">
                <span className="text-[11px] text-muted-foreground shrink-0">Zoom</span>
                <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([v]) => setZoom(v)} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {imageSrc && (
              <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
                Elegir otra foto
              </Button>
            )}
            <Button type="button" onClick={handleConfirm} disabled={!imageSrc || !croppedAreaPixels || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Guardando…" : "Guardar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
