import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Building2, Users } from "lucide-react";
import { useGetAgency, useListUsers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { RoleBadge, ActiveBadge } from "@/pages/team";

export default function AgencyDetail() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const agencyId = parseInt(params.id, 10);

  const { data: agency, isLoading } = useGetAgency(agencyId);
  const { data: users, isLoading: usersLoading } = useListUsers();

  const linkedUsers = useMemo(
    () => (users ?? []).filter(u => u.agencyId === agencyId),
    [users, agencyId]
  );

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-muted-foreground text-sm">Acceso restringido a administradores.</div>;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Cargando agencia…</div>;
  }

  if (!agency) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Agencia no encontrada</div>;
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <Link href="/agencies" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Todas las agencias
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(agency.logoFileUrl ?? agency.logoUrl) ? (
            <img src={agency.logoFileUrl ?? agency.logoUrl ?? undefined} alt={agency.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: agency.primaryColor ?? "#C4793A" }}>
              <Building2 className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>{agency.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{agency.slug}</p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium ${agency.active ? "bg-[#E4F3EC] text-[#2E7D5A]" : "bg-[#FDECEA] text-[#C0392B]"}`}>
          {agency.active ? "Activa" : "Inactiva"}
        </span>
      </div>

      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: "#3D2F6B" }} />
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Usuarios vinculados <span className="text-muted-foreground font-normal">({linkedUsers.length})</span>
          </span>
        </div>
        {usersLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando usuarios…</div>
        ) : !linkedUsers.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Ningún usuario está vinculado a esta agencia todavía</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {["Nombre", "Email", "Rol", "Estado"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linkedUsers.map(u => (
                <tr key={u.id} className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors">
                  <td className="px-5 py-3 font-medium" style={{ color: "#2D1F0E" }}>{u.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3"><ActiveBadge active={u.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
