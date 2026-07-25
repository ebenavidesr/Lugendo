import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { LugendoCompass } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, XCircle } from "lucide-react";

export default function PendingApproval() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const isRejected = user?.status === "rejected";

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <LugendoCompass size={56} variant="light" className="mb-3" />
          <h1 className="font-sans font-medium text-[2rem] leading-none" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "#2D1F0E" }}>Lu</span>
            <span style={{ color: "#C4793A" }}>g</span>
            <span style={{ color: "#2D1F0E" }}>endo</span>
          </h1>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="items-center text-center space-y-3">
            {isRejected ? (
              <XCircle className="w-10 h-10 text-destructive" />
            ) : (
              <Clock className="w-10 h-10" style={{ color: "#C4793A" }} />
            )}
            <CardTitle className="text-2xl font-serif">
              {isRejected ? "Acceso no aprobado" : "Tu acceso está pendiente de aprobación"}
            </CardTitle>
            <CardDescription className="text-[15px]">
              {isRejected
                ? "Tu solicitud de acceso a Lugendo no ha sido aprobada. Si crees que se trata de un error, contacta con el equipo de Lugendo."
                : "Lugendo está en fase de pruebas con acceso restringido a usuarios validados. Te avisaremos por email en cuanto tu cuenta esté aprobada."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={handleLogout} data-testid="button-pending-logout">
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
