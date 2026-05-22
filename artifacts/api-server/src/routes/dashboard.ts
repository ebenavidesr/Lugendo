import { Router, type IRouter } from "express";
import { eq, and, sql, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  tripsTable, invitationsTable, itinerariesTable, usersTable,
} from "@workspace/db";
import { requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireRoles("admin", "manager", "agent"), async (req, res): Promise<void> => {
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
    .select({ count: sql<number>`count(distinct traveler_id)::int` })
    .from(invitationsTable);
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
      tripId: invitationsTable.tripId,
      invited: sql<number>`count(*)::int`,
      accepted: sql<number>`sum(case when status = 'accepted' then 1 else 0 end)::int`,
    })
    .from(invitationsTable)
    .groupBy(invitationsTable.tripId);
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
    .select()
    .from(invitationsTable)
    .orderBy(sql`${invitationsTable.createdAt} desc`)
    .limit(10);

  res.json({
    tripsByStatus,
    totalTravelers,
    upcomingTrips: upcomingWithCounts,
    recentInvitations: recentInvitations.map(i => ({
      ...i,
      travelerName: null,
      createdAt: i.createdAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
    })),
    occupancyAlerts,
  });
});

export default router;
