import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Compass, LogOut } from "lucide-react";
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
    <div className="min-h-screen bg-stone-50 text-stone-900 font-serif flex flex-col">
      <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 max-w-3xl w-full mx-auto">
        <Link href="/traveler" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight">
          <Compass className="w-6 h-6 text-stone-700" />
          <span>Passport</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-sans text-stone-500 hidden sm:inline-block">
            {user?.name}
          </span>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-stone-500 hover:text-stone-900" data-testid="button-logout">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 font-sans">
        {children}
      </main>
      
      <footer className="py-8 text-center text-stone-400 text-sm font-sans">
        Powered by Lugendo
      </footer>
    </div>
  );
}
