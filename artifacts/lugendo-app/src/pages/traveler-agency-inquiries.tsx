import { Link } from "wouter";
import { useListMyAgencyInquiries } from "@workspace/api-client-react";
import { ArrowLeft, MessageCircle } from "lucide-react";

export default function TravelerAgencyInquiries() {
  const { data: inquiries, isLoading } = useListMyAgencyInquiries();

  return (
    <div className="space-y-5">
      <Link href="/traveler" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Mis viajes
      </Link>

      <div>
        <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Mis consultas</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Consultas que has enviado a agencias de viajes</p>
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-12">Cargando…</div>
      ) : !inquiries?.length ? (
        <div className="text-center py-16 bg-card border border-border rounded-[14px]">
          <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-40" style={{ color: "#9C7A58" }} />
          <p className="text-sm text-muted-foreground">Todavía no has enviado ninguna consulta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => (
            <div key={inq.id} className="bg-card border border-border rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div>
                  <p className="font-medium text-[13px]" style={{ color: "#2D1F0E" }}>{inq.agencyName}</p>
                  {inq.itineraryName && (
                    <p className="text-[12px] text-muted-foreground">Sobre: {inq.itineraryName}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(inq.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{inq.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
