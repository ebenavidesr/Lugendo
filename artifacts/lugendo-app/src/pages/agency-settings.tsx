import { useState, useEffect } from "react";
import { useGetAgency, useUpdateAgency } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Palette, Mic2, Save, Loader2 } from "lucide-react";

const TONE_LABELS: Record<string, { label: string; desc: string }> = {
  friendly:      { label: "Cercano",        desc: "Cálido y entusiasta, como un amigo experto en viajes" },
  informative:   { label: "Informativo",    desc: "Claro y práctico, con datos útiles y concretos" },
  adventurous:   { label: "Aventurero",     desc: "Emocionante y dinámico, lleno de energía" },
  luxury:        { label: "Lujo",           desc: "Elegante y sofisticado, con atención al detalle exclusivo" },
  professional:  { label: "Profesional",    desc: "Preciso y formal, orientado al detalle" },
};

export default function AgencySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const agencyId = user?.agencyId;

  const { data: agency, isLoading } = useGetAgency(agencyId ?? 0);

  const updateAgency = useUpdateAgency();

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    primaryColor: "",
    writingTone: "friendly",
  });

  useEffect(() => {
    if (agency) {
      setForm({
        name: agency.name ?? "",
        logoUrl: agency.logoUrl ?? "",
        primaryColor: agency.primaryColor ?? "",
        writingTone: agency.writingTone ?? "friendly",
      });
    }
  }, [agency]);

  const handleSave = async () => {
    if (!agencyId) return;
    try {
      await updateAgency.mutateAsync({
        agencyId,
        data: {
          name: form.name || undefined,
          logoUrl: form.logoUrl || undefined,
          primaryColor: form.primaryColor || undefined,
          writingTone: form.writingTone as "informative" | "friendly" | "adventurous" | "luxury" | "professional",
        },
      });
      toast({ title: "Configuración guardada" });
    } catch {
      toast({ variant: "destructive", title: "Error al guardar la configuración" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--terra)" }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ background: "#EAE6F5" }}>
          <Settings className="w-5 h-5" style={{ color: "#3D2F6B" }} />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "#2D1F0E" }}>Configuración de agencia</h1>
          <p className="text-[13px] text-muted-foreground">Personaliza el perfil y el tono de escritura IA de {agency?.name ?? "tu agencia"}</p>
        </div>
      </div>

      {/* Identity card */}
      <div className="rounded-[14px] border border-border p-5 space-y-4" style={{ background: "white" }}>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4" style={{ color: "#C4793A" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#2D1F0E" }}>Identidad</span>
        </div>
        <div>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre de la agencia</label>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Lugendo Travel"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>URL del logo</label>
          <Input
            value={form.logoUrl}
            onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
            placeholder="https://cdn.tuagencia.com/logo.png"
          />
          {form.logoUrl && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={form.logoUrl}
                alt="Logo preview"
                className="w-10 h-10 rounded-[8px] object-contain border border-border"
                onError={e => (e.currentTarget.style.display = "none")}
              />
              <span className="text-[11px] text-muted-foreground">Vista previa del logo</span>
            </div>
          )}
        </div>
        <div>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Color principal</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.primaryColor || "#C4793A"}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="w-10 h-9 rounded-[6px] border border-border cursor-pointer p-0.5"
            />
            <Input
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              placeholder="#C4793A"
              className="max-w-[120px]"
            />
            {form.primaryColor && (
              <div className="w-6 h-6 rounded-full border border-border" style={{ background: form.primaryColor }} />
            )}
          </div>
        </div>
      </div>

      {/* Writing tone card */}
      <div className="rounded-[14px] border border-border p-5 space-y-4" style={{ background: "white" }}>
        <div className="flex items-center gap-2 mb-1">
          <Mic2 className="w-4 h-4" style={{ color: "#3D2F6B" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#2D1F0E" }}>Tono de escritura IA</span>
        </div>
        <p className="text-[12px] text-muted-foreground -mt-1">
          Este tono se usará cuando la IA genere descripciones de días en los itinerarios.
        </p>
        <Select value={form.writingTone} onValueChange={v => setForm(f => ({ ...f, writingTone: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TONE_LABELS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.writingTone && TONE_LABELS[form.writingTone] && (
          <div className="rounded-[10px] p-3" style={{ background: "#EDE9F8" }}>
            <span className="text-[12px]" style={{ color: "#3D2F6B" }}>
              <strong>{TONE_LABELS[form.writingTone].label}:</strong> {TONE_LABELS[form.writingTone].desc}
            </span>
          </div>
        )}

        {/* Tone preview examples */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9C7A58" }}>
            Ejemplos de cada tono
          </div>
          {Object.entries(TONE_LABELS).map(([value, { label }]) => (
            <div
              key={value}
              className="rounded-[8px] p-2.5 cursor-pointer transition-colors"
              style={{
                background: form.writingTone === value ? "#EDE9F8" : "#FAF2EB",
                border: form.writingTone === value ? "1px solid #C5B8EA" : "1px solid transparent",
              }}
              onClick={() => setForm(f => ({ ...f, writingTone: value }))}>
              <div className="text-[11px] font-semibold mb-0.5" style={{ color: form.writingTone === value ? "#3D2F6B" : "#9C7A58" }}>
                {label}
              </div>
              <div className="text-[11px]" style={{ color: "#6B5744" }}>{label === "Cercano" ? "\"¡Hoy te lleva el corazón de Marrakech! Descubre los zocos y déjate llevar por la magia de la medina.\"" : label === "Informativo" ? "\"El día incluye visita al zoco El Fna (3h), degustación de cocina local y traslado al riad. Duración estimada: 6h.\"" : label === "Aventurero" ? "\"¡Adrénaline al máximo! Te adentrarás en las callejuelas de Marrakech en una experiencia que no olvidarás.\"" : label === "Lujo" ? "\"Un día exclusivo de inmersión cultural en la histórica medina, con guía privado y degustación de alta gastronomía marroquí.\"" : "\"Día 3: Visita cultural a la medina de Marrakech. Incluye: zoco El Fna, palacio Bahía y almuerzo en restaurante local.\""}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateAgency.isPending}
          className="gap-2"
          style={{ background: "#C4793A", color: "#FAF2EB" }}>
          {updateAgency.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {updateAgency.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
