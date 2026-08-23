import { createContext, useContext, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useGetMe, AuthUser, AuthUserRole, AuthUserStatus } from "@workspace/api-client-react";

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  isError: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

// Top-level path segments already claimed by real routes in App.tsx. Kept in sync manually
// with RESERVED_AGENCY_SLUGS in artifacts/api-server/src/lib/schemas.ts, which stops an agency
// from picking one of these as its public-profile slug in the first place.
const RESERVED_TOP_SEGMENTS = new Set([
  "login", "register", "pending", "verify-email", "forgot-password", "reset-password",
  "foto", "buscar", "dashboard", "trips", "itineraries", "hotels", "activities",
  "team", "agencies", "settings", "traveler", "inquiries", "",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    // /foto/:code (task #141) is a standalone public "shared photo" link — an external
    // contact ("Invitada") must be able to view it whether logged out, logged in as a
    // traveler, or logged in as back-office staff, so it's fully exempt from routing.
    if (location.startsWith("/foto/")) return;
    // /buscar (task #161) is the public multi-agency itinerary search — reachable
    // without any session, same exemption as /foto/:code.
    if (location === "/buscar") return;
    // /:slug (task #162) is the public agency profile — a single path segment that isn't one
    // of the app's reserved routes. The page itself 404s if the slug doesn't resolve to an
    // agency with a published profile, so this exemption doesn't leak anything by itself.
    const segments = location.split("/");
    if (segments.length === 2 && !RESERVED_TOP_SEGMENTS.has(segments[1])) return;
    if (!isLoading) {
      const isAuthRoute = location === "/login" || location === "/register";
      const isPublicRoute = isAuthRoute || location === "/forgot-password" || location.startsWith("/reset-password");
      const isPendingRoute = location === "/pending";
      const isVerifyEmailRoute = location === "/verify-email";
      if (!user && !isPublicRoute) {
        setLocation("/login");
      } else if (user && user.status !== AuthUserStatus.approved) {
        if (!isPendingRoute) setLocation("/pending");
      } else if (user && !user.emailVerified) {
        if (!isVerifyEmailRoute) setLocation("/verify-email");
      } else if (user && (isAuthRoute || isPendingRoute || isVerifyEmailRoute)) {
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
