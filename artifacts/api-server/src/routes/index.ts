import { Router, type IRouter } from "express";
import { isReady } from "../lib/readiness";
import healthRouter from "./health";
import authRouter from "./auth";
import agenciesRouter from "./agencies";
import usersRouter from "./users";
import hotelsRouter from "./hotels";
import activitiesRouter from "./activities";
import itinerariesRouter from "./itineraries";
import tripsRouter from "./trips";
import invitationsRouter from "./invitations";
import travelerRouter from "./traveler";
import dashboardRouter from "./dashboard";
import destinationsRouter from "./destinations";
import storageRouter from "./storage";
import checklistTemplatesRouter from "./checklist-templates";

const router: IRouter = Router();

// Liveness first: /healthz must answer before migrations finish (the server
// now opens the port before running them), so it's mounted ahead of the gate.
router.use(healthRouter);

// Readiness gate: block real API traffic with 503 until migrations/init have
// completed. Because the port opens before migrations now, requests can
// arrive against a not-yet-migrated schema; this keeps them from hitting the
// DB until it's ready. /healthz already responded above, so it's unaffected.
router.use((_req, res, next) => {
  if (!isReady()) {
    res.status(503).json({ error: "Service starting up, please retry shortly" });
    return;
  }
  next();
});

router.use(authRouter);
router.use(agenciesRouter);
router.use(usersRouter);
router.use(hotelsRouter);
router.use(activitiesRouter);
router.use(itinerariesRouter);
router.use(tripsRouter);
router.use(invitationsRouter);
router.use(travelerRouter);
router.use(dashboardRouter);
router.use(destinationsRouter);
router.use(storageRouter);
router.use(checklistTemplatesRouter);

export default router;
