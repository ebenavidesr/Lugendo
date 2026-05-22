import { createContext, useContext, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useGetMe, AuthUser, AuthUserRole } from "@workspace/api-client-react";

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  isError: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (!isLoading) {
      const isAuthRoute = location === "/login" || location === "/register";
      if (!user && !isAuthRoute) {
        setLocation("/login");
      } else if (user && isAuthRoute) {
        if (user.role === AuthUserRole.traveler) {
          setLocation("/traveler");
        } else {
          setLocation("/dashboard");
        }
      } else if (user) {
        // Enforce role boundaries
        const isTravelerRoute = location.startsWith("/traveler");
        if (user.role === AuthUserRole.traveler && !isTravelerRoute) {
          setLocation("/traveler");
        } else if (user.role !== AuthUserRole.traveler && isTravelerRoute) {
          setLocation("/dashboard");
        }
      }
    }
  }, [user, isLoading, location, setLocation]);

  const value = {
    user: user || null,
    isLoading,
    isError,
    logout: () => setLocation("/login"),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
