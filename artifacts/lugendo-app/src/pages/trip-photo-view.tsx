import { useParams, useLocation } from "wouter";
import { useGetTripPhoto, useUseTripPhotoAsTemplate, getGetTripPhotoQueryKey, AuthUserRole } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { LugendoCompass } from "@/components/logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/utils";
import { MapPin, Hotel, Sparkles, Calendar } from "lucide-react";

export default function TripPhotoView() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, isError } = useGetTripPhoto(code ?? "", {
    query: { queryKey: getGetTripPhotoQueryKey(code ?? ""), enabled: !!code },
  });
  const useAsTemplate = useUseTripPhotoAsTemplate();

  const handleUseAsTemplate = () => {
    if (!code) return;
    useAsTemplate.mutate({ code }, {
      onSuccess: (res) => {
        toast({ title: "¡Viaje creado!", description: "Ya puedes editarlo a tu gusto." });
        navigate(`/traveler/trips/${res.tripId}`);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: getApiErrorMessage(err, "No se pudo usar esta foto como plantilla") });
      },
    });
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF2EB" }}>Cargando…</div>;
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#FAF2EB" }}>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-[15px]" style={{ color: "#2D1F0E" }}>Esta foto de viaje ya no está disponible.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { snapshot } = data;

  return (
    <div className="min-h-screen font-sans" style={{ background: "#FAF2EB" }}>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex flex-col items-center mb-8">
          <LugendoCompass size={48} variant="light" className="mb-3" />
          <div className="text-[11px] uppercase tracking-widest" style={{ color: "#9C7A58" }}>Foto de viaje compartida</div>
        </div>

        <Card className="shadow-xl border-border/50 mb-6">
          <CardHeader>
            <h1 className="text-2xl font-serif" style={{ color: "#2D1F0E" }}>{snapshot.tripName}</h1>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {snapshot.startDate}{snapshot.endDate ? ` — ${snapshot.endDate}` : ""}
            </div>
            {snapshot.description && (
              <p className="text-[14px] pt-2" style={{ color: "#2D1F0E" }}>{snapshot.description}</p>
            )}
          </CardHeader>
        </Card>

        <div className="space-y-4">
          {snapshot.days.map((day) => (
            <Card key={day.dayNumber} className="border-border/50">
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0"
                    style={{ background: "#ECD5B8", color: "#2D1F0E" }}
                  >
                    {day.dayNumber}
                  </div>
                  {(day.cityFrom || day.cityTo) && (
                    <div className="flex items-center gap-1 text-[13px]" style={{ color: "#2D1F0E" }}>
                      <MapPin className="w-3.5 h-3.5" style={{ color: "#C4793A" }} />
                      {day.cityFrom && day.cityTo && day.cityFrom !== day.cityTo
                        ? `${day.cityFrom} → ${day.cityTo}`
                        : (day.cityTo ?? day.cityFrom)}
                    </div>
                  )}
                </div>

                {day.hotels.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px] mb-1.5" style={{ color: "#2D1F0E" }}>
                    <Hotel className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#8B4420" }} />
                    <span>{h.name}{h.address ? ` — ${h.address}` : ""}</span>
                  </div>
                ))}

                {day.activities.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "#2D1F0E" }}>
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#3D2F6B" }} />
                    <span>
                      {a.startTime ? `${a.startTime} · ` : ""}{a.name}
                      {a.description ? ` — ${a.description}` : ""}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6 border-border/50" style={{ background: "#FAEEE4" }}>
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-[14px]" style={{ color: "#2D1F0E" }}>
              ¿Te inspira este viaje? Úsalo como plantilla para crear el tuyo, totalmente editable.
            </p>
            {user && user.role === AuthUserRole.traveler ? (
              <Button onClick={handleUseAsTemplate} disabled={useAsTemplate.isPending} data-testid="button-use-as-template">
                {useAsTemplate.isPending ? "Creando…" : "Usar como plantilla"}
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button onClick={() => navigate(`/register?photoCode=${encodeURIComponent(code ?? "")}`)}>
                  Crear mi cuenta y usarla
                </Button>
                <Button variant="outline" onClick={() => navigate(`/login?photoCode=${encodeURIComponent(code ?? "")}`)}>
                  Ya tengo cuenta
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
