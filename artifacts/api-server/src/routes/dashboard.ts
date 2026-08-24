import { Router, type IRouter } from "express";
import { eq, and, sql, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, tripSharesTable, itinerariesTable, usersTable,
} from "@workspace/db";
import { requireRoles } from "../middlewares/auth";
import { getTripStatsForItineraries, summarizeTripStats } from "../lib/itinerary-stats";

const router: IRouter = Router();

router.get("/dashboard/summary", requireRoles("admin", "manager", "agent", "advisor"), async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const whereTrip = role === "admin" || !agencyId
    ? undefined
    : eq(tripsTable.agencyId, agencyId);

  const statusCounts = await db
    .select({
      status: tripsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tripsTable)
    .where(whereTrip)
    .groupBy(tripsTable.status);

  const tripsByStatus = {
    draft: 0, scheduled: 0, active: 0, finished: 0, cancelled: 0,
  };
  for (const r of statusCounts) {
    if (r.status in tripsByStatus) {
      (tripsByStatus as Record<string, number>)[r.status] = r.count;
    }
  }

  const [travelerCount] = await db
    .select({ count: sql<number>`count(distinct shared_with_user_id)::int` })
    .from(tripSharesTable)
    .where(eq(tripSharesTable.origin, "agency"));
  const totalTravelers = travelerCount?.count ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingQuery = db
    .select()
    .from(tripsTable)
    .where(
      and(
        whereTrip,
        sql`${tripsTable.startDate} >= ${today}`,
        sql`${tripsTable.status} in ('scheduled', 'active')`,
      )
    )
    .orderBy(tripsTable.startDate)
    .limit(5);

  const upcomingTrips = await upcomingQuery;

  const invCounts = await db
    .select({
      tripId: tripSharesTable.tripId,
      invited: sql<number>`count(*)::int`,
      accepted: sql<number>`sum(case when status = 'accepted' then 1 else 0 end)::int`,
    })
    .from(tripSharesTable)
    .where(eq(tripSharesTable.origin, "agency"))
    .groupBy(tripSharesTable.tripId);
  const invMap: Record<number, { invited: number; accepted: number }> = {};
  for (const r of invCounts) {
    if (r.tripId) invMap[r.tripId] = { invited: r.invited, accepted: r.accepted };
  }

  const upcomingWithCounts = upcomingTrips.map(t => ({
    ...t,
    itineraryName: null,
    invitedCount: invMap[t.id]?.invited ?? 0,
    acceptedCount: invMap[t.id]?.accepted ?? 0,
    createdAt: t.createdAt.toISOString(),
  }));

  const occupancyAlerts = upcomingWithCounts.filter(t => {
    if (!t.maxCapacity || t.maxCapacity === 0) return false;
    const pct = t.acceptedCount / t.maxCapacity;
    return pct < 0.7;
  });

  const recentInvitations = await db
    .select({
      id: tripSharesTable.id,
      tripId: tripSharesTable.tripId,
      email: tripSharesTable.sharedWithEmail,
      status: tripSharesTable.status,
      segment: tripSharesTable.segment,
      travelerId: tripSharesTable.sharedWithUserId,
      createdAt: tripSharesTable.createdAt,
      acceptedAt: tripSharesTable.acceptedAt,
    })
    .from(tripSharesTable)
    .where(eq(tripSharesTable.origin, "agency"))
    .orderBy(sql`${tripSharesTable.createdAt} desc`)
    .limit(10);

  res.json({
    tripsByStatus,
    totalTravelers,
    upcomingTrips: upcomingWithCounts,
    recentInvitations: recentInvitations.map(i => ({
      ...i,
      segment: i.segment ?? null,
      travelerName: null,
      createdAt: i.createdAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
    })),
    occupancyAlerts,
  });
});

router.get("/dashboard/itineraries", requireRoles("admin", "manager", "agent", "advisor"), async (req, res): Promise<void> => {
  const { agencyId, role } = req.session;
  const whereItinerary = role === "admin" || !agencyId
    ? undefined
    : eq(itinerariesTable.agencyId, agencyId);

  const itineraries = await db
    .select({ id: itinerariesTable.id, name: itinerariesTable.name })
    .from(itinerariesTable)
    .where(whereItinerary);

  const trips = await getTripStatsForItineraries(itineraries.map(i => i.id));
  const overall = summarizeTripStats(trips);

  const perItinerary: Record<number, { tripCount: number; travelerCount: number; revenue: number }> = {};
  for (const t of trips) {
    if (t.itineraryId == null) continue;
    if (!perItinerary[t.itineraryId]) perItinerary[t.itineraryId] = { tripCount: 0, travelerCount: 0, revenue: 0 };
    perItinerary[t.itineraryId].tripCount += 1;
    perItinerary[t.itineraryId].travelerCount += t.travelerCount;
    perItinerary[t.itineraryId].revenue += t.revenue;
  }

  const ranked = itineraries.map(i => ({
    id: i.id,
    name: i.name,
    tripCount: perItinerary[i.id]?.tripCount ?? 0,
    travelerCount: perItinerary[i.id]?.travelerCount ?? 0,
    revenue: perItinerary[i.id]?.revenue ?? 0,
  }));

  const topByRevenue = [...ranked].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topByTravelers = [...ranked].sort((a, b) => b.travelerCount - a.travelerCount).slice(0, 5);

  res.json({
    totalItineraries: itineraries.length,
    ...overall,
    topByRevenue,
    topByTravelers,
  });
});

export default router;
