import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useResendVerificationEmail } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { LugendoCompass } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MailCheck } from "lucide-react";

export default function VerifyEmailPending() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const resend = useResendVerificationEmail();
  const { toast } = useToast();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const handleResend = () => {
    resend.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Email reenviado", description: `Revisa la bandeja de entrada de ${user?.email ?? "tu cuenta"}.` });
      },
      onError: () => {
        toast({ variant: "destructive", title: "No se pudo reenviar", description: "Inténtalo de nuevo en unos minutos." });
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
            <MailCheck className="w-10 h-10" style={{ color: "#C4793A" }} />
            <CardTitle className="text-2xl font-serif">Confirma tu email</CardTitle>
            <CardDescription className="text-[15px]">
              Te enviamos un enlace de verificación a <strong>{user?.email}</strong>. Ábrelo para poder usar Lugendo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={handleResend}
              disabled={resend.isPending}
              data-testid="button-resend-verification"
            >
              {resend.isPending ? "Reenviando…" : "Reenviar email"}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleLogout} data-testid="button-verify-logout">
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
