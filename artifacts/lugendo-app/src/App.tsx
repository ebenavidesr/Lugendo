import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BackOfficeLayout } from "@/components/layout/back-office-layout";
import { TravelerLayout } from "@/components/layout/traveler-layout";

// Pages
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";

// Stub pages
const Dashboard = () => <div className="p-8"><h1 className="text-3xl font-bold">Dashboard</h1><p>Welcome to Lugendo Back Office.</p></div>;
const Trips = () => <div className="p-8"><h1 className="text-3xl font-bold">Trips</h1></div>;
const TravelerHome = () => <div className="p-8"><h1 className="text-3xl font-serif">My Trips</h1></div>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

function ProtectedBackOffice({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user || user.role === "traveler") return null; // handled by AuthProvider redirect
  return <BackOfficeLayout>{children}</BackOfficeLayout>;
}

function ProtectedTraveler({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user || user.role !== "traveler") return null; // handled by AuthProvider redirect
  return <TravelerLayout>{children}</TravelerLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Login} />

      {/* Back Office Routes */}
      <Route path="/dashboard">
        <ProtectedBackOffice><Dashboard /></ProtectedBackOffice>
      </Route>
      <Route path="/trips">
        <ProtectedBackOffice><Trips /></ProtectedBackOffice>
      </Route>
      
      {/* Traveler Routes */}
      <Route path="/traveler">
        <ProtectedTraveler><TravelerHome /></ProtectedTraveler>
      </Route>

      {/* Default */}
      <Route path="/">
        <div /> {/* Redirected in AuthProvider */}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
