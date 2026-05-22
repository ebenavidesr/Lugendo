import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Map, Bed, Plane, Users, LogOut } from "lucide-react";
import { LugendoCompass, LugendoWordmark } from "@/components/logo";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function BackOfficeLayout({ children }: { children: ReactNode }) {
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

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trips", label: "Trips", icon: Plane },
    { href: "/itineraries", label: "Itineraries", icon: Map },
    { href: "/hotels", label: "Hotels", icon: Bed },
    ...(user?.role === "admin" || user?.role === "manager" ? [{ href: "/users", label: "Team", icon: Users }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col hidden md:flex shrink-0">
        <div className="px-5 py-4 border-b border-white/[0.06] mb-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LugendoCompass size={22} variant="dark" />
            <LugendoWordmark variant="dark" size="sm" />
          </Link>
          <div className="mt-1 text-[11px] font-medium tracking-wide uppercase" style={{ color: "rgba(250,242,235,0.35)" }}>
            {user?.agencyName || "Agency Workspace"}
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-accent" : "opacity-70")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-semibold shrink-0">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs opacity-70 truncate">{user?.email}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start mt-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" 
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2 opacity-70" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-16 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LugendoCompass size={20} variant="light" />
            <LugendoWordmark variant="light" size="sm" />
          </Link>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </header>
        <div className="flex-1 overflow-auto bg-muted/30">
          {children}
        </div>
      </main>
    </div>
  );
}
