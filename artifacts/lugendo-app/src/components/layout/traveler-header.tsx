import { Link, useLocation } from "wouter";
import { LogOut, User, MessageCircle, Search as SearchIcon } from "lucide-react";
import { LugendoCompass, LugendoWordmark } from "@/components/logo";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const navButtonClass = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-sm font-sans transition-colors hover:bg-muted/40";

/**
 * Cabecera única del front del viajero (#177) — usada tanto en las páginas privadas
 * (envueltas en TravelerLayout) como en las públicas de exploración (/buscar,
 * /itinerarios/:id) cuando el usuario está logueado. Sin sesión, se reduce a
 * "Iniciar sesión".
 */
export function TravelerHeader({ maxWidth = "max-w-3xl" }: { maxWidth?: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  return (
    <header className={`h-16 bg-card border-b border-border flex items-center justify-between px-4 ${maxWidth} w-full mx-auto`}>
      <Link href="/traveler" className="flex items-center gap-2">
        <LugendoCompass size={22} variant="light" />
        <LugendoWordmark variant="light" size="sm" />
      </Link>

      {user ? (
        <div className="flex items-center gap-1">
          <Link href="/buscar">
            <button className={navButtonClass} style={{ color: "#7A5C3A" }} title="Explorar viajes">
              <SearchIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline-block">Explorar viajes</span>
            </button>
          </Link>
          <Link href="/traveler/inquiries">
            <button className={navButtonClass} style={{ color: "#7A5C3A" }} title="Mis consultas">
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline-block">Consultas</span>
            </button>
          </Link>
          <Link href="/traveler/profile">
            <button className={navButtonClass} style={{ color: "#7A5C3A" }} title="Ver mi perfil">
              <User className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline-block">{user.name}</span>
            </button>
          </Link>
          <div className="w-px h-5 bg-border mx-1 shrink-0" aria-hidden="true" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-sm font-sans text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline-block">Salir</span>
          </button>
        </div>
      ) : (
        <Link href="/login" className="text-sm font-medium" style={{ color: "#C4793A" }}>Iniciar sesión</Link>
      )}
    </header>
  );
}
