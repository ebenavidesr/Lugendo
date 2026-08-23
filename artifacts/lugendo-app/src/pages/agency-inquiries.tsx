import { useListAgencyInquiries, useMarkAgencyInquiryRead, getListAgencyInquiriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Mail } from "lucide-react";

export default function AgencyInquiries() {
  const { data: inquiries, isLoading } = useListAgencyInquiries();
  const markRead = useMarkAgencyInquiryRead();
  const qc = useQueryClient();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ inquiryId: id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListAgencyInquiriesQueryKey() }),
    });
  };

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Consultas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Mensajes de viajeros interesados en vuestros viajes</p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : !inquiries?.length ? (
        <div className="bg-card border border-border rounded-[14px] p-12 text-center">
          <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-40" style={{ color: "#9C7A58" }} />
          <p className="text-sm text-muted-foreground">Todavía no habéis recibido ninguna consulta.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => (
            <div key={inq.id} className="bg-card border border-border rounded-[14px] p-4"
              style={inq.status === "pending" ? { borderLeft: "3px solid #C4793A" } : undefined}>
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div>
                  <p className="font-medium text-[13px]" style={{ color: "#2D1F0E" }}>{inq.travelerName}</p>
                  <a href={`mailto:${inq.travelerEmail}`} className="text-[12px] inline-flex items-center gap-1" style={{ color: "#C4793A" }}>
                    <Mail className="w-3 h-3" /> {inq.travelerEmail}
                  </a>
                  {inq.itineraryName && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">Sobre: {inq.itineraryName}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(inq.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  {inq.status === "pending" && (
                    <button
                      onClick={() => handleMarkRead(inq.id)}
                      disabled={markRead.isPending}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "#ECD5B8", color: "#7A5C3A" }}>
                      Marcar como leída
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{inq.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
