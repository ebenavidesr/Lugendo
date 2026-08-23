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
import PendingApproval from "@/pages/pending-approval";
import VerifyEmailPending from "@/pages/verify-email-pending";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Trips from "@/pages/trips";
import TripDetail from "@/pages/trip-detail";
import Hotels from "@/pages/hotels";
import Itineraries from "@/pages/itineraries";
import ItineraryDetail from "@/pages/itinerary-detail";
import Team from "@/pages/team";
import Activities from "@/pages/activities";
import TripWizard from "@/pages/trip-wizard";
import ItineraryWizard from "@/pages/itinerary-wizard";
import TravelerHome from "@/pages/traveler-home";
import TravelerTrip from "@/pages/traveler-trip";
import TravelerTripWizard from "@/pages/traveler-trip-wizard";
import TravelerTripEdit from "@/pages/traveler-trip-edit";
import TravelerProfile from "@/pages/traveler-profile";
import TravelerCompanionProfile from "@/pages/traveler-companion-profile";
import Agencies from "@/pages/agencies";
import AgencyDetail from "@/pages/agency-detail";
import AgencySettings from "@/pages/agency-settings";
import TripPhotoView from "@/pages/trip-photo-view";
import SearchPage from "@/pages/search";
import ItineraryPublicDetail from "@/pages/itinerary-public-detail";
import AgencyPublicProfile from "@/pages/agency-public-profile";
import AgencyInquiries from "@/pages/agency-inquiries";
import TravelerAgencyInquiries from "@/pages/traveler-agency-inquiries";

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
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user || user.status !== "approved" || user.role === "traveler") return null;
  return <BackOfficeLayout>{children}</BackOfficeLayout>;
}

function ProtectedTraveler({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user || user.status !== "approved" || user.role !== "traveler") return null;
  return <TravelerLayout>{children}</TravelerLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Login} />
      <Route path="/pending" component={PendingApproval} />
      <Route path="/verify-email" component={VerifyEmailPending} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/foto/:code" component={TripPhotoView} />
      <Route path="/buscar" component={SearchPage} />
      <Route path="/itinerarios/:id" component={ItineraryPublicDetail} />

      {/* Back Office */}
      <Route path="/dashboard">
        <ProtectedBackOffice><Dashboard /></ProtectedBackOffice>
      </Route>
      <Route path="/trips/new">
        <ProtectedBackOffice><TripWizard /></ProtectedBackOffice>
      </Route>
      <Route path="/trips/:id">
        {(params) => (
          <ProtectedBackOffice><TripDetail /></ProtectedBackOffice>
        )}
      </Route>
      <Route path="/trips">
        <ProtectedBackOffice><Trips /></ProtectedBackOffice>
      </Route>
      <Route path="/itineraries/new">
        <ProtectedBackOffice><ItineraryWizard /></ProtectedBackOffice>
      </Route>
      <Route path="/itineraries/:id">
        {() => (
          <ProtectedBackOffice><ItineraryDetail /></ProtectedBackOffice>
        )}
      </Route>
      <Route path="/itineraries">
        <ProtectedBackOffice><Itineraries /></ProtectedBackOffice>
      </Route>
      <Route path="/hotels">
        <ProtectedBackOffice><Hotels /></ProtectedBackOffice>
      </Route>
      <Route path="/activities">
        <ProtectedBackOffice><Activities /></ProtectedBackOffice>
      </Route>
      <Route path="/team">
        <ProtectedBackOffice><Team /></ProtectedBackOffice>
      </Route>
      <Route path="/inquiries">
        <ProtectedBackOffice><AgencyInquiries /></ProtectedBackOffice>
      </Route>
      <Route path="/agencies/:id">
        {() => (
          <ProtectedBackOffice><AgencyDetail /></ProtectedBackOffice>
        )}
      </Route>
      <Route path="/agencies">
        <ProtectedBackOffice><Agencies /></ProtectedBackOffice>
      </Route>
      <Route path="/settings">
        <ProtectedBackOffice><AgencySettings /></ProtectedBackOffice>
      </Route>

      {/* Traveler Portal */}
      <Route path="/traveler/profile">
        <ProtectedTraveler><TravelerProfile /></ProtectedTraveler>
      </Route>
      <Route path="/traveler/inquiries">
        <ProtectedTraveler><TravelerAgencyInquiries /></ProtectedTraveler>
      </Route>
      <Route path="/traveler/travelers/:id">
        {() => (
          <ProtectedTraveler><TravelerCompanionProfile /></ProtectedTraveler>
        )}
      </Route>
      <Route path="/traveler/trips/new">
        <ProtectedTraveler><TravelerTripWizard /></ProtectedTraveler>
      </Route>
      <Route path="/traveler/trips/:id/edit">
        {() => (
          <ProtectedTraveler><TravelerTripEdit /></ProtectedTraveler>
        )}
      </Route>
      <Route path="/traveler/trips/:id">
        {() => (
          <ProtectedTraveler><TravelerTrip /></ProtectedTraveler>
        )}
      </Route>
      <Route path="/traveler">
        <ProtectedTraveler><TravelerHome /></ProtectedTraveler>
      </Route>

      {/* Default */}
      <Route path="/">
        <div />
      </Route>

      {/* Public agency profile (tarea #162) — must stay last before the catch-all so it never
          shadows a real route above; the slug itself is validated against the same reserved
          list enforced at agency creation time (see RESERVED_AGENCY_SLUGS in schemas.ts). */}
      <Route path="/:slug" component={AgencyPublicProfile} />

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
