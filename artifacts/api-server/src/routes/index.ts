import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
