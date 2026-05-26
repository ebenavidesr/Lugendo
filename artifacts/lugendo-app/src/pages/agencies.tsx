import { useState } from "react";
import { Building2, Pencil, Plus, Globe } from "lucide-react";
import {
  useListAgencies, useUpdateAgency, useCreateAgency,
} from "@workspace/api-client-react";
import type { Agency } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function AgencyForm({
  initial,
  onSubmit,
  isPending,
  onClose,
}: {
  initial: { name: string; slug: string; logoUrl: string; primaryColor: string };
  onSubmit: (data: typeof initial) => void;
  isPending: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof initial>) => setForm(f => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Nombre *</label>
        <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ej. Mi Agencia" />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Slug *</label>
        <Input value={form.slug} onChange={e => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="mi-agencia" className="font-mono text-[13px]" />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground mb-1 block">URL del logo</label>
        <Input value={form.logoUrl} onChange={e => set({ logoUrl: e.target.value })} placeholder="https://..." />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground mb-1 block">Color principal</label>
        <div className="flex items-center gap-2">
          <input type="color" value={form.primaryColor || "#C4793A"} onChange={e => set({ primaryColor: e.target.value })}
            className="h-9 w-14 cursor-pointer rounded-[6px] border border-border bg-transparent p-1" />
          <Input value={form.primaryColor} onChange={e => set({ primaryColor: e.target.value })} placeholder="#C4793A" className="font-mono text-[13px]" />
        </div>
      </div>
      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button onClick={() => onSubmit(form)} disabled={isPending || !form.name || !form.slug}
          style={{ background: "#C4793A", color: "#FAF2EB" }}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function EditAgencyDialog({ agency, onClose }: { agency: Agency; onClose: () => void }) {
  const update = useUpdateAgency();
  const qc = useQueryClient();
  const { toast } = useToast();

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar agencia</DialogTitle>
        </DialogHeader>
        <AgencyForm
          initial={{ name: agency.name, slug: agency.slug, logoUrl: agency.logoUrl ?? "", primaryColor: agency.primaryColor ?? "#C4793A" }}
          isPending={update.isPending}
          onClose={onClose}
          onSubmit={data => {
            update.mutate(
              { agencyId: agency.id, data: { name: data.name, logoUrl: data.logoUrl || undefined, primaryColor: data.primaryColor || undefined } },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: ["/api/agencies"] });
                  toast({ title: "Agencia actualizada" });
                  onClose();
                },
                onError: () => toast({ variant: "destructive", title: "Error al actualizar" }),
              }
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateAgencyDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAgency();
  const qc = useQueryClient();
  const { toast } = useToast();

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva agencia</DialogTitle>
        </DialogHeader>
        <AgencyForm
          initial={{ name: "", slug: "", logoUrl: "", primaryColor: "#C4793A" }}
          isPending={create.isPending}
          onClose={onClose}
          onSubmit={data => {
            create.mutate(
              { data: { name: data.name, slug: data.slug, logoUrl: data.logoUrl || undefined, primaryColor: data.primaryColor || undefined } },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: ["/api/agencies"] });
                  toast({ title: "Agencia creada" });
                  onClose();
                },
                onError: () => toast({ variant: "destructive", title: "Error al crear agencia" }),
              }
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default function Agencies() {
  const { user } = useAuth();
  const { data: agencies, isLoading } = useListAgencies();
  const [editTarget, setEditTarget] = useState<Agency | null>(null);
  const [creating, setCreating] = useState(false);

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-muted-foreground text-sm">Acceso restringido a administradores.</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Agencias</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona todas las agencias de la plataforma</p>
        </div>
        <Button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 text-[13px] font-medium"
          style={{ background: "#C4793A", color: "#FAF2EB", borderRadius: "8px" }}>
          <Plus className="w-4 h-4" /> Nueva agencia
        </Button>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando agencias…</div>
        ) : !agencies?.length ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">No hay agencias todavía</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Agencia", "Slug", "Color", "Estado", ""].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agencies.map(agency => (
                <tr key={agency.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {agency.logoUrl ? (
                        <img src={agency.logoUrl} alt={agency.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: agency.primaryColor ?? "#C4793A" }}>
                          <Building2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <span className="font-medium" style={{ color: "#2D1F0E" }}>{agency.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-[12px] text-muted-foreground">{agency.slug}</span>
                  </td>
                  <td className="px-5 py-3">
                    {agency.primaryColor ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-border" style={{ background: agency.primaryColor }} />
                        <span className="font-mono text-[11px] text-muted-foreground">{agency.primaryColor}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${agency.active ? "bg-[#E4F3EC] text-[#2E7D5A]" : "bg-[#FDECEA] text-[#C0392B]"}`}>
                      {agency.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {agency.slug && (
                        <a href={`/${agency.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Globe className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => setEditTarget(agency)}
                        className="p-1 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editTarget && <EditAgencyDialog agency={editTarget} onClose={() => setEditTarget(null)} />}
      {creating && <CreateAgencyDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
