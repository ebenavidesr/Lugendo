import { useCallback, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Fixed output aspect for every day cover photo. object-cover at render time handles any
// container width/height mismatch, so this only needs to be a reasonable "banner" shape --
// it doesn't have to exactly match every surface's box.
const CROP_ASPECT = 2.5;
const OUTPUT_WIDTH = 1200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("No se pudo cargar la imagen")));
    img.src = src;
  });
}

async function getCroppedImageBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const outputHeight = Math.round(OUTPUT_WIDTH / (cropPixels.width / cropPixels.height));
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no soporta el recorte de imágenes");
  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, OUTPUT_WIDTH, outputHeight,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))),
      "image/jpeg",
      0.9,
    );
  });
}

async function uploadPublicPhoto(blob: Blob): Promise<string> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "day-photo.jpg", size: blob.size, contentType: "image/jpeg", visibility: "public" }),
  });
  if (!urlRes.ok) throw new Error("No se pudo obtener la URL de subida");
  const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!uploadRes.ok) throw new Error("Error al subir la foto");

  return `/api/storage/public-objects/${objectPath}`;
}

interface DayPhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (photoUrl: string | null) => Promise<void>;
}

function DayPhotoEditDialog({ open, onOpenChange, onSave }: DayPhotoEditDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

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
      onOpenChange(v);
      if (!v) reset();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      const photoUrl = await uploadPublicPhoto(blob);
      await onSave(photoUrl);
      toast({ title: "Foto guardada" });
      onOpenChange(false);
      reset();
    } catch (err) {
      toast({ variant: "destructive", title: (err as Error).message ?? "Error al guardar la foto" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Foto de portada del día</DialogTitle>
        </DialogHeader>

        {!imageSrc ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:bg-muted/40 transition-colors"
            >
              <ImagePlus className="w-6 h-6 opacity-50" />
              <span className="text-[13px] text-muted-foreground">Seleccionar una foto</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative w-full rounded-[12px] overflow-hidden bg-muted" style={{ height: 260 }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={CROP_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <div className="flex items-center gap-3 px-1">
              <span className="text-[11px] text-muted-foreground shrink-0">Zoom</span>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={([v]) => setZoom(v)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground px-1">
              Arrastra la foto para elegir qué parte se ve.
            </p>
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
  );
}

interface DayPhotoZoneProps {
  photoUrl: string | null | undefined;
  editable: boolean;
  onSave: (photoUrl: string | null) => Promise<void>;
  height?: number;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function DayPhotoZone({ photoUrl, editable, onSave, height = 134, onClick, children, className }: DayPhotoZoneProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await onSave(null);
      toast({ title: "Foto eliminada" });
    } catch {
      toast({ variant: "destructive", title: "Error al eliminar la foto" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{ height, background: "var(--duna)", cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <Camera className="w-8 h-8 opacity-30" style={{ color: "var(--noche)" }} />
      )}

      {children}

      {editable && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          {photoUrl && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="p-1.5 rounded-[8px] transition-colors disabled:opacity-50"
              style={{ background: "rgba(0,0,0,0.45)", color: "#FAF2EB" }}
              title="Quitar foto"
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); setDialogOpen(true); }}
            className="p-1.5 rounded-[8px] transition-colors"
            style={{ background: "rgba(0,0,0,0.45)", color: "#FAF2EB" }}
            title={photoUrl ? "Cambiar foto" : "Añadir foto"}
          >
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <DayPhotoEditDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={onSave} />
    </div>
  );
}
