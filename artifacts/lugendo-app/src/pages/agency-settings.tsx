import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useGetAgency, useUpdateAgency, useDeleteAgency, useListAgencies, getListAgenciesQueryKey, AuthUserRole } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NoteRichTextEditor } from "@/components/note-rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/utils";
import { ChecklistTemplatesSettings } from "@/components/checklist-templates-settings";
import { AgencyLogoField } from "@/components/agency-logo-field";
import { AgencyPhotosField } from "@/components/agency-photos-field";
import { Settings, Palette, Mic2, Save, Loader2, Globe, ArrowLeft, Trash2 } from "lucide-react";

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
  const [, navigate] = useLocation();
  // /agencies/:id/settings (solo admin, gestionar cualquier agencia) vs. /settings (la propia).
  const params = useParams<{ id?: string }>();
  const isPlatformAdmin = user?.role === AuthUserRole.admin;
  const isAgent = user?.role === AuthUserRole.agent;
  const targetAgencyId = params.id && isPlatformAdmin ? parseInt(params.id, 10) : (user?.agencyId ?? undefined);
  const managingOtherAgency = params.id != null;

  // Un admin puede saltar a la configuración de cualquier agencia/asesor desde aquí mismo,
  // sin tener que pasar antes por /agencies/:id.
  const { data: allAgencies } = useListAgencies({ query: { queryKey: getListAgenciesQueryKey(), enabled: isPlatformAdmin } });

  const { data: agency, isLoading } = useGetAgency(targetAgencyId ?? 0);

  const updateAgency = useUpdateAgency();
  const deleteAgency = useDeleteAgency();
  const qc = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDelete = () => {
    if (!targetAgencyId) return;
    deleteAgency.mutate({ agencyId: targetAgencyId }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/agencies"] });
        toast({ title: "Agencia eliminada" });
        navigate("/agencies");
      },
      onError: (err) => toast({ variant: "destructive", title: getApiErrorMessage(err, "Error al eliminar la agencia") }),
    });
  };

  const [form, setForm] = useState({
    name: "",
    primaryColor: "",
    writingTone: "friendly",
    description: "",
    publicProfileEnabled: false,
  });

  useEffect(() => {
    if (agency) {
      setForm({
        name: agency.name ?? "",
        primaryColor: agency.primaryColor ?? "",
        writingTone: agency.writingTone ?? "friendly",
        description: agency.description ?? "",
        publicProfileEnabled: agency.publicProfileEnabled ?? false,
      });
    }
  }, [agency]);

  const handleSave = async () => {
    if (!targetAgencyId) return;
    try {
      await updateAgency.mutateAsync({
        agencyId: targetAgencyId,
        data: {
          name: form.name || undefined,
          primaryColor: form.primaryColor || undefined,
          writingTone: form.writingTone as "informative" | "friendly" | "adventurous" | "luxury" | "professional",
          description: form.description || null,
          publicProfileEnabled: form.publicProfileEnabled,
        },
      });
      toast({ title: "Configuración guardada" });
    } catch {
      toast({ variant: "destructive", title: "Error al guardar la configuración" });
    }
  };

  if (managingOtherAgency && !isPlatformAdmin) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Acceso restringido a administradores.</div>;
  }

  if (isAgent) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Acceso restringido — habla con un administrador o manager de tu agencia.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--terra)" }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {managingOtherAgency && (
        <Link href="/agencies" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground -mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Todas las agencias
        </Link>
      )}

      {isPlatformAdmin && allAgencies && allAgencies.length > 0 && (
        <div className="rounded-[14px] border border-border p-4" style={{ background: "#EAE6F5" }}>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#3D2F6B" }}>
            Editando la configuración de
          </label>
          <Select
            value={String(targetAgencyId ?? "")}
            onValueChange={v => navigate(`/agencies/${v}/settings`)}
          >
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allAgencies.filter(a => a.active).map(a => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name} {a.agencyType === "advisor" ? "· Asesor" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: "#EAE6F5" }}>
            <Settings className="w-5 h-5" style={{ color: "#3D2F6B" }} />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold" style={{ color: "#2D1F0E" }}>Configuración de agencia</h1>
            <p className="text-[13px] text-muted-foreground">Personaliza el perfil y el tono de escritura IA de {agency?.name ?? "tu agencia"}</p>
          </div>
        </div>
        {isPlatformAdmin && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium border transition-colors shrink-0"
            style={{ borderColor: "#F5C6C0", color: "#C0392B" }}>
            <Trash2 className="w-3.5 h-3.5" /> Eliminar agencia
          </button>
        )}
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
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Logo</label>
          {targetAgencyId && (
            <AgencyLogoField agencyId={targetAgencyId} logoFileUrl={agency?.logoFileUrl} logoUrl={agency?.logoUrl} />
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

      {/* Public profile card (tarea #162) */}
      <div className="rounded-[14px] border border-border p-5 space-y-4" style={{ background: "white" }}>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4" style={{ color: "#2E7D5A" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#2D1F0E" }}>Perfil público</span>
        </div>
        <p className="text-[12px] text-muted-foreground -mt-1">
          Página visible para cualquier persona sin cuenta, con vuestra identidad y los itinerarios que hayáis publicado en el buscador.
        </p>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Perfil visible públicamente</p>
            {form.publicProfileEnabled && agency?.slug && (
              <a href={`/${agency.slug}`} target="_blank" rel="noopener noreferrer"
                className="text-[12px] font-mono" style={{ color: "#C4793A" }}>
                lugendo.io/{agency.slug} ↗
              </a>
            )}
          </div>
          <Switch checked={form.publicProfileEnabled} onCheckedChange={v => setForm(f => ({ ...f, publicProfileEnabled: v }))} />
        </div>

        <div>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Fotos del perfil</label>
          {targetAgencyId && (
            <AgencyPhotosField agencyId={targetAgencyId} photoUrls={agency?.photoUrls ?? []} />
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Descripción</label>
          <NoteRichTextEditor
            key={targetAgencyId}
            initialHtml={agency?.description ?? ""}
            onChange={html => setForm(f => ({ ...f, description: html }))}
            placeholder="Contadle a un viajero quiénes sois y qué tipo de viajes hacéis mejor que nadie…"
            className="min-h-[90px]"
          />
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

      {(user?.role === AuthUserRole.admin || user?.role === AuthUserRole.manager || user?.role === AuthUserRole.advisor) && <ChecklistTemplatesSettings />}

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

      {confirmingDelete && agency && (
        <Dialog open onOpenChange={v => !v && setConfirmingDelete(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Eliminar agencia</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
              ¿Seguro que quieres eliminar{" "}
              <strong className="font-medium" style={{ color: "#2D1F0E" }}>"{agency.name}"</strong>?{" "}
              Solo se puede eliminar si no tiene itinerarios, viajes, usuarios, hoteles ni actividades vinculados. Esta acción no se puede deshacer.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}
                disabled={deleteAgency.isPending}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={deleteAgency.isPending}
                onClick={handleDelete} className="gap-1.5" style={{ background: "#C0392B", color: "white" }}>
                <Trash2 className="w-3.5 h-3.5" />
                {deleteAgency.isPending ? "Eliminando…" : "Eliminar agencia"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
