import { useState } from "react";
import { Plus, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListUsers, useSendInvitations } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User, UserRole } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const roleBadge: Record<UserRole, { bg: string; color: string; label: string }> = {
  admin:    { bg: "#FDECEA", color: "#C0392B", label: "Admin" },
  manager:  { bg: "#EAE6F5", color: "#3D2F6B", label: "Manager" },
  agent:    { bg: "#FAEEE4", color: "#8B4420", label: "Agente" },
  traveler: { bg: "#ECD5B8", color: "#7A5C3A", label: "Viajero" },
};

function RoleBadge({ role }: { role: UserRole }) {
  const s = roleBadge[role] ?? roleBadge.agent;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

const schema = z.object({
  emails: z.string().min(1, "Introduce al menos un email"),
  tripId: z.string().optional(),
});

export default function Team() {
  const [open, setOpen] = useState(false);
  const { data: users, isLoading } = useListUsers();
  const invite = useSendInvitations();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuth();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { emails: "", tripId: "" },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    if (!values.tripId) {
      toast({ variant: "destructive", title: "Selecciona un viaje para invitar viajeros" });
      return;
    }
    const emails = values.emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
    invite.mutate({
      tripId: parseInt(values.tripId),
      data: { emails },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/trips"] });
        toast({ title: `${emails.length} invitación${emails.length > 1 ? "es" : ""} enviada${emails.length > 1 ? "s" : ""}` });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ variant: "destructive", title: "Error al enviar invitaciones" }),
    });
  };

  const staff = users?.filter(u => u.role !== "traveler") ?? [];
  const travelers = users?.filter(u => u.role === "traveler") ?? [];

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Equipo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona los miembros de la agencia</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
          style={{ background: "#C4793A", color: "#FAF2EB" }}
          onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
          onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}>
          <Mail className="w-4 h-4" /> Invitar viajeros
        </button>
      </div>

      {/* Staff */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>Personal de agencia</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : !staff.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay personal registrado</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", "Email", "Rol", "Estado", "Alta"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((u: User) => (
                <tr key={u.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
                        style={{ background: "#3D2F6B", color: "#FAF2EB" }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium" style={{ color: "#2D1F0E" }}>{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: u.active ? "#E4F3EC" : "#ECD5B8", color: u.active ? "#2E7D5A" : "#7A5C3A" }}>
                      {u.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{fmt(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Travelers */}
      {travelers.length > 0 && (
        <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
              Viajeros registrados <span className="text-muted-foreground font-normal">({travelers.length})</span>
            </span>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", "Email", "Estado", "Alta"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {travelers.map((u: User) => (
                <tr key={u.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
                        style={{ background: "#C4793A", color: "#FAF2EB" }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium" style={{ color: "#2D1F0E" }}>{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: u.active ? "#E4F3EC" : "#ECD5B8", color: u.active ? "#2E7D5A" : "#7A5C3A" }}>
                      {u.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{fmt(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar viajeros a un viaje</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="tripId" render={({ field }) => (
                <FormItem>
                  <FormLabel>ID del viaje</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Ej: 1" {...field} />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Puedes copiar el ID desde la lista de viajes
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="emails" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emails de los viajeros</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={"ana@ejemplo.com\ncarlo@ejemplo.com"}
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground mt-1">Un email por línea o separados por coma</p>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={invite.isPending}
                  style={{ background: "#C4793A", color: "#FAF2EB" }}>
                  {invite.isPending ? "Enviando…" : "Enviar invitaciones"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
