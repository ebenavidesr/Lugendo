import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { LugendoCompass, LugendoWordmark } from "@/components/logo";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function TravelerLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
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
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 max-w-3xl w-full mx-auto">
        <Link href="/traveler" className="flex items-center gap-2">
          <LugendoCompass size={22} variant="light" />
          <LugendoWordmark variant="light" size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-sans hidden sm:inline-block" style={{ color: "#7A5C3A" }}>
            {user?.name}
          </span>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground" data-testid="button-logout">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 font-sans">
        {children}
      </main>
      
      <footer className="py-8 text-center text-sm font-sans" style={{ color: "#9C7A58" }}>
        Powered by Lugendo
      </footer>
    </div>
  );
}
